---
title: "Merge/Rebase Conflict UX and Error Recovery Across the Editor Spectrum"
description: "How 12+ editors and git tools present merge/rebase conflicts, surface resolution actions, handle push rejections and network failures, and provide safety nets for error recovery. Source-level analysis of VSCode, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed, plus coverage of GitKraken, Fork, Sourcetree, diffview.nvim, vim-fugitive, Obsidian-Git, and TinaCMS."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - VSCode
  - GitHub Desktop
  - lazygit
  - Magit
  - JetBrains IntelliJ
  - Zed
  - GitKraken
  - diffview.nvim
  - vim-fugitive
  - Obsidian-Git
  - TinaCMS
  - Fork
  - Sourcetree
topics:
  - merge conflict resolution UX
  - rebase visualization
  - git error recovery
  - push rejection handling
  - safety nets and undo
  - non-developer git abstraction
---

# Merge/Rebase Conflict UX and Error Recovery Across the Editor Spectrum

**Purpose:** Document the industry landscape for how editors and git tools across the spectrum — from developer IDEs to non-developer wrappers — present merge/rebase conflicts, expose resolution actions, handle git errors (rejected push, network failure, corrupt state), and provide safety nets for recovery. Portable and 3P-factual: any team implementing git lifecycle UX should derive equal value.

**Parent report:** `reports/git-lifecycle-push-pull-merge-patterns/`

---

## Executive Summary

Merge conflict resolution and error recovery UX across 12+ editors reveals four architectural patterns for conflict presentation, a clear maturity spectrum for error recovery, and several universal gaps in the industry.

**Key Findings:**

- **Conflict presentation has converged on four architectures** — dedicated 3-way merge editors (JetBrains, VSCode merge editor, GitKraken, diffview.nvim), inline markers with action buttons (VSCode inline, Zed, lazygit), file-list dialogs that delegate to external editors (GitHub Desktop, Sourcetree), and Emacs buffer-based resolution (Magit via smerge + ediff). The inline-with-buttons pattern is the rising trend, with Zed and JetBrains adding AI/agent resolution as a new action alongside accept-ours/theirs.
- **No editor provides aggregate "N of M files resolved" progress.** Per-file tracking exists (VSCode merge editor tracks `unhandledConflictsCount`), but no tool shows cross-file resolution progress at the SCM level. lazygit comes closest by auto-detecting when all conflicts are resolved and prompting to continue.
- **Rejected push recovery ranges from automated retry loops (JetBrains) to bare error messages (Zed).** JetBrains implements a 10-attempt push-update-push cycle with merge/rebase choice dialog. Most editors only suggest "try pulling first" without automating it. `--force-with-lease` is the universal default for force push safety.
- **Safety nets split into reactive (reflog, auto-stash) and proactive (WIP refs, Local History).** lazygit's reflog-based undo/redo is the most innovative recovery UX — global `z`/`Z` keybindings parse the reflog to reverse any operation. Magit's WIP refs provide continuous per-branch snapshots. JetBrains' Local History is a git-independent recovery mechanism. Most editors have no user-facing reflog access.
- **Non-developer wrappers bifurcate between conflict avoidance (TinaCMS) and raw conflict marker exposure (Obsidian-Git).** TinaCMS's branch-per-edit model pushes conflicts to GitHub's merge UI, where developers resolve them. Obsidian-Git drops raw `<<<<<<<`/`>>>>>>>` markers into users' notes — the worst UX for non-developers.
- **Network failure handling is uniformly primitive.** No editor distinguishes DNS failure from auth timeout from server error. No editor provides offline mode, queued operations, or retry with backoff.

---

## Research Rubric

