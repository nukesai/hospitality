import { ne as commonNe } from "@nukesai-pos/common/i18n/locales/ne";

import { nestPosMessages, type PosMessages, type PosNestedMessages } from "../i18n/nest.js";

export const ne: PosMessages = {
  pos: nestPosMessages(commonNe) as PosNestedMessages,
};
