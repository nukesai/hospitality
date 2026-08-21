import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * next.config wrapper — the whole build-side integration:
 *
 *   import { withNukesPos } from "@nukesai-pos/frontend/next-config";
 *   export default withNukesPos({ ...your config });
 *
 * NO server-only pill here: next.config.ts is evaluated by plain Node without
 * the react-server condition, where importing server-only throws.
 */
export interface WithNukesPosOptions {
  /** Path to the app's i18n request config; omit for next-intl's ./i18n/request.ts convention.
   *  MUST be relative — Turbopack rejects absolute paths (plugin throws). */
  readonly requestConfig?: string;
  /** Set false when the app already wires createNextIntlPlugin itself. */
  readonly intl?: boolean;
  /** Opt-in experimental barrel optimization (Next docs: not production-recommended).
   *  Tree-shaking is already guaranteed by subpath exports + leaf directives. */
  readonly optimizePackageImports?: boolean;
}

/**
 * Next accepts a config object OR a `(phase, { defaultConfig })` function
 * (`next.config.ts` documents both). Both shapes are wrapped: spreading a
 * FUNCTION would quietly produce `{}` and drop every option the host app
 * declared, so the function form is composed instead.
 */
export type NextConfigFn = (
  phase: string,
  context: { defaultConfig: NextConfig },
) => NextConfig | Promise<NextConfig>;
export type NextConfigInput = NextConfig | NextConfigFn;

export function withNukesPos(config?: NextConfig, options?: WithNukesPosOptions): NextConfig;
export function withNukesPos(config: NextConfigFn, options?: WithNukesPosOptions): NextConfigFn;
export function withNukesPos(
  config: NextConfigInput = {},
  options: WithNukesPosOptions = {},
): NextConfigInput {
  if (typeof config === "function") {
    return async (phase, context) => applyNukesPos(await config(phase, context), options);
  }
  return applyNukesPos(config, options);
}

function applyNukesPos(config: NextConfig, options: WithNukesPosOptions): NextConfig {
  let next: NextConfig = {
    ...config,
    // Backend stays a native Node dependency graph (pg pools, pino) — never
    // bundled into Server Components output. 16.1+ Turbopack externalizes its
    // transitive deps automatically.
    serverExternalPackages: [
      ...new Set([...(config.serverExternalPackages ?? []), "@nukesai-pos/backend"]),
    ],
  };

  if (options.optimizePackageImports === true) {
    next = {
      ...next,
      experimental: {
        ...next.experimental,
        optimizePackageImports: [
          ...new Set([
            ...(next.experimental?.optimizePackageImports ?? []),
            "@nukesai-pos/frontend",
            "@nukesai-pos/common",
          ]),
        ],
      },
    };
  }

  if (options.intl === false) return next;
  const withIntl =
    options.requestConfig === undefined
      ? createNextIntlPlugin()
      : createNextIntlPlugin(options.requestConfig);
  return withIntl(next);
}
