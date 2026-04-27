# Evidence: D1 — Conceptual Axes for This Comparison

**Dimension:** Concise conceptual axes that matter for comparing VS Code vs Claude Code's per-scope configuration. Five axes scoped to the question — not the broader encyclopedia.
**Date:** 2026-04-25
**Sources:** Synthesized from D2 (VS Code topology) and D3 (Claude Code topology) findings; cross-referenced with D7 (git/ESLint/JetBrains/npm/Cursor) for grounding.

---

## Five axes

For *this* comparison — two products, both developer-tools, both with per-user-global / per-project / per-user-project surfaces — five axes are sufficient. Each axis is a question the reader can ask of either product to locate the same conceptual surface.

### Axis 1: Scope hierarchy (which scopes exist + precedence)

Every developer tool that supports per-scope config defines a finite ladder of scopes and a precedence rule (which beats which). The ladder usually progresses from "narrowest scope wins" (project-local beats user-global beats system) plus an admin/policy layer above everything.

**Why it matters for this comparison:** This is the spine of the whole topic. The shape of each tool's ladder is the primary distinguisher.

**VS Code:** 5 scopes (Default → User → Remote → Workspace → Workspace Folder), with Policy on top. `inspect()` exposes 8 effective slots (5 base × 2 language-variant minus the slots that don't exist). [D2.1, D2.4]
**Claude Code:** 5 positions (User → Project → Local → CLI → Managed), single file per scope. Settings precedence is monotonic; CLI flags are themselves a scope. [D3.1]

### Axis 2: Storage location (where each scope physically lives on disk)

Scope and storage often correlate but aren't identical. Two scopes can share a directory (`.vscode/settings.json` and `.vscode/launch.json` are both Workspace scope, different files); one scope can map to multiple physical locations (Claude Code's "Managed" supports a primary file, a drop-in `.d/` directory, MDM plist, and Windows registry).

**Why it matters for this comparison:** Tools that share a scope hierarchy on paper can have very different commit/sync semantics depending on whether the file lives in the project tree, the user home directory, the OS application-support directory, or a profile-specific subdirectory.

**VS Code:** User → OS-XDG (`~/Library/Application Support/Code/User/settings.json` on macOS); Workspace → `.vscode/settings.json` in repo root; Workspace Folder → per-folder `.vscode/settings.json` in multi-root; Multi-root Workspace → in-band `settings` block inside `.code-workspace` JSON; Profile → sibling `profiles/<id>/` under the User dir. [D2.6]
**Claude Code:** User → `~/.claude/settings.json`; Project → `.claude/settings.json` (committed); Local → `.claude/settings.local.json` (gitignored); Managed → OS-specific path (`/Library/Application Support/ClaudeCode/...` on macOS, `/etc/claude-code/...` on Linux, `C:\Program Files\ClaudeCode\...` on Windows) plus drop-in `.d/` plus MDM plist plus Windows registry. [D3.1]

### Axis 3: Edit surface (UI / file / CLI / API — where the user actually changes the value)

Where can the user actually mutate the value? Some tools maintain a dual surface (UI ↔ file kept in sync structurally); some have UI as the only canonical surface; some have file as the only canonical surface; some have CLI as primary with file as secondary.

**Why it matters for this comparison:** This is the most user-facing axis. A product with a comprehensive Settings UI optimizes for users who don't want to write JSON; a product that's file-first optimizes for repo-shareable, version-controllable, scriptable config. The two products take opposite stances here.

**VS Code:** True dual surface. Settings UI (`Cmd+,`) and `settings.json` are kept in structural sync via `ConfigurationEditingService` — every UI write produces a deterministic JSON edit preserving comments and formatting; every schema-registered setting gets autocomplete in the JSON editor. [D2.10] Multiple physical edit surfaces for the same logical setting (UI, JSON file, Settings Editor with scope dropdown).
**Claude Code:** File-first. `settings.json` is the canonical surface, hand-edited or scripted. UI is fragmented: per-concern slash commands (`/permissions`, `/memory`, `/agents`, `/mcp`, `/model`, `/statusline`) handle their own slice; `/config` survives only as a credential toggle. [D3.12] Plus CLI commands for some operations (`claude mcp add`, `claude agents`).

