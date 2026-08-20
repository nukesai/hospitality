// Resolved by the "browser" export condition. Reaching this module means a
// client component imported a server-only entry point.
//
// Verified behaviour (Next 16.3.1 / Turbopack): the build fails with
//   Export <name> doesn't exist in target module .../_browser_guard.js [app-client]
// and the real server module is absent from .next/static.
throw new Error(
  "[@nukesai-pos/backend] This module is server-only and cannot be imported "
    + 'from a Client Component. Import UI from "@nukesai-pos/frontend/client", '
    + "or move the call into a Server Component / Route Handler.",
);

export {};
