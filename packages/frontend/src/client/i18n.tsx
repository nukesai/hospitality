"use client";

import type { i18n } from "i18next";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { createPosI18n, type PosI18nConfig } from "../i18n/index.js";

export interface PosI18nProviderProps extends PosI18nConfig {
  readonly children: ReactNode;
}

/** Client boundary for translated UI; instance is stable per mount, locale switches in-place. */
export function PosI18nProvider({ children, ...config }: PosI18nProviderProps): ReactElement {
  const [instance] = useState<i18n>(() => createPosI18n(config));
  useEffect(() => {
    if (instance.language !== config.lng) {
      void instance.changeLanguage(config.lng);
    }
  }, [instance, config.lng]);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

export { useTranslation } from "react-i18next";
