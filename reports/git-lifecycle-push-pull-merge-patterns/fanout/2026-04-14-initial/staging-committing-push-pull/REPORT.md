---
title: "Staging, Committing, Push/Pull UX Across the Editor Spectrum"
description: "Source-level analysis of how 12 editors and tools expose git staging granularity, commit message composition, undo workflows, auto-commit patterns, push/pull mechanics, force push protection, fetch automation, and upstream tracking — from developer IDEs through visual clients to non-developer wrappers."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - VS Code
  - GitHub Desktop
  - Lazygit
  - Magit
  - Zed
  - GitKraken
  - JetBrains
  - Fugitive
  - Fork
  - Sourcetree
  - Obsidian-git
  - Cursor
topics:
  - git staging UX
  - commit message composition
  - push pull mechanics
  - auto-commit patterns
  - force push protection
  - fetch automation
---

# Staging, Committing, Push/Pull UX Across the Editor Spectrum

**Purpose:** Factual landscape of how editors expose the git staging-through-push lifecycle to users. Covers the full spectrum from developer IDEs (VS Code, JetBrains, Zed, Cursor) through power-user TUIs (Lazygit, Magit, Fugitive) and visual git clients (GitHub Desktop, GitKraken, Fork, Sourcetree) to non-developer wrappers (Obsidian-git). Source-level where available; docs-level otherwise. Any team implementing git lifecycle UX should derive equal value regardless of product category.

**Parent report:** `reports/git-lifecycle-push-pull-merge-patterns/` — Direction 1 of 4 (D1 + D2).

---

## Executive Summary

Staging, committing, and push/pull are the most frequently exercised git operations, yet editor implementations diverge sharply across two axes: **granularity of control** and **degree of abstraction**.

