---
"@nukesai-pos/backend": minor
"@nukesai-pos/common": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

Publish under **public** npm access, licensed **GPL-3.0-or-later**.

The packages were `UNLICENSED` (proprietary). They now ship the full GPL-3 text
and declare `"license": "GPL-3.0-or-later"`. Note the copyleft consequence: an
application that installs `@nukesai-pos/*` and distributes the result is a
derivative work and must be GPL-licensed too.

For consumers this removes a credential requirement entirely: `nukes-pos init`
no longer writes an `.npmrc`, so nobody needs an `NPM_TOKEN` in their shell or
their CI to install `@nukesai-pos/*`. `doctor` no longer checks for one either.
If you already have an `.npmrc` from a previous scaffold, the auth line is now
unnecessary — the registry entry is harmless but does nothing.

`publishConfig.access`, the changesets config and the release script all say
`public`. Provenance stays off: npm attestation requires a public source
repository and this one is private.