| # | Facet | Priority | Depth |
|---|---|---|---|
| D3.1 | Conflict presentation (3-way editor vs inline markers vs resolve pane) | P0 | Deep |
| D3.2 | Conflict detection & listing (sidebar/changes list, progress indicators) | P0 | Deep |
| D3.3 | Resolution actions (accept ours/theirs/both/custom, granularity) | P0 | Deep |
| D3.4 | Semantic/language-aware merge | P1 | Moderate |
| D3.5 | Mid-rebase state visualization | P0 | Deep |
| D3.6 | Merge tool configuration (external tools, built-in) | P0 | Moderate |
| D3.7 | Preserving unresolved markers (pre-commit guards) | P0 | Moderate |
| D3.8 | Cherry-pick / revert conflicts | P1 | Moderate |
| D6.1 | Network failure handling (offline, retry, error messages) | P0 | Deep |
| D6.2 | Rejected push (non-fast-forward recovery) | P0 | Deep |
| D6.3 | Diverged histories (ahead/behind, graph, action prompts) | P0 | Deep |
| D6.4 | Reflog access & UX (operation history, undo) | P0 | Moderate |
| D6.5 | Safety nets (autostash, backup refs, confirmation dialogs) | P0 | Deep |
| D6.6 | Detached HEAD as error state | P1 | Moderate |
| D6.7 | Corrupt/locked repo handling | P1 | Moderate |
| D6.8 | Credential/auth failure recovery | P1 | Moderate |

**Source-level analysis:** VSCode, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed (6 editors). Documentation-level coverage: GitKraken, Fork, Sourcetree, diffview.nvim, vim-fugitive, Obsidian-Git, TinaCMS, tig, git CLI.

---

## Detailed Findings

### D3.1 Conflict Presentation

**Finding:** Four distinct architectural patterns exist for conflict presentation, driven by the editor's target audience and design philosophy.

**Evidence:** [evidence/d3-conflict-presentation.md](evidence/d3-conflict-presentation.md)

#### Architecture 1 — Dedicated 3-way merge editor

| Editor | Layout | Notes |
|--------|--------|-------|
| JetBrains | Left (yours) / Right (theirs) / Center (editable result from base) | Gold standard. Auto-swaps sides during rebase. AI extension point. |
| VSCode merge editor | Input1 / Input2 / Result, two layout modes (`mixed`/`columns`) | Opt-in via `git.mergeEditor`. Tracks `unhandledConflictsCount`. |
| GitKraken | Left (current) / Right (incoming) / Bottom (editable output) | Checkbox selection. AI auto-resolve. |
| diffview.nvim | 3/4-way configurable layouts (`diff3_horizontal`, `diff4_mixed`, etc.) | Terminal-based. Full `git mergetool` replacement. |

JetBrains' reverse-root detection stands out: during rebase, the "ours" and "theirs" labels are semantically swapped in git's convention, but IntelliJ detects this via `GitMergeUtil.isReverseRoot(repository)` and transparently swaps the panes so the user always sees their own changes on the left.

#### Architecture 2 — Inline markers with action buttons

| Editor | Detection | Actions | Emerging capability |
|--------|-----------|---------|-------------------|
| VSCode inline | Text scan for `<<<<<<<`/`>>>>>>>` markers | CodeLens: Accept Current / Incoming / Both / Compare | — |
| Zed | `ConflictRegion` struct with anchor ranges | Inline buttons: "Use [branch]" / "Use Both" | "Resolve with Agent" button |
| lazygit | Conflict markers colored red, hunk selection highlighted | `<space>` accept hunk, `b` accept both, arrow keys navigate | Content undo stack per conflict |

Zed's "Resolve with Agent" is the most forward-looking pattern: each inline conflict block has an optional button that sends the conflict text, file path, and branch names to an AI agent for resolution. JetBrains has an equivalent extension point (`MergeResolveActionSupport`) but surfaces it in the editor notification panel rather than inline.

#### Architecture 3 — File-list dialog (delegates to external tools)

GitHub Desktop, Sourcetree, and Fork use this pattern. Conflicted files appear in a list; the primary action is "Open in [external editor]" or "Launch External Merge Tool." Resolution at the git level is offered via "Resolve Using Mine/Theirs" right-click options (whole-file granularity). GitHub Desktop uniquely uses `git diff --check` to count conflict markers per file and displays "N conflicts" next to each file.

