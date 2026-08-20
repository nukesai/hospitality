import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required once a real DB/ORM driver is dropped into the adapter port —
  // Next bundles Server Component imports by default and native drivers break.
  serverExternalPackages: ["@nukesai-pos/backend"],

  experimental: {
    // Still flagged experimental in 16.3.1. Belt-and-braces on top of the
    // multi-subpath + leaf-directive + sideEffects design, which was verified
    // to tree-shake correctly WITHOUT this flag.
    optimizePackageImports: ["@nukesai-pos/frontend", "@nukesai-pos/common"],
  },
};

export default nextConfig;
