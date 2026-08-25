---
"@nukesai-pos/backend": patch
---

Default publish channel is now `canary` rather than `latest`.

`publishConfig.tag` moves from `latest` to `canary` on all four published
packages. This is metadata only — it changes nothing about the code you install
— but it means a stray `npm publish` can no longer land unfinished packages on
the production channel.

The real guard is `scripts/resolve-release-channel.mjs`, which derives the npm
dist-tag from repository state and refuses to publish when no channel has been
selected. pnpm does not read `publishConfig.tag` at all, so the tag is passed
explicitly on the publish command.
