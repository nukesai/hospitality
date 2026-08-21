// Wired by withNukesPos() -> createNextIntlPlugin (aliases next-intl/config here).
// Routed mode: the [locale] segment is forwarded by next-intl itself; no cookie
// read keeps static rendering possible.
import { createPosRequestConfig } from "@nukesai-pos/frontend/server";

export default createPosRequestConfig({ cookieName: false });
