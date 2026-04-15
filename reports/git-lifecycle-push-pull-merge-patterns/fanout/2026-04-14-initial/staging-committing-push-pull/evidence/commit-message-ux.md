# Evidence: Commit Message UX (D1.3, D1.4)

**Dimension:** D1.3 Commit message UX, D1.4 Amend workflows
**Date:** 2026-04-14
**Sources:** microsoft/vscode, desktop/desktop, jesseduffield/lazygit, magit/magit, zed-industries/zed, tpope/vim-fugitive, GitKraken docs, JetBrains docs, Cursor docs

---

## Key files referenced

- `microsoft/vscode` `extensions/git/src/commands.ts:2568-2603` — `commitWithAnyInput()`, message validation
- `microsoft/vscode` `extensions/git/src/repository.ts:1099-1127` — input validation settings
- `microsoft/vscode` `extensions/git/package.json:3664-3744` — validation + AI co-author settings
- `desktop/desktop` `app/src/models/commit-message.ts` — `ICommitMessage` (summary + description)
- `desktop/desktop` `app/src/ui/changes/commit-message.tsx` — co-author support, Copilot flag
- `desktop/desktop` `app/src/lib/wrap-rich-text-commit-message.ts` — `IdealSummaryLength=50`, `MaxSummaryLength=72`
- `jesseduffield/lazygit` `pkg/config/user_config.go` — `CommitPrefixConfig`, `AutoWrapWidth: 72`
- `jesseduffield/lazygit` `pkg/gui/controllers/commit_message_controller.go` — inline editor, history navigation
- `magit/magit` `lisp/magit-commit.el` — commit transient, amend-published warning
- `magit/magit` `lisp/git-commit.el` — summary length validation, style conventions
- `zed-industries/zed` `crates/git_ui/src/git_panel.rs` — inline editor, AI generation, amend flow

---

## Findings

### Finding: Two commit message input paradigms — inline box vs full editor
**Confidence:** CONFIRMED
**Evidence:** All 6 source-level editors

**Inline input box** (VS Code, GitHub Desktop, Zed, GitKraken, Sourcetree):
- Single text field (VS Code SCM input box, GitHub Desktop summary+description, Zed inline editor)
- Character limits enforced visually (GitHub Desktop: 50 ideal / 72 max summary; VS Code: configurable via `git.inputValidationLength: 72`, `git.inputValidationSubjectLength: 50`)
- Quick commit without leaving the IDE

**Full editor buffer** (Magit, Fugitive, Lazygit):
- Commit message composed in a real editor buffer with syntax highlighting
- Magit: `git-commit-mode` with `C-c C-c` to finish, `C-c C-k` to cancel
- Fugitive: `gitcommit` filetype in Vim
- Lazygit: inline summary+description with Tab to toggle, or `HandleCommitEditorPress()` to switch to `$EDITOR`

**Hybrid** (VS Code, Lazygit): VS Code's `git.useEditorAsCommitInput` (default `true`) opens `COMMIT_EDITMSG` in the editor. Lazygit offers both inline and external editor modes.

### Finding: AI commit message generation is becoming table-stakes for commercial editors
**Confidence:** CONFIRMED
**Evidence:** GitKraken docs, JetBrains AI Assistant docs, Cursor docs, Zed source, VS Code source

| Editor | AI commit messages | Provider | Notable features |
|--------|-------------------|----------|------------------|
| GitKraken | Yes (paid) | Gemini/OpenAI/Azure/Anthropic/custom | **Commit Composer**: restructures existing commits into logical groupings via drag-and-drop |
| JetBrains | Yes (AI Assistant, paid) | JetBrains AI | Customizable prompt, explains commits, marketplace plugins |
| Cursor | Yes (native) | Cursor model | Context-aware using repo history, `Made with Cursor` trailer |
| Zed | Yes (native) | `LanguageModelRegistry` | Compresses diff to 20KB max, loads project rules, streaming completion |
| VS Code | Yes (Copilot) | GitHub Copilot | `git.addAICoAuthor` setting appends `Co-authored-by: Copilot <copilot@github.com>` |
| GitHub Desktop | Partial | Copilot | `generatedByCopilot` flag on `ICommitMessage` model |

