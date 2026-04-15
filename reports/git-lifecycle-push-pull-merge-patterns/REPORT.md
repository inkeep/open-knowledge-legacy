---
title: "Git Lifecycle UX Patterns: Push, Pull, Merge, and Beyond"
description: "How 15+ editors and tools across the spectrum — developer IDEs, visual git clients, power-user TUIs, and non-developer wrappers — implement the post-clone git lifecycle. Covers staging/commit, push/pull, merge/rebase conflicts, branch management, credential persistence, error recovery, history/diff visualization, and non-developer abstraction patterns. Source-level analysis of VS Code, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed, plus docs-level coverage of GitKraken, Fork, Sourcetree, Obsidian-Git, TinaCMS, and others."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - VS Code
  - GitHub Desktop
  - lazygit
  - Magit
  - JetBrains IntelliJ
  - Zed
  - GitKraken
  - Fork
  - Sourcetree
  - Obsidian-Git
  - TinaCMS
  - diffview.nvim
  - Sublime Merge
  - Logseq
  - SiYuan
topics:
  - git lifecycle UX
  - staging and commit patterns
  - push pull mechanics
  - merge conflict resolution
  - branch management
  - credential persistence
  - error recovery
  - non-developer git abstraction
  - editor spectrum
---

# Git Lifecycle UX Patterns: Push, Pull, Merge, and Beyond

**Purpose:** Factual landscape of how editors and tools expose the post-clone git lifecycle to users. Eight dimensions (D1–D8) span the full surface from staging granularity to non-developer abstraction. Source-level where available; docs-level otherwise. Any team implementing git lifecycle UX should derive equal value regardless of product category.

---

## Executive Summary

The post-clone git lifecycle — staging, committing, pushing, pulling, branching, merging, and recovering from errors — is implemented by every code editor and git client. Yet the implementations diverge so sharply that they reveal fundamentally different philosophies about what git is: an artifact, an implementation detail, or a surface.

This report surveys 15+ tools across four bands of the **editor spectrum**:

| Band | Tools | Git philosophy |
|------|-------|---------------|
| **Full git vocabulary** | Magit, lazygit, Fugitive, tig | Git is the product. Every flag, every mode, every edge case is a first-class UX surface. |
| **Guided git** | VS Code, JetBrains, Zed, GitHub Desktop, GitKraken, Fork, Sourcetree | Git is an integrated capability. The editor exposes common operations with guardrails, hiding the long tail. |
| **Power-user hybrid** | Sublime Merge, diffview.nvim | Git is the sole focus, but presented with GUI/editor affordances rather than raw CLI vocabulary. |
| **Git-as-transport** | Obsidian-Git, TinaCMS, Logseq, SiYuan, Joplin | Git is an implementation detail. Users think in "save," "sync," or "backup" — not in git operations. |

The most architecturally consequential dimension is **D8: non-developer abstraction**. The fundamental design choice that determines abstraction quality is *where git operations execute*: server-side via API (TinaCMS), custom non-git sync (SiYuan, Joplin), or client-side git wrapper (Obsidian-Git, Logseq). Server-side execution provides the highest abstraction and lowest retreat-to-CLI frequency but trades off commit atomicity. Client-side wrapping preserves full git compatibility but exposes users to the full failure surface. No tool has successfully wrapped git's complete failure surface for non-developers.

**Key Findings:**

- **D1: Staging granularity follows a four-tier structure** (all/file/hunk/line), implemented via three distinct strategies — patch construction, in-process diff fixup, or three-way diff editor. AI commit message generation has become table-stakes for commercially-funded editors: VS Code (Copilot), JetBrains (AI Assistant), Cursor, Zed, and GitKraken all ship native support; GitHub Desktop and Sourcetree do not.
- **D2: No editor defaults to rebase for pull.** Merge is the universal safe default. Fetch automation intervals span 1 minute to 1 hour; several editors default to no auto-fetch.
- **D3: Conflict presentation has converged on four architectures** — dedicated 3-way merge editors, inline markers with action buttons, file-list dialogs, and Emacs buffer-based resolution. AI/agent-assisted conflict resolution is the most significant emerging pattern.
- **D4: Dirty-working-tree handling on branch switch is the highest-variance UX decision** across the spectrum — no two tools handle it identically.
- **D5: Credential persistence universally delegates to the OS keychain** for desktop tools. `GIT_ASKPASS` is the universal editor injection point. Obsidian-Git stores credentials in unencrypted browser localStorage.
- **D6: Safety nets split into reactive (reflog, auto-stash) and proactive (WIP refs, Local History).** lazygit's reflog-based undo is the most innovative recovery UX. Network failure handling is uniformly primitive across the ecosystem.
- **D7: DAG graph rendering is universal in developer tools** but follows two architectural patterns (custom layout vs git delegation). Blame spans four distinct surface patterns.
- **D8: The abstraction holds for the happy path but fractures on any state requiring human judgment.** Six confirmed retreat-to-CLI scenarios in Obsidian-Git. TinaCMS retreats to GitHub's web UI — a graceful degradation.

---

## Research Rubric

