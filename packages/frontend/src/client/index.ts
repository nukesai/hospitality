// Barrel — NO "use client" here (lint-enforced). Directives live on leaves so
// tree-shaking keeps unused components out of the consumer's client bundle.
export * from "./auth/auth-client.js";
export * from "./auth/roles.js";
// The provider LEAF lives in the neutral i18n/ dir (the server-side PosIntl
// composition needs it too); the hooks come straight from next-intl — barrels
// stay re-export-only and the "use client" directive stays on leaves.
export { PosIntlProvider, type PosIntlProviderProps } from "../i18n/provider.js";
export { useFormatter, useLocale, useTranslations } from "next-intl";
export * from "./logging/http-logger.js";
export * from "./order-ticket.js";
export * from "./trpc.js";