#### Architecture 4 — Emacs buffer-based (Magit)

Magit auto-activates `smerge-mode` when visiting a conflicted file and provides hunk-level resolution keybindings directly from the status buffer diff (`u` = keep ours, `l` = keep theirs, `b` = keep base, `a` = keep all). For more complex conflicts, `e` launches Emacs' `ediff` in 3-way merge mode with ancestor buffers.

**Decision triggers:**
- If the target user is a developer comfortable with multiple panes → Architecture 1 or 4
- If the editor is primarily a code editor where conflicts are incidental → Architecture 2
- If the target user is non-technical or the editor has no text editing infrastructure for conflicts → Architecture 3

---

### D3.2 Conflict Detection and Listing

**Finding:** All editors detect conflicts from `git status` porcelain codes. No editor provides aggregate cross-file progress tracking.

**Evidence:** [evidence/d3-conflict-presentation.md](evidence/d3-conflict-presentation.md)

Every editor studied parses git's two-letter status codes to identify conflicted files. The seven unmerged status codes (`UU`, `AA`, `DD`, `AU`, `UA`, `DU`, `UD`) are universally recognized, though editors differ in how finely they classify them. GitHub Desktop and lazygit distinguish "conflicts with inline markers" (`UU`, `AA`) from "manual conflicts" (`DD`, `DU`, `UD`, etc.), which determines whether to offer text-level or file-level resolution.

The universal gap: no editor studied provides a "3 of 7 conflicts resolved" progress bar at the SCM level. VSCode's merge editor tracks `unhandledConflictsCount` per open file, but this is not aggregated. lazygit's auto-detection of conflict count dropping to zero is the closest behavior — it automatically prompts the user to continue when all files are resolved.

---

### D3.3 Resolution Actions and Granularity

**Finding:** Resolution granularity spans four levels, and every editor exposes at least whole-file ours/theirs.

**Evidence:** [evidence/d3-conflict-presentation.md](evidence/d3-conflict-presentation.md)

| Granularity | Editors |
|-------------|---------|
| Whole file (ours/theirs) | All editors (via `git checkout --ours/--theirs`) |
| Per conflict block (hunk) | VSCode inline, lazygit, Magit smerge, diffview.nvim |
| Per modified-base-range | VSCode merge editor, JetBrains, GitKraken |
| Per line (direct editing) | JetBrains (result pane), GitKraken (output panel), diffview.nvim |

Magit's discard-on-conflict flow is noteworthy: when `magit-discard` is invoked on a conflicted file, it prompts `[o]urs/upper`, `[b]ase`, or `[t]heirs/lower` — a three-choice model that includes the base version, which most editors omit from quick-resolution options.

---

### D3.4 Semantic/Language-Aware Merge

**Finding:** No mainstream editor uses AST or language-aware merge for git conflict resolution.

**Evidence:** [evidence/d3-conflict-presentation.md](evidence/d3-conflict-presentation.md) (negative searches section)

Despite JetBrains having full AST infrastructure for dozens of languages, its merge tool operates purely at the text/line level. IntelliJ's "Resolve Simple Conflicts" feature auto-merges non-overlapping changes within a line, but this is character-level, not semantic. No other editor in the study applies tree-sitter, LSP, or AST analysis to merge resolution.

