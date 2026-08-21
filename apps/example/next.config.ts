import { withNukesPos } from "@nukesai-pos/frontend/next-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3 writes AGENTS.md/CLAUDE.md into the app dir; this repo's rulebook
  // lives at the monorepo root, so keep the fixture clean.
  agentRules: false,
};

// serverExternalPackages + the next-intl plugin (i18n/request.ts) are wired by
// withNukesPos — the whole build-side integration is this one wrapper.
export default withNukesPos(nextConfig);