| Dim | Name | Priority | Source |
|-----|------|----------|--------|
| D1 | Staging & commit UX | P0 | Staging granularity, partial commit, commit message, amend, undo, auto-commit |
| D2 | Push/pull mechanics | P0 | Pull semantics, upstream tracking, fetch automation, force push, dry-run |
| D3 | Merge/rebase conflict UX | P0 | Conflict presentation, detection, resolution actions, rebase visualization |
| D4 | Branch management | P0 | Branch picker, create, switch (dirty tree), delete, stash, worktree |
| D5 | Remote/auth persistence | P0 | Credential storage, token refresh, multi-account, SSH/HTTPS, helpers |
| D6 | Error handling & recovery | P0 | Network failure, rejected push, reflog, safety nets, detached HEAD |
| D7 | History & diff visualization | P1 | Commit graph, file history, blame, diff viewer, search, keyboard |
| D8 | Non-developer abstraction | P0 | Auto-commit, terminology, safety nets, conflict handling, retreat-to-CLI |

**Stance:** Factual — observations and patterns only. No recommendations.

**Non-goals:** Clone/initial init UX, OAuth at clone time, CRDT-specific branching internals, git library selection criteria, draft-isolation-as-worktree patterns for AI agents.

---

## D1: Staging & Commit UX

**Evidence:** [evidence/d1-staging-commit.md](evidence/d1-staging-commit.md)

### Staging Granularity

Four staging tiers exist, with adoption decreasing at finer granularity. Across the 12 tools surveyed for D1 (VS Code, GitHub Desktop, lazygit, Magit, Zed, JetBrains, GitKraken, Fork, Sourcetree, Obsidian-Git, Fugitive, GitHub CLI):

