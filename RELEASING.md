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

## When a release goes red

A red release run does NOT mean nothing was published. Diagnose in this order —
the registry is the source of truth, not the workflow's colour.

```bash
GH_PAGER=cat gh run view <run-id> --log-failed | tail -40
for p in common backend frontend cli; do
  printf '%-10s ' "$p"
  curl -s -H 'cache-control: no-cache' "https://registry.npmjs.org/@nukesai-pos%2f$p" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s)["dist-tags"])))'
done
```

| Failed at        | What is true                                                                 | What to do                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-flight       | Nothing ran. No version commit, no publish.                                  | Fix the cause and re-run. Safe.                                                                                                                                                                     |
| Version + commit | `main` carries a version bump for an unpublished version.                    | Re-run the workflow. The pre-flight probes the registry and resumes the publish.                                                                                                                    |
| Publish          | Some packages may be up, some not.                                           | Re-run. Publishing an already-published version is a no-op; the registry probe skips what landed.                                                                                                   |
| **Verify**       | **Everything probably published.** Check the registry before doing anything. | If all four are present and correctly tagged, the release succeeded and only the check was impatient. Push the tags by hand (below) — the tag step is gated on the publish step, so it was skipped. |
| Tag              | Published and verified; only tags are missing.                               | Push the tags by hand (below).                                                                                                                                                                      |
| Back-merge       | Published and tagged; `staging`/`development` are behind.                    | Read the error. If it refused a rollback propagation, that is deliberate — see Rollback. Otherwise resolve the `sync/*` PR it opened.                                                               |

**npm is slower than it looks.** Measured from npm's own `time` records,
`@nukesai-pos/cli` lands about **63 seconds** after the first package in the
same `pnpm publish -r`, reproducibly. That is why
`scripts/verify-published.mjs` waits 195 seconds. Do not shorten it to make a
release "faster" — a false failure costs more than the wait, and it trains
people to ignore a real one.

### Pushing tags by hand

Only needed when the tag step was skipped by an earlier failure.

```bash
git checkout main && git pull
pnpm exec changeset git-tag                     # one tag per package
VERSION="$(node -p "require('./packages/backend/package.json').version")"
git tag -a "v$VERSION" -m "v$VERSION"
git tag --points-at HEAD | while IFS= read -r t; do git push origin "refs/tags/$t"; done
```

Push tags one at a time. The names contain `@` and `/`, and the local husky
pre-push hook runs a full typecheck, which mangles a multi-ref push.

---

## Creating or re-creating the long-lived branches

**Fetch first.** `staging` and `development` were once created from a local
`main` that had not been pulled, so both landed 9 commits behind and carried
none of the release workflows — pushes to them published nothing and said
nothing.

```bash
git fetch origin
git switch -c staging   origin/main   && git push -u origin staging
git switch -c development origin/staging && git push -u origin development
```

That order gives all three an identical merge base, so the first promotion PRs
are empty rather than enormous reverse diffs.

Verify before trusting them:

```bash
for b in main staging development; do
  printf '%-12s %s  %s/4 workflows\n' "$b" "$(git rev-parse --short origin/$b)" \
    "$(git ls-tree -r origin/$b --name-only | grep -c 'release-canary\|release-beta\|release-production\|promote')"
done
```

If a branch is behind and has no unique commits, fast-forward it — this is
non-destructive:

```bash
git push origin origin/main:refs/heads/staging
```

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

**All of this is DONE as of the 1.0.0 release (2026-08-25).** It is recorded so
that a future reader can verify it rather than redo it.

| Setting                  | Required                                               | State |
| ------------------------ | ------------------------------------------------------ | ----- |
| `allow_squash_merge`     | **false**                                              | done  |
| `allow_rebase_merge`     | **false**                                              | done  |
| `delete_branch_on_merge` | **true**                                               | done  |
| environment `release`    | `NPM_TOKEN` — canary and beta                          | done  |
| environment `production` | `NPM_TOKEN` **plus variable `RELEASE_ALLOW_LATEST=1`** | done  |

Verify any time:

```bash
GH_PAGER=cat gh api repos/nukesai/hospitality --jq \
  '"squash=\(.allow_squash_merge) rebase=\(.allow_rebase_merge) delete=\(.delete_branch_on_merge)"'
GH_PAGER=cat gh api repos/nukesai/hospitality/environments/production/variables --jq '.variables[] | "\(.name)=\(.value)"'
GH_PAGER=cat gh api repos/nukesai/hospitality/environments/production/secrets   --jq '.secrets[].name'
```

`RELEASE_ALLOW_LATEST` must exist on `production` and **nowhere else**. The guard
refuses a canary or beta publish if it sees that variable, so putting it on the
shared `release` environment would break both pre-release channels. Two
environments is the reason it is invisible to them.

`NPM_TOKEN` cannot be copied between environments by any tool — GitHub secrets
are write-only, readable by nobody after they are set. A human pastes it:

```bash
gh secret set NPM_TOKEN --env production      # prompts, hidden input, no shell history
```

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