### Axis 4: Sync semantics (does the value follow the user across machines? across the team?)

Three distinct sync models for any given setting: (a) local-only (lives on this machine, doesn't follow anywhere), (b) user-account synced (follows the user across their machines via a product service), (c) team-shared via VCS (follows the project across all developers via git).

**Why it matters for this comparison:** A tool's choice of which scope syncs determines whether a setting is "your preference" (account-synced, follows you) or "the team's contract" (VCS-shared, applies to everyone) or "this machine's quirk" (local, sticky). The line between these gets drawn very differently across products.

**VS Code:** Settings Sync is opt-in cloud sync via Microsoft/GitHub account. Syncs a fixed 7-category bundle (Settings, Keybindings, Snippets, Tasks, UI State, Extensions, Profiles). `machine`-scoped settings are skipped by default. User-level overrides via `settingsSync.ignoredSettings` and `settingsSync.ignoredExtensions`. Workspace settings sync via git (committed `.vscode/`). Per-extension opt-out via `ignoreSync` schema flag. [D2.11, D2.12]
**Claude Code:** No first-party cloud sync for `~/.claude/`. User-level config travels by users dotfile-syncing their home directory themselves. Project config syncs via git (committed `.claude/`). Local config (`.claude/settings.local.json`) is gitignored by convention; doesn't sync anywhere. Enterprise can push managed settings via MDM/Group Policy/registry — that is the only "sync" Claude Code formally provides. [D3.1, D3.3]

### Axis 5: Override semantics (what happens when the same key is set in two scopes?)

When a setting appears in multiple scopes, two different override behaviors exist:
- **Pure override:** higher-priority scope's value replaces lower-priority value entirely (atomic).
- **Merge / additive:** higher and lower contributions combine (object merge for objects; concatenation for arrays).

These can be value-type-dependent (object merges, primitive overrides) or globally-mandated.

**Why it matters for this comparison:** This is the most consequential per-scope semantic, and the two products land on opposite defaults for arrays. It directly governs whether a project-level allow rule can erase a user-level allow rule (override) or both apply (merge).

**VS Code:** Object values merge across scopes (`{a:1,b:2}` ∪ `{b:3,c:4}` → `{a:1,b:3,c:4}` per `inspect()` resolver). Primitives and arrays *override*. Higher-priority scope wins entirely for non-object types. [D2.2]
**Claude Code:** Arrays *merge across scopes* (concatenated and deduplicated). Primitives override. Object behavior is implicit. The merge rule means a denial array (`permissions.deny`) accumulates across every scope; a higher-priority scope cannot subtract from a lower scope's array. [D3.2]

---

## Why these five and not more

The example prompt the user shared sketched six axes (term, scope, storage, sync, lifecycle, visibility). For *this* comparison:
- **Term** (Configuration vs Settings vs Preferences) doesn't change the analysis — both products call most of it "settings" with some adjacent "memory"/"rules"/"profiles" terminology. Folded into prose where relevant.
- **Lifecycle** (build-time vs boot-time vs hot-reload vs real-time) is mostly uniform across these two products — both apply most settings live, both require restarts for a small set. Not a high-signal axis for *this* comparison.
- The five axes above are the ones where the two products materially diverge.

## Where each axis lands the comparison

| Axis | Both same | Materially diverge | Where the divergence shows up |
|------|-----------|--------------------|--------------------------------|
| 1. Scope hierarchy | Both have 4-5 layer ladders with policy on top | Yes | Workspace Folder (multi-root) is VS Code-only; Local-overrides-Project is Claude-only |
| 2. Storage location | Both use OS-XDG for user; project tree for workspace/project | Yes | VS Code splits into many files in `.vscode/`; Claude Code keeps most in one `settings.json` |
| 3. Edit surface | Both expose CLI, file, and some UI | Strongly | VS Code dual-surface UI ↔ JSON; Claude Code file-first with fragmented per-concern UI |
| 4. Sync semantics | Both lean on git for project; both have user dotfile possibility | Yes | VS Code has first-party Settings Sync; Claude Code has none (relies on users) |
| 5. Override semantics | Both default override for primitives | Yes | Object merge (VS Code) vs Array merge (Claude Code); these are *different categories* of merging |
