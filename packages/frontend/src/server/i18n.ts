import "server-only";

import type { i18n, Namespace, TFunction } from "i18next";
import { cache } from "react";

import { createPosI18n, type PosI18nConfig } from "../i18n/index.js";

export interface PosServerI18n {
  readonly getI18n: (lng: string) => i18n;
  readonly getT: (lng: string, ns?: Namespace) => TFunction;
}

/**
 * Consumer calls this ONCE at module scope of their own server module; the
 * returned getT is then per-request-safe: React cache() memoizes per RSC
 * request, so concurrent requests in different locales get isolated instances
 * (a shared instance + changeLanguage races across requests — verified).
 */
export const createPosServerI18n = (config: Omit<PosI18nConfig, "lng">): PosServerI18n => {
  const getI18n = cache((lng: string): i18n => createPosI18n({ ...config, lng }));
  const getT = (lng: string, ns?: Namespace): TFunction => getI18n(lng).getFixedT(lng, ns ?? null);
  return { getI18n, getT };
};