Semantic merge exists as a standalone commercial tool ([SemanticMerge](https://www.semanticmerge.com/) from PlasticSCM/Unity), but it is not integrated into any mainstream editor's git workflow. This remains an open research area.

**Remaining uncertainty:** Whether any JetBrains plugin (not the core git4idea plugin) offers semantic merge capabilities. The core platform does not.

---

### D3.5 Mid-Rebase State Visualization

**Finding:** Rebase UX spans a wide maturity spectrum — from full sequence editors (Magit, JetBrains) to boolean "in progress" indicators (VSCode).

**Evidence:** [evidence/d3-rebase-and-operations.md](evidence/d3-rebase-and-operations.md)

**Tier 1 — Full interactive rebase sequence editor:**

Magit's `git-rebase-mode` is the gold standard: the rebase todo file opens in the editor with per-commit action editing (`p`/pick, `r`/reword, `e`/edit, `s`/squash, `f`/fixup, `d`/drop), reordering via `M-p`/`M-n`, and the status buffer shows completed/current/remaining commits with distinct faces. Mid-rebase commands (`continue`, `skip`, `abort`, `edit`) are available from a transient popup. Published-commit protection warns before rewriting history pushed to publishing branches.

JetBrains offers a two-pane dialog (commit table with drag-to-reorder on the left, commit details/diff on the right) and a colored toolbar widget showing operation state with quick-access buttons.

lazygit interleaves TODO items and regular commits in the commits panel with color-coded actions (Pick=cyan, Drop=red, Edit=green, Fixup=magenta). It auto-resolves empty commits, auto-prompts when all conflicts are resolved, and includes `--autostash` on all interactive rebase commands.

**Tier 2 — Progress parsing with step counter:**

GitHub Desktop parses `.git/rebase-merge/msgnum` and `end` files and `Rebasing (N/M)` stderr output for live progress. Shows a percentage progress bar.

**Tier 3 — Boolean state only:**

VSCode detects rebase via sentinel directories but does not read step progress files. Status bar shows `{branchName} (Rebasing)` with no step/total counter. This is a notable gap for the most widely-used editor.

---

### D3.6 Merge Tool Configuration

**Finding:** Modern IDEs are self-contained merge tools; external merge tool configuration is a legacy pattern preserved in visual git clients and CLI-adjacent tools.

**Evidence:** [evidence/d3-rebase-and-operations.md](evidence/d3-rebase-and-operations.md)

| Editor | External merge tool support |
|--------|---------------------------|
| VSCode | None — VSCode IS the merge tool |
| JetBrains | None — IDE IS the merge tool |
| Zed | None — built-in inline resolution |
| GitHub Desktop | None — delegates to user's external editor |
| lazygit | Yes — `git mergetool` launch from menu |
| Magit | Via ediff — customizable `magit-ediff-dwim-resolve-function` |
| GitKraken | Yes — Beyond Compare, FileMerge, Kaleidoscope, KDiff, Araxis, P4Merge |
| Fork | Yes — external merge tool from context menu |
| Sourcetree | Yes — P4Merge default, configurable |

---

### D3.7 Unresolved Marker Guards

**Finding:** No editor scans staged files for leftover conflict markers. All rely on git's built-in unmerged-file check, which has a gap.

**Evidence:** [evidence/d3-rebase-and-operations.md](evidence/d3-rebase-and-operations.md)

Git itself prevents committing files that are in an unmerged state (UU/AA/DD/etc. status codes). However, if a user manually edits a file, stages it (clearing the unmerged status), but accidentally leaves one set of `<<<<<<<`/`>>>>>>>` markers, git will commit it. No editor adds a secondary text-scan guard for this scenario.

The closest guards: VSCode's merge editor shows a warning when closing with unhandled conflicts; GitHub Desktop disables the submit button while files remain unresolved and shows a `CommitConflictsWarning` override dialog. But these only apply during the merge workflow, not as a general pre-commit check.

A pre-commit hook checking for conflict markers (e.g., `grep -rn '<<<<<<< ' staged-files`) would close this gap but is not built into any editor studied.

---

### D3.8 Cherry-Pick and Revert Conflicts

**Finding:** All editors route cherry-pick and revert conflicts through the same UI as merge/rebase, with minor operation-specific differences.

**Evidence:** [evidence/d3-rebase-and-operations.md](evidence/d3-rebase-and-operations.md)

GitHub Desktop uses a unified `MultiCommitOperation` component with the same step state machine for merge, rebase, cherry-pick, squash, and reorder. JetBrains shares `GitApplyChangesProcess` between cherry-pick and revert. lazygit tracks CherryPicking and Reverting as independent booleans alongside Rebasing and Merging. Magit shows sequencer progress for multi-commit cherry-pick/revert via `.git/sequencer/` files.

The skip command (`git cherry-pick --skip`, `git revert --skip`) is available for cherry-pick and revert (and rebase) but not merge. lazygit encodes this: `CanSkip()` returns true for rebase, cherry-pick, and revert, but false for merge.

---

### D6.1 Network Failure Handling

**Finding:** Network failure handling is uniformly primitive. No editor distinguishes failure types or provides offline mode.

**Evidence:** [evidence/d6-push-rejection-divergence.md](evidence/d6-push-rejection-divergence.md)

All editors detect network failures via a single regex on git's stderr ("Could not read from remote repository"). No editor distinguishes DNS failure from auth timeout from HTTP 502 from SSH connection refused. No editor provides:
- Offline detection or graceful degradation
- Queued operations for when connectivity returns
- Network-specific error classification for user messaging
- Automatic retry with backoff

GitHub Desktop silently swallows network errors from background fetch operations (`backgroundTaskHandler`), which prevents notification spam but means connectivity issues surface only when the user explicitly pushes/pulls.

---

### D6.2 Rejected Push (Non-Fast-Forward)

**Finding:** Recovery from rejected push spans four strategies, from automated retry loops to bare error messages.

**Evidence:** [evidence/d6-push-rejection-divergence.md](evidence/d6-push-rejection-divergence.md)

**JetBrains — Automated update-then-retry loop:** `GitPushOperation.java` retries up to 10 times. On rejection, shows a dialog with Merge/Rebase/Cancel options plus a "remember my choice" checkbox. Creates a Local History system label before the first update for recovery. This is the most sophisticated pattern.

**GitHub Desktop — Fetch suggestion:** Shows a dialog explaining the situation and offering a "Fetch" button. Does not auto-pull or auto-retry. The user must then manually merge/pull after fetching.

**VSCode — Text suggestion:** Error notification says "Try running 'Pull' first." Offers "Open Git Log" and "Show Command Output" — no "pull then push" action button.

**lazygit — Force push confirmation:** If the branch is known to be behind, offers a confirmation dialog for `--force-with-lease`. If the remote state is unknown, offers raw `--force`. `git.disableForcePushing` config exists.

**Zed — Error toast:** Generic "git push failed" toast with "View Log" button. No recovery workflow.

All editors default to `--force-with-lease` over `--force` for force push operations. Magit makes this a deliberate UX choice: lowercase `f` maps to `--force-with-lease` (safer), uppercase `F` to `--force` (dangerous), requiring a shift-key for the destructive option.

---

### D6.3 Diverged Histories

**Finding:** All editors show ahead/behind counts; Magit uniquely shows the actual diverged commit list.

**Evidence:** [evidence/d6-push-rejection-divergence.md](evidence/d6-push-rejection-divergence.md)

The universal pattern is compact `↑N ↓N` indicators in a status bar or push/pull button. Most editors adapt the button label based on state: "Fetch" (in sync) → "Pull" (behind) → "Push" (ahead) → "Sync" (both diverged). GitHub Desktop and Zed take this furthest with dynamically-labeled split buttons with dropdown menus.

Magit's approach is distinct: the status buffer includes four sections showing the actual commit log of diverged history (unpushed-to-pushremote, unpushed-to-upstream, unpulled-from-pushremote, unpulled-from-upstream). This gives the user full context about *what* diverged, not just *how much*. The upstream header dynamically shows "Merge:" or "Rebase:" based on the branch's pull configuration.

lazygit supports triangular workflows (separate push remote and pull remote) with independent `AheadForPull`/`BehindForPull` and `AheadForPush`/`BehindForPush` counters — a capability most editors lack.

---

### D6.4 Reflog Access and UX

**Finding:** Reflog UX ranges from invisible (most editors) to a full undo system (lazygit), with Magit providing a dedicated browser.

**Evidence:** [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md)

**lazygit's reflog-based undo** is the most innovative recovery UX across all editors studied. Global `z` (undo) and `Z` (redo) keybindings parse the reflog to reverse the last user-initiated operation. The system classifies reflog entries (checkout, commit, rebase) and applies the appropriate reversal (checkout back, soft reset, hard reset with autostash). Each undo/redo is itself tagged in the reflog via `GIT_REFLOG_ACTION=[lazygit undo]`, creating an audit trail that the undo parser skips over. Mid-rebase state is detected and shows "Can't undo while rebasing."

**Magit's reflog mode** provides a dedicated buffer for browsing reflog entries, color-coded by operation type (commit=green, reset=red, checkout=blue). From this buffer, users can view any entry's commit, reset to it, cherry-pick from it, or create a branch from it.

**All other editors** either use reflog internally only (VSCode uses it to detect branch parent) or have no reflog access. This means the most powerful recovery mechanism in git — the ability to undo almost any operation — is invisible to users of the most popular editors.

---

### D6.5 Safety Nets

**Finding:** Safety nets cluster into five categories, with significant variation in adoption.

**Evidence:** [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md)

**Auto-stash** is the most widely adopted safety net. VSCode, GitHub Desktop, lazygit, JetBrains, and Magit all implement it, though mechanisms differ. JetBrains' `GitPreservingProcess` is the most sophisticated — it wraps any destructive operation with a save → run → load cycle, using either git stash or the IDE's own shelve system (configurable). If the save fails, the operation is skipped entirely.

**Continuous backup systems** are rare but powerful. Magit's `magit-wip-mode` auto-creates snapshot commits to branch-specific refs (`refs/wip/index/`, `refs/wip/wtree/`) on every file save and before/after apply operations. JetBrains' Local History records every file change independently of git, retains 5 working days by default, and places system labels before/after critical operations. Both systems survive scenarios where `git reflog` is insufficient.

**Confirmation dialogs** vary in comprehensiveness. Magit gates 28 potentially destructive actions via `magit-confirm` with a customizable bypass list. VSCode gates force push behind `git.allowForcePush` (default false). lazygit confirms force push, undo/redo, abort, and cherry-pick paste.

**Published-commit protection** is offered by Magit (checks publishing branches before rewriting history, warns before amending pushed commits) and partially by JetBrains (warns about "rebase over merge" in push rejection dialog).

**Trash instead of permanent delete:** Only Magit's `magit-delete-by-moving-to-trash` (default on) routes file discards to the system trash.

---

### D6.6 Detached HEAD

**Finding:** Editors handle detached HEAD as a visual indicator with disabled operations, sometimes preceded by a warning before entering the state.

**Evidence:** [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md)

VSCode swaps the branch icon to a commit icon and hides publish/sync buttons. lazygit disables merge and commit-moving operations with explicit error messages. Magit shows the commit hash instead of branch name in the header. GitHub Desktop shows a confirmation dialog before entering detached HEAD state via commit checkout: "Checking out a commit will create a detached HEAD."

No editor proactively suggests "create a branch to save your work" when detecting uncommitted changes in detached HEAD state. This is a universal gap — the standard recovery (create branch from HEAD) is not surfaced in any editor's detached HEAD UI.

---

### D6.7 Corrupt/Locked Repository

**Finding:** Only VSCode handles lock files automatically (silent retry with backoff). No editor detects or recovers from index corruption.

**Evidence:** [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md)

VSCode detects `RepositoryIsLocked` from git stderr and retries up to 10 times with quadratic backoff (50ms, 200ms, 450ms, ..., ~5s at attempt 10). It does not offer to remove stale lock files. The file watcher explicitly filters out `index.lock` changes to avoid spurious status refreshes.

No other editor studied provides lock file detection, automatic retry, or "remove stale lock" UI. No editor detects or suggests `git gc` for corrupt repositories, or handles index corruption beyond the lock file scenario.

---

### D6.8 Credential/Auth Failure Recovery

**Finding:** GitHub Desktop has the most sophisticated credential recovery; most editors rely on git's credential infrastructure with no re-prompt flow.

**Evidence:** [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md)

GitHub Desktop implements a "trampoline" credential helper that intercepts git credential requests, looks up stored accounts, prompts for missing credentials, and handles operation-specific authentication failures: SAML SSO re-auth (detects enforcement messages and shows re-auth dialog with org name), missing workflow scope (detects OAuth scope failures for `.github/workflows/` pushes), insufficient permissions (triggers "Create Fork" dialog), and GitHub push protection (parses secret scanning errors). Rejection tracking prevents infinite re-prompt loops.

All other editors studied rely on git's standard credential helper infrastructure with no editor-level re-prompt flow. Obsidian-Git surfaces raw git error messages in Notice modals.

---

## Cross-Cutting Patterns

### The conflict avoidance vs. resolution spectrum

For non-developer users, the most effective strategy is **conflict avoidance**, not conflict resolution:

| Strategy | Example | How it works | Who it serves |
|----------|---------|-------------|---------------|
| Branch-per-edit + PR merge | TinaCMS | Editors create branches; conflicts resolved by developers in GitHub | Content editors |
| Auto-commit + pull-before-push | Obsidian-Git | Reduces conflict window; raw markers on failure | Note-takers |
| Three-way merge editor | JetBrains, VSCode, GitKraken | Full control over resolution | Developers |
| Reflog-powered undo | lazygit | Reverse any operation | Power users |

### AI/Agent integration as an emerging conflict resolution modality

Two editors have shipped agent-assisted conflict resolution:
- **Zed:** "Resolve with Agent" inline button sends conflict text, file path, and branch names to an agent
- **JetBrains:** `MergeResolveActionSupport` extension point allows plugins to contribute "Resolve with AI" actions to the editor notification panel
- **GitKraken:** "Auto-resolve with AI" suggests resolutions with explanations

This is the most significant emerging pattern in the space. The conflict resolution surface area (bounded text, clear ours/theirs semantics, limited context needed) is well-suited for AI assistance.

### Git rerere — the universal silent helper

`git rerere` (reuse recorded resolution) is built into git and works silently for all editors: on first conflict resolution, it records the resolution; on subsequent identical conflicts, it auto-applies the prior resolution. No editor explicitly surfaces rerere to users. For long-lived topic branches that need repeated rebasing, enabling rerere (`git config --global rerere.enabled true`) eliminates repeated resolution of the same conflicts.

---

## Comparative Matrix

### D3: Conflict presentation and resolution

| Editor | Presentation | Granularity | AI resolve | External tools | Rebase progress |
|--------|-------------|-------------|------------|----------------|-----------------|
| JetBrains | 3-way merge editor | Per-line | Extension point | No | Full dialog + toolbar widget |
| VSCode (merge editor) | 3-way merge editor | Per-range | No | No | Boolean only |
| VSCode (inline) | Inline markers + CodeLens | Per-hunk | No | No | Boolean only |
| Zed | Inline buttons | Per-conflict | Yes (built-in) | No | None |
| lazygit | Inline colored markers | Per-hunk | No | `git mergetool` | Color-coded TODO list |
| Magit | smerge-mode + ediff | Per-hunk + 3-way | No | Via ediff | Full sequence editor |
| GitHub Desktop | File-list dialog | Whole file | No | No | N/M progress bar |
| GitKraken | 3-panel editor | Per-line | Yes (auto-resolve) | Yes (6 tools) | N/A |
| diffview.nvim | 3/4-way terminal diff | Per-hunk | No | `git mergetool` | N/A |
| Fork | Built-in resolver | Per-file | No | Yes | N/A |
| Sourcetree | External tool launch | Per-file | No | Yes (P4Merge default) | N/A |

### D6: Error recovery and safety nets

| Editor | Push rejection | Force push mode | Auto-stash | Reflog UX | Backup system | Lock handling |
|--------|---------------|-----------------|------------|-----------|---------------|---------------|
| JetBrains | Retry loop (10x) + Merge/Rebase dialog | `--force-with-lease` | GitPreservingProcess (stash/shelve) | None | Local History (5 days) | None |
| VSCode | Text suggestion | `--force-with-lease` | `git.autoStash` setting | Internal only | None | Retry 10x, quadratic backoff |
| GitHub Desktop | Fetch dialog | `--force-with-lease` | Desktop-specific stash | None | None | None |
| lazygit | Force push confirmation | `--force-with-lease` (proactive) | Auto everywhere | Undo/redo system | None | None |
| Magit | Error in status buffer | `--force-with-lease` (lowercase f) | Transient arg | Full browser | WIP refs (continuous) | None |
| Zed | Error toast | Explicit action | None | None | None | None |
| Obsidian-Git | Raw error in Notice | N/A | None | None | None | Promise queue |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **D3.4 Semantic merge:** Confirmed as NOT FOUND across all editors studied. SemanticMerge (PlasticSCM) exists as a standalone tool but is not integrated into any mainstream editor. Whether any JetBrains marketplace plugin offers this capability was not verified.
- **D6.7 Index corruption:** No editor handles git index corruption beyond lock file scenarios. Whether `git fsck` or `git gc` is ever surfaced to users was not found in any source.
- **Cursor and Windsurf:** Both are VSCode forks and likely inherit the inline merge conflict extension + 3-way merge editor. Not independently verified at source level.

### Out of Scope (per Parent Rubric)

- Clone/initial init UX
- OAuth/auth implementation at clone time
- CRDT-specific branching internals
- Git library selection criteria
- Draft-isolation-as-worktree patterns for AI agents

---

## References

### Evidence Files

- [evidence/d3-conflict-presentation.md](evidence/d3-conflict-presentation.md) — Conflict presentation architectures, detection, and resolution actions across 12+ editors
- [evidence/d3-rebase-and-operations.md](evidence/d3-rebase-and-operations.md) — Rebase visualization, merge tool config, marker guards, cherry-pick/revert
- [evidence/d6-push-rejection-divergence.md](evidence/d6-push-rejection-divergence.md) — Network failure, rejected push recovery, diverged history visualization
- [evidence/d6-safety-nets-recovery.md](evidence/d6-safety-nets-recovery.md) — Reflog UX, safety nets, detached HEAD, lock files, credential recovery

### External Sources

- [microsoft/vscode](https://github.com/microsoft/vscode) — extensions/merge-conflict/, src/vs/workbench/contrib/mergeEditor/, extensions/git/
- [desktop/desktop](https://github.com/desktop/desktop) — app/src/lib/git/, app/src/ui/merge-conflicts/, app/src/ui/push-needs-pull/
- [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) — pkg/gui/mergeconflicts/, pkg/gui/controllers/, pkg/commands/git_commands/
- [magit/magit](https://github.com/magit/magit) — lisp/magit-merge.el, lisp/magit-sequence.el, lisp/magit-reflog.el, lisp/magit-wip.el
- [JetBrains/intellij-community](https://github.com/JetBrains/intellij-community) — plugins/git4idea/src/git4idea/merge/, plugins/git4idea/src/git4idea/push/, plugins/git4idea/src/git4idea/rebase/
- [zed-industries/zed](https://github.com/zed-industries/zed) — crates/git_ui/src/conflict_view.rs, crates/git_ui/src/git_panel.rs
- [sindrets/diffview.nvim](https://github.com/sindrets/diffview.nvim) — Neovim 3/4-way merge conflict viewer
- [tpope/vim-fugitive](https://github.com/tpope/vim-fugitive) — Vim git wrapper with vimdiff-based conflict resolution
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) — Obsidian plugin with minimal conflict handling
- [tinacms/tinacms](https://github.com/tinacms/tinacms) — Branch-per-edit conflict avoidance architecture
- [GitKraken merge tool docs](https://www.gitkraken.com/features/merge-conflict-resolution-tool) — 3-panel merge + AI auto-resolve + conflict prevention
- [git-scm.com/docs/git-rerere](https://git-scm.com/docs/git-rerere) — Reuse recorded resolution
- [git-scm.com/docs/git-reflog](https://git-scm.com/docs/git-reflog) — Reference log documentation
- [jonas/tig](https://github.com/jonas/tig) — Read-only git browser, no conflict support
