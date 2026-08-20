/**
 * DERIVED from @nukesai-pos/common — the single catalog source of truth.
 * The common catalog is FLAT (backend's dependency-free translator needs it
 * that way); next-intl needs a NESTED tree — nestPosMessages is the loss-less
 * bridge (round-trip proven in locales.test.ts). Everything lives under the
 * `pos` namespace so it can never collide with the consumer app's messages,
 * and dotted call sites stay byte-identical: useTranslations("pos") +
 * t("order.total"), t(error.message) with wire key "errors.internal", etc.
 */
import { en as commonEn } from "@nukesai-pos/common/i18n/locales/en";

import { nestPosMessages, type PosMessages, type PosNestedMessages } from "../i18n/nest.js";

export const en: PosMessages = {
  // Cast is sound: PosNestedMessages is derived from the same PosMessageKey
  // union the runtime transform walks; the round-trip test locks them together.
  pos: nestPosMessages(commonEn) as PosNestedMessages,
};

/** The `AppConfig["Messages"]` fragment consumers compose into their augmentation. */
export type PosEnResources = typeof en;