Not present: Magit, Fugitive, Lazygit, Fork, Sourcetree, Obsidian-git.

GitKraken's Commit Composer (v11.3+) goes beyond message generation — it analyzes staged changes and suggests restructuring into multiple logical commits, with drag-and-drop reordering.

### Finding: Co-author support varies from first-class to absent
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop source, VS Code source, Cursor docs

- GitHub Desktop: Explicit co-author UI with `AutocompletingInput` and `CoAuthorAutocompletionProvider`. Formats as `Co-Authored-By: Name <email>` via `git interpret-trailers`. Only enabled for GitHub/GHE repos.
- VS Code: `git.addAICoAuthor` setting (`'off' | 'chatAndAgent' | 'all'`). Checks `_aiEdits.hasAiContributions` to auto-append Copilot co-author.
- Cursor: Automatic `Made with Cursor` trailer on commits and PRs. Can be disabled. Enterprise admins can enforce attribution policy.
- Zed: Collaborative session participants with write access can be added via `toggle_fill_co_authors()`.
- Magit: `C-c C-i` in commit buffer opens trailer transient (Acked-by, Reviewed-by, etc.).

### Finding: Branch-name-based commit prefix is a lazygit-unique feature
**Confidence:** CONFIRMED
**Evidence:** `jesseduffield/lazygit` `pkg/config/user_config.go`, `pkg/gui/controllers/helpers/working_tree_helper.go`

Lazygit's `CommitPrefixConfig{Pattern, Replace}` extracts commit prefixes from branch names via regex. Example: branch `feature/AB-123-foo` with pattern `^\w+\/(\w+-\w+).*` and replace `[$1] ` produces prefix `[AB-123] `.

Two config levels: `Git.CommitPrefix` (global) and `Git.CommitPrefixes` (per-repo, keyed by repo name). No other editor in the set implements this natively — it typically requires external hooks or plugins.

### Finding: Amend workflows range from transparent to guarded
**Confidence:** CONFIRMED
**Evidence:** All source-level editors

**No pushed-commit warning:**
- VS Code: Amend proceeds without checking remote state. No explicit warning.
- GitHub Desktop: Amend available regardless of push state.
- Lazygit: `Gui.SkipAmendWarning: false` controls a generic amend warning, but does not specifically check push status.

**Pushed-commit warning:**
- Magit: `magit-commit-amend-assert` checks `magit-list-publishing-branches`. If HEAD has been pushed to any configured publishing branch, prompts via `magit-confirm 'amend-published`: `"This commit has already been published to %s. Do you really want to modify it?"`
- Zed: `check_for_pushed_commits()` runs before `uncommit()`, showing a confirmation prompt if the commit has been pushed.

**Amend variants (Magit stands alone in breadth):**
| Command | Behavior |
|---------|----------|
| `magit-commit-amend` | Amend, edit message |
| `magit-commit-extend` | Amend, keep message (`--no-edit`) |
| `magit-commit-reword` | Change message only (`--only`) |
| `magit-commit-fixup` | `--fixup=COMMIT` |
| `magit-commit-squash` | `--squash=COMMIT` |
| `magit-commit-instant-fixup` | fixup + immediate autosquash rebase |
| `magit-commit-instant-squash` | squash + immediate autosquash rebase |
| `magit-commit-alter` | `--fixup=amend:COMMIT` (git 2.32+) |
| `magit-commit-revise` | `--fixup=reword:COMMIT` (git 2.32+) |

Lazygit matches Magit's fixup breadth: `createFixupCommit()` supports fixup/squash with autosquash rebase. The `HandleFindBaseCommitForFixupPress()` feature is unique — uses `git blame` to auto-find which commit introduced the staged changes, navigating to it for fixup creation.

**Implications:** Editors targeting developers (Magit, Lazygit) expose the full git commit amendment vocabulary. Editors targeting broader audiences (VS Code, GitHub Desktop) expose only basic amend. Non-developer tools (Obsidian-git) expose amend as a command palette option without UI prominence.

---

## Gaps / follow-ups

- Conventional commits plugins/helpers not deeply investigated beyond noting their absence in most editors' core
- Commit signing (`--gpg-sign`) UX not covered (mentioned as settings in VS Code and Lazygit but not a primary dimension)
