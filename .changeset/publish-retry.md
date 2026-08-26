---
"@nukesai-pos/common": patch
"@nukesai-pos/backend": patch
"@nukesai-pos/frontend": patch
"@nukesai-pos/cli": patch
---

Releases now retry the publish, not just the verification.

`pnpm publish` reports success for a package npm never actually stores.
Observed repeatedly on `@nukesai-pos/cli`, the only package here with a `bin`
field, which puts it through extra npm-side processing. From npm's own `time`
records, five consecutive canaries were stored roughly 3 min, 5½ min, 1½ min and
2½ min after publish — and the fifth was never stored at all, while the other
three packages landed in about a second each and npm reported "All Systems
Operational" throughout.

The previous fix lengthened how long the verifier would wait. That was the wrong
shape of fix, because no timeout covers "never". The release now runs up to three
publish rounds, verifying after each. Publishing a version that already exists is
a no-op, so packages that landed are untouched and only the missing one is
retried. A release that still cannot be verified after three rounds fails loudly
with the commands to diagnose it.

No runtime code changed.
