import "server-only";

import { betterAuth } from "better-auth";
import type { Auth, BetterAuthOptions, SecondaryStorage } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import type { DefaultOrganizationPlugin } from "better-auth/plugins/organization";
import { bearer } from "better-auth/plugins/bearer";
import { nextCookies } from "better-auth/next-js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MailPort } from "../ports/mail.js";
import { ac, posRoles } from "./roles.js";

/** All values consumer-provided; nothing reads process.env inside the library.
 * Consumer bootstrap maps BETTER_AUTH_SECRET -> secret, BETTER_AUTH_URL -> baseUrl,
 * AUTH_TRUSTED_ORIGINS (csv) -> trustedOrigins, AUTH_COOKIE_DOMAIN -> cookieDomain. */
export interface AuthEnv {
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly cookieDomain?: string | undefined;
  readonly appName: string;
  /** Mount path of the auth handler inside the app, e.g. `/api/pos/auth`.
   *  MUST match where the consumer routes requests (better-auth default: /api/auth). */
  readonly basePath?: string | undefined;
}

export interface CreateAuthDeps {
  readonly env: AuthEnv;
  readonly db: NodePgDatabase<Record<string, unknown>>;
  readonly schema: Record<string, unknown>; // the committed drizzle schema barrel incl. auth tables
  readonly secondaryStorage?: SecondaryStorage | undefined; // Redis-backed; omit in tests
  readonly mailer: MailPort;
}

interface PosOrgPluginOptions {
  ac: typeof ac;
  roles: typeof posRoles;
  creatorRole: "owner";
  schema: {
    organization: { modelName: "branch" };
    member: { modelName: "branchMember"; fields: { organizationId: "branchId" } };
    invitation: {
      modelName: "branchInvitation";
      fields: { organizationId: "branchId" };
    };
  };
}

export type PosOrgPlugin = DefaultOrganizationPlugin<PosOrgPluginOptions>;
export type PosPlugins = [PosOrgPlugin, ReturnType<typeof bearer>, ReturnType<typeof nextCookies>];

export interface PosAuthOptions extends BetterAuthOptions {
  plugins: PosPlugins;
}

export type PosAuth = Auth<PosAuthOptions>;

export const buildAuthOptions = (deps: CreateAuthDeps): PosAuthOptions => ({
  appName: deps.env.appName,
  secret: deps.env.secret,
  baseURL: deps.env.baseUrl,
  ...(deps.env.basePath !== undefined ? { basePath: deps.env.basePath } : {}),
  trustedOrigins: [...deps.env.trustedOrigins],
  telemetry: { enabled: false },
  database: drizzleAdapter(deps.db, {
    provider: "pg",
    schema: deps.schema,
  }),
  ...(deps.secondaryStorage ? { secondaryStorage: deps.secondaryStorage } : {}),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await deps.mailer.send({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await deps.mailer.send({
        to: user.email,
        subject: "Verify your email",
        text: `Verify your email: ${url}`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 15,
    // With secondaryStorage set, sessions would live ONLY in Redis by default.
    // Keep Postgres as source of truth for RLS/audit:
    storeSessionInDatabase: true,
    // 60s: bounds the session-revocation blind spot (cookieCache skips the DB).
    // Branch procedures re-check membership per request via getActiveMember, so
    // ROLE changes apply immediately; only outright revocation waits out this TTL.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: deps.secondaryStorage ? "secondary-storage" : "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  advanced: {
    cookiePrefix: "pos",
    ...(deps.env.cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: deps.env.cookieDomain,
          },
        }
      : {}),
    database: { generateId: "uuid" }, // -> pg gen_random_uuid() defaults in generated schema
  },
  plugins: [
    organization({
      ac,
      roles: posRoles,
      creatorRole: "owner",
      schema: {
        organization: { modelName: "branch" },
        member: {
          modelName: "branchMember",
          fields: { organizationId: "branchId" },
        },
        invitation: {
          modelName: "branchInvitation",
          fields: { organizationId: "branchId" },
        },
      },
    }),
    bearer(),
    nextCookies(), // MUST stay last
  ],
});

export function createAuth(deps: CreateAuthDeps): PosAuth {
  return betterAuth(buildAuthOptions(deps));
}
