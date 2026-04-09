# Evidence: Git Persistence x Onboarding Friction (D4)

**Dimension:** D4 — Intersection of git persistence model and zero-friction onboarding
**Date:** 2026-04-08
**Sources:** Git documentation, Gerrit refs docs, Storybook issue #26095, gitignore.pro, Hocuspocus persistence docs, existing onboarding report

---

## Key files referenced
- `/reports/onboarding-multiproject-ux/REPORT.md` — existing onboarding research
- `/reports/onboarding-multiproject-ux/evidence/cli-init-patterns.md` — 8 tools compared
- `/reports/onboarding-multiproject-ux/evidence/kb-in-repo-patterns.md` — repo topology patterns
- `/evidence/auto-persistence-architecture.md` — locked three-tier design

---

## Findings

### Finding: `npx openknowledge init` must validate git presence — no comparable tool has this dependency
**Confidence:** CONFIRMED
**Evidence:** The persistence pipeline is structurally dependent on git (WIP refs, isolated index, commit-tree). No comparable tool (Obsidian, Storybook, Docusaurus, Turborepo) requires git this deeply. Obsidian has zero git awareness. Storybook assumes git exists. The init command MUST detect: work tree, bare repo, submodule, worktree — before proceeding.

**Implication:** Init decision tree: existing work tree → use parent git (sidecar). No git + `--standalone` → auto `git init`. No git + no flag → warn and guide. Bare repo → error. Worktree → works (shared refs). Submodule → warn but allow.

### Finding: WIP refs are invisible to casual git use but visible to power-user commands
**Confidence:** CONFIRMED
**Evidence:** `git branch`, `git log`, `git status`, `git push` (default), `git push --all` — do NOT see `refs/wip/`. `git for-each-ref`, `git push --mirror`, `git clone --mirror` — DO see them. GitHub UI only displays `refs/heads/` and `refs/tags/`.

**Implication:** Standard developer workflows are safe. `git push --mirror` is the only realistic risk vector — should be documented.

### Finding: Custom ref namespaces have strong precedent in mature tools
**Confidence:** CONFIRMED
**Evidence:** git stash (`refs/stash`), git notes (`refs/notes/*`), Gerrit (`refs/changes/*`, `refs/meta/config`), gittuf (`refs/gittuf/*`), GitHub (`refs/pull/*/head`). Gerrit is the most extreme user — stores all review metadata as commits in custom refs. Primary isolation mechanism is server-side `transfer.hideRefs`.

**Implication:** `refs/wip/` follows established conventions. Not a novel or fragile pattern.

### Finding: GIT_INDEX_FILE should live at `.openknowledge/cache/git-index`
**Confidence:** INFERRED
**Evidence:** Options evaluated: `.openknowledge/cache/` (gitignored, discoverable, survives reboots), `.git/openknowledge-index` (pollutes `.git/`), `/tmp/` (lost on reboot). The index file is not truly temporary — it represents the last known state for incremental WIP commits.

**Implication:** Store at `.openknowledge/cache/git-index`. Auto-covered by `.openknowledge/cache/` gitignore entry.

### Finding: Init should append to `.gitignore` with a commented section — well-precedented
**Confidence:** CONFIRMED
**Evidence:** Next.js, Docusaurus, Turborepo, Astro all modify `.gitignore` during init. Storybook does NOT (known gap — issue #26095). Best practice from gitignore.pro: "When a tool introduces artifacts, the same operation should introduce the ignore rules."

**Implication:** Init appends `.openknowledge/cache/` to `.gitignore` with a `# Open Knowledge` comment. Idempotent check before appending.

### Finding: Six gaps identified in the existing onboarding report
**Confidence:** CONFIRMED
**Evidence:** Cross-reference of onboarding report D1/D4 with persistence architecture reveals:
- G1 (HIGH): Git presence validation not addressed in D1 init patterns
- G2 (MEDIUM): WIP ref leakage via `--mirror` not documented
- G3 (LOW): `.openknowledge/cache/git-index` covered by wildcard but not explicit
- G4 (MEDIUM): WIP ref cleanup lifecycle after checkpoints not mentioned
- G5 (MEDIUM): Crash recovery from stale lock files / corrupt index not addressed
- G6 (LOW→MEDIUM): `git gc` object accumulation from WIP refs not planned

**Implication:** The onboarding report's init recommendations are sound but need supplementing with git validation and persistence-specific concerns.

### Finding: Two tension points between onboarding goals and persistence model
**Confidence:** INFERRED
**Evidence:**
1. "Under 10 seconds" init target vs. git validation complexity (detecting work tree, bare, submodule, worktree, version). Still achievable but adds steps not anticipated.
2. Sidecar "uses parent git" recommendation vs. WIP ref pollution of parent repo's ref space.

**Implication:** Neither is a blocker. Git validation is fast (<1s). WIP ref pollution is invisible to standard workflows. But both should be documented.

---

## Negative searches
- Searched for tools that auto-manage `.git/config` remote push refspecs: none found that do this silently
- Searched for CI/CD pipelines that iterate all refs and choke on custom namespaces: no confirmed incidents, but theoretical risk from mirror/backup scripts

---

## Gaps / follow-ups
- Windows-specific git behavior with custom refs not investigated
- `git gc` long-term impact with thousands of WIP commits needs empirical measurement
