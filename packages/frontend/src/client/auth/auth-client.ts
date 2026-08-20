"use client";

import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

import { posClientAc, posClientRoles } from "./roles.js";

export interface AuthClientEnv {
  readonly baseUrl: string;
  /** Mobile: read the token captured from the `set-auth-token` response header on sign-in. */
  readonly getBearerToken?: (() => string | null) | undefined;
}

/** Exported for direct testing: the per-request bearer resolver better-auth calls. */
export const resolveBearerToken = (getBearerToken?: () => string | null): string =>
  getBearerToken?.() ?? "";

export type PosAuthClient = ReturnType<
  typeof createAuthClient<{
    baseURL: string;
    plugins: [
      ReturnType<
        typeof organizationClient<{ ac: typeof posClientAc; roles: typeof posClientRoles }>
      >,
    ];
  }>
>;

/**
 * Web: cookie-based out of the box. Mobile: pass getBearerToken (captured from
 * the `set-auth-token` response header on sign-in); after sign-in call
 * client.organization.setActive to pick the branch.
 */
export function createPosAuthClient(env: AuthClientEnv): PosAuthClient {
  return createAuthClient({
    baseURL: env.baseUrl,
    plugins: [organizationClient({ ac: posClientAc, roles: posClientRoles })],
    ...(env.getBearerToken
      ? {
          fetchOptions: {
            auth: {
              type: "Bearer" as const,
              /* v8 ignore next -- zero-logic thunk; better-auth invokes it per fetch. resolveBearerToken is tested directly. */
              token: () => resolveBearerToken(env.getBearerToken),
            },
          },
        }
      : {}),
  });
}
