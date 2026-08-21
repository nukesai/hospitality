import type { PosMessageSource } from "../i18n/request-config.js";

/**
 * STATIC per-locale loader map. Deliberately not a template-literal dynamic
 * import — bundlers cannot statically resolve `import(`./${locale}.js`)`
 * inside node_modules; an explicit map they can. Only the active locale's
 * catalog is loaded per request.
 */
export const posMessageLoaders: PosMessageSource = {
  en: async () => (await import("./en.js")).en,
  ne: async () => (await import("./ne.js")).ne,
};
