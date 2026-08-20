/**
 * DERIVED from @nukesai-pos/common — the single catalog source of truth.
 * This module only shapes the common catalog into i18next's namespace layout
 * and carries the literal key types for the consumer's i18next augmentation.
 */
import { en as commonEn } from "@nukesai-pos/common/i18n/locales/en";

export const en: { readonly pos: typeof commonEn } = { pos: commonEn };

export type PosEnResources = typeof en;
/** Same keys, any translated strings — the contract every other locale satisfies. */
export type PosLocaleResources = {
  readonly [NS in keyof PosEnResources]: Record<keyof PosEnResources[NS], string>;
};
