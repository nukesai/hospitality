/**
 * SINGLE SOURCE OF TRUTH for POS message catalogs. `as const` keeps literal
 * keys so downstream packages (frontend i18next resources, backend translator)
 * derive their types from here — no duplicated strings anywhere.
 * Interpolation is single-brace `{name}` repo-wide: the common translator uses
 * it natively and frontend's createPosI18n configures i18next to match.
 */
export const en = {
  "order.status.pending": "Pending",
  "order.status.preparing": "Preparing",
  "order.status.ready": "Ready",
  "order.status.delivered": "Delivered",
  "order.status.paid": "Paid",
  "order.total": "Total: {amount}",
  "order.acknowledge": "Acknowledge",
  "order.acknowledged": "Acknowledged",
  "order.summary.status": "Status: {status}",
  "order.summary.items": "Items: {count}",
  "admin.title": "Nukes POS Admin",
  "admin.nav.dashboard": "Dashboard",
  "admin.nav.orders": "Orders",
  "admin.dashboard.welcome": "Welcome to your POS.",
  "admin.orders.empty": "No orders yet.",
  "errors.validationFailed": "Some fields are invalid.",
  "errors.unauthenticated": "Please sign in.",
  "errors.branchAccessDenied": "You do not have access to this branch.",
  "errors.roleForbidden": "Your role cannot perform this action.",
  "errors.resourceNotFound": "Not found.",
  "errors.orderStateConflict": "The order changed in the meantime.",
  "errors.rateLimited": "Too many requests — try again shortly.",
  "errors.internal": "Something went wrong.",
} as const;

/** Key contract every other locale must satisfy (values free, keys locked). */
export type PosMessageKey = keyof typeof en;
export type PosMessages = Readonly<Record<PosMessageKey, string>>;
