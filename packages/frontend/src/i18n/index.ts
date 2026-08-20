import { createInstance, type i18n, type Resource, type ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next/initReactI18next";

export type PosResourceBundle = ResourceLanguage;

export interface PosI18nConfig {
  readonly lng: string;
  readonly fallbackLng?: string;
  readonly resources: Resource;
  readonly defaultNS?: string;
}

export const POS_DEFAULT_NS = "pos";

/**
 * Builds an isolated i18next instance. Never a module-level singleton: the
 * server creates one per request+locale, the client one per provider mount.
 * `initAsync: false` (i18next v26 option; replaces old `initImmediate`) makes
 * init synchronous because resources are injected in memory — `t` is usable
 * in the same tick and Suspense never triggers.
 */
export const createPosI18n = (config: PosI18nConfig): i18n => {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: config.lng,
    fallbackLng: config.fallbackLng ?? "en",
    resources: config.resources,
    defaultNS: config.defaultNS ?? POS_DEFAULT_NS,
    initAsync: false,
    // Single-brace {name} — the SAME syntax as common's translator, so catalogs
    // in @nukesai-pos/common are reused verbatim (no duplicated strings, no
    // transformation). escapeValue false: React escapes; double-escaping corrupts.
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
    react: { useSuspense: false },
  });
  return instance;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deep-merge for consumer overrides — override wins per leaf key:
 * `mergePosResources({ en }, { en: { pos: { "order.total": "Sum: {amount}" } } })`.
 */
export const mergePosResources = (base: Resource, override: Resource): Resource => {
  const merge = (
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...a };
    for (const key of Object.keys(b)) {
      const bv = b[key];
      const av = out[key];
      out[key] = isRecord(av) && isRecord(bv) ? merge(av, bv) : bv;
    }
    return out;
  };
  return merge(base, override) as Resource;
};
