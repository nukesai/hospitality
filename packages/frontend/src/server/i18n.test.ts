/**
 * Unit tests mock the two Next-runtime boundaries (next-intl/server's
 * getRequestConfig is IDENTITY in the react-server build and a thrower in the
 * react-client build vitest resolves; next/headers needs a request scope).
 * The REAL react-server path is exercised by the example app's production
 * build + E2E — this file covers OUR cascade/merge/binding logic.
 */
import { describe, expect, it, vi } from "vitest";

const cookieStore = { value: undefined as string | undefined, reads: 0 };
vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => {
    cookieStore.reads += 1;
    return Promise.resolve({
      get: (name: string) =>
        name === "NEXT_LOCALE" && cookieStore.value !== undefined
          ? { value: cookieStore.value }
          : undefined,
    });
  },
}));

import { posIntlOnError, posMessageFallback } from "../i18n/fallback.js";
import { createPosRequestConfig, type PosRequestConfigOptions } from "./i18n.js";

type ConfigFn = (params: {
  locale?: string;
  requestLocale?: Promise<string | undefined>;
}) => Promise<{
  locale: string;
  messages: Record<string, unknown>;
  onError: unknown;
  getMessageFallback: unknown;
  timeZone?: string;
  now?: Date;
  formats?: unknown;
}>;

const configFor = (options?: PosRequestConfigOptions): ConfigFn => createPosRequestConfig(options);

describe("createPosRequestConfig", () => {
  it("serves the shipped catalog for the default locale with POS fallbacks bound", async () => {
    cookieStore.value = undefined;
    const config = await configFor()({});
    expect(config.locale).toBe("en");
    expect(config.messages).toMatchObject({
      pos: { order: { status: { ready: "Ready" } } },
    });
    expect(config.onError).toBe(posIntlOnError);
    expect(config.getMessageFallback).toBe(posMessageFallback);
  });

  it("honors the explicit locale (getTranslations({locale}) path)", async () => {
    cookieStore.value = undefined;
    const config = await configFor()({ locale: "ne" });
    expect(config.locale).toBe("ne");
    expect(config.messages).toMatchObject({
      pos: { order: { status: { ready: "तयार" } } },
    });
  });

  it("uses the [locale] segment next-intl forwards in routed apps", async () => {
    cookieStore.value = undefined;
    const config = await configFor({ cookieName: false })({
      requestLocale: Promise.resolve("ne"),
    });
    expect(config.locale).toBe("ne");
  });

  it("consults resolveLocale before the cookie", async () => {
    cookieStore.value = "en";
    const config = await configFor({ resolveLocale: async () => Promise.resolve("ne") })({});
    expect(config.locale).toBe("ne");
  });

  it("falls back to the locale cookie in the without-routing mode", async () => {
    cookieStore.value = "ne";
    const config = await configFor()({});
    expect(config.locale).toBe("ne");
  });

  it("never reads cookies when disabled (static routed apps)", async () => {
    cookieStore.value = "ne";
    const config = await configFor({ cookieName: false })({});
    expect(config.locale).toBe("en");
  });

  it("merges consumer messages and overrides over the catalog", async () => {
    cookieStore.value = undefined;
    const config = await configFor({
      messages: () => ({ app: { hello: "hi" } }),
      overrides: { en: { pos: { order: { total: "Sum: {amount}" } } } },
    })({});
    expect(config.messages).toMatchObject({
      app: { hello: "hi" },
      pos: { order: { total: "Sum: {amount}" } },
    });
  });

  it("LAYERS consumer catalogs over the shipped ones instead of replacing them", async () => {
    cookieStore.value = undefined;
    const options: PosRequestConfigOptions = {
      locales: ["en", "ne", "fr"],
      posMessages: { fr: () => ({ pos: { order: { status: { ready: "Prêt" } } } }) },
    };
    // The added locale works...
    expect(await configFor(options)({ locale: "fr" })).toMatchObject({
      locale: "fr",
      messages: { pos: { order: { status: { ready: "Prêt" } } } },
    });
    // ...and the shipped catalogs are still there (the silent-regression case:
    // missing messages render as their key path, so nothing would have failed).
    expect(await configFor(options)({ locale: "ne" })).toMatchObject({
      messages: { pos: { order: { status: { ready: "तयार" } } } },
    });
  });

  it("does not touch cookies once a higher-priority candidate decided the locale", async () => {
    cookieStore.value = "ne";
    cookieStore.reads = 0;
    expect(await configFor()({ locale: "en" })).toMatchObject({ locale: "en" });
    expect(await configFor({ resolveLocale: async () => Promise.resolve("ne") })({})).toMatchObject(
      {
        locale: "ne",
      },
    );
    expect(cookieStore.reads).toBe(0);
    // ...but the cookie IS read when the cascade is still undecided.
    await configFor()({});
    expect(cookieStore.reads).toBe(1);
  });

  it("reads the deprecated requestLocale getter lazily (static rendering stays possible)", async () => {
    cookieStore.value = undefined;
    let requestLocaleReads = 0;
    const params = {
      locale: "ne",
      get requestLocale(): Promise<string | undefined> {
        requestLocaleReads += 1;
        return Promise.resolve("en");
      },
    };
    expect(await configFor()(params)).toMatchObject({ locale: "ne" });
    expect(requestLocaleReads).toBe(0);
  });

  it("passes timeZone/now/formats through and lets onError be replaced", async () => {
    cookieStore.value = undefined;
    const now = new Date("2026-08-21T00:00:00.000Z");
    const onError = (): void => undefined;
    const formats = { dateTime: { short: { dateStyle: "short" as const } } };
    const config = await configFor({ timeZone: "Asia/Kathmandu", now, formats, onError })({});
    expect(config).toMatchObject({ timeZone: "Asia/Kathmandu", now, formats, onError });
  });

  it("omits the optional keys entirely when not configured", async () => {
    cookieStore.value = undefined;
    const config = await configFor()({});
    expect(Object.keys(config).sort()).toEqual([
      "getMessageFallback",
      "locale",
      "messages",
      "onError",
    ]);
    expect(config.onError).toBe(posIntlOnError);
  });
});
