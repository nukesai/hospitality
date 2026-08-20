# @nukesai-pos/cli

Scaffolds Nukes POS into an existing Next.js 16 (App Router) application.
Proprietary — © Nukes AI & Software Solution.

```bash
npx @nukesai-pos/cli init      # detect app, write nukes-pos.json, .npmrc, (nukes-pos) route group
npx @nukesai-pos/cli add kds   # scaffold an optional surface (registry grows with releases)
npx @nukesai-pos/cli doctor    # read-only diagnosis; exits non-zero on problems
npx @nukesai-pos/cli upgrade   # regenerate scaffolds; ALWAYS a dry-run plan first
```

Global flags: `--cwd`, `--yes`, `--dry-run`, `--silent`, `--force`.

**Safety model** — this CLI writes into customer repositories:

- refuses a dirty git worktree without `--force`;
- every generated file carries a `hash:` stamp; pristine files regenerate
  silently on upgrade, edited files are never clobbered (they get a `.new`
  sidecar + diff);
- config patching is AST-based (magicast for `next.config.*`,
  comment-preserving JSONC for `tsconfig.json`) and idempotent.
