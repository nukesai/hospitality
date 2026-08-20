// Consumer-owned i18next augmentation (the library must NOT ship it — a global
// declaration inside node_modules would collide with the app's own).
import type { PosEnResources } from "@nukesai-pos/frontend/locales/en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "pos";
    resources: PosEnResources;
  }
}
