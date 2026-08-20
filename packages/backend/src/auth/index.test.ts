import type { SecondaryStorage, User } from "better-auth";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import type { MailMessage, MailPort } from "../ports/mail.js";
import { buildAuthOptions, createAuth, type AuthEnv, type CreateAuthDeps } from "./index.js";
import { ac, posRoles } from "./roles.js";

interface CapturingMailer extends MailPort {
  readonly sent: MailMessage[];
}

const makeMailer = (): CapturingMailer => {
  const sent: MailMessage[] = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
      return Promise.resolve();
    },
    close: async () => Promise.resolve(),
  };
};

const baseEnv: AuthEnv = {
  secret: "unit-test-secret-0123456789abcdef0123456789abcdef",
  baseUrl: "https://pos.example.test",
  trustedOrigins: ["https://app.example.test", "https://kiosk.example.test"],
  appName: "pos-under-test",
};

const schema: Record<string, unknown> = {
  user: {},
  session: {},
  account: {},
  verification: {},
  branch: {},
  branchMember: {},
  branchInvitation: {},
};

const fakeDb = (): NodePgDatabase<Record<string, unknown>> =>
  ({ _: { fullSchema: schema }, query: {} }) as unknown as NodePgDatabase<Record<string, unknown>>;

const makeSecondaryStorage = (): SecondaryStorage => ({
  get: async () => Promise.resolve(null),
  getAndDelete: async () => Promise.resolve(null),
  increment: async () => Promise.resolve(1),
  set: async () => Promise.resolve(),
  delete: async () => Promise.resolve(),
});

interface DepsOverrides {
  readonly secondaryStorage?: SecondaryStorage;
  readonly cookieDomain?: string;
}

const makeDeps = (
  overrides: DepsOverrides = {},
): { deps: CreateAuthDeps; mailer: CapturingMailer } => {
  const mailer = makeMailer();
  const deps: CreateAuthDeps = {
    env: { ...baseEnv, cookieDomain: overrides.cookieDomain },
    db: fakeDb(),
    schema,
    secondaryStorage: overrides.secondaryStorage,
    mailer,
  };
  return { deps, mailer };
};

const testUser: User = {
  id: "user-1",
  name: "Test User",
  email: "user@example.test",
  emailVerified: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("buildAuthOptions", () => {
  it("copies env values into the options", () => {
    const { deps } = makeDeps();
    const options = buildAuthOptions(deps);
    expect(options.appName).toBe("pos-under-test");
    expect(options.secret).toBe(baseEnv.secret);
    expect(options.baseURL).toBe(baseEnv.baseUrl);
    expect(options.trustedOrigins).toEqual([...baseEnv.trustedOrigins]);
    expect(options.trustedOrigins).not.toBe(deps.env.trustedOrigins);
  });

  it("disables telemetry and wires a drizzle database adapter", () => {
    const options = buildAuthOptions(makeDeps().deps);
    expect(options.telemetry).toEqual({ enabled: false });
    expect(typeof options.database).toBe("function");
  });

  it("keeps Postgres as session source of truth with a cookie cache", () => {
    const options = buildAuthOptions(makeDeps().deps);
    expect(options.session).toEqual({
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    });
  });

  it("omits secondaryStorage and rate-limits against the database without it", () => {
    const options = buildAuthOptions(makeDeps().deps);
    expect("secondaryStorage" in options).toBe(false);
    expect(options.rateLimit).toEqual({
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/forget-password": { window: 60, max: 3 },
      },
    });
  });

  it("passes secondaryStorage through and rate-limits against it when present", () => {
    const secondaryStorage = makeSecondaryStorage();
    const options = buildAuthOptions(makeDeps({ secondaryStorage }).deps);
    expect(options.secondaryStorage).toBe(secondaryStorage);
    expect(options.rateLimit?.storage).toBe("secondary-storage");
  });

  it("uses uuid id generation and the pos cookie prefix", () => {
    const options = buildAuthOptions(makeDeps().deps);
    expect(options.advanced?.cookiePrefix).toBe("pos");
    expect(options.advanced?.database?.generateId).toBe("uuid");
    expect(options.advanced?.crossSubDomainCookies).toBeUndefined();
  });

  it("enables crossSubDomainCookies only when a cookieDomain is provided", () => {
    const options = buildAuthOptions(makeDeps({ cookieDomain: ".example.test" }).deps);
    expect(options.advanced?.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: ".example.test",
    });
  });

  it("orders plugins organization -> bearer -> nextCookies", () => {
    const options = buildAuthOptions(makeDeps().deps);
    expect(options.plugins.map((plugin) => plugin.id)).toEqual([
      "organization",
      "bearer",
      "next-cookies",
    ]);
  });

  it("remaps the org schema to branch models and wires ac/roles", () => {
    const options = buildAuthOptions(makeDeps().deps);
    const [org] = options.plugins;
    expect(org.options.ac).toBe(ac);
    expect(org.options.roles).toBe(posRoles);
    expect(org.options.creatorRole).toBe("owner");
    expect(org.options.schema).toEqual({
      organization: { modelName: "branch" },
      member: { modelName: "branchMember", fields: { organizationId: "branchId" } },
      invitation: {
        modelName: "branchInvitation",
        fields: { organizationId: "branchId" },
      },
    });
  });

  it("sendResetPassword emails the reset url through the injected mailer", async () => {
    const { deps, mailer } = makeDeps();
    const options = buildAuthOptions(deps);
    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    await options.emailAndPassword?.sendResetPassword?.({
      user: testUser,
      url: "https://pos.example.test/reset?token=abc",
      token: "abc",
    });
    expect(mailer.sent).toEqual([
      {
        to: "user@example.test",
        subject: "Reset your password",
        text: "Reset your password: https://pos.example.test/reset?token=abc",
      },
    ]);
  });

  it("sendVerificationEmail emails the verification url through the injected mailer", async () => {
    const { deps, mailer } = makeDeps();
    const options = buildAuthOptions(deps);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.emailVerification?.autoSignInAfterVerification).toBe(true);
    await options.emailVerification?.sendVerificationEmail?.({
      user: testUser,
      url: "https://pos.example.test/verify?token=xyz",
      token: "xyz",
    });
    expect(mailer.sent).toEqual([
      {
        to: "user@example.test",
        subject: "Verify your email",
        text: "Verify your email: https://pos.example.test/verify?token=xyz",
      },
    ]);
  });
});

describe("createAuth", () => {
  it("returns a better-auth instance exposing api and handler", async () => {
    const auth = createAuth(makeDeps().deps);
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.api.signInEmail).toBe("function");
    expect(typeof auth.api.createOrganization).toBe("function");
    expect(auth.options.appName).toBe("pos-under-test");
    // Init must settle without touching a real database or the network.
    await expect(auth.$context).resolves.toBeDefined();
  });
});
