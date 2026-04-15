# Claim Inventory: Git Lifecycle UX Patterns

**Consolidated from:** 4 sub-reports, 21 evidence files
**Date:** 2026-04-14
**Scope:** D1–D8 post-clone git lifecycle UX across 15+ editors

---

## D1: Staging & Commit UX

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C1.1 | Four staging tiers exist: stage-all (12/12), stage-file (11/12), stage-hunk (10/12), stage-line (8/12) | CONFIRMED | table | Dir1 REPORT, staging-granularity.md |
| C1.2 | Three sub-hunk strategies: patch construction, in-process diff fixup, three-way diff editor | CONFIRMED | prose | Dir1 REPORT, staging-granularity.md |
| C1.3 | GitHub Desktop rebuilds the index from scratch at commit time via unstageAll→stageFiles→commit | CONFIRMED | code | Dir1 staging-granularity.md |
| C1.4 | Two commit message paradigms: inline box vs full editor buffer | CONFIRMED | prose | Dir1 commit-message-ux.md |
| C1.5 | AI commit message generation shipped in 5 of 7 commercial editors | CONFIRMED | table | Dir1 commit-message-ux.md |
| C1.6 | GitKraken Commit Composer offers AI-assisted commit history restructuring | CONFIRMED | prose | Dir1 commit-message-ux.md |
| C1.7 | lazygit branch-name-based commit prefix via CommitPrefixConfig regex | CONFIRMED | code | Dir1 commit-message-ux.md |
| C1.8 | Magit offers 12 commit transient commands | CONFIRMED | prose | Dir1 commit-message-ux.md |
| C1.9 | Pushed-commit amend warnings exist only in Magit and Zed | CONFIRMED | prose | Dir1 commit-message-ux.md |
| C1.10 | Four undo-commit strategies: mixed reset, soft reset, reflog-based, full transient | CONFIRMED | table | Dir1 undo-revert-autocommit.md |
| C1.11 | lazygit reflog-based undo handles COMMIT/CHECKOUT/REBASE action kinds | CONFIRMED | code | Dir1 undo-revert-autocommit.md |
| C1.12 | Auto-commit is exclusively a non-developer pattern (Obsidian-Git only) | CONFIRMED | prose | Dir1 undo-revert-autocommit.md |
| C1.13 | VS Code smart-commit is opt-in (default false) with one-time prompt | CONFIRMED | code | Dir1 undo-revert-autocommit.md |

## D2: Push/Pull Mechanics

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C2.1 | No editor defaults to rebase for pull; merge is universal default | CONFIRMED | table | Dir1 pull-fetch-mechanics.md |
| C2.2 | Obsidian-Git syncMethod "reset" hard-resets local to remote — unique in ecosystem | CONFIRMED | code | Dir1 pull-fetch-mechanics.md |
| C2.3 | Fetch intervals span 1 min (lazygit/GitKraken) to 1 hour (GitHub Desktop) | CONFIRMED | table | Dir1 pull-fetch-mechanics.md |
| C2.4 | VS Code/Zed/Magit default to no auto-fetch | CONFIRMED | prose | Dir1 pull-fetch-mechanics.md |
| C2.5 | GitHub Desktop fetch uses server-driven interval with random ±30s skew | CONFIRMED | code | Dir1 pull-fetch-mechanics.md |
| C2.6 | Four force push protection strategies across ecosystem | CONFIRMED | table | Dir1 push-upstream-indicators.md |
| C2.7 | GitHub Desktop ForcePushBranchState three-state enum: NotAvailable/Available/Recommended | CONFIRMED | code | Dir1 push-upstream-indicators.md |
| C2.8 | Zed has no force push protection | CONFIRMED | prose | Dir1 push-upstream-indicators.md |
| C2.9 | Dry-run/preview only in Magit push transient | CONFIRMED | prose | Dir1 pull-fetch-mechanics.md |
| C2.10 | lazygit supports triangular workflows with separate pull/push divergence | CONFIRMED | code | Dir1 push-upstream-indicators.md |
| C2.11 | Three upstream tracking patterns: auto-set, interactive prompt, explicit transient | CONFIRMED | prose | Dir1 push-upstream-indicators.md |

## D3: Merge/Rebase Conflict UX

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C3.1 | Four conflict presentation architectures exist | CONFIRMED | prose | Dir2 d3-conflict-presentation.md |
| C3.2 | JetBrains detects rebase reverse-root and swaps panes | CONFIRMED | code | Dir2 d3-conflict-presentation.md |
| C3.3 | Zed "Resolve with Agent" is the most forward-looking conflict pattern | CONFIRMED | prose | Dir2 d3-conflict-presentation.md |
| C3.4 | No editor provides aggregate conflict resolution progress | CONFIRMED (gap) | prose | Dir2 d3-conflict-presentation.md |
| C3.5 | Resolution granularity spans four levels | CONFIRMED | table | Dir2 d3-conflict-presentation.md |
| C3.6 | Semantic/AST-aware merge absent from all mainstream editors | CONFIRMED (neg) | prose | Dir2 d3-conflict-presentation.md |
| C3.7 | Rebase UX spans three tiers: full sequence editor, progress parsing, boolean only | CONFIRMED | table | Dir2 d3-rebase-and-operations.md |
| C3.8 | VS Code reads no step progress files during rebase — boolean only | CONFIRMED | code | Dir2 d3-rebase-and-operations.md |
| C3.9 | No editor scans staged files for leftover conflict markers | CONFIRMED (gap) | prose | Dir2 d3-rebase-and-operations.md |
| C3.10 | Cherry-pick/revert conflicts route through same UI as merge | CONFIRMED | prose | Dir2 d3-rebase-and-operations.md |
| C3.11 | git rerere works silently for all editors; none surface it | CONFIRMED | prose | Dir2 d3-rebase-and-operations.md |

