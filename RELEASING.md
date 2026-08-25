# Releasing

The branch is the channel. Merging is the only release action.

| Branch        | Merging into it publishes           | Version                         | dist-tag | Commits versions    |
| ------------- | ----------------------------------- | ------------------------------- | -------- | ------------------- |
| `development` | a canary, every push                | `0.0.0-canary-<utc14>-<sha7>`   | `canary` | no                  |
| `staging`     | a beta, when the queue is non-empty | `<next>-beta.<utc14>.sha-<sha>` | `beta`   | no                  |
| `main`        | a GA                                | `<next>`                        | `latest` | **yes — only here** |

---

## The normal flow

1. `git switch development && git pull`, then `git switch -c feat/<slug>`.
2. Code. Commit with a scoped conventional message — the scope is mandatory and
   the enum is in `commitlint.config.js`.
3. `pnpm changeset`. Pick the bump, **write the release note in prose**, and
   **select all four published packages**. Versioning is fixed, so a changeset
   naming fewer leaves the rest with an empty changelog section;
   `pnpm changesets:verify` refuses that.
4. Open a PR into `development`. Merge when green and reviewed.
5. **Automatic:** a canary publishes. Try it with
   `pnpm add @nukesai-pos/cli@canary` in a throwaway app.
6. **Automatic:** `promote.yml` keeps a `development → staging` PR open, its body
   carrying the exact next version and the exact CHANGELOG `main` will commit.
7. Merge that PR when development is done.
8. **Automatic:** a beta publishes at the real next version. Pilots on
   `^<next>-beta.<...>` pick it up. An empty queue publishes nothing and stays
   green.
9. Repeat. Each staging merge ships a strictly newer beta.
10. Merge the standing `staging → main` PR. **That merge is the release
    decision.** There is no second approval.
11. **Automatic:** pre-flight → `changeset version` → commit → push → publish to
    `latest` → verify against the registry → move `beta` up to the GA → tag →
    back-merge `main → staging → development` → wake the downstream channels.
12. Pilots land on the GA at their next install with no `package.json` edit.

Four things stay manual, and all four are decisions: writing the release note,
and the three merges.

---

## Hotfix

1. `git switch -c hotfix/<slug> main` — from `main`, never from `staging`.
2. Fix it. `pnpm changeset` — **`patch` only.**

   A `minor` hotfix steals the version number the beta train has already
   claimed. If `staging` computed `1.2.0` from the shared queue while `main` is
   still on `1.1.0`, a minor hotfix ships as `1.2.0` — the hotfix, not the
   piloted feature — and the feature then ships as `1.3.0`. At 1.x the pilot's
   `^1.2.0-beta.<...>` still covers `1.3.0` so the train survives, but the
   release notes lie about what shipped when.

3. PR into `main`. Merge it (merge commit).
4. **Automatic:** version → publish `1.1.1` to `latest` → verify → tag →
   back-merge down → a beta fires on `staging` so pilots get the fix too.

**Never cherry-pick a hotfix downward.** It propagates by the back-merge.
Unfinished `staging` work survives untouched, because the hotfix never branched
from `staging`.

---

## Rollback

**Rule: never `git revert -m 1` a promotion merge on `main`.**

Reproduced end to end:

```
main: revert -m 1 <promotion merge>            -> feature gone from main
back-merge main -> staging                     -> CLEAN, exit 0, feature gone
back-merge staging -> development              -> CLEAN, exit 0, feature gone
git merge --no-ff feat/refund  (to restore it) -> "Already up to date."
```

No conflict, nothing red, and `git log` still shows the `feat:` commit so it
looks present. Roll back production at 2am and by morning the pipeline has
silently deleted the feature from the two branches where the work lives.
`sync-down` now refuses this case, but that refusal is a tripwire, not a plan.

### Tier 1 — the version is bad, not dangerous (this is the default)

Roll forward. Cut a `hotfix/*` from `main` with a `patch` changeset that removes
or disables the offending behaviour. One release, one direction, no history
surgery. This is the procedure for almost every case.

### Tier 2 — consumers must stop resolving it now

Do not touch git. Move the pointer and mark the version:

```bash
for p in common backend frontend cli; do
  npm dist-tag add @nukesai-pos/$p@<last-good> latest
  npm deprecate  @nukesai-pos/$p@<bad> "Broken: <reason>. Use <last-good> or >=<fix>."
done
node scripts/verify-published.mjs --version <last-good> --tag latest
```

`latest` now resolves to the last good release for every new install. Then do
Tier 1. **Never `npm unpublish`** — it strands lockfiles.

### Tier 3 — the merge itself must leave `main` (rare, and it is history surgery)

Revert on `main`, then **immediately** `git revert` the revert on `development`
in the same hour, before any back-merge runs, and record both SHAs in the
incident note. `sync-down` stays red until `development` carries the
counter-revert. That redness is the point.

---

## One-time setup

| Setting                  | Required                                               |
| ------------------------ | ------------------------------------------------------ |
| `allow_squash_merge`     | **false**                                              |
| `allow_rebase_merge`     | **false**                                              |
| `delete_branch_on_merge` | **true**                                               |
| environment `release`    | `NPM_TOKEN` — used by canary and beta                  |
| environment `production` | `NPM_TOKEN` **plus variable `RELEASE_ALLOW_LATEST=1`** |

Branch protection is **not available on this plan** — both
`branches/main/protection` and the rulesets endpoint return
`403 Upgrade to GitHub Pro`. Production is locked by four independent keys
instead, any three of which can be wrong while the release still refuses:

1. `github.ref_name == 'main'` on the release job
2. `RELEASE_ALLOW_LATEST`, visible only inside the `production` environment
3. `HEAD` must be a merge commit — a hand-pushed commit can never reach `latest`
4. the branch-keyed shape check in `scripts/resolve-release-channel.mjs`

Because the lock lives in the repo, `pnpm channels:verify` runs on every PR and
before every publish. Its 20 asserted states are mutation-tested.

---

## Why there is no pre mode

`changeset pre enter beta` cannot advance its own `-beta.N` counter without
committed state — the counter is read off the version already on disk, so a
branch that stamps without committing recomputes `-beta.0` forever and npm
rejects the second publish. Worse, a `pre.json` that reaches `main` makes
production publish to the **beta** tag even with `RELEASE_ALLOW_LATEST=1`.

`staging` computes the real next version by running `changeset version` on a
disposable checkout instead. That touches no git refs at all, so it works on a
checkout where `main` does not exist locally — which is exactly what
`actions/checkout` produces.

## Why versions are 1.x

At `0.x` a caret cannot cross a minor: `semver.satisfies("0.2.0", "^0.1.0")` is
`false`. The CLI writes `^<cliVersion>` into every app it scaffolds, so at 0.x
every scaffolded app is frozen at its scaffold version and can never receive a
release. At 1.x carets work, and a pilot pinned to `^1.2.0-beta.<...>` rides
through every later beta, the GA, its patches, and the next feature train
without editing a file.
