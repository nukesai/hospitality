---
"@nukesai-pos/common": major
"@nukesai-pos/backend": major
"@nukesai-pos/frontend": major
"@nukesai-pos/cli": major
---

First 1.0 release. Caret ranges now work for scaffolded apps.

**This is why 1.0.0 and not 0.2.0.** The CLI writes `^${cliVersion}` into every
app it scaffolds. Under semver a caret on a `0.x` version is pinned to that
minor — `satisfies("0.2.0", "^0.1.0")` is `false` — so every app ever scaffolded
by the CLI was frozen at its scaffold version and could never receive a release
without a hand-edit to a file the consumer did not write. That contradicts the
organising principle of this repo. At `1.x` the caret does what everyone expects:
`^1.0.0` picks up every later minor and patch.

Two related fixes ship with it:

- The CLI now writes an **exact pin** rather than a caret when it is itself a
  canary. `^0.0.0-canary-<ts>-<sha>` expands to a range that can never resolve a
  stable release and floats onto every future snapshot, so an app scaffolded
  from a canary silently tracked canaries forever. Beta and stable keep the
  caret, which is the point of the channel design — `^1.2.0-beta.<ts>.sha-<sha>`
  graduates a scaffolded app onto the GA and on to the next feature train with
  no edit.

- Release channels are now selected by **branch**, not by a human remembering a
  flag. `development` publishes `@canary`, `staging` publishes `@beta`, and
  `main` publishes `@latest`. Pre mode is gone. For consumers this changes
  nothing about the code, but `@beta` now tracks a real, strictly-increasing
  version instead of a counter that could not advance.

No runtime API changed in this release.
