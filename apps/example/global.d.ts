// Consumer-owned next-intl augmentation (the library must NOT ship it — two
// AppConfig declarations with different Messages types would conflict).
import type { PosEnResources } from "@nukesai-pos/frontend/locales/en";

import type { routing } from "./i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: PosEnResources;
  }
}