**Staging granularity** follows a clear tier structure. Every editor supports file-level staging. Most developer-facing tools support hunk-level staging (10 of 12 surveyed). Line-level staging — staging arbitrary lines within a hunk — is supported by 8 tools, but the implementation strategies differ fundamentally: VS Code, GitHub Desktop, and Lazygit construct patches programmatically; Magit uses Emacs region selection with in-process diff fixup; JetBrains offers a three-way diff editor for character-level precision. Zed is the notable gap — line-level staging is in active development (issue #45295). Obsidian-git deliberately limits to file-level, matching its non-developer audience.

**Commit message UX** has bifurcated into an inline-box paradigm (VS Code, GitHub Desktop, Zed, GitKraken) and a full-editor-buffer paradigm (Magit, Fugitive, Lazygit). AI commit message generation is becoming table-stakes for commercial editors — GitKraken, JetBrains, Cursor, Zed, and VS Code all ship it. GitKraken's Commit Composer goes furthest, offering AI-assisted restructuring of commit history.

**Pull defaults** are universally merge-based. No editor defaults to rebase. Rebase is always opt-in, with varying levels of accessibility — GitKraken and JetBrains make it easy to persist as a default; VS Code requires a separate command invocation; GitHub Desktop has no UI and reads git config only.

**Fetch automation** intervals span 1 minute (GitKraken, Lazygit) to 1 hour (GitHub Desktop). VS Code and Zed default to no auto-fetch, requiring user opt-in. Magit has no auto-fetch at all.

**Force push protection** follows four distinct strategies: hidden-by-default opt-in (VS Code, Sourcetree), always-force-with-lease (GitHub Desktop), explicit transient switches (Magit), and contextual heuristics (Lazygit). Zed currently has no force push protection.

**Auto-commit** is exclusively a non-developer pattern. Only Obsidian-git fully abstracts git into a timer-based "backup" paradigm. Developer editors universally require explicit staging and commit intent.

**Key Findings:**
- **Line-level staging implementation diverges into 3 strategies** — patch construction, in-process diff fixup, or three-way diff editor. The choice reflects architectural philosophy, not capability gaps.
- **AI commit messages are table-stakes for commercial editors** — 5 of 7 commercial/funded editors ship them natively, with GitKraken going furthest (AI-assisted commit history restructuring).
- **No editor defaults to rebase for pull** — merge is the universal safe default. Rebase accessibility varies from one-click persistent toggle to hidden git config.
- **Force push protection is inconsistent across the ecosystem** — strategies range from hidden-by-default to no protection at all.
- **Auto-commit is a non-developer-only pattern** — Obsidian-git is the sole tool offering timer-based auto-commit, bridging the gap between git and "cloud sync" mental models.
- **Dry-run/preview before push-pull is almost non-existent** — only Magit's push transient exposes `--dry-run`. Behind/ahead indicators serve as a weak proxy.

---

## Research Rubric

| Dim | Facet | Priority | Depth |
|-----|-------|----------|-------|
| D1.1 | Staging granularity (file/hunk/line/all) | P0 | Deep |
| D1.2 | Partial commit / stash workflows | P0 | Deep |
| D1.3 | Commit message UX | P0 | Moderate |
| D1.4 | Amend workflows | P0 | Moderate |
| D1.5 | Undo/revert after commit | P0 | Moderate |
| D1.6 | Auto-staging / auto-commit | P0 | Deep |
| D1.7 | File-status visualization | P1 | Moderate |
| D1.8 | Empty-repo first-commit | P1 | Moderate |
| D2.1 | Pull semantics (merge vs rebase) | P0 | Deep |
| D2.2 | Upstream tracking | P0 | Moderate |
| D2.3 | Fetch automation | P0 | Deep |
| D2.4 | Push UX (force, protection) | P0 | Deep |
| D2.5 | Dry-run / preview | P1 | Moderate |
| D2.6 | Rejected push recovery | P0 | Moderate |
| D2.7 | Multi-remote support | P1 | Moderate |
| D2.8 | Behind/ahead indicators | P1 | Moderate |

**Stance:** Factual — observations and patterns only. No recommendations.

**Source-level depth:** VS Code (`extensions/git/src/`), GitHub Desktop (`app/src/`), Lazygit (`pkg/`), Magit (`lisp/`), Zed (`crates/git_ui/`, `crates/git/`), Fugitive (`autoload/fugitive.vim`). Docs-level: GitKraken, Fork, Sourcetree, JetBrains, Cursor, Obsidian-git.

---

## Detailed Findings

### D1.1: Staging Granularity

**Finding:** Four staging tiers exist, with adoption decreasing at finer granularity.

**Evidence:** [evidence/staging-granularity.md](evidence/staging-granularity.md)

| Level | Support | Notable absences |
|-------|---------|-----------------|
| Stage-all | Universal (12/12) | — |
| Stage-file | 11/12 | GitHub CLI (delegates to `git`) |
| Stage-hunk | 10/12 | Obsidian-git (by design), GitHub CLI |
| Stage-line/range | 8/12 | Zed (in development), Fugitive (delegates to `git add --patch`), Obsidian-git, GitHub CLI |

Three distinct implementation strategies for sub-hunk staging:

1. **Patch construction + `git apply --cached`** (VS Code, GitHub Desktop, Lazygit): The editor constructs a patch programmatically from selected lines, then applies it to the index. VS Code uses `intersectDiffWithRange()` to clip hunks to editor selection, then `git hash-object -w` + `git update-index`. Lazygit's `patch.Transform(TransformOpts{IncludedLineIndices})` constructs surgical patches from selected line ranges. GitHub Desktop tracks per-line inclusion via its `DiffSelection` divergence set.

2. **In-process diff fixup** (Magit): `magit-diff-hunk-region-patch` walks every hunk line, converts unselected lines to context (replacing `+`/`-` with space), then `diff-fixup-modifs` recalculates `@@ -X,Y +A,B @@` headers. The Emacs region provides the arbitrary line selection — no separate selection UI needed.

3. **Three-way diff editor** (JetBrains): A three-pane view showing HEAD / Staged / Local where the staged pane is a fully-functional editor. Users can type directly into it for character-level staging precision. This is the most granular staging UI in the ecosystem.

**GitHub Desktop's inverted index model** is architecturally distinct: the index is rebuilt from scratch at commit time based on UI checkbox state, not incrementally modified via `git add`. `unstageAll()` → `stageFiles()` → `commit()`. Users never interact with `git add` directly.

### D1.2: Partial Commit / Stash Workflows

**Finding:** Stash workflows expose the staging/partial-commit boundary. Lazygit offers the richest stash menu; GitHub Desktop's inverted index model precludes granular stash variants.

**Evidence:** [evidence/staging-granularity.md](evidence/staging-granularity.md)

Lazygit exposes 5 stash variants: stash all, keep index, include untracked, staged only (`git stash push --staged`, git 2.35+), and unstaged only (workaround via temp commit + stash + soft reset). The "staged only" variant has a multi-step fallback for git < 2.35 with known edge-case bugs documented in source comments.

Magit surfaces stash options through its transient popup system. GitHub Desktop and Obsidian-git do not expose granular stash workflows — their index abstractions make "stash some, keep others" less natural.

### D1.3: Commit Message UX

**Finding:** Two paradigms (inline box vs full editor) coexist. AI commit message generation is becoming table-stakes for commercial editors.

**Evidence:** [evidence/commit-message-ux.md](evidence/commit-message-ux.md)

**Inline input box** (VS Code, GitHub Desktop, Zed, GitKraken, Sourcetree): Single text field with optional validation. GitHub Desktop enforces summary+description separation with 50/72 character guidelines. VS Code offers configurable validation via `git.inputValidationLength` and `git.inputValidationSubjectLength`.

**Full editor buffer** (Magit, Fugitive, Lazygit): Commit message composed in a real editor buffer. Magit's `git-commit-mode` provides `C-c C-c` finish / `C-c C-k` cancel, diff display, trailer insertion, message history ring, and font-lock highlighting for overlong summaries.

**AI commit message generation:**

| Editor | Availability | Providers | Distinctive feature |
|--------|-------------|-----------|-------------------|
| GitKraken | Paid | Gemini/OpenAI/Azure/Anthropic/custom | Commit Composer: AI-assisted commit history restructuring |
| JetBrains | AI Assistant (paid) | JetBrains AI | Customizable prompts, marketplace plugins |
| Cursor | Native | Cursor model | `Made with Cursor` trailer, Cursor Blame (AI vs human attribution) |
| Zed | Native | `LanguageModelRegistry` | Compresses diff to 20KB max, loads project rules |
| VS Code | Copilot | GitHub Copilot | `git.addAICoAuthor` appends `Co-authored-by: Copilot` trailer |

Absent from: Magit, Fugitive, Lazygit, Fork, Sourcetree, Obsidian-git. Obsidian-git offers `commitMessageScript` — a shell script hook that can generate messages externally.

**Branch-name-based commit prefix** is a lazygit-unique feature: `CommitPrefixConfig{Pattern, Replace}` extracts prefixes from branch names via regex. Example: branch `feature/AB-123-foo` → prefix `[AB-123] `.

### D1.4: Amend Workflows

**Finding:** Amend breadth ranges from basic (single amend command) to comprehensive (10+ variants). Pushed-commit warnings are inconsistent.

**Evidence:** [evidence/commit-message-ux.md](evidence/commit-message-ux.md)

**Comprehensive amend vocabulary** (Magit, Lazygit): Magit offers 12 commit transient commands including amend, extend (keep message), reword, fixup, squash, instant-fixup (fixup + immediate rebase), instant-squash, alter (`--fixup=amend:`), and revise (`--fixup=reword:`). Lazygit matches with fixup, squash, and a unique `HandleFindBaseCommitForFixupPress()` that uses `git blame` to auto-find the commit that introduced the staged changes.

**Basic amend** (VS Code, GitHub Desktop, Zed, GitKraken, Sourcetree, JetBrains): Single "amend" option that amends the last commit.

**Pushed-commit warnings:**
- Magit: `magit-commit-amend-assert` checks `magit-list-publishing-branches` before amend — prompts if HEAD is on any publishing branch.
- Zed: `check_for_pushed_commits()` shows confirmation prompt if commit has been pushed.
- VS Code, GitHub Desktop, Lazygit: No pushed-commit-specific warning. Amend proceeds regardless of push state.

### D1.5: Undo/Revert After Commit

**Finding:** Three undo-commit strategies exist, with Lazygit's reflog-based undo being the most sophisticated.

**Evidence:** [evidence/undo-revert-autocommit.md](evidence/undo-revert-autocommit.md)

| Strategy | Editors | Git operation | Scope |
|----------|---------|---------------|-------|
| Mixed reset | VS Code, GitHub Desktop | `git reset --mixed HEAD~1` | Last commit only |
| Soft reset | Zed | `git reset --soft HEAD^` | Last commit only |
| Reflog-based undo | Lazygit | Walks reflog, reverses most recent user action | Any undoable git action (commit, checkout, rebase) |
| Full reset transient | Magit | User chooses `--soft`/`--mixed`/`--hard`/`--keep` | Any commit |

Lazygit's implementation is architecturally distinct: `parseReflogForActions()` walks reflog entries, skipping `[lazygit undo]`/`[lazygit redo]` tagged entries via a counter. It handles three action kinds — COMMIT (soft reset), CHECKOUT (checkout previous branch), REBASE (hard reset + auto-stash/pop). Keybindings: `z` undo, `Z` redo.

VS Code and GitHub Desktop both special-case the initial commit: `deleteRef('HEAD')` instead of `reset HEAD~` (which would fail with no parent). VS Code additionally warns before undoing merge commits.

### D1.6: Auto-Staging / Auto-Commit Patterns

**Finding:** Auto-commit is exclusively a non-developer pattern. Developer editors require explicit intent.

**Evidence:** [evidence/undo-revert-autocommit.md](evidence/undo-revert-autocommit.md)

**Three categories:**

1. **Smart commit (stage-all-if-nothing-staged)** — VS Code: `git.enableSmartCommit` (default `false`) auto-stages all changes when committing with nothing staged. `git.suggestSmartCommit` (default `true`) prompts once with Always/Never to set the preference. Lazygit and Magit offer similar prompts without calling it "smart commit."

2. **Timer-based auto-commit** — Obsidian-git: `autoSaveInterval` (minutes) triggers `commitAndSync()` = pull + commit + push as one atomic "backup" operation. `autoBackupAfterFileChange` uses debounce instead of fixed interval. Default message: `"vault backup: {{date}}"`. Timers persist across app restarts via localStorage timestamps. `pauseAutomatics` gate via localStorage.

3. **No auto-staging** — Lazygit, Magit, Fugitive, GitHub Desktop, Zed, GitKraken, Fork, Sourcetree, JetBrains: all require explicit staging intent. Magit's `magit-commit-ask-to-stage` (default `'verbose`) asks to stage before committing with nothing staged but does not auto-stage silently.

The auto-commit pattern maps to a "cloud sync" mental model where the user thinks in "vault backup" rather than discrete git operations. It is deliberately absent from developer-facing tools, where commit intent is a core part of the workflow.

### D1.7: File-Status Visualization

**Finding:** File status visualization converges on icon + color + grouping, but grouping semantics vary.

**Evidence:** [evidence/undo-revert-autocommit.md](evidence/undo-revert-autocommit.md)

VS Code uses four SCM resource groups (Merge Changes, Staged Changes, Changes, Untracked Changes). `git.untrackedChanges` controls whether untracked files appear in "Changes" (`'mixed'`, default), their own group (`'separate'`), or are hidden. Status letters: `M`, `A`, `D`, `R`, `C`, `U`, `!`, `?`.

GitHub Desktop uses Octicon-based icons with `AriaLiveContainer` for screen reader accessibility. Conflicted files branch into `ConflictsWithMarkers` (showing conflict marker count) and `ManualConflict`.

Zed offers flat and tree view modes (`GitPanelViewMode::Flat | ::Tree`). Tree view supports directory-level staging aggregation. Diff stat display (lines added/removed) added in PR #49519.

### D1.8: Empty-Repo and First-Commit Onboarding

**Finding:** First-commit handling is an edge case, not a designed flow.

**Evidence:** [evidence/undo-revert-autocommit.md](evidence/undo-revert-autocommit.md)

Most editors treat the empty-repo state as degenerate rather than a designed onboarding flow. VS Code's action button returns `undefined` when `!this.state.HEAD` — no commit button appears. GitHub Desktop's `NoChanges` component suggests "Publish your repository to GitHub" without special first-commit guidance. Obsidian-git handles it transparently — `commitAndSync()` works regardless of commit count.

This represents an opportunity gap across the ecosystem, particularly for non-developer audiences who may not understand the initial commit concept.

### D2.1: Pull Semantics

**Finding:** No editor defaults to rebase. Merge is the universal safe default.

**Evidence:** [evidence/pull-fetch-mechanics.md](evidence/pull-fetch-mechanics.md)

| Editor | Default | Rebase accessibility |
|--------|---------|---------------------|
| VS Code | Merge | Separate command (`git.pullRebase`), no persistent setting |
| GitHub Desktop | Merge (FF with fallback) | Git config only, no UI toggle |
| Lazygit | Delegates to git config | No lazygit-level config |
| Magit | Merge | `--rebase` switch in pull transient (per-invocation) |
| Zed | Merge | `git::PullRebase` action + keybinding |
| GitKraken | FF-if-possible | Dropdown with persistent default |
| Fork | Merge | Global sticky toggle (feature request for per-repo) |
| JetBrains | Configurable | Persistent per-IDE setting with FF-only/no-FF options |
| Obsidian-git | Merge | `syncMethod: "rebase"` config; also offers `"reset"` (destructive) |

Obsidian-git's `syncMethod: "reset"` is architecturally unique — it uses `git update-ref` to hard-reset the local branch to the remote, treating the remote as authoritative truth. No developer-facing editor offers this.

### D2.2: Upstream Tracking

**Finding:** Three patterns for handling branches without upstream tracking.

**Evidence:** [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md)

1. **First-push prompt with auto-set-upstream** (VS Code, GitHub Desktop, Zed): catches "no upstream" error, shows publish/publish-branch button, auto-adds `--set-upstream`.
2. **Interactive upstream prompt** (Lazygit): opens prompt pre-filled with `<remote> <branch>` and autocomplete. Two paths: direct push (if `push.default = current`) or interactive selection.
3. **Explicit transient selection** (Magit): push transient detects missing upstream and prompts to set it with confirmation.

### D2.3: Fetch Automation

**Finding:** Auto-fetch intervals span 1 minute to 1 hour. Several editors default to no auto-fetch.

**Evidence:** [evidence/pull-fetch-mechanics.md](evidence/pull-fetch-mechanics.md)

| Editor | Default | Interval | Notable implementation detail |
|--------|---------|----------|------------------------------|
| GitKraken | On | 1 min | — |
| Lazygit | On | 1 min | `--no-write-fetch-head` prevents FETCH_HEAD contention; silent fail on credential prompt |
| Fork | On | 20 min | Per-remote configurable |
| Sourcetree | On | 10 min | Per-repo toggle |
| JetBrains | On (when enabled) | 20 min | Hidden registry key configuration |
| GitHub Desktop | On | 1 hour | Server-driven interval via API, random ±30s skew |
| VS Code | **Off** | 3 min (when enabled) | First-time prompt after first remote op; disables on metered connections |
| Zed | **Off** | N/A | Strictly user-initiated |
| Magit | **Off** | N/A | No auto-fetch at all |

GitHub Desktop's implementation is the most sophisticated: interval is server-driven via `api.getFetchPollInterval()` with a 5-minute floor, and random skew per instance prevents fleet synchronization. VS Code's `AutoFetcher` awaits `repository.whenIdleAndFocused()` before fetching and disables on metered connections.

### D2.4: Push UX and Force Push Protection

**Finding:** Force push protection follows four distinct strategies.

**Evidence:** [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md)

| Strategy | Editors | Mechanism |
|----------|---------|-----------|
| Hidden-by-default opt-in | VS Code, Sourcetree | Setting must be enabled; `--force-with-lease` default |
| Always-force-with-lease | GitHub Desktop | Never exposes raw `--force`; three-state recommendation (Not Available / Available / Recommended) |
| Explicit transient switches | Magit | Separate `--force-with-lease` and `--force` switches |
| Contextual heuristics | Lazygit | Proactive: `--force-with-lease` when branch known behind; Reactive: raw `--force` when remote branch not local |
| Warning dialog + protected branch lockout | JetBrains | `--force-with-lease`; disabled on protected branches |
| No protection | Zed | Direct execution, no confirmation |

VS Code's force push protection is the most layered: `git.allowForcePush` (gate), `git.useForcePushWithLease` (default `true`), `git.useForcePushIfIncludes` (default `true`, git 2.30+), and `git.confirmForcePush` (confirmation dialog).

GitHub Desktop's `ForcePushBranchState` enum is notable — it elevates force push from "Available" to "Recommended" when the user has performed a rebase or amend on pushed commits, surfacing the intent-aware suggestion.

### D2.5: Dry-Run / Preview Before Push-Pull

**Finding:** Dry-run/preview is almost non-existent in GUIs.

**Evidence:** [evidence/pull-fetch-mechanics.md](evidence/pull-fetch-mechanics.md)

Only Magit exposes `--dry-run` as a push option (the `-n` switch in the push transient). No other editor offers a preview of what a pull or push will do before executing it. Behind/ahead indicators serve as a lightweight proxy but don't show the actual commits/diffs that will move.

### D2.6: Rejected Push Recovery

**Finding:** Recovery flows are reactive, not preventive. No editor pre-checks for remote divergence before push.

**Evidence:** [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md)

VS Code iterates through registered `PushErrorHandler` instances (extension point for GitHub Pull Requests etc.). GitHub Desktop catches `PushNotFastForward` and shows a "Pull before pushing" dialog, plus handlers for OAuth scope, SAML re-auth, and permission errors (suggesting fork creation). Lazygit's reactive path distinguishes between cases where the remote branch is/isn't stored locally.

### D2.7: Multi-Remote Support

**Finding:** Multi-remote support divides into simple picker vs fork-aware workflow.

**Evidence:** [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md)

**Simple remote picker** (VS Code, Magit): quick pick for remote selection in push/pull/fetch operations.

**Fork-aware workflow** (GitHub Desktop): `findUpstreamRemote()` validates both remote name AND URL. `ChooseForkSettings` dialog presents "contribute to parent" vs "for my own purposes." Stale fork remotes are pruned automatically.

**Fork shortcut** (Lazygit): `addFork()` detects origin URL, prompts for fork username, rewrites URL. Supports `username:branch` syntax.

**Triangular workflow** (Lazygit): Branch model carries separate `AheadForPull`/`BehindForPull` and `AheadForPush`/`BehindForPush` fields, supporting workflows where pull target differs from push target.

### D2.8: Behind/Ahead Indicators

**Finding:** Behind/ahead indicators are universal but vary in fidelity from simple counts to full commit listings.

**Evidence:** [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md)

| Editor | Location | Format | Fidelity |
|--------|----------|--------|----------|
| VS Code | Status bar | `N↓ M↑` + dynamic action button | Count only |
| GitHub Desktop | Toolbar | Arrow icons + counts | Count only |
| Lazygit | Branches panel | Four separate counts (pull/push) | Count + triangular workflow |
| Magit | Status buffer | Unpulled/Unpushed sections | Full commit listings |
| Zed | Git panel footer | Arrow icons + count badges | Count only |
| JetBrains | Status bar widget | Colored arrows + counts | Count only |

VS Code's action button state machine (`actionButton.ts`) dynamically transitions: Commit (if changes) → Publish (no upstream) → Sync Changes N↓ M↑ → Commit (disabled).

Magit provides the richest view — not just counts but full commit listings in Unpulled/Unpushed sections via `magit--insert-log`, letting users inspect exactly what will move on push/pull.

---

## Cross-Cutting Patterns

### The Abstraction Spectrum

The editors surveyed fall into three bands on the abstraction spectrum:

| Band | Editors | Staging model | Commit model | Push/pull model |
|------|---------|---------------|-------------|-----------------|
| **Full git vocabulary** | Magit, Lazygit, Fugitive | File/hunk/line + full index control | 10+ commit variants, fixup/squash/reword | Explicit transient with all flags |
| **Guided git** | VS Code, GitHub Desktop, Zed, JetBrains, GitKraken, Fork, Sourcetree | File/hunk/line with visual affordances | Basic commit + amend | Push/pull buttons with contextual warnings |
| **Git-as-transport** | Obsidian-git | File-only | Auto-commit on timer | "Sync" = pull + commit + push |

The key insight is that **staging granularity does not predict push/pull abstraction**. An editor can offer line-level staging (guided-git band) while still requiring explicit push/pull actions. The abstraction axis is orthogonal — it runs from "expose every git flag" (Magit) to "hide git entirely" (Obsidian-git's `commitAndSync()`).

### Settings-Driven Configuration vs Transient Discovery

Two competing models for git option discovery:

1. **Settings-driven** (VS Code, JetBrains, GitHub Desktop): Behavior configured via persistent settings (`git.autofetch`, `git.pullRebase`, `git.allowForcePush`). The user configures once, the editor applies consistently. 50+ git settings in VS Code alone.

2. **Transient-driven** (Magit, Lazygit): Options discovered at invocation time via popup menus. The user chooses per-operation. Flags are visible and switchable. This model scales better to git's combinatorial option space but requires more per-operation knowledge.

Zed's SplitButton with dropdown chevron is a hybrid — persistent default action with discoverable alternatives.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **D1.8 (Empty-repo first-commit):** Most editors treat this as an edge case. Limited source-level evidence beyond VS Code and GitHub Desktop.
- **D2.5 (Dry-run/preview):** Confirmed as a gap across the ecosystem. Only Magit offers `--dry-run`.

### Out of Scope (per Parent Rubric)
- Clone/initial init UX (covered in `reports/open-from-github-onboarding-mechanics/`)
- OAuth/auth at clone time
- CRDT-specific branching internals
- Git library selection criteria
- Merge/rebase conflict resolution UX (Direction 2)
- Branch management UX (Direction 3)
- History/diff visualization (Direction 4)

### Gaps for Follow-Up
- **Zed line-level staging** is in active development — re-check after implementation lands
- **Conventional commits** plugin ecosystem not deeply investigated
- **Branch protection rules** (GitHub rulesets) and how editors surface them
- **`git push --force-if-includes`** adoption beyond VS Code (git 2.30+)
- **Neovim ecosystem** has multiple staging plugins (gitsigns.nvim, diffview.nvim) beyond Fugitive — not covered in depth

---

## References

### Evidence Files
- [evidence/staging-granularity.md](evidence/staging-granularity.md) — D1.1-D1.2: Staging tiers, implementation strategies, stash workflows
- [evidence/commit-message-ux.md](evidence/commit-message-ux.md) — D1.3-D1.4: Commit message paradigms, AI generation, amend variants
- [evidence/undo-revert-autocommit.md](evidence/undo-revert-autocommit.md) — D1.5-D1.8: Undo strategies, auto-commit patterns, file status, first commit
- [evidence/pull-fetch-mechanics.md](evidence/pull-fetch-mechanics.md) — D2.1, D2.3, D2.5: Pull defaults, fetch automation, dry-run
- [evidence/push-upstream-indicators.md](evidence/push-upstream-indicators.md) — D2.2, D2.4, D2.6-D2.8: Force push, upstream tracking, multi-remote, behind/ahead

### External Sources
- [microsoft/vscode](https://github.com/microsoft/vscode) `extensions/git/src/` — Git extension source (commands.ts, repository.ts, staging.ts, autofetch.ts, statusbar.ts, actionButton.ts)
- [desktop/desktop](https://github.com/desktop/desktop) `app/src/` — GitHub Desktop source (changes UI, git operations, background fetcher, fork detection)
- [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) `pkg/` — Lazygit source (staging controller, sync, undo controller, upstream helper, stash)
- [magit/magit](https://github.com/magit/magit) `lisp/` — Magit source (magit-commit.el, magit-push.el, magit-pull.el, magit-fetch.el, magit-apply.el, magit-diff.el)
- [zed-industries/zed](https://github.com/zed-industries/zed) `crates/git_ui/`, `crates/git/` — Zed source (git_panel.rs, buffer_diff.rs, git_ui.rs)
- [tpope/vim-fugitive](https://github.com/tpope/vim-fugitive) — Fugitive source
- [Vinzent03/obsidian-git](https://github.com/Vinzent03/obsidian-git) — Obsidian-git source (automaticsManager.ts, types.ts, simpleGit.ts)
- [GitKraken Desktop Help](https://help.gitkraken.com/gitkraken-desktop/) — Staging, commits, push/pull, AI docs
- [JetBrains IntelliJ IDEA Help](https://www.jetbrains.com/help/idea/) — Commit/push/pull, git staging, AI Assistant
- [Fork Release Notes](https://git-fork.com/releasenotes) — Fork features and changes
- [Sourcetree Support](https://support.atlassian.com/sourcetree/) — Commit/push/pull, auto-fetch, force push docs
- [Cursor Docs](https://docs.cursor.com/) — AI commit messages, agent attribution
- [GitHub CLI Manual](https://cli.github.com/manual/) — PR-centric workflow (no staging/commit commands)
