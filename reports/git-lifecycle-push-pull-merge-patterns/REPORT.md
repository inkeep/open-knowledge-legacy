---
title: "Git Lifecycle UX Patterns: Push, Pull, Merge, and Beyond"
description: "How 15+ editors and tools across the spectrum — developer IDEs, visual git clients, power-user TUIs, and non-developer wrappers — implement the post-clone git lifecycle. Covers staging/commit, push/pull, merge/rebase conflicts, branch management, credential persistence, error recovery, history/diff visualization, and non-developer abstraction patterns. Extended with sync-engine prior art (Linear, Figma, Notion, Replit, Google Docs, Obsidian Sync), error-class taxonomy, recovery UX by failure mode, offline affordances, progress reporting, sustained auth lifecycle, sync-button decomposition, and git-to-user vocabulary mapping. Further extended with auto-sync scheduler dynamics (debounce, queue, idle detection, restart persistence), retry + backoff patterns from workflow automation tools (n8n, Temporal, Prefect, Airflow, Airbyte), and file-sync tool dynamics (Syncthing, Rclone, Nextcloud, git-annex, Dropbox). Source-level analysis of VS Code, GitHub Desktop, lazygit, Magit, JetBrains IntelliJ, Zed, plus docs-level coverage of GitKraken, Fork, Sourcetree, Obsidian-Git, TinaCMS, and others."
createdAt: 2026-04-14
updatedAt: 2026-04-15
subjects:
  - Linear
  - Figma
  - Notion
  - Replit
  - Google Docs
  - Obsidian Sync
  - iCloud Drive
  - Dropbox
  - Stripe API
  - gRPC
  - Tower
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
  - n8n
  - Temporal
  - Prefect
  - Airbyte
  - Apache Airflow
  - Syncthing
  - Rclone
  - Nextcloud
  - git-annex
  - OneDrive
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
  - sync engine architecture
  - offline affordances
  - progress reporting
  - failure taxonomy
  - sustained auth lifecycle
  - auto-sync scheduling
  - retry and backoff patterns
  - file sync dynamics
  - workflow automation
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
- **D6 (extended): A five-class error taxonomy emerges from cross-referencing git editors with Stripe, gRPC, and AWS SDK patterns.** Network (transient), auth (non-retryable without re-auth), semantic (requires user decision), structural (requires content/config change), and local (requires local cleanup). No git client implements circuit-breaking, adaptive retry, or error-to-documentation linking — patterns that are standard in API ecosystems.
- **Sync-engine apps (Linear, Figma, Notion, Google Docs, Obsidian Sync, among others) have solved offline queues, reconnection UX, and conflict avoidance** at a level that git-backed editors have not attempted. Linear persists transactions to IndexedDB with a 4-stage queue pipeline. Figma stores offline edits and reapplies on reconnection. No git editor queues operations when offline or provides retry with backoff.
- **D5 (extended): Token expiry varies from 1 hour (GitHub App installation) to no scheduled expiry (GitHub OAuth, with 1-year inactivity auto-revoke), yet no editor implements silent token refresh.** All editors surface auth failure as a user-facing error requiring manual re-authentication. No editor proactively checks OAuth scopes or detects external identity switches.
- **D8 (extended): Auto-sync scheduler dynamics diverge sharply across git-backed editors.** Obsidian-Git uses chained one-shot setTimeout (not setInterval) with FIFO PromiseQueue serialization, persists last-auto timestamps for restart resumption, but has zero error backoff. SiYuan/dejavu implements counted backoff (7 failures → block auto-sync; 8th failure → 5-min retry; 15 failures → 64-min retry) plus a cloud-level distributed mutex. logseq/git-auto is a stateless shell loop with no retry, debounce, or persistence. No git-backed editor implements idle detection before committing.
- **D6 (extended): Retry + backoff patterns from workflow automation tools (Temporal, Prefect, Airflow, Airbyte) reveal a maturity gap.** Temporal provides typed non-retryable errors, exponential backoff with configurable coefficients, and 6 named overlap policies. Prefect adds built-in jitter. No git editor implements any of these patterns — the most sophisticated git-side retry is JetBrains' 10-attempt rejected-push loop with no backoff.
- **Non-editor sync dynamics: File-sync tools and workflow engines have converged on design patterns that the git editor ecosystem has not adopted.** File-sync tools (Syncthing, Rclone) contribute jittered scan intervals, configurable debounce windows, two-level retry (per-pass + per-API-call), and timetable-based rate limiting. Workflow engines (Temporal, Prefect, Airflow) contribute typed non-retryable error classification, exponential backoff with jitter, and formal overlap policies. Both categories use metadata-database-driven state persistence across restart — absent from git editors.

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

### Sustained Auth Lifecycle (Post-Clone)

**Evidence:** [evidence/d5-sustained-auth-lifecycle.md](evidence/d5-sustained-auth-lifecycle.md)

The parent D5 section covers credential storage at clone time. This extension covers what happens during long-running editor sessions: token expiry, re-auth UX, scope drift, identity switches.

**Token expiry models vary from 1 hour to never across forges:**

| Forge | Token Type | Expiry | Refresh |
|-------|-----------|--------|---------|
| GitHub | OAuth app (`gho_`) | No expiry (auto-revoke after 1yr inactivity) | None |
| GitHub | App installation | 1 hour hard | JWT-signed request; SDKs auto-refresh |
| GitHub | Fine-grained PAT | Configurable; org max 366 days | No refresh — create new |
| GitLab | OAuth access | 2 hours | Refresh token exchange (invalidates prior pair) |
| Bitbucket | OAuth access | 1 hour | Refresh token (no expiry) |
| Azure DevOps | OAuth | Short-lived | Refresh token valid 90 days if used once |

External revocation detection is universally lazy — the next git operation returns 401/403. No forge pushes revocation notifications to running clients.

**No editor implements silent token refresh.** When auth fails mid-session, all editors surface the failure as a user-facing error requiring manual intervention:

| Editor | Re-Auth UX | Notable |
|--------|-----------|---------|
| VS Code | `CredentialsProvider` chain (60s cache) → input box fallback | Auto-regenerates keychain entries when deleted |
| JetBrains | Modal dialog; "Missing personal access token" in settings | Known bug: sometimes does NOT re-prompt after failure ([IDEA-134848](https://youtrack.jetbrains.com/issue/IDEA-134848)) |
| GitHub Desktop | Sign-out/sign-in flow | Overrides credential helper via `-c credential.helper=` |
| lazygit | Delegates to git's credential helpers | Can hang if credential cache daemon dies ([#145](https://github.com/jesseduffield/lazygit/issues/145)) |
| Zed | System credential helper + graphical askpass for SSH | Linux: may lose auth session on restart ([#18140](https://github.com/zed-industries/zed/issues/18140)) |
| Obsidian-Git | Desktop: OS helper; Mobile: PAT in localStorage | Mobile PAT not synced between devices |

**Scope drift is detected only at push-time.** GitHub returns `X-OAuth-Scopes` and `X-Accepted-OAuth-Scopes` headers on every API call, but no editor reads them preemptively. The canonical scenario: a user with `repo` scope pushes to `.github/workflows/` and gets `refusing to allow an OAuth App to create or update workflow without workflow scope`. VS Code's `forceNewSession` API enables scope upgrades, but only after the push fails.

**Stale credential detection is universally lazy.** No editor proactively detects that the user's identity changed externally (via browser, `gh auth switch`, or credential manager). Detection happens only on the next failed git operation.

**Credential helper TTLs create silent auth cliffs:**

| Helper | TTL | Session Behavior |
|--------|-----|-----------------|
| `credential-cache` (git built-in) | 900s (15 min) default | Most aggressive cliff; credentials silently dropped |
| `osxkeychain` / `wincred` | Permanent | No session timeout; survives reboots |
| `credential-store` | Permanent (plaintext) | No expiry |
| GCM | Depends on backing store | Evolving: Git 2.40+ `password_expiry_utc`, Git 2.41+ `oauth_refresh_token` |

GCM is evolving toward proactive refresh: Git 2.40 added `password_expiry_utc` (check expiry without network), Git 2.41 added `oauth_refresh_token` (store refresh tokens alongside access tokens). GCM's Bitbucket provider supports automatic refresh; GitHub provider does not yet ([GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059)). The `git-credential-oauth` helper (hickford) implements full proactive refresh via stored refresh token exchange.

**Multi-account sustained sessions** remain structurally limited. JetBrains supports multiple GitHub accounts in settings but requires manual per-project assignment. `gh auth switch` changes the active account immediately for API calls but requires a new git operation for the credential helper to serve the updated token. [1Password's SSH agent](https://developer.1password.com/docs/ssh/agent/) provides per-application, per-terminal-tab authorization with configurable session duration. GCM's `credential.useHttpPath=true` enables per-repo credential isolation — without it, a single credential per hostname makes multi-account usage on the same forge impossible.

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

### Error-Class Taxonomy

**Evidence:** [evidence/d6-failure-taxonomy.md](evidence/d6-failure-taxonomy.md)

Git communicates errors via stderr with four prefix conventions (`fatal:`, `error:`, `hint:`, `warning:`) and coarse exit codes (128 for fatal, 1 for error). Git provides no structured error codes — all downstream tools must parse stderr strings. VS Code defines 48 error codes via regex classification (`GitErrorCodes` enum). Dugite (GitHub Desktop) defines 59 codes including GitHub-specific server errors (GH001–GH004 and additional codes for secret detection, protected branch force push, and private email restrictions).

Cross-referencing editor codebases with three cross-domain error taxonomies produces a five-class structure:

| Class | Examples | Retryability | Cross-Domain Analog |
|-------|---------|-------------|-------------------|
| **1. Network (transient)** | DNS failure, timeout, HTTP 5xx, 429 | Auto-retry with backoff | AWS "transient"; gRPC `UNAVAILABLE` |
| **2. Auth (non-retryable)** | Expired token, 401/403, scope mismatch | Re-auth required | AWS "non-retryable"; gRPC `UNAUTHENTICATED` |
| **3. Semantic (user decision)** | Non-fast-forward, protected branch, merge conflicts | User must choose strategy | gRPC `FAILED_PRECONDITION` / `ABORTED` |
| **4. Structural (content change)** | LFS quota, large file, pre-receive hook, secret detection | Content/config change required | gRPC `RESOURCE_EXHAUSTED` |
| **5. Local (cleanup)** | index.lock, dirty tree, disk full | Local action required | gRPC `FAILED_PRECONDITION` (local) |

**Cross-domain prior art for error taxonomy design:**

[Stripe's three-layer model](https://docs.stripe.com/error-handling?lang=node) (9 types → ~100 codes → ~50 decline codes) is the gold standard. Each error includes `doc_url` linking to resolution documentation — a pattern no git client implements. [gRPC's 17-code taxonomy](https://grpc.io/docs/guides/status-codes/) distinguishes library-generated errors (infrastructure) from application-only errors (business logic) — mapping directly to git-infrastructure vs repository-semantic errors. [AWS SDK retry classification](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) splits errors into transient (jittered exponential backoff), throttling (adaptive rate limiting), and non-retryable — with circuit-breaking via token bucket. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) separates stable `title` from instance-specific `detail`, mirroring git's distinction between "Push rejected (non-fast-forward)" and "Your branch is 3 commits behind origin/main."

No git client implements circuit-breaking, adaptive retry, or error-to-documentation linking.

### Recovery UX by Failure Mode

**Evidence:** [evidence/d6-recovery-ux-by-mode.md](evidence/d6-recovery-ux-by-mode.md)

Five failure modes surveyed across 7+ editors and 2 sync-engine apps:

**(a) Rejected push:** JetBrains is the only editor presenting **Rebase** and **Merge** as equal-weight peer buttons in a dedicated dialog (with a "Remember choice" checkbox). All others default to one strategy: VS Code shows "Pull then Push" notification, GitHub Desktop changes button label contextually, GitKraken offers a banner with "Pull (FF if possible)" / "Force Push" / "Cancel." No editor creates an automatic backup before the recovery pull.

**(b) Pull with merge conflicts:** VS Code's 3-way merge editor with Copilot AI-assisted resolution represents the current state of the art. JetBrains provides a three-panel merge tool with per-chunk accept/reject. GitHub Desktop delegates to external editors — closing the conflict dialog does NOT abort the merge, a documented UX confusion ([#1627](https://github.com/desktop/desktop/issues/1627)). Tower provides a Conflict Wizard with a top-level Abort button.

**(c) Auth token expired mid-operation:** No editor implements silent token refresh. All surface the failure as a user-facing error. No mid-operation preservation — a push failing partway through auth expiry is simply aborted.

**(d) Interrupted long operation:** An interrupted clone leaves a partial `.git/` directory that no editor UI can resume ([GitHub Desktop #7440](https://github.com/desktop/desktop/issues/7440)). Git itself can recover via `git fetch` inside the partial directory, but editors don't surface this. Stale `index.lock` files from interrupted operations require manual removal — no editor automates cleanup.

**(e) Dirty-tree refuses operation:** Git supports `--autostash` since 2.9 with `pull.autoStash`/`rebase.autoStash` config options. JetBrains' "Smart checkout" is the only editor that transparently stashes, switches branch, and pops. All other editors surface the raw error message.

**Sync-engine contrast:** Linear handles failure via optimistic UI + server-ordered rollback — changes apply locally immediately, and on server rejection, the transaction's `rollback` method undoes client-side changes (the change briefly appears then disappears). Figma uses last-writer-wins with no user-facing conflict resolution. Neither app ever shows a merge dialog to users — a fundamentally different tradeoff from git editors, which preserve every version but force users through conflict resolution.

### Retry + Backoff Patterns (Cross-Domain Prior Art)

**Evidence:** [evidence/c3-workflow-automation-retry-patterns.md](evidence/c3-workflow-automation-retry-patterns.md)

The error-class taxonomy in the parent D6 section identifies five classes of git failure. This extension maps the retry and backoff mechanics that mature systems use for each class — drawn from workflow automation tools, not git editors, because no git editor implements retry beyond JetBrains' 10-attempt rejected-push loop.

**Retry policy comparison across tool categories:**

| System | Policy Type | Initial Delay | Multiplier | Max Delay | Jitter | Non-Retryable Classification |
|--------|------------|---------------|-----------|-----------|--------|------------------------------|
| JetBrains (push rejection) | Fixed count | Immediate | none | none | none | none |
| VS Code (lock file) | Quadratic | 50ms | quadratic | ~5s | none | none |
| n8n (built-in) | Fixed | 1–5000ms | none | 5000ms | none | none |
| [Temporal](https://docs.temporal.io/encyclopedia/retry-policies) | Exponential | 1s | 2.0 | 100s | none built-in | `ApplicationFailure.non_retryable` + type list |
| [Prefect](https://docs.prefect.io/v3/how-to-guides/workflows/retries) | Exponential+jitter | configurable | configurable | configurable | `retry_jitter_factor` | `retry_condition_fn` |
| [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) | Exponential | configurable | configurable | `max_retry_delay` | none | none (callback) |
| [Airbyte](https://docs.airbyte.com/understanding-airbyte/jobs) | Fixed-step escalation | 10s | n/a | 270s | none | threshold (5 zero-data = halt) |

**Three patterns absent from git editors but standard in workflow tools:**

1. **Typed non-retryable errors.** Temporal classifies errors at the type level: `ApplicationFailure` can carry a `non_retryable` flag, and RetryPolicy accepts a `nonRetryableErrors` type list. Auth failures (Class 2 in the D6 taxonomy) and semantic failures (Class 3) are non-retryable by nature — retrying a rejected push or an expired token wastes time and bandwidth. No git editor distinguishes retryable from non-retryable errors.

2. **Jitter.** Prefect's `retry_jitter_factor=0.5` adds up to 50% of base delay randomly. Syncthing jitters its rescan interval ±25%. Jitter prevents thundering-herd when multiple clients retry simultaneously after a shared outage. No git editor applies jitter to any retry or fetch interval — GitHub Desktop's ±30s fetch skew is the closest approximation.

3. **Overlap policies.** Temporal defines [6 named schedule overlap policies](https://docs.temporal.io/schedule): `SKIP` (default — drop if running), `BUFFER_ONE`, `BUFFER_ALL`, `CANCEL_OTHER`, `TERMINATE_OTHER`, `ALLOW_ALL`. Git editors use ad-hoc overlap handling: Obsidian-Git serializes via PromiseQueue, SiYuan uses a mutex + atomic flag, Joplin uses lock acquisition. GitHub Actions has 2 overlap options (`cancel-in-progress: true/false`). No git editor exposes overlap policy as a configurable option.

**State persistence during retry diverges at the architectural level.** Temporal persists every state transition via event sourcing — a crash mid-activity resumes from the last heartbeat checkpoint. Airbyte checkpoints via STATE messages — partial success allows resume from last acknowledged state. n8n and Airflow restart execution from scratch on crash. Git editors have no mid-operation checkpointing — an interrupted clone leaves a partial `.git/` directory that no editor can resume.

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

### Sync Button Decomposition

**Evidence:** [evidence/d8-sync-button-anatomy.md](evidence/d8-sync-button-anatomy.md)

What atomic operations hide behind abstracted buttons:

| Tool | Button | Actual Operations | Atomic? | On Step-N Failure |
|------|--------|-------------------|---------|-------------------|
| Obsidian-Git | "Commit-and-sync" | stage → commit → pull → push (4-6 git ops) | No | No rollback; commit persists on push fail |
| TinaCMS | "Save" | getContent → createOrUpdateFileContents (GitHub API) | Near-atomic | API-level: no partial state |
| Logseq | None (auto) | add -A → commit (no push built-in) | Near-atomic | No error handling |
| SiYuan | "Sync now" | ~15-step: lock → download → diff → merge → upload → unlock | No | Fast-fail; index update is commit point |
| Joplin | "Synchronise" | 3 phases: delete-remote → upload → download | No | Per-item atomic; sync_time checkpoint |
| Linear | None (invisible) | MobX mutation → transaction queue → GraphQL → delta | Server-side atomic | IndexedDB cache; auto-resubmit |

Obsidian-Git's `promiseQueue.addTask()` serializes double-presses — the second invocation waits for the first to complete. Obsidian-Git also registers 30+ individual commands (Stage, Unstage, Fetch, Push, Pull, Switch branch, etc.) alongside the unified action, providing both abstracted and granular surfaces.

TinaCMS's editorial workflow adds a layer: on protected branches, "Save" triggers branch creation → content indexing → draft PR auto-generation. Subsequent saves commit to that branch. "Publish" means merging the PR on GitHub — git operations remain fully server-side.

Joplin is not git-based — it uses the same `Synchronizer.ts` algorithm over a file-API abstraction for all 7 sync targets (filesystem, WebDAV, OneDrive, Dropbox, S3, Joplin Server, Joplin Cloud). Conflicts go to a special "_Conflict_" notebook; the remote version replaces local, and the local original is preserved as a "conflict note."

### Auto-Sync Scheduler Dynamics

**Evidence:** [evidence/c1-git-editor-sync-dynamics.md](evidence/c1-git-editor-sync-dynamics.md)

The Sync Button Decomposition above documents *what* operations each tool runs. This extension documents *when and how* those operations are scheduled — the runtime scheduling, debouncing, queue management, and coordination patterns.

**Scheduling trigger models across git-backed editors:**

| Tool | Trigger Model | Interval | Debounce | Queue | Error Recovery |
|------|--------------|----------|----------|-------|----------------|
| [Obsidian-Git](https://github.com/Vinzent03/obsidian-git) | Hybrid: chained setTimeout + event debounce | `autoSaveInterval` (min) | Trailing, per-setting | FIFO PromiseQueue | None — log + continue |
| [logseq/git-auto](https://github.com/logseq/git-auto) | Interval loop (`while true; sleep`) | 20s default, `-i` flag | None | None (shell sequential) | None — silent fail |
| [SiYuan/dejavu](https://github.com/siyuan-note/dejavu) | Hybrid: poll gate + manual bypass | 30s–12h (`SetSyncInterval`) | `planSyncAfter(d)` | Mutex serialization | Counted backoff: 7 fail → block, 15 → 64min |
| [Joplin](https://joplinapp.org/) | External scheduler (explicit `start()`) | "Few seconds / few minutes" | External | TaskQueue + lock | Per-item disablement |

**Obsidian-Git's chained one-shot setTimeout** is architecturally distinct from `setInterval`. The next timer starts only after the current operation completes (`automaticsManager.ts:137-165`), meaning the effective cycle time is `operation_duration + configured_interval`. This provides natural rate-limiting without an explicit throttle — a slow commit-and-sync extends the cycle proportionally.

**Obsidian-Git is the only surveyed tool that persists scheduler state across restart.** Last-auto timestamps are stored in Obsidian's `localStorage` (`automaticsManager.ts:19-30, 244-252`). On restart, `loadLastAuto()` computes remaining wait: a 20-min interval with 12 min elapsed resumes at 8 min, not at 20 min. All other tools restart their timers from zero.

**User-triggered vs auto coordination:** All surveyed tools serialize user and auto operations through the same mechanism — Obsidian-Git via PromiseQueue, SiYuan via mutex, Joplin via lock acquisition. No tool preempts a running auto operation for a user trigger. Obsidian-Git's `pause` flag (persisted to localStorage) disables the timer chain entirely. SiYuan's `byHand=true` parameter bypasses the auto-sync error counter gate but still contends for the mutex.

**Idle/activity detection before committing is absent from all surveyed tools.** Obsidian-Git's `autoBackupAfterFileChange` debounce triggers after the last file change regardless of whether the user is still editing — it is a change-coalescing debounce, not an idle detector. No tool checks "is the user currently typing?" before initiating a commit.

**SiYuan's counted backoff is the most sophisticated error recovery in any git-adjacent editor.** After 7 consecutive auto-sync failures, `autoSyncErrCount > 7` blocks automatic sync. Manual trigger (`byHand=true`) still works and resets the counter. After 8 failures, `planSyncAfter(fixSyncInterval)` schedules a 5-minute retry. After 15 failures, backoff extends to 64 minutes. SiYuan's [cloud-level distributed mutex](https://github.com/siyuan-note/dejavu) (`sync_lock.go`) — a cloud-stored lock object with 65-second TTL, 30-second refresh, and 3-retry acquisition — prevents two devices from syncing simultaneously.

**Mobile/desktop scheduling divergence is surface-level (Obsidian-Git).** The `AutomaticsManager` scheduling code is shared. Desktop uses `SimpleGit` (native git binary); mobile uses `IsomorphicGit` (pure JS). The practical constraint is OS-level: mobile timers fire only while the app is foregrounded.

### Git-to-User Vocabulary Map

**Evidence:** [evidence/d8-terminology-map.md](evidence/d8-terminology-map.md)

A five-tier vocabulary abstraction model refines the terminology spectrum from the parent D8 section:

**Tier 1 — No version-control vocabulary:** Linear, iCloud Drive, Dropbox, Notion. Changes "just happen." Conflicts surface as renamed files ("conflicted copy"), system dialogs, or duplicate pages. Zero git concepts exposed.

**Tier 2 — One opaque "Sync" button:** Joplin ("Synchronise"), SiYuan ("Sync now"). All operations behind one button. "Sync target" / "Data snapshot" replace git terms entirely.

**Tier 3 — "Save" makes one commit; branch/PR exposed selectively:** TinaCMS. "Save" = one GitHub API commit. "Branch" visible in editorial workflow. No push/pull/merge/conflict in the editor itself.

**Tier 4 — Git operations named but simplified:** Logseq ("Git auto commit" toggle), Obsidian-Git basic ("Commit-and-sync"), VS Code ("Sync Changes" = pull+push). Git terminology used but operations unified.

**Tier 5 — Full git vocabulary, 1:1 mapping:** Obsidian-Git advanced (30+ commands), GitHub Desktop ("Push origin" / "Pull origin"), GitKraken (full vocabulary + graph).

**Vocabulary fractures under failure.** Every tool that abstracts git vocabulary eventually exposes lower-level terms in error messages: Obsidian-Git shows "Merge conflict in file.md," TinaCMS leaks "422 Unprocessable Entity," SiYuan surfaces "Lock acquisition failed," Joplin's users encounter a "_Conflict_" notebook with no preparation for what "conflict" means. Linear is the sole exception — it maintains its vocabulary abstraction even under failure, surfacing only "Sync failed" or "Please reload the application."

The fracture gradient correlates inversely with normal abstraction level: tools that hide more vocabulary produce more jarring fractures when errors force implementation details to surface.

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

### Theme 7: The Failure-Mode Gradient

Git editors and sync-engine apps occupy opposite ends of a failure-mode maturity gradient. The gradient spans three capabilities: error classification, offline resilience, and progress visibility.

**Error classification:** Git editors parse stderr strings with regex — VS Code (48 codes), dugite (59 codes). Stripe classifies errors via three hierarchical layers (type/code/decline_code) with documentation URLs. gRPC defines 17 canonical codes distinguishing infrastructure from application errors. AWS SDK classifies retryability (transient/throttling/non-retryable) with circuit-breaking. No git client implements any of these patterns.

**Offline resilience:** Sync-engine apps persist operation queues (Linear: IndexedDB with 4-stage pipeline; Figma: IndexedDB with 30-day retention; Notion: SQLite). Git editors have zero offline affordances — operations fail immediately without connectivity. Obsidian-Git's timed retry (next auto-sync interval) is the closest approximation, and it is a naive timer, not exponential backoff.

**Progress visibility:** JetBrains and Sublime Merge are the only git editors providing both percentage display and cancel buttons for git operations. VS Code shows percentage only for clone. Sync-engine apps abstract progress entirely — Linear and Figma show a spinner or offline badge, with no per-operation progress. The models diverge: git editors expose partial progress for long operations; sync-engine apps hide operations entirely.

**Observation:** The bridge patterns that exist in sync-engine apps (persistent queues, error-to-documentation linking, circuit-breaking) have not crossed into the git editor ecosystem. The structural barrier is git's stderr-based error reporting — without structured error codes, editors have not implemented the retry classification, documentation linking, or adaptive backoff that API clients take for granted.

### Theme 8: The Scheduler Maturity Gradient

Four tool categories occupy distinct tiers of scheduling maturity. The gradient spans trigger sophistication, retry mechanics, overlap handling, and state persistence.

**Tier 1 — Naive timer (git-backed editors).** Fixed-interval `setTimeout` or shell `sleep` loop. No debounce (logseq/git-auto), or trailing-edge debounce with no idle detection (Obsidian-Git). Error recovery ranges from none (Obsidian-Git logs and continues; logseq/git-auto silently fails) to counted backoff after repeated failures (SiYuan: 7 failures → block auto-sync, escalating to 64-minute retry). No overlap policy — implicit serialization via queue or mutex. Scheduler state lost on restart (all except Obsidian-Git). Rate limiting is implicit via cycle time.

**Tier 2 — Event-driven with reconnection (sync-engine apps).** Event-loop microtask batching (Linear), fixed-tick batching (Figma 33ms), push-subscription + autosave (Notion 15s). Queue persistence to IndexedDB or SQLite. Reconnection catch-up via lastSyncId or full re-download. No configurable retry — the system either catches up or re-downloads. No user-facing scheduling controls.

**Tier 3 — Configurable retry with backoff (file-sync tools).** Hybrid watch + periodic full-rescan with jittered intervals (Syncthing ±25%). Configurable debounce (Syncthing 10s). Two-level retry: per-pass + per-API-call (Rclone). Fixed-interval reconnection (Syncthing 60s). Per-device rate limiting with timetable support (Rclone). Conflict resolution via rename with configurable policy (Rclone). State via metadata database.

**Tier 4 — Typed retry with durable execution (workflow engines).** Exponential backoff with configurable coefficient and max interval (Temporal, Prefect, Airflow). Built-in jitter as a first-class parameter (Prefect only — Temporal's RetryPolicy schema does not include jitter; it must be added manually in Activity code). Typed non-retryable error classification (Temporal). 6 named overlap policies (Temporal). Event-sourced state persistence with mid-operation heartbeat checkpointing (Temporal). Per-item checkpoint for partial-success resumption (Airbyte). Circuit-breaker-equivalent via threshold counts (Airbyte: 5 consecutive zero-data → halt, 10 total zero-data → halt, 20 total partial-data → halt).

**The gradient reveals three capabilities that have not crossed category boundaries:**

1. **Jitter** exists in Tier 3 (Syncthing ±25%) and Tier 4 (Prefect `retry_jitter_factor`) but not in Tier 1 or Tier 2. Git editors with auto-fetch (GitKraken 1-min, lazygit 1-min, GitHub Desktop 1-hour) fire at fixed intervals with no jitter, creating synchronized fetch bursts when multiple developers restart their editors simultaneously.

2. **Typed non-retryable errors** exist only in Tier 4 (Temporal's `ApplicationFailure.non_retryable`). All other tiers retry all errors equally, wasting time on auth failures (Class 2) and semantic failures (Class 3) that cannot succeed without user intervention.

3. **Mid-operation checkpointing** exists only in Tier 4 (Temporal heartbeats, Airbyte STATE messages). All other tiers lose progress on interruption — an interrupted git clone leaves a partial `.git/` directory, and an interrupted Syncthing transfer restarts from the file level.

---

## Sync-Engine Apps as Prior Art

**Evidence:** [evidence/sync-engine-prior-art.md](evidence/sync-engine-prior-art.md)

Six sync-engine apps were surveyed for their offline affordances, reconnection UX, conflict models, and progress patterns — domains where git-backed editors have invested minimally.

### Offline Architecture Comparison

| App | Queue Persistence | Offline Indicator | Reconnection | Conflict Model |
|-----|------------------|-------------------|-------------|----------------|
| **Linear** | IndexedDB (`_transaction` table); 4-stage pipeline | Spinner + "Offline"/"Syncing" badge (top-left) | Delta catch-up via `lastSyncId` comparison | LWW (properties); CRDT (descriptions) |
| **Figma** | IndexedDB (30-day Chrome, 7-day Safari) | Toolbar offline icon + bottom notification | Download fresh doc, reapply offline edits | LWW per property (server authority) |
| **Notion** | SQLite (`offline_page` + `offline_action` tables) | Top-bar sync indicator | Timestamp comparison, fetch modified pages | CRDT (text); conflict-copy (non-text) |
| **Google Docs** | Browser local cache (Chrome extension) | Not documented | 4-step OT reconciliation | OT (server-side transformation) |
| **Obsidian Sync** | Local filesystem (inherently offline-first) | Not needed | diff-match-patch auto-merge | 3-way merge (md); LMW (non-md) |
| **Replit** | None (no offline mode) | Disconnection dialog | Auto-reconnect; polling fallback | OT (requires active connection) |

Linear's architecture is the most fully documented via a [CTO-endorsed reverse-engineering effort](https://github.com/wzhudev/reverse-linear-sync-engine). Its 4-stage transaction queue (created → queued/persisted → executing → completed-but-unsynced) provides the strongest offline guarantee: transactions in IndexedDB survive app restarts and are automatically resubmitted on reconnection. The server assigns monotonically incrementing `syncId` values — no client-side merge conflicts are possible. Caveat: real-world users report that closing and reopening the Mac app without connectivity yields "Unknown Error" — persistent offline access requires a continuous session.

Figma's approach keeps "connecting and reconnecting very simple" ([Evan Wallace](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)): on reconnection, clients download a fresh document copy, reapply offline edits on top, and resume WebSocket sync. Anti-flicker: Figma discards incoming server changes that conflict with unacknowledged local edits, showing "our best prediction of what the eventually-consistent value will be."

Notion shipped offline in August 2025 — its most-requested feature. Pages are explicitly marked "available offline" and dynamically migrated to a CRDT data model. SQLite evolved from best-effort cache to persistent storage. Desktop and mobile only (not browser). Conflict resolution: CRDT auto-merge for text edits; "Conflict" duplicate pages for non-text changes.

### Progress Reporting Across Git Libraries

Four git libraries provide progress APIs with varying quality:

| Library | API | Data Available | Used By |
|---------|-----|----------------|---------|
| simple-git | `SimpleGitProgressEvent` callback | method + stage + progress (0-100) | Obsidian-Git (desktop) |
| isomorphic-git | `onProgress` callback | phase + loaded + total (total may be 0) | Obsidian-Git (mobile) |
| dugite | Parses native git `--progress` stderr | Raw strings (percentage, counts, speed) | GitHub Desktop |
| libgit2/git2-rs | `RemoteCallbacks` typed callbacks | `Progress` struct (objects, bytes) + sideband | Zed |

simple-git provides the cleanest API (method + stage + percentage integer). isomorphic-git's is the weakest — `total` can be 0 making percentage calculation impossible, and complex commands (clone = fetch + indexPack + checkout) report per-sub-command phases requiring manual aggregation.

**Editor progress UX remains sparse.** Only JetBrains (`Task.Backgroundable` with `setFraction(0.0–1.0)` and `checkCanceled()`) and Sublime Merge (progress bar with cancel "x") provide both percentage display and cancel buttons. VS Code shows percentage for clone only (since Oct 2019, [PR #71341](https://github.com/microsoft/vscode/pull/71341)). GitHub Desktop shows percentage for clone; other operations show a rotating circle. GitKraken users report the UI appears to "hang" with no progress indication.

**Cancellation is safe but underexposed.** Git push is server-confirmed — SIGINT during push means the local ref is not updated. Fetch writes temporary packfiles renamed atomically on completion. Clone leaves a partial `.git/` directory not resumable through any editor UI. JetBrains implements cancel via `ProcessCanceledException` which sends SIGINT to the spawned git process. No editor provides cleanup logic beyond what git itself handles.

**Cross-domain progress patterns** appear to converge on three properties (INFERRED): (1) a single aggregate indicator (not per-subsystem), (2) phase labels (downloading/extracting/indexing), and (3) determinate percentage when possible. Docker's per-layer approach is widely seen as an anti-pattern ([moby #4022](https://github.com/moby/moby/issues/4022)). Git's multi-phase output (counting, compressing, receiving, resolving deltas) maps well to phase labels, but no editor aggregates these into a single percentage.

---

## Non-Editor Sync Dynamics

This section surveys two tool categories outside the editor/sync-engine/git-client framing: **workflow automation tools** (n8n, Temporal, Prefect, Airflow, Airbyte) and **file-sync tools** (Syncthing, Rclone, Nextcloud, git-annex, Dropbox). These tools have mature scheduling, retry, and coordination mechanics that editors have not adopted.

### Workflow Automation: Retry + Scheduling Mechanics

**Evidence:** [evidence/c3-workflow-automation-retry-patterns.md](evidence/c3-workflow-automation-retry-patterns.md)

Six workflow/automation tools were surveyed for their retry policies, scheduling overlap handling, and state persistence patterns.

**Per-unit retry is universal.** Every mature workflow system retries at the smallest meaningful unit: [Temporal](https://docs.temporal.io/encyclopedia/retry-policies) retries Activities (not Workflows), [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) retries Tasks (not DAG runs), [Airbyte](https://docs.airbyte.com/understanding-airbyte/jobs) retries connection attempts (not individual records), [Prefect](https://docs.prefect.io/v3/how-to-guides/workflows/retries) retries Tasks. Whole-workflow retry is treated as exceptional.

**Exponential backoff with configurable coefficients is the norm.** Temporal defaults to `initialInterval=1s, backoffCoefficient=2.0, maxInterval=100s`. Prefect and Airflow provide equivalent configurability. n8n is the outlier — its built-in retry caps at 5 attempts / 5000ms with fixed delay only; exponential backoff requires a manually wired loop subworkflow.

**Overlap policies — what happens when the next scheduled run fires while the current is still executing:**

| Tool | Overlap Model |
|------|--------------|
| [Temporal](https://docs.temporal.io/schedule) | 6 named: SKIP, BUFFER_ONE, BUFFER_ALL, CANCEL_OTHER, TERMINATE_OTHER, ALLOW_ALL |
| [GitHub Actions](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) | 2: `cancel-in-progress: true/false` |
| [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html) | `max_active_runs` + `depends_on_past` + `catchup` |
| [n8n](https://docs.n8n.io/hosting/scaling/concurrency-control/) | Concurrency limit (queue or cancel excess) |
| Obsidian-Git | Implicit (PromiseQueue serialization) |
| SiYuan | Implicit (mutex + atomic flag) |

**State persistence splits durable from ephemeral execution.** Temporal persists every state transition via event sourcing — a crash mid-activity resumes from the last heartbeat checkpoint. Airbyte checkpoints via STATE messages — partial success allows resume from last acknowledged state. n8n/Airflow/GitHub Actions restart from scratch on crash. The "durable execution" pattern (Temporal) preserves mid-operation progress; the "restart execution" pattern (n8n, Airflow) does not.

### File-Sync Tools: Detection, Scheduling, and Conflict Patterns

**Evidence:** [evidence/c4-file-sync-tools-dynamics.md](evidence/c4-file-sync-tools-dynamics.md)

Six file-sync tools were surveyed for their change detection, scheduling, conflict resolution, and rate-limiting patterns.

**Hybrid watch + periodic full-rescan is the universal detection model.** Every daemon-based tool ([Syncthing](https://docs.syncthing.net/users/syncing.html), [Nextcloud](https://docs.nextcloud.com/desktop/3.3/architecture.html), Dropbox, OneDrive, [git-annex](https://git-annex.branchable.com/design/assistant/syncing/)) uses filesystem events (inotify/FSEvents) as the primary trigger with a periodic full-scan as a safety net. Safety-net intervals vary: 1 hour (Syncthing), 2 hours (Nextcloud fallback), undisclosed (Dropbox/OneDrive). [Rclone bisync](https://rclone.org/bisync/) offloads scheduling entirely to the caller (cron or loop).

**Debounce is explicitly designed only where rapid changes are expected.** Syncthing's `fsWatcherDelayS` (default 10 seconds) is the only tool with a documented, configurable debounce. Syncthing additionally holds deletions an extra ~60 seconds to avoid spurious deletes from in-progress writes. All other tools coalesce implicitly via sync-cycle batching.

**Jittered scan intervals prevent thundering-herd.** Syncthing jitters its `rescanIntervalS` ±25% — if configured at 3600s, the actual interval is 2700–4500s. No git editor applies jitter to any timer. GitHub Desktop's ±30s random skew on its 1-hour fetch interval is the closest git-side approximation.

**Conflict resolution is uniformly rename-based — no tool auto-merges content:**

| Tool | Winner Selection | Conflict Naming Pattern |
|------|-----------------|------------------------|
| [Syncthing](https://docs.syncthing.net/users/syncing.html) | Older mtime loses; device-ID tiebreaker | `.sync-conflict-YYYYMMDD-HHMMSS-<id8>` |
| [Rclone](https://rclone.org/bisync/) | Configurable: `newer`/`older`/`larger`/`path1`/`path2` | `.<conflict-suffix>` (default `.conflict`) |
| [Nextcloud](https://docs.nextcloud.com/desktop/3.3/architecture.html) | Server wins original name | `_conflict-YYYYMMDD-HHMMSS` |
| [git-annex](https://git-annex.branchable.com/design/assistant/syncing/) | Both kept (no winner) | Separate git commits |
| [Dropbox](https://help.dropbox.com/organize/conflicted-copy) | Last save wins original name | `(DeviceName's conflicted copy YYYY-MM-DD)` |
| OneDrive | Keep both | `-<DeviceName>` |

Rclone bisync is the only tool with an explicit conflict policy enum (`--conflict-resolve`). All others apply a fixed strategy.

**Two-level retry exists in Rclone but nowhere in the git editor ecosystem.** Rclone separates outer retry (`--retries`, default 3 — retries entire sync pass) from inner retry (`--low-level-retries`, default 10 — retries individual API calls). Syncthing reconnects at a fixed 60-second interval with no backoff. git-annex assistant retries failed pushes every 30 minutes. No git editor has retry at either level.

**Rate limiting is a first-class feature only in Syncthing and Rclone.** Syncthing offers per-device kBps controls with LAN-only exemption. Rclone offers timetable-based `--bwlimit` (e.g., `"08:00,512k 18:00,10M 23:00,off"`) and parallelism knobs (`--transfers`, `--checkers`). No other surveyed tool provides user-facing bandwidth throttling.

**State persistence is via metadata database, not operation queue.** All tools re-derive pending work from their metadata store on reconnect: Syncthing (BoltDB index), Nextcloud (SQLite journal), Dropbox/OneDrive (proprietary SQLite), Rclone (`.lst` snapshot files), git-annex (git objects). No tool uses an explicit "pending operations queue" — a structural difference from sync-engine apps like Linear (IndexedDB `__transactions` queue).

### Sync-Engine Apps: Scheduling + Queue Dynamics

**Evidence:** [evidence/c2-sync-engine-dynamics.md](evidence/c2-sync-engine-dynamics.md)

The parent "Sync-Engine Apps as Prior Art" section above covers offline architecture, progress APIs, and conflict models. This extension adds the runtime scheduling, batching, and queue management dynamics.

**Batching windows are matched to interaction model.** [Linear](https://github.com/wzhudev/reverse-linear-sync-engine) uses JS event-loop microtask batching — changes within the same event loop share a `batchIndex`, sufficient for issue-tracker interaction patterns. [Figma](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) sends batched updates at 33ms / 30 FPS, matching the animation-frame model of a design tool. [Notion](https://www.notion.com/blog/how-we-made-notion-available-offline) autosaves every 15 seconds, appropriate for long-form editing. No tool uses a fixed polling cadence for change detection — all are event-driven.

**Reconnection pattern bifurcates on storage design.** Incremental catch-up (Linear: `lastSyncId` delta fetch; Google Docs: upload change log for server-side OT) requires the server to maintain an ordered delta log. Full re-download + local replay (Figma: download fresh document, reapply offline edits; Notion: timestamp comparison + re-fetch) is simpler but creates larger reconnect payloads for large documents.

**Queue persistence correlates with conflict model.** Linear persists unconfirmed mutations to IndexedDB `__transactions` — model tables contain only confirmed-only state. Notion persists to SQLite, surviving OS reboot. Figma's ephemeral edit list is consistent with its re-download model: the list only needs to survive the session because the server is always authoritative on reconnect.

**Conflict detection happens at the boundary, not at write time.** Linear: server response (delta ack). Figma: WebSocket ack boundary with anti-flicker (client tracks unacknowledged property changes, refuses to overwrite with older `sequence_number`). Notion: reconnect timestamp comparison. Google Docs: server-side OT transformation. Obsidian Sync: file-save-time content hash comparison. No system detects conflicts when the user types — a deliberate latency trade-off.

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

### Dimensions Added in Update Pass (2026-04-15) — Scheduler Dynamics Gaps
- **Obsidian-Git mobile background execution:** OS-level timer throttling constraints not verified. Mobile timers fire only while foregrounded, but the exact iOS/Android behavior with Obsidian's mobile app was not tested.
- **Joplin external scheduler cadence:** "Few seconds / few minutes" not confirmed at source level; external scheduling mechanism not identified.
- **TinaCMS debounce timing:** Per-file commit triggers confirmed but debounce window not verified at source level.
- **Linear reconnection backoff:** Spinner shown during reconnect events, but backoff curve not documented in public sources.
- **Figma offline edit persistence duration:** 30-day IndexedDB retention is community-sourced; not confirmed in official Figma documentation.
- **Syncthing per-file failure retry:** Documented at the scan-cycle level but per-file retry behavior (within a cycle) not fully confirmed.
- **n8n exponential backoff:** Community reports suggest recent versions may have added native exponential backoff; docs still show fixed delay.
- **Temporal jitter:** Confirmed absent from RetryPolicy schema — can only be added manually inside Activity code.

### Dimensions Added in Update Pass (2026-04-14) — Remaining Gaps
- **Linear real-time persistence:** Users report "Unknown Error" when reopening without connectivity; the offline guarantee depends on maintaining a continuous session. The precise failure mode was not source-verified.
- **Notion offline edge cases:** Database offline limited to first 50 rows of first view; non-text conflict resolution produces duplicate pages but the reconciliation algorithm was not source-verified.
- **GCM proactive refresh for GitHub:** Proposed in [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059) but not yet implemented — status may change.
- **Azure DevOps OAuth deprecation timeline:** Reportedly scheduled for removal in 2026 ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth?view=azure-devops)); may affect long-term auth patterns for that forge.
- **Replit offline:** Crosis provides no built-in offline functionality. Goval architecture prevents offline editing due to OT server requirement. Community feature requests exist but no implementation was found.

### Out of Scope (per Rubric)
- Clone/initial init UX
- OAuth at clone time
- CRDT-specific branching internals
- Git library selection criteria
- Draft-isolation-as-worktree patterns for AI agents

---

## References

### Evidence Files (Update Pass 2026-04-15 — Scheduler Dynamics)
- [evidence/c1-git-editor-sync-dynamics.md](evidence/c1-git-editor-sync-dynamics.md) — Auto-sync scheduling: Obsidian-Git timer chain + PromiseQueue, SiYuan counted backoff + cloud mutex, logseq shell loop, Joplin lock serialization
- [evidence/c2-sync-engine-dynamics.md](evidence/c2-sync-engine-dynamics.md) — Sync-engine scheduling: Linear microtask batching + 4-stage queue, Figma 33ms tick + WAL journal, Notion push subscriptions + SQLite, Google Docs OT reconciliation
- [evidence/c3-workflow-automation-retry-patterns.md](evidence/c3-workflow-automation-retry-patterns.md) — Workflow retry policies: n8n fixed 5-try cap, Temporal exponential + typed non-retryable, Prefect jitter, Airflow exponential, Airbyte fixed-step escalation, GitHub Actions community retry
- [evidence/c4-file-sync-tools-dynamics.md](evidence/c4-file-sync-tools-dynamics.md) — File-sync dynamics: Syncthing jittered rescan + debounce + per-device throttle, Rclone two-level retry + bwlimit timetable, Nextcloud ETag pruning, git-annex 30-min push retry, Dropbox/OneDrive conflict naming

### Evidence Files (Original + Update Pass 2026-04-14)
- [evidence/d1-staging-commit.md](evidence/d1-staging-commit.md) — Staging tiers, commit message paradigms, AI generation, amend, undo, auto-commit
- [evidence/d2-push-pull.md](evidence/d2-push-pull.md) — Pull defaults, fetch automation, force push protection, upstream tracking, dry-run
- [evidence/d3-merge-conflict.md](evidence/d3-merge-conflict.md) — Conflict architectures, rebase visualization, marker guards, cherry-pick/revert
- [evidence/d4-branch-management.md](evidence/d4-branch-management.md) — Branch picker, dirty-tree handling, delete, worktree, spinoff/spinout
- [evidence/d5-remote-auth.md](evidence/d5-remote-auth.md) — Credential storage, GCM architecture, token refresh, multi-account, injection points
- [evidence/d5-sustained-auth-lifecycle.md](evidence/d5-sustained-auth-lifecycle.md) — Token expiry by forge, re-auth UX, scope drift, identity switches, credential helper TTLs
- [evidence/d6-error-recovery.md](evidence/d6-error-recovery.md) — Rejected push, reflog undo, safety nets, lock files, credential recovery
- [evidence/d6-failure-taxonomy.md](evidence/d6-failure-taxonomy.md) — Five-class error taxonomy, cross-domain anchors (Stripe/gRPC/AWS/RFC 9457), editor error surfaces
- [evidence/d6-recovery-ux-by-mode.md](evidence/d6-recovery-ux-by-mode.md) — Recovery UX for 5 failure modes across 7+ editors, sync-engine contrast
- [evidence/d7-history-diff.md](evidence/d7-history-diff.md) — Commit graph, blame, diff viewer, 3-way merge, search, keyboard ergonomics
- [evidence/d8-nondev-abstraction.md](evidence/d8-nondev-abstraction.md) — Auto-commit, terminology, conflicts, collaboration, retreat-to-CLI
- [evidence/d8-sync-button-anatomy.md](evidence/d8-sync-button-anatomy.md) — Sync button decomposition across 8 tools, operation sequences, failure recovery
- [evidence/d8-terminology-map.md](evidence/d8-terminology-map.md) — Five-tier vocabulary model, comprehensive term mapping, fracture analysis
- [evidence/sync-engine-prior-art.md](evidence/sync-engine-prior-art.md) — Offline architectures, progress APIs, cancellation semantics for sync-engine apps + git libraries

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
- [Stripe error handling](https://docs.stripe.com/error-handling?lang=node) — Three-layer error taxonomy (type/code/decline_code)
- [gRPC status codes](https://grpc.io/docs/guides/status-codes/) — 17-code canonical taxonomy
- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) — Problem Details for HTTP APIs
- [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) — Retry classification
- [Julia Evans — Notes on git's error messages](https://jvns.ca/blog/2024/04/10/notes-on-git-error-messages/) — stderr prefix conventions
- [desktop/dugite](https://github.com/desktop/dugite) — `lib/errors.ts` (59 error codes)
- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — CTO-endorsed analysis of Linear's sync architecture
- [Linear sync engine blog](https://linear.app/blog/scaling-the-linear-sync-engine) — Official architecture overview
- [Figma multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — Evan Wallace on CRDT-inspired architecture
- [Figma offline docs](https://help.figma.com/hc/en-us/articles/360040328553-What-can-I-do-offline-in-Figma)
- [Notion offline blog](https://www.notion.com/blog/how-we-made-notion-available-offline) — SQLite + CRDT migration
- [replit/crosis](https://github.com/replit/crosis) — WebSocket protocol client
- [Google Docs offline help](https://support.google.com/docs/answer/6388102?hl=en)
- [Obsidian Sync](https://obsidian.md/sync) — First-party paid sync with diff-match-patch merge
- [GitHub Docs — Token Expiration](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [GitLab Docs — OAuth Provider](https://docs.gitlab.com/integration/oauth_provider/)
- [Atlassian Blog — Bitbucket Token Expiry](https://www.atlassian.com/blog/bitbucket/enhancing-security-in-bitbucket-introducing-expiry-for-access-tokens)
- [GCM Issue #2059](https://github.com/git-ecosystem/git-credential-manager/issues/2059) — Proactive OAuth refresh
- [1Password SSH Agent](https://developer.1password.com/docs/ssh/agent/) — Per-application authorization
- [gh CLI — Multiple Accounts](https://github.com/cli/cli/blob/trunk/docs/multiple-accounts.md)
- [simple-git progress plugin](https://github.com/steveukx/git-js/blob/main/docs/PLUGIN-PROGRESS-EVENTS.md)
- [isomorphic-git onProgress](https://isomorphic-git.org/docs/en/onProgress)
- [git2-rs RemoteCallbacks](https://docs.rs/git2/latest/git2/struct.RemoteCallbacks.html)
- [Tower](https://www.git-tower.com/) — Visual git client with Conflict Wizard
- [desktop/askpass-trampoline](https://github.com/desktop/askpass-trampoline) — GitHub Desktop credential bridge
- [git-credential-oauth](https://github.com/hickford/git-credential-oauth) — Proactive refresh via stored refresh tokens
- [Apple TN2336](https://developer.apple.com/library/archive/technotes/tn2336/_index.html) — iCloud conflict handling
- [Dropbox conflicted copy](https://help.dropbox.com/organize/conflicted-copy)

### External Sources (Update Pass 2026-04-15 — Scheduler Dynamics)
- [Vinzent03/obsidian-git — automaticsManager.ts](https://github.com/Vinzent03/obsidian-git/blob/master/src/automaticsManager.ts) — Timer chain, debounce, last-auto persistence
- [logseq/git-auto](https://github.com/logseq/git-auto) — Shell-based auto-commit loop (archived)
- [siyuan-note/siyuan — sync.go](https://github.com/siyuan-note/siyuan/blob/master/kernel/model/sync.go) — Counted backoff, sync mode gating
- [siyuan-note/dejavu — sync_lock.go](https://github.com/siyuan-note/dejavu/blob/master/sync_lock.go) — Cloud-level distributed mutex
- [n8n Error Handling](https://docs.n8n.io/flow-logic/error-handling/) — Retry on Fail, error workflows
- [n8n Concurrency Control](https://docs.n8n.io/hosting/scaling/concurrency-control/) — Workflow overlap handling
- [n8n Queue Mode](https://docs.n8n.io/hosting/scaling/queue-mode/) — BullMQ + Redis worker dispatch
- [n8n Rate Limits](https://docs.n8n.io/integrations/builtin/rate-limits/) — API rate-limit handling
- [Temporal Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies) — Exponential backoff, non-retryable errors
- [Temporal Failures Reference](https://docs.temporal.io/references/failures) — Typed error hierarchy
- [Temporal Schedules](https://docs.temporal.io/schedule) — 6 named overlap policies
- [Temporal Activity Timeouts](https://temporal.io/blog/activity-timeouts) — Heartbeat checkpointing
- [Prefect Retry How-To](https://docs.prefect.io/v3/how-to-guides/workflows/retries) — exponential_backoff + jitter
- [Airflow Tasks](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) — retry_exponential_backoff, pools
- [Airbyte Jobs](https://docs.airbyte.com/understanding-airbyte/jobs) — Attempt thresholds, fixed-step escalation
- [Airbyte Checkpointing](https://airbyte.com/blog/checkpointing) — STATE message persistence
- [GitHub Actions Workflow Syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) — Concurrency, schedule
- [Syncthing — Understanding Synchronization](https://docs.syncthing.net/users/syncing.html) — Watcher, debounce, conflict naming
- [Syncthing — Configuration reference](https://docs.syncthing.net/users/config.html) — Intervals, rate limits, connection limits
- [Rclone — Bisync](https://rclone.org/bisync/) — Conflict resolver, listing snapshots, recovery
- [Rclone — Global Flags](https://rclone.org/flags/) — retries, bwlimit, transfers
- [Rclone — rclone mount](https://rclone.org/commands/rclone_mount/) — VFS cache, poll-interval
- [Nextcloud Desktop Architecture (v3.3)](https://docs.nextcloud.com/desktop/3.3/architecture.html) — Sync engine, ETag pruning
- [git-annex assistant syncing](https://git-annex.branchable.com/design/assistant/syncing/) — Watcher, push retry
- [OneDrive sync conflicts](https://sharepointmaven.com/how-onedrive-sync-resolves-sync-conflicts/) — Office co-authoring, keep-both
- [marknotfound — Reverse Engineering Linear's Sync](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) — Independent sync analysis
- [Making multiplayer more reliable (Figma)](https://www.figma.com/blog/making-multiplayer-more-reliable/) — WAL journal details
- [Notion offline blog](https://www.notion.com/blog/how-we-made-notion-available-offline) — SQLite + CRDT migration