## D4: Branch Management

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C4.1 | Three branch picker patterns: dropdown, panel, transient popup | CONFIRMED | table | Dir3 all evidence files |
| C4.2 | "Recently used" diverges: committer-date (VS Code) vs reflog (GitHub Desktop, lazygit) | CONFIRMED | prose | Dir3 vscode-branch-auth.md, github-desktop-branch-auth.md |
| C4.3 | Dirty-tree handling is the highest-variance UX decision | CONFIRMED | table | Dir3 all evidence files |
| C4.4 | VS Code "Migrate Changes" is the only move-to-new-branch checkout option | CONFIRMED | code | Dir3 vscode-branch-auth.md |
| C4.5 | JetBrains Smart Checkout uses Shelf (not git stash) | CONFIRMED | prose | Dir3 nondev-wrappers-jetbrains.md |
| C4.6 | Branch-from-issue exists in exactly two tools (JetBrains Tasks, lazygit PR badges) | CONFIRMED | prose | Dir3 nondev-wrappers-jetbrains.md |
| C4.7 | Magit spinoff/spinout is unique in ecosystem | CONFIRMED | code | Dir3 magit-zed-branch-auth.md |
| C4.8 | lazygit has the most complete worktree support with collision detection | CONFIRMED | code | Dir3 lazygit-branch-stash-worktree.md |
| C4.9 | No editor proactively suggests "create branch" in detached HEAD state | CONFIRMED (gap) | prose | Dir3 all evidence files |

## D5: Remote/Auth Persistence

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C5.1 | GCM ICredentialStore: 4-method interface, 8 backends | CONFIRMED | code | Dir3 credential-architecture.md |
| C5.2 | GIT_ASKPASS is the universal editor injection point; Magit sole outlier | CONFIRMED | prose | Dir3 credential-architecture.md, magit-zed-branch-auth.md |
| C5.3 | GitHub OAuth tokens don't expire — no refresh path | CONFIRMED | prose | Dir3 credential-architecture.md |
| C5.4 | gh CLI store/erase are intentional no-ops | CONFIRMED | code | Dir3 credential-architecture.md |
| C5.5 | Multi-account limited by git credential protocol (no native user concept) | CONFIRMED | prose | Dir3 credential-architecture.md |
| C5.6 | Obsidian-Git stores credentials in unencrypted browser localStorage | CONFIRMED | code | Dir3 nondev-wrappers-jetbrains.md |
| C5.7 | Zed leads with 9 hosting providers in CredentialsProvider | CONFIRMED | prose | Dir3 magit-zed-branch-auth.md |

## D6: Error Handling & Recovery

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C6.1 | JetBrains push retry loop: MAX_PUSH_ATTEMPTS = 10 | CONFIRMED | code | Dir2 d6-push-rejection-divergence.md |
| C6.2 | lazygit reflog-based undo is the most innovative recovery UX | CONFIRMED | code | Dir2 d6-safety-nets-recovery.md |
| C6.3 | Magit WIP refs provide continuous snapshots | CONFIRMED | code | Dir2 d6-safety-nets-recovery.md |
| C6.4 | JetBrains GitPreservingProcess wraps destructive ops with save/run/load | CONFIRMED | code | Dir2 d6-safety-nets-recovery.md |
| C6.5 | Network failure handling uniformly primitive — single regex, no retry | CONFIRMED | prose | Dir2 d6-push-rejection-divergence.md |
| C6.6 | VS Code lock retry: 10 attempts, quadratic backoff | CONFIRMED | code | Dir2 d6-safety-nets-recovery.md |
| C6.7 | GitHub Desktop has the most sophisticated credential recovery (SAML SSO, scope, secret scan) | CONFIRMED | code | Dir2 d6-safety-nets-recovery.md |
| C6.8 | Five safety-net categories: auto-stash, continuous backup, confirmation, published-commit, trash | CONFIRMED | prose | Dir2 d6-safety-nets-recovery.md |
| C6.9 | Only Magit's magit-delete-by-moving-to-trash routes discards to system trash | CONFIRMED | prose | Dir2 d6-safety-nets-recovery.md |

