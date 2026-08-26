---
"@nukesai-pos/common": patch
"@nukesai-pos/backend": patch
"@nukesai-pos/frontend": patch
"@nukesai-pos/cli": patch
---

Release verification now waits long enough for npm to actually publish.

The publish verifier gave the registry 30 seconds to show a new version before
calling the release a failure. That is not enough. Measured from npm's own
`time` records, `@nukesai-pos/cli` lands roughly **63 seconds** after the first
package in the same `pnpm publish -r`, reproducibly:

```
common 1.0.0  06:45:32.986Z    common canary  06:53:13.869Z
cli    1.0.0  06:46:35.866Z    cli    canary  06:54:16.361Z
```

So two correct releases went red — the 1.0.0 production release and the first
canary — while every package was in fact present a minute later. The budget is
now 195 seconds (a linear ramp capped at 30s per attempt). The check itself is
unchanged and still refuses a genuinely missing version or a dist-tag pointing
at the wrong build; it is only more patient.

No runtime code changed. This is a release-tooling fix, released across the
fixed group because the group versions in lockstep.
