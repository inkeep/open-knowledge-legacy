# Run: 2026-04-14-initial

**Status:** Closed (2026-04-14)
**Intent:** Fanout (re-dispatch after pre-compaction run produced scaffolding only)
**Created:** 2026-04-14

**Consolidation summary:** 4 sub-reports → parent REPORT.md (629 lines). 21 sub-report evidence files → 8 parent-level evidence files (one per dimension). Claim inventory at `fanout/2026-04-14-initial/CLAIMS.md` (84 claims, 83 CONFIRMED / 1 INFERRED). Zero `fanout/` path leakage in REPORT.md or parent evidence/. Sub-reports preserved for auditability.

## Parent Context

**Purpose:** Factual landscape of how code editors and file editors with git integration expose the post-clone git lifecycle (staging, committing, push/pull, merge/rebase conflicts, branch management, remote/auth persistence, error recovery, history/diff visualization, and non-developer abstraction patterns) to users. Portable/3P-factual. Any team implementing git lifecycle UX in an editor should derive equal value regardless of product category.

**Primary question:** What are the industry patterns, architectural decisions, and UX choices for post-clone git lifecycle management across the spectrum from developer-facing IDEs (VSCode, JetBrains, Cursor, Zed) → visual git clients (GitHub Desktop, GitKraken, Fork, Sourcetree) → power-user TUIs (lazygit, Magit, tig, Stacked Git) → non-developer wrappers (Obsidian-Git, TinaCMS, Logseq)?

**Non-goals:**
- Clone/initial init UX (covered in `reports/open-from-github-onboarding-mechanics/`)
- OAuth/auth implementation details at clone time (same as above)
- CRDT-specific branching internals (covered in `reports/crdt-branching-namespacing-prior-art/`)
- Git library selection criteria (covered in `reports/git-library-for-knowledge-platform/`)
- Draft-isolation-as-worktree patterns for AI agents (covered in `reports/claude-code-worktree-git-isolation/` and `reports/worktree-orchestration-landscape/`)

## Rubric (8 dimensions → 4 fanout directions)

| # | Dimension | Priority | Depth | Direction |
|---|---|---|---|---|
| D1 | Staging & commit UX (hunks/files/all, messages, amend, undo) | P0 | Deep | 1 |
| D2 | Push/pull mechanics (fetch/pull/rebase, upstream tracking, dry-run) | P0 | Deep | 1 |
| D3 | Merge/rebase conflict UX (3-way view, markers, abort, resolution flow) | P0 | Deep | 2 |
| D6 | Error handling & recovery (network fail, rejected push, reflog/undo) | P0 | Deep | 2 |
| D4 | Branch management (create/switch/delete, stash-on-switch, detached HEAD) | P0 | Deep | 3 |
| D5 | Remote/auth persistence (credential store, token refresh, multi-account, SSH/HTTPS) | P0 | Deep | 3 |
| D7 | History & diff visualization (log graph, blame, file history, diff viewer) | P1 | Moderate | 4 |
| D8 | Non-developer abstraction patterns (TinaCMS/Obsidian-Git/Logseq; auto-commit/sync; safety nets) | P0 | Deep | 4 |

## Selected Fanout Directions

| # | Direction | Dimensions | Facet Count | Source Diversity | Assessment |
|---|---|---|---|---|---|
| 1 | staging-committing-push-pull | D1 + D2 | 8+ | 10+ OSS repos + docs | Heavy |
| 2 | merge-conflicts-error-recovery | D3 + D6 | 8+ | 10+ OSS repos + docs | Heavy |
| 3 | branch-management-remote-auth | D4 + D5 | 8+ | 10+ OSS repos + docs | Heavy |
| 4 | history-diff-and-nondev-ux | D7 + D8 | 6+ | mixed | Heavy |

## Target sources (3P, across all directions)

- **Developer IDEs:** `microsoft/vscode`, JetBrains IDEs docs + IntelliJ Community source, `zed-industries/zed`, Cursor (VSCode fork behavior), Neovim + fugitive.vim, Emacs Magit
- **Visual git clients:** `desktop/desktop` (+ `dugite`), GitKraken (docs), Fork (docs), Sourcetree (Atlassian docs), SmartGit (docs)
- **Power-user TUIs:** `jesseduffield/lazygit`, `jonas/tig`, `stacked-git/stgit`, Graphite (`withgraphite/graphite-cli`)
- **CLI tooling:** `cli/cli` (gh), `git/git` docs (porcelain behavior)
- **Non-developer wrappers:** `Vinzent03/obsidian-git`, `tinacms/tinacms` + Tina Cloud docs, `logseq/logseq` git plugin, `siyuan-note/siyuan` sync, Joplin sync
- **Libraries (auth/credential cache specifics):** `steveukx/git-js` (simple-git), `isomorphic-git/isomorphic-git`, git-credential-manager source

## Sub-instance Tracking

| Direction | Status | Report Path | Notes |
|---|---|---|---|
| staging-committing-push-pull | complete | fanout/2026-04-14-initial/staging-committing-push-pull/ | D1+D2 — 410-line REPORT.md + 5 evidence files |
| merge-conflicts-error-recovery | complete | fanout/2026-04-14-initial/merge-conflicts-error-recovery/ | D3+D6 — 454-line REPORT.md + 4 evidence files |
| branch-management-remote-auth | complete | fanout/2026-04-14-initial/branch-management-remote-auth/ | D4+D5 — 418-line REPORT.md + 6 evidence files |
| history-diff-and-nondev-ux | complete | fanout/2026-04-14-initial/history-diff-and-nondev-ux/ | D7+D8 — 433-line REPORT.md + 6 evidence files |

## Fanout Directory

`reports/git-lifecycle-push-pull-merge-patterns/fanout/2026-04-14-initial/`

## Previous run notes

The pre-compaction dispatch of `--fanout` created directory scaffolding but never produced sub-reports (dispatch limitation — parent agent only scaffolded, didn't launch workers). This run re-dispatches each direction as an independent nested `/research --headless` instance with explicit spawn commands and depth control.
