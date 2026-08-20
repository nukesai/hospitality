import type { Transporter } from "nodemailer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PosEnv } from "../../env.js";
import { createNodemailerMail, type TransportFactory } from "./nodemailer.js";

const { createTransportMock, sendMailMock, closeMock } = vi.hoisted(() => {
  const hoistedSendMail = vi.fn(async (): Promise<Record<string, never>> => {
    await Promise.resolve();
    return {};
  });
  const hoistedClose = vi.fn((): void => undefined);
  const hoistedCreateTransport = vi.fn(() => ({
    sendMail: hoistedSendMail,
    close: hoistedClose,
  }));
  return {
    createTransportMock: hoistedCreateTransport,
    sendMailMock: hoistedSendMail,
    closeMock: hoistedClose,
  };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

const makeEnv = (overrides: Partial<PosEnv> = {}): PosEnv => ({
  NODE_ENV: "test",
  BACKEND_RUNTIME: "server",
  DATABASE_URL: "postgres://localhost:5432/pos",
  MIGRATE_DATABASE_URL: undefined,
  DATABASE_POOL_MAX: 10,
  DATABASE_POOL_IDLE_TIMEOUT_MS: 30_000,
  DATABASE_CONNECT_TIMEOUT_MS: 10_000,
  DATABASE_POOL_MAX_USES: 0,
  DATABASE_SSL: false,
  CACHE_DRIVER: "memory",
  CACHE_URL: undefined,
  CACHE_KEY_PREFIX: "pos",
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_TRUSTED_ORIGINS: "",
  AUTH_COOKIE_DOMAIN: undefined,
  MAIL_DRIVER: "smtp",
  SMTP_HOST: "mailpit",
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  MAIL_FROM: "no-reply@localhost",
  LOG_LEVEL: "info",
  ANALYTICS_DRIVER: "noop",
  ANALYTICS_WRITE_KEY: undefined,
  API_MAX_BODY_BYTES: 1_048_576,
  DEFAULT_LOCALE: "en",
  ...overrides,
});

describe("createNodemailerMail", () => {
  beforeEach(() => {
    createTransportMock.mockClear();
    sendMailMock.mockClear();
    closeMock.mockClear();
  });

  describe("default transport factory", () => {
    it("configures the transport from env with auth when user and pass are both set", () => {
      createNodemailerMail(makeEnv({ SMTP_USER: "user", SMTP_PASS: "secret", SMTP_SECURE: true }));
      expect(createTransportMock).toHaveBeenCalledExactlyOnceWith({
        host: "mailpit",
        port: 1025,
        secure: true,
        auth: { user: "user", pass: "secret" },
      });
    });

    it("omits auth when SMTP_USER is missing", () => {
      createNodemailerMail(makeEnv({ SMTP_USER: undefined, SMTP_PASS: "secret" }));
      expect(createTransportMock).toHaveBeenCalledExactlyOnceWith({
        host: "mailpit",
        port: 1025,
        secure: false,
        auth: undefined,
      });
    });

    it("omits auth when SMTP_PASS is missing", () => {
      createNodemailerMail(makeEnv({ SMTP_USER: "user", SMTP_PASS: undefined }));
      expect(createTransportMock).toHaveBeenCalledExactlyOnceWith({
        host: "mailpit",
        port: 1025,
        secure: false,
        auth: undefined,
      });
    });
  });

  describe("with an injected transport factory", () => {
    const factorySeenEnvs: PosEnv[] = [];
    const fakeTransporter = {
      sendMail: sendMailMock,
      close: closeMock,
    } as unknown as Transporter;
    const transportFactory: TransportFactory = (env) => {
      factorySeenEnvs.push(env);
      return fakeTransporter;
    };

    it("passes env to the injected factory instead of nodemailer", () => {
      const env = makeEnv();
      createNodemailerMail(env, transportFactory);
      expect(factorySeenEnvs.at(-1)).toBe(env);
      expect(createTransportMock).not.toHaveBeenCalled();
    });

    it("maps the message onto sendMail, stamping MAIL_FROM and keeping html", async () => {
      const mail = createNodemailerMail(makeEnv(), transportFactory);
      await mail.send({
        to: "to@example.com",
        subject: "Receipt",
        text: "plain",
        html: "<b>rich</b>",
      });
      expect(sendMailMock).toHaveBeenCalledExactlyOnceWith({
        from: "no-reply@localhost",
        to: "to@example.com",
        subject: "Receipt",
        text: "plain",
        html: "<b>rich</b>",
      });
    });

    it("sends html as undefined when the message has none", async () => {
      const mail = createNodemailerMail(makeEnv(), transportFactory);
      await mail.send({ to: "to@example.com", subject: "s", text: "t" });
      expect(sendMailMock).toHaveBeenCalledExactlyOnceWith({
        from: "no-reply@localhost",
        to: "to@example.com",
        subject: "s",
        text: "t",
        html: undefined,
      });
    });

    it("close calls transporter.close", async () => {
      const mail = createNodemailerMail(makeEnv(), transportFactory);
      await expect(mail.close()).resolves.toBeUndefined();
      expect(closeMock).toHaveBeenCalledTimes(1);
    });
  });
});
