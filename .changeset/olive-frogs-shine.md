---
"@nukesai-pos/backend": patch
---

Release pipeline now verifies against the npm registry that a publish actually
landed.

`pnpm publish` reporting success is not proof of publication: a release run
printed `✅ Published package @nukesai-pos/cli@…`, exited 0, and the registry
returns 404 for that version while the other three packages published fine —
splitting a fixed version group with nothing red. Both publish paths now end in
a registry check that every package exists at the expected version and that the
dist-tag resolves to it.

No runtime code changes.