| Level | Support | Notable absences |
|-------|---------|-----------------|
| Stage-all | Universal (12/12) | — |
| Stage-file | 11/12 | GitHub CLI |
| Stage-hunk | 10/12 | Obsidian-Git (by design), GitHub CLI |
| Stage-line/range | 8/12 | Zed (in development, [issue #45295](https://github.com/zed-industries/zed/issues/45295)), Fugitive, Obsidian-Git, GitHub CLI |

Three implementation strategies for sub-hunk staging:

1. **Patch construction + `git apply --cached`** (VS Code, GitHub Desktop, lazygit): The editor constructs a patch programmatically from selected lines. VS Code's `intersectDiffWithRange()` clips hunks to editor selection. lazygit's `patch.Transform(TransformOpts{IncludedLineIndices})` constructs surgical patches.
2. **In-process diff fixup** (Magit): `magit-diff-hunk-region-patch` walks every hunk line, converts unselected lines to context, then `diff-fixup-modifs` recalculates `@@ -X,Y +A,B @@` headers.
3. **Three-way diff editor** (JetBrains): A three-pane view (HEAD / Staged / Local) where users type directly into the staged pane for character-level precision.

GitHub Desktop's **inverted index model** is architecturally distinct: the index is rebuilt from scratch at commit time based on UI checkbox state (`unstageAll()` → `stageFiles()` → `commit()`), not incrementally modified via `git add`.

### Commit Message UX

Two paradigms coexist: **inline input box** (VS Code, GitHub Desktop, Zed, GitKraken, Sourcetree) with optional validation, and **full editor buffer** (Magit, Fugitive, lazygit) with syntax highlighting and trailer insertion.

AI commit message generation has become table-stakes for commercial editors:

| Editor | Provider | Distinctive feature |
|--------|----------|-------------------|
| GitKraken | Gemini/OpenAI/Azure/Anthropic/custom | Commit Composer: AI-assisted commit history restructuring |
| JetBrains | JetBrains AI | Customizable prompts with `$GIT_BRANCH_NAME` |
| Cursor | Cursor model | `Made with Cursor` trailer, Cursor Blame attribution |
| Zed | `LanguageModelRegistry` | Compresses diff to 20KB max, loads project rules |
| VS Code | GitHub Copilot | `git.addAICoAuthor` appends `Co-authored-by: Copilot` trailer |

lazygit offers a unique **branch-name-based commit prefix**: `CommitPrefixConfig{Pattern, Replace}` extracts prefixes from branch names via regex (e.g., branch `feature/AB-123-foo` → prefix `[AB-123] `).

### Amend Workflows

Amend breadth ranges from basic (single amend command) to comprehensive. Magit offers 12 commit transient commands including amend, extend, reword, fixup, squash, instant-fixup, and instant-squash. lazygit's `HandleFindBaseCommitForFixupPress()` uses `git blame` to auto-find the commit that introduced staged changes.

Pushed-commit warnings are inconsistent: Magit checks publishing branches before amend; Zed's `check_for_pushed_commits()` shows a confirmation prompt; VS Code, GitHub Desktop, and lazygit proceed without warning.

### Undo After Commit

| Strategy | Editors | Git operation |
|----------|---------|---------------|
| Mixed reset | VS Code, GitHub Desktop | `git reset --mixed HEAD~1` |
| Soft reset | Zed | `git reset --soft HEAD^` |
| Reflog-based undo | lazygit | Walks reflog, reverses most recent action |
| Full reset transient | Magit | User chooses `--soft`/`--mixed`/`--hard`/`--keep` |

lazygit's reflog-based undo handles three action kinds — COMMIT (soft reset), CHECKOUT (checkout previous), REBASE (hard reset + auto-stash/pop) — and tags each undo via `GIT_REFLOG_ACTION=[lazygit undo]` for skip-over in subsequent undo walks.

### Auto-Commit

Auto-commit is exclusively a non-developer pattern. Only Obsidian-Git fully abstracts git into a timer-based "backup" paradigm (`autoSaveInterval` in minutes, `autoBackupAfterFileChange` via debounce). Developer editors universally require explicit staging and commit intent. VS Code's `git.enableSmartCommit` (default `false`) is the closest developer-side equivalent — it auto-stages all changes when committing with nothing staged.

---

## D2: Push/Pull Mechanics

**Evidence:** [evidence/d2-push-pull.md](evidence/d2-push-pull.md)

### Pull Semantics

No editor defaults to rebase. Merge is the universal safe default. Rebase accessibility varies:

| Editor | Default | Rebase accessibility |
|--------|---------|---------------------|
| VS Code | Merge | Separate command (`git.pullRebase`), no persistent setting |
| GitHub Desktop | Merge (FF with fallback) | Git config only, no UI toggle |
| lazygit | Delegates to git config | No lazygit-level config |
| Magit | Merge | `--rebase` switch in pull transient (per-invocation) |
| Zed | Merge | `git::PullRebase` action + keybinding |
| GitKraken | FF-if-possible | Dropdown with persistent default |
| JetBrains | Configurable | Persistent per-IDE setting with FF-only/no-FF options |
| Obsidian-Git | Merge | `syncMethod: "rebase"` config; also offers `"reset"` (destructive) |

Obsidian-Git's `syncMethod: "reset"` is architecturally unique — it uses `git update-ref` to hard-reset the local branch to the remote, treating the remote as authoritative truth. No developer-facing editor offers this.

### Fetch Automation

Auto-fetch intervals span 1 minute to 1 hour:

| Editor | Default | Interval | Implementation detail |
|--------|---------|----------|-----------------------|
| GitKraken | On | 1 min | — |
| lazygit | On | 1 min | `--no-write-fetch-head` prevents FETCH_HEAD contention |
| Fork | On | 20 min | Per-remote configurable |
| GitHub Desktop | On | 1 hour | Server-driven via API; random ±30s skew |
| VS Code | **Off** | 3 min (when enabled) | Disables on metered connections; awaits `whenIdleAndFocused()` |
| Zed | **Off** | N/A | Strictly user-initiated |
| Magit | **Off** | N/A | No auto-fetch at all |

### Force Push Protection

Six distinct strategies span the spectrum from always-safe defaults to no protection at all:

| Strategy | Editors | Mechanism |
|----------|---------|-----------|
| Hidden-by-default opt-in | VS Code, Sourcetree | Setting must be enabled; `--force-with-lease` default |
| Always-force-with-lease | GitHub Desktop | Never exposes raw `--force`; three-state `ForcePushBranchState` |
| Explicit transient switches | Magit | Lowercase `f` = `--force-with-lease`; uppercase `F` = `--force` |
| Contextual heuristics | lazygit | Proactive `--force-with-lease` when behind; reactive `--force` when remote unknown |
| Warning dialog + protected branch lockout | JetBrains | `--force-with-lease`; disabled on protected branches |
| No protection | Zed | Direct execution, no confirmation |

GitHub Desktop elevates force push from "Available" to "Recommended" when the user has performed a rebase or amend on pushed commits — an intent-aware suggestion.

### Dry-Run / Preview

Dry-run/preview before push-pull is almost non-existent. Only Magit exposes `--dry-run` as a push transient switch. Behind/ahead indicators serve as a lightweight proxy.

---

## D3: Merge/Rebase Conflict UX

**Evidence:** [evidence/d3-merge-conflict.md](evidence/d3-merge-conflict.md)

### Conflict Presentation Architectures

Four distinct patterns:

**Architecture 1 — Dedicated 3-way merge editor** (JetBrains, VS Code merge editor, GitKraken, diffview.nvim). JetBrains' reverse-root detection stands out: during rebase, `GitMergeUtil.isReverseRoot(repository)` detects the semantic swap and transparently swaps panes so the user always sees their changes on the left.

**Architecture 2 — Inline markers with action buttons** (VS Code inline, Zed, lazygit). Zed's "Resolve with Agent" button is the most forward-looking pattern — each conflict block has an optional button that sends text, file path, and branch names to an AI agent. JetBrains has an equivalent extension point (`MergeResolveActionSupport`).

**Architecture 3 — File-list dialog** (GitHub Desktop, Sourcetree, Fork). Conflicted files appear in a list; resolution is "Open in external editor" or whole-file "Resolve Using Mine/Theirs."

**Architecture 4 — Emacs buffer-based** (Magit via smerge + ediff). Hunk-level resolution keybindings from the status buffer diff: `u` = keep ours, `l` = keep theirs, `b` = keep base, `a` = keep all.

**Universal gap:** No editor provides aggregate "N of M files resolved" progress at the SCM level.

### Mid-Rebase Visualization

Rebase UX spans a maturity spectrum:

| Tier | Editors | Capability |
|------|---------|-----------|
| Full sequence editor | Magit, JetBrains, lazygit | Per-commit action editing, reordering, color-coded TODO |
| Progress parsing | GitHub Desktop | `.git/rebase-merge/msgnum`+`end` → percentage bar |
| Boolean only | VS Code | Status bar shows `(Rebasing)` — no step counter |

VS Code reads no step progress files during rebase, a notable gap for the most widely-used editor.

### Semantic/Language-Aware Merge

No mainstream editor uses AST or language-aware merge for git conflict resolution. JetBrains' "Resolve Simple Conflicts" auto-merges non-overlapping changes within a line, but this is character-level, not semantic. [SemanticMerge](https://www.semanticmerge.com/) exists as a standalone commercial tool but is not integrated into any mainstream editor.

### Unresolved Marker Guards

No editor scans staged files for leftover conflict markers. All rely on git's built-in unmerged-file check, which has a gap: if a user manually edits a file, stages it, but accidentally leaves `<<<<<<<`/`>>>>>>>` markers, git commits it. A pre-commit hook would close this gap but is not built into any editor.

---

## D4: Branch Management

**Evidence:** [evidence/d4-branch-management.md](evidence/d4-branch-management.md)

### Branch Picker UX

Three architectural patterns:

| Pattern | Editors | Optimization |
|---------|---------|-------------|
| Dropdown pickers | VS Code, GitHub Desktop, Zed | Quick-switch |
| Panel-based browsers | lazygit, GitKraken, Fork | Visual exploration |
| Transient popups | Magit, JetBrains | Keyboard-driven dispatch |

**"Recently used" divergence:** VS Code uses committer date (`--sort=-committerdate`), which puts recently-modified branches first. GitHub Desktop and lazygit use the reflog (`git log -g HEAD`), which puts recently-switched-to branches first — a meaningful UX difference.

### Dirty-Working-Tree Handling on Branch Switch

This is the highest-variance UX decision across the editor spectrum:

| Tool | Strategy | Mechanism |
|------|----------|-----------|
| VS Code | 3-option modal: Stash & Checkout / Migrate Changes / Force | Catches `DirtyWorkTree` error |
| GitHub Desktop | Configurable strategy enum persisted in localStorage | Pre-flight check |
| lazygit | Autostash prompt on failure | Detects error string |
| Magit | Hard error on create-with-start-point | `user-error` guard |
| Zed | Fully delegates to git; toast on error | No pre-flight check |
| JetBrains | Smart Checkout (shelve + checkout + unshelve) | Uses Shelf (not git stash) |

VS Code's "Migrate Changes" is the only tool offering explicit move-uncommitted-to-new-branch as a first-class option. JetBrains' Smart Checkout uses the IDE's own Shelf mechanism rather than git stash — shelved changes are IDE-specific, not visible via `git stash list`. GitHub Desktop's strategy enum is the only persistent preference for this behavior.

### Branch-From-Issue Integration

Branch-from-issue *creation* exists in exactly one tool: JetBrains. Its Tasks plugin provides configurable template-based branch naming with placeholders for issue ID and title, connecting to 10+ issue trackers (Jira, GitHub, GitLab, YouTrack). lazygit and GitKraken display PR/issue metadata in branch context but do not bridge to branch creation; GitHub Desktop offers issue autocomplete in commit messages without a branch-from-issue flow.

### Worktree UX

| Tool | Support | Key features |
|------|---------|-------------|
| lazygit | Full panel | Create, switch, remove; branch-worktree collision detection |
| Magit | Integrated in branch transient | Create, move, delete (trash/permanent) |
| Zed | Dedicated picker | Auto-trust, open in new window |
| Fork | Dialog (since 2.63) | Create Worktree dialog |
| VS Code, GitHub Desktop, GitKraken | None | — |

lazygit's branch-worktree collision detection is the most safety-conscious pattern: attempting to checkout a branch checked out in another worktree prompts to switch to that worktree instead.

### Unique Primitives

Magit's **spinoff/spinout** is unique: `spinoff` creates a new branch, moves unpushed commits to it, and resets the source branch to the merge-base — all via `git update-ref` without force-push. No other surveyed tool offers this.

---

## D5: Remote/Auth Persistence

**Evidence:** [evidence/d5-remote-auth.md](evidence/d5-remote-auth.md)

### Credential Architecture

| Tool | Storage Layer | Mechanism |
|------|--------------|-----------|
| VS Code | OS keychain | `ExtensionContext.secrets` → macOS Keychain / Windows Credential Manager |
| GitHub Desktop | OS keychain | `keytar` npm package → OS backends |
| lazygit | Delegates to git | No own storage; relies on configured `credential.helper` |
| Magit | Emacs auth-source | `~/.authinfo.gpg` (GPG-encrypted) |
| Zed | OS keychain | `CredentialsProvider` → platform keychain |
| JetBrains | PasswordSafe | → macOS Keychain / Gnome Keyring / KeePass (configurable) |
| Obsidian-Git | Browser localStorage | **Unencrypted**, plugin-namespaced |

[GCM](https://github.com/git-ecosystem/git-credential-manager)'s `ICredentialStore` is the most complete abstraction: four methods (`Get`, `GetAccounts`, `AddOrUpdate`, `Remove`) implemented by eight swappable backends. Service key format: normalized URI without userinfo.

### Editor Injection Points

`GIT_ASKPASS` is the universal injection point — VS Code, GitHub Desktop (trampoline), JetBrains (sidecar `GitAskPassApp`), and Zed (Unix socket IPC) all use it. Magit is the sole outlier, using Emacs process filter interception instead.

### Token Refresh

GitHub OAuth tokens (`gho_`) don't expire — no refresh flow is exercised anywhere for GitHub. Token refresh is a GitLab-specific concern, where GCM implements proactive polling with refresh tokens stored under an `"oauth-refresh-token."` key prefix.

### Multi-Account

Multi-account is structurally limited by git's credential protocol, which has no native user concept. Without `username` in the URL, the first matching credential wins. GCM mitigates this with `credential.useHttpPath=true` for per-repo scoping.

### Multi-Forge Support

Zed leads with 9 hosting providers (GitHub, GitLab, Bitbucket, Azure, Gitea, Forgejo, Gitee, Chromium, SourceHut). GCM covers 4 (GitHub, GitLab, Bitbucket, Azure DevOps). Magit covers 5 via the Forge package.

---

## D6: Error Handling & Recovery

**Evidence:** [evidence/d6-error-recovery.md](evidence/d6-error-recovery.md)

### Rejected Push Recovery

Recovery strategies span from automated retry to bare error messages:

| Strategy | Editor | Mechanism |
|----------|--------|-----------|
| Automated retry loop | JetBrains | `GitPushOperation.java` retries up to 10 times; Merge/Rebase/Cancel dialog |
| Fetch suggestion | GitHub Desktop | "Fetch" button dialog, no auto-retry |
| Text suggestion | VS Code | "Try running 'Pull' first" notification |
| Force push confirmation | lazygit | `--force-with-lease` when behind; raw `--force` when remote unknown |
| Error toast | Zed | Generic toast with "View Log" button |

JetBrains creates a Local History system label before the first update attempt, enabling recovery if the retry loop goes wrong.

### Safety Nets

Safety nets cluster into five categories with significant variation:

**Auto-stash** is the most widely adopted. JetBrains' `GitPreservingProcess` is the most sophisticated — it wraps any destructive operation with a save → run → load cycle, using either git stash or the IDE's own Shelf (configurable). If the save fails, the operation is skipped entirely.

**Continuous backup systems** are rare but powerful. Magit's `magit-wip-mode` auto-creates snapshot commits to branch-specific refs (`refs/wip/index/`, `refs/wip/wtree/`) on every file save. JetBrains' Local History records every file change independently of git, retaining 5 working days by default.

**Confirmation dialogs** vary: Magit gates dozens of destructive actions via `magit-confirm` (see the [`magit-no-confirm`](https://magit.vc/manual/magit/Completion-Confirmation-and-the-Selection.html) defcustom); VS Code gates force push behind `git.allowForcePush` (default false).

**Published-commit protection** is offered by Magit (checks publishing branches before rewriting history) and partially by JetBrains.

**Trash instead of permanent delete:** Only Magit's `magit-delete-by-moving-to-trash` (default on) routes file discards to the system trash.

### Reflog Access and UX

lazygit's reflog-based undo is the most innovative recovery UX across all editors. Global `z` (undo) and `Z` (redo) keybindings parse the reflog to reverse the last user-initiated operation. The system classifies entries (checkout, commit, rebase) and applies the appropriate reversal. Each undo/redo is tagged via `GIT_REFLOG_ACTION=[lazygit undo]`, creating an audit trail that the parser skips.

Magit's reflog mode provides a dedicated buffer for browsing entries, color-coded by operation type. All other editors either use reflog internally only (VS Code detects branch parent) or have no reflog access — meaning the most powerful recovery mechanism in git is invisible to users of the most popular editors.

### Network Failure Handling

Network failure handling is uniformly primitive. All editors detect failures via a single regex on git's stderr ("Could not read from remote repository"). No editor distinguishes DNS failure from auth timeout from HTTP 502. No editor provides offline mode, queued operations, or retry with backoff.

### Corrupt/Locked Repository

Only VS Code handles lock files automatically — silent retry up to 10 times with quadratic backoff (50ms, 200ms, 450ms, ..., ~5s). No editor offers "remove stale lock" UI. No editor detects or suggests `git gc` for corrupt repositories.

---

## D7: History & Diff Visualization

**Evidence:** [evidence/d7-history-diff.md](evidence/d7-history-diff.md)

### Commit Graph

DAG graph rendering follows two architectural patterns:

**GUI-computed layout** (JetBrains, GitKraken, Sublime Merge, Fork): Tools compute their own graph visualization. JetBrains uses `GraphColorGetterByNodeFactory`. GitKraken renders an interactive DAG with minimap overview. Sublime Merge adds syntax-highlighted diff context.

**Git-delegated** (lazygit, tig, Magit): Tools process `git log --graph` output. lazygit's `pipeSetCache` is thread-safe with mutex protection. Magit caps graph coloring at 256 commits (`magit-log-color-graph-limit`).

VS Code added native Source Control Graph only in v1.93 (Aug 2024). GitHub Desktop shows a flat linear commit list with no DAG graph.

### Blame

Blame surfaces span four distinct patterns: [GitLens](https://help.gitkraken.com/gitlens/gitlens-features) offers the most layered display (current line, gutter, file, status bar — four independent surfaces). Magit provides the richest mode taxonomy: `magit-blame-addition`, `magit-blame-removal`, `magit-blame-reverse`, `magit-blame-echo`. [tig](https://jonas.github.io/tig/doc/manual.html) uniquely provides `,` to trace back to the previous modification of a line. VS Code has no native inline blame — it relies entirely on extensions.

### Diff Viewer

Unified + split toggle is table stakes. Differentiation comes from:
- **Word-level refinement:** Magit's `magit-diff-refine-hunk` offers four strategies. Sublime Merge provides character-level diffs.
- **Pager composition:** lazygit delegates to configurable pagers (`delta`), cycling between them with `|`.
- **Image diff:** GitHub Desktop leads with four modes (2-Up, Swipe, Onion Skin, Difference). Fork supports basic image diffs. No other tool provides native image diff.

### Search in History

[Sublime Merge](https://sublimemerge.com/docs) provides the most structured search: typed keywords (`author:`, `path:`, `file:`, `contents:`, `commit:`), logical operators (`and`, `or`, `not`), and CLI access via `smerge search <query>`. JetBrains does NOT support pickaxe (`git log -S/-G`). GitKraken adds AI/natural-language search.

### 3-Way Merge Editors

3-way merge editors are converging: VS Code (v1.69+), JetBrains, GitKraken all offer them. Fork goes to 4-way with a dedicated 4-panel editor. diffview.nvim supports both 3-way and 4-way layout options.

---

## D8: Non-Developer Abstraction Patterns

**Evidence:** [evidence/d8-nondev-abstraction.md](evidence/d8-nondev-abstraction.md)

This is the most architecturally consequential dimension. The fundamental design axis is **where git operations execute**:

1. **Server-side via API (TinaCMS):** Highest abstraction, lowest retreat frequency, graceful degradation to GitHub web UI. Trades off commit atomicity — each file save is a separate commit via GitHub Contents API; no batching.
2. **Custom non-git sync (SiYuan, Joplin):** Avoids git complexity entirely. SiYuan's [Dejavu](https://github.com/siyuan-note/dejavu) uses content-aware block-level merge. Joplin uses last-write-wins with conflict copy preservation.
3. **Client-side git wrapper (Obsidian-Git, Logseq):** Full git compatibility but full git failure surface. The abstraction holds for the happy path but fractures on any state requiring human judgment.

### Auto-Commit Strategies

Three patterns with distinct conflict profiles:

| Pattern | Examples | Trigger | Conflict profile |
|---------|---------|---------|-----------------|
| Timer interval | Obsidian-Git, Logseq | Configurable minutes (Obsidian-Git), fixed 60s (Logseq) | Reduces conflict window via frequent sync |
| File-change debounce | Obsidian-Git | Vault modify/delete/create/rename events | Lower latency, higher index contention |
| API-mediated save | TinaCMS | User-initiated "Save" → GitHub Contents API | Per-file commits, no batching |

### Terminology Abstraction

A clear spectrum from fully hidden to fully exposed:

```
Fully hidden ←————————————————————————→ Fully exposed
Joplin   TinaCMS   Logseq   Obsidian-Git(basic)   Obsidian-Git(advanced)
```

[Joplin](https://joplinapp.org/) uses zero git terms: "Synchronise," "Conflicts" notebook, "Previous versions." [TinaCMS](https://tina.io/docs/tinacloud/editorial-workflow) shows near-zero: "Save" (not commit), simplified "Branch" modal. [Obsidian-Git](https://github.com/Vinzent03/obsidian-git) underwent an explicit evolution in v2.27.0 (2024-09-18): "backup" was renamed to "commit-and-sync."

### Conflict Handling

Conflict handling follows a strategy spectrum that correlates with where git executes:

| Tool | Strategy | Resolution surface |
|------|----------|--------------------|
| TinaCMS | Avoidance (branch-per-editor) | GitHub PR UI |
| SiYuan | Smart merge (block-level) + 7-min temporal guard | Automatic + history |
| Joplin | Last-write-wins + conflict copy | Conflicts notebook |
| Obsidian-Git (desktop) | Git merge + manual markers | In-file markers, no merge tool |
| Obsidian-Git (mobile) | isomorphic-git `diff3Merge` | **None** — `MergeNotSupportedError` |

[Obsidian-Git](https://github.com/Vinzent03/obsidian-git) on mobile throws `MergeNotSupportedError` for non-auto-resolvable conflicts — a confirmed broken capability ([#906](https://github.com/Vinzent03/obsidian-git/issues/906), [#803](https://github.com/Vinzent03/obsidian-git/issues/803)).

### Retreat-to-CLI Frequency

```
Never retreats ←—————————————————————————→ Frequently retreats
Joplin   SiYuan   TinaCMS(→GitHub UI)   Obsidian-Git(desktop)   Obsidian-Git(mobile)   Logseq
```

**Obsidian-Git — 6 confirmed retreat scenarios:** mobile merge conflicts, authentication failures, Snap/Flatpak sandboxing, corrupted git state, force operations, complex `.gitignore`.

**TinaCMS — 3 retreat scenarios, all to GitHub web UI (not terminal):** PR merge conflicts, branch cleanup, schema migration.

The critical insight: TinaCMS's retreat mode drops to a more capable web interface, not a less capable terminal. The abstraction degrades gracefully.

### Collaboration Model

All surveyed non-dev tools target single-user multi-device sync. Multi-user collaboration is either not designed for (Obsidian-Git, Logseq, Joplin, SiYuan) or achieved through branch isolation (TinaCMS). No tool uses CRDT or real-time presence.

---

## Cross-Cutting Themes

### Theme 1: The Safety-Net Continuum

Auto-stash on branch switch (D4), auto-stash on rebase (D6), auto-stash on pull (D2), and auto-commit (D8) are all manifestations of the same architectural pattern: **silently preserving working state before a potentially destructive operation**. The implementations differ by scope and mechanism, but the intent is identical.

**Evidence across dimensions:** D4 established that dirty-tree handling on branch switch is the highest-variance UX decision — every tool handles it differently. D6 confirmed that JetBrains' `GitPreservingProcess` wraps *any* destructive operation with save/run/load. D2 showed that `git.autoStash` on pull is separate from D4's checkout auto-stash in VS Code. D8 demonstrated that Obsidian-Git's `pullBeforePush: true` and TinaCMS's API-level safety are the non-developer equivalents.

**Observation:** Tools that unify these safety nets into a single, configurable mechanism (as JetBrains approaches with `GitPreservingProcess`) produce consistent behavior across operations. Tools with per-operation safety nets exhibit higher variance — a given operation may or may not be wrapped depending on independent settings.

### Theme 2: The Guided-Git Convergence

Developer IDEs appear to be converging on a common capability set: file/hunk/line staging, inline commit box with AI generation, merge/sync buttons with force-push protection, and 3-way merge editors. The differentiating surface has shifted from *what operations are possible* to **how operations are discovered and composed**.

**Evidence across dimensions:** D1 showed staging granularity is near-universal in developer tools. D3 confirmed 3-way merge editors are converging (VS Code v1.69+, JetBrains, GitKraken). D1 also showed AI-powered commit messages are table-stakes. D4 demonstrated that branch picker UX is the remaining high-variance surface.

**Observation:** Within the guided-git band, the high-variance surfaces observed across dimensions are discovery UX (transient popups vs settings-driven vs inline), error messaging quality, and AI integration depth. This claim is INFERRED rather than CONFIRMED — each capability's individual universality is documented, but the convergence thesis synthesizes across dimensions.

### Theme 3: Settings-Driven vs Transient Discovery

Two competing models for git option discovery emerged across D1, D2, D3, and D4:

1. **Settings-driven** (VS Code, JetBrains, GitHub Desktop): Behavior configured via persistent settings. The user configures once, the editor applies consistently. VS Code alone exposes dozens of `git.*` settings ([VS Code git settings reference](https://code.visualstudio.com/docs/sourcecontrol/overview)).
2. **Transient-driven** (Magit, lazygit): Options discovered at invocation time via popup menus. Flags are visible and switchable per-operation. Transients surface every git flag at the point of use; settings require users to know which settings exist before configuring them.

Zed's SplitButton with dropdown chevron is a hybrid — persistent default action with discoverable alternatives.

### Theme 4: AI/Agent Integration as an Emerging Modality

AI is entering the git lifecycle across multiple dimensions simultaneously:

- **D1:** Commit message generation (5 commercially-funded editors surveyed ship it: VS Code, JetBrains, Cursor, Zed, GitKraken; GitHub Desktop and Sourcetree do not. GitKraken's Commit Composer goes furthest)
- **D3:** Conflict resolution (Zed "Resolve with Agent" inline button, JetBrains `MergeResolveActionSupport` extension point, GitKraken auto-resolve with per-line explanations)
- **D7:** History search (GitKraken AI/natural-language search)

The conflict resolution surface is well-suited for AI: bounded text, clear ours/theirs semantics, limited context needed. None of the non-developer tools (D8) have adopted AI for commits or conflicts.

### Theme 5: The Abstraction Fracture Point

D8 revealed a pattern that echoes across all dimensions: **abstractions hold for the happy path but fracture on states requiring human judgment**. This is not limited to non-developer tools:

- D3: VS Code's rebase shows `(Rebasing)` with no step counter — the abstraction of "git is handling it" provides no actionable information.
- D6: Network failures surface as a single undifferentiated error across all editors — "Could not read from remote repository" whether the issue is DNS, auth, or server.
- D4: Detached HEAD is detected by all editors but none proactively suggest "create a branch to save your work."

The pattern: tools invest heavily in the golden path and minimally in failure recovery. TinaCMS is the sole exception — its retreat to GitHub's web UI is a designed degradation path, not an unhandled edge case.

### Theme 6: The Reflog Gap

The reflog is git's most powerful recovery mechanism — it enables undo of nearly any operation. Yet across D6 and D1, only lazygit (full undo/redo system) and Magit (dedicated browser) surface it to users. Every other editor either uses reflog internally (VS Code detects branch parent) or has no access. This means users of the most popular editors cannot access the most important safety net without dropping to the CLI.

---

## Comparative Matrices

### D1–D2: Staging, Commit, Push/Pull

| Editor | Staging depth | AI commit | Pull default | Force push | Auto-fetch |
|--------|-------------|-----------|-------------|------------|------------|
| VS Code | Line | Copilot | Merge | Opt-in `--force-with-lease` | Off (3 min when on) |
| GitHub Desktop | Line | No | Merge (FF) | Always `--force-with-lease` | On (1 hour) |
| lazygit | Line | No | Git config | Contextual heuristics | On (1 min) |
| Magit | Line | No | Merge | Explicit transient | Off |
| Zed | Hunk (line in dev) | Native | Merge | No protection | Off |
| JetBrains | Character | AI Assistant | Configurable | Protected branches | Configurable (not documented) |
| GitKraken | Line | Multi-provider | FF-if-possible | Not documented | On (1 min) |
| Obsidian-Git | File | No | Merge | No surface | N/A |

### D3, D6: Conflict UX and Recovery

| Editor | Conflict arch | Resolution granularity | Push rejection | Reflog UX | Safety net |
|--------|--------------|----------------------|----------------|-----------|------------|
| JetBrains | 3-way editor | Per-line | 10x retry loop | None | Local History |
| VS Code | 3-way + inline | Per-range | Text suggestion | Internal only | `git.autoStash` |
| lazygit | Inline colored | Per-hunk | Force confirm | Undo/redo system | Auto-stash |
| Magit | smerge + ediff | Per-hunk + 3-way | Error in buffer | Full browser | WIP refs |
| GitHub Desktop | File-list dialog | Whole file | Fetch dialog | None | Desktop stash |
| Zed | Inline buttons | Per-conflict | Error toast | None | None |
| Obsidian-Git | N/A | N/A | Raw error | None | `pullBeforePush` |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **D3.4 Semantic merge:** Confirmed absent across all mainstream editors. Whether any JetBrains marketplace plugin offers this capability was not verified.
- **D7 Logseq internals:** Source-level investigation was limited; findings are primarily from community documentation.
- **Cursor and Windsurf:** As VS Code forks, they likely inherit git features but were not independently verified.

### Universal Gaps Across the Ecosystem
- No editor provides aggregate "N of M files resolved" conflict progress
- No editor scans staged files for leftover conflict markers (pre-commit hook gap)
- Network failure handling is undifferentiated — no retry, no offline queue, no error classification
- No editor proactively suggests branch creation in detached HEAD state
- Reflog access is absent from most popular editors
- Stale lock file removal has no UI in any editor

### Out of Scope (per Rubric)
- Clone/initial init UX
- OAuth at clone time
- CRDT-specific branching internals
- Git library selection criteria
- Draft-isolation-as-worktree patterns for AI agents

---

## References

### Evidence Files
- [evidence/d1-staging-commit.md](evidence/d1-staging-commit.md) — Staging tiers, commit message paradigms, AI generation, amend, undo, auto-commit
- [evidence/d2-push-pull.md](evidence/d2-push-pull.md) — Pull defaults, fetch automation, force push protection, upstream tracking, dry-run
- [evidence/d3-merge-conflict.md](evidence/d3-merge-conflict.md) — Conflict architectures, rebase visualization, marker guards, cherry-pick/revert
- [evidence/d4-branch-management.md](evidence/d4-branch-management.md) — Branch picker, dirty-tree handling, delete, worktree, spinoff/spinout
- [evidence/d5-remote-auth.md](evidence/d5-remote-auth.md) — Credential storage, GCM architecture, token refresh, multi-account, injection points
- [evidence/d6-error-recovery.md](evidence/d6-error-recovery.md) — Rejected push, reflog undo, safety nets, lock files, credential recovery
- [evidence/d7-history-diff.md](evidence/d7-history-diff.md) — Commit graph, blame, diff viewer, 3-way merge, search, keyboard ergonomics
- [evidence/d8-nondev-abstraction.md](evidence/d8-nondev-abstraction.md) — Auto-commit, terminology, conflicts, collaboration, retreat-to-CLI

### External Sources
- [microsoft/vscode](https://github.com/microsoft/vscode) — `extensions/git/src/`, `extensions/merge-conflict/`, `src/vs/workbench/contrib/mergeEditor/`
- [desktop/desktop](https://github.com/desktop/desktop) — `app/src/lib/git/`, `app/src/ui/`
- [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) — `pkg/gui/`, `pkg/commands/git_commands/`
- [magit/magit](https://github.com/magit/magit) — `lisp/magit-*.el`
- [zed-industries/zed](https://github.com/zed-industries/zed) — `crates/git_ui/`, `crates/askpass/`, `crates/git/`
- [JetBrains/intellij-community](https://github.com/JetBrains/intellij-community) — `plugins/git4idea/`
- [git-ecosystem/git-credential-manager](https://github.com/git-ecosystem/git-credential-manager) — `src/shared/Core/`
- [cli/cli](https://github.com/cli/cli) — `pkg/cmd/auth/gitcredential/helper.go`
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) — `src/automaticsManager.ts`, `src/gitManager/`
- [tinacms/tinacms](https://github.com/tinacms/tinacms) — `packages/tinacms-gitprovider-github/`
- [siyuan-note/dejavu](https://github.com/siyuan-note/dejavu) — `sync.go`
- [sindrets/diffview.nvim](https://github.com/sindrets/diffview.nvim)
- [tpope/vim-fugitive](https://github.com/tpope/vim-fugitive)
- [jonas/tig](https://jonas.github.io/tig/doc/manual.html)
- [GitKraken Desktop Help](https://help.gitkraken.com/gitkraken-desktop/)
- [GitLens docs](https://help.gitkraken.com/gitlens/gitlens-features)
- [Sublime Merge docs](https://sublimemerge.com/docs)
- [Fork](https://git-fork.com)
- [JetBrains IntelliJ IDEA Help](https://www.jetbrains.com/help/idea/)
- [Sourcetree Support](https://support.atlassian.com/sourcetree/)
- [Cursor Docs](https://docs.cursor.com/)
- [TinaCMS editorial workflow docs](https://tina.io/docs/tinacloud/editorial-workflow)
- [Joplin conflict docs](https://joplinapp.org/help/apps/conflict/)
- [Logseq git-auto](https://github.com/logseq/git-auto)
- [VS Code Copilot commit messages](https://code.visualstudio.com/docs/copilot/copilot-smart-actions)
- [JetBrains AI commit messages](https://www.jetbrains.com/help/ai-assistant/ai-in-vcs-integration.html)
- [git-scm.com/docs/git-rerere](https://git-scm.com/docs/git-rerere)
- [git-scm.com/docs/git-reflog](https://git-scm.com/docs/git-reflog)
- [git-scm.com/docs/gitcredentials](https://git-scm.com/docs/gitcredentials)
- [SemanticMerge](https://www.semanticmerge.com/) — Standalone semantic merge tool (PlasticSCM/Unity)
