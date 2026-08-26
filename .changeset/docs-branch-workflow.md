---
"@nukesai-pos/common": patch
"@nukesai-pos/backend": patch
"@nukesai-pos/frontend": patch
"@nukesai-pos/cli": patch
---

Documentation: the branch-based release workflow is now written down.

`CLAUDE.md` and `AGENTS.md` still described the old single-branch delivery flow
("implement on a branch"), which no longer says enough — the branch you pick is
now the only thing that selects an npm channel. Both now state the ladder, name
`development` as the base for feature work, and reserve `main` for `hotfix/*`.

`RELEASING.md` gains the two things this release actually needed and did not
have: a triage table for a red release run (a red run does not mean nothing
published — the registry is the source of truth, not the workflow's colour), and
the correct way to create the long-lived branches from a freshly fetched base.

No runtime code changed.
