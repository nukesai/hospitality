---
"@nukesai-pos/common": patch
"@nukesai-pos/backend": patch
"@nukesai-pos/frontend": patch
"@nukesai-pos/cli": patch
---

The publish retry now survives a failing publish.

The three-round retry added in the previous release called a helper that ends
in `process.exit()`, so the moment `pnpm publish` exited non-zero the process
was gone and rounds two and three were unreachable. It only ever covered the
case where pnpm exited 0 and the registry disagreed — which is the failure it
was written for, so it worked, but it was one bad exit code away from not
working at all.

That distinction stops being academic under trusted publishing, where
authentication is exchanged per package: a credential that fails at package
three leaves the fixed version group split across the registry, and a retry is
the only thing that closes it.

No runtime code changed.