## D7: History & Diff Visualization

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C7.1 | DAG graph: two patterns (GUI-computed vs git-delegated) | CONFIRMED | prose | Dir4 d7-commit-graph-file-history-blame.md |
| C7.2 | VS Code native graph added in v1.93 (Aug 2024); GitHub Desktop has no graph | CONFIRMED | prose | Dir4 d7-commit-graph-file-history-blame.md |
| C7.3 | GitKraken does not follow renames in file history (feedback #232754) | CONFIRMED | prose | Dir4 d7-commit-graph-file-history-blame.md |
| C7.4 | Blame spans four surface patterns | CONFIRMED | prose | Dir4 d7-commit-graph-file-history-blame.md |
| C7.5 | Sublime Merge has the most structured history search (typed keywords + logical operators) | CONFIRMED | code | Dir4 d7-diff-merge-search-keyboard.md |
| C7.6 | JetBrains does not support pickaxe search (-S/-G) | CONFIRMED | prose | Dir4 d7-diff-merge-search-keyboard.md |
| C7.7 | Image diff: GitHub Desktop leads with 4 modes; rare elsewhere | CONFIRMED | prose | Dir4 d7-diff-merge-search-keyboard.md |
| C7.8 | Two keyboard paradigms: flat bindings (lazygit) vs hierarchical transients (Magit) | CONFIRMED | prose | Dir4 d7-diff-merge-search-keyboard.md |

## D8: Non-Developer Abstraction Patterns

| # | Claim | Confidence | Content Type | Sources |
|---|-------|-----------|-------------|---------|
| C8.1 | Where git executes determines abstraction quality (server API vs client wrapper) | CONFIRMED | prose | Dir4 all D8 evidence files |
| C8.2 | TinaCMS per-file commit via GitHub Contents API — no batching | CONFIRMED | code | Dir4 d8-tinacms-source-analysis.md |
| C8.3 | Obsidian-Git mobile merge conflicts broken (MergeNotSupportedError) | CONFIRMED | code | Dir4 d8-obsidian-git-source-analysis.md |
| C8.4 | Obsidian-Git "backup" → "commit-and-sync" rename in v2.27.0 | CONFIRMED | prose | Dir4 d8-obsidian-git-source-analysis.md |
| C8.5 | Six CLI retreat scenarios in Obsidian-Git | CONFIRMED | prose | Dir4 d8-conflicts-collaboration-retreat.md |
| C8.6 | TinaCMS retreats to GitHub web UI (graceful degradation), not CLI | CONFIRMED | prose | Dir4 d8-conflicts-collaboration-retreat.md |
| C8.7 | SiYuan uses block-level content-aware merge with 7-min temporal guard | CONFIRMED | code | Dir4 d8-conflicts-collaboration-retreat.md |
| C8.8 | All non-dev tools target single-user multi-device; no CRDT/presence | CONFIRMED | prose | Dir4 d8-conflicts-collaboration-retreat.md |
| C8.9 | Four commit message generation approaches: timestamp, fixed label, template+variables, AI | CONFIRMED | table | Dir4 d8-auto-commit-terminology-safety.md |
| C8.10 | Non-dev conflict strategy spectrum: avoidance → smart merge → LWW → manual markers → broken | CONFIRMED | table | Dir4 d8-conflicts-collaboration-retreat.md |

---

## Cross-Cutting Claims

| # | Claim | Confidence | Dimensions |
|---|-------|-----------|-----------|
| CC1 | Safety-net continuum: auto-stash on switch/rebase/pull and auto-commit are the same pattern | CONFIRMED | D1, D2, D4, D6, D8 |
| CC2 | Developer IDEs are converging on a common capability set; differentiation shifted to discovery UX | INFERRED | D1, D3, D7 |
| CC3 | Settings-driven vs transient-driven option discovery are competing models | CONFIRMED | D1, D2, D3, D4 |
| CC4 | AI/agent integration entering git lifecycle across commit messages, conflict resolution, and search | CONFIRMED | D1, D3, D7 |
| CC5 | Abstractions hold for happy path but fracture on states requiring human judgment | CONFIRMED | D3, D6, D8 |
| CC6 | Reflog is the most powerful recovery mechanism but invisible in most popular editors | CONFIRMED | D1, D6 |

---

## Coverage Summary

| Dimension | Claims | All CONFIRMED | Gaps identified |
|-----------|--------|---------------|-----------------|
| D1 | 13 | Yes | Zed line-level staging in progress |
| D2 | 11 | Yes | Dry-run only in Magit |
| D3 | 11 | Yes | Conflict progress bar, marker guard, semantic merge |
| D4 | 9 | Yes | Detached HEAD rescue, branch rename |
| D5 | 7 | Yes | Passkey support, inline 2FA |
| D6 | 9 | Yes | Offline mode, stale lock UI, git gc |
| D7 | 8 | Yes | Logseq internals, Cursor verification |
| D8 | 10 | Yes | Logseq source-level |
| Cross-cutting | 6 | 5 CONFIRMED, 1 INFERRED | — |
| **Total** | **84** | **83 CONFIRMED** | — |
