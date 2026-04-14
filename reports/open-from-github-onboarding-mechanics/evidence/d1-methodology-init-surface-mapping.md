# Evidence: D1 — Methodology for mapping an editor's init surface

**Dimension:** What to inspect in any editor's codebase before choosing a clone-from-GitHub integration seam
**Date:** 2026-04-14
**Sources:** cross-editor pattern comparison (VSCode, GitHub Desktop, Zed, Obsidian-Git, gh CLI) + general editor-architecture analysis

---

## Purpose

Before an implementer can pick an architectural seam from D10 (CLI orchestrator / in-server hot-swap / multi-process launcher), they need a grounded understanding of *their own* editor's onboarding surface. This file documents the five questions that determine fit, with the evidence patterns that inform each answer.

This is methodology, not codebase-specific mapping. An implementer applies the questions to their own codebase to derive answers.

---

## The five questions

### Q1: Does your start/launch path auto-initialize scaffolding on a fresh directory?

**Why it matters:** Most editors that support "open a folder" have some form of project-local metadata directory (`.vscode/`, `.obsidian/`, `.cursor/`, `.logseq/`, `.storybook/`). The launch path usually has some behavior for "the folder has never been opened here before" — either the editor creates the metadata directory automatically, or it expects you to run a separate `init` command first.

**How to determine it in your codebase:**
- Grep for your metadata-dir name in your launch code path.
- Look for `existsSync(<metadataPath>)` or equivalent presence checks followed by scaffolding code.
- Check whether your `init` command is callable from within `start`, or only as a separate command.

**Implication for clone:**
- **Auto-init on launch:** Post-clone handoff is trivial — the clone orchestrator lands files at the target path and invokes `start <target>`; auto-init fires. No new init-after-clone code path needed.
- **Init as separate command:** Clone orchestrator must explicitly chain `clone → init → start`.

**Prior-art examples:**
- Obsidian auto-creates `.obsidian/` on first vault open.
- VSCode does NOT auto-create `.vscode/` — it's workspace-authored, optional, and user-managed. Clone-to-edit in VSCode relies on the user creating any needed metadata themselves.
- Storybook's first-run flow creates `.storybook/` as part of the install/init command, not as part of running `storybook dev`.

### Q2: Is a git library already a dependency of your editor's server runtime?

**Why it matters:** Many editors use git internally for unrelated features — version history, attribution journals, crash recovery, snapshotting, local-first sync. If a git library is already shipped, the clone feature reuses it without introducing a new dependency. If not, the clone feature's library selection is the editor's *first* git dependency, and the library choice sets a precedent for future git-touching features.

**How to determine it in your codebase:**
- Grep your `package.json` / `Cargo.toml` for `simple-git`, `isomorphic-git`, `nodegit`, `dugite`, `git2`, `libgit2`.
- Grep your source for `child_process.spawn.*git`, `execFile.*git`, `execSync.*git`.
- Search for existing version-history, backup, or snapshotting features — if they exist, they likely shell to git.

**Implication for clone:**
- **Library already present:** reuse it. Library selection for clone is pre-decided.
- **No library:** choose from D2 based on your runtime and constraints.

**Prior-art examples:**
- VSCode's `extensions/git` ships its own git-binary wrapper; other extensions compose on top of it rather than introducing competing libraries.
- GitHub Desktop standardized on dugite for all git ops, server-side and UI-side.
- gh CLI calls `exec.Command("git", ...)` directly with a thin wrapper.

### Q3: What is the identity of "a project" in your editor?

**Why it matters:** Clone produces a fresh filesystem directory. That directory must satisfy the editor's "project identity" contract. Different editors have different contracts.

**Models observed:**
- **Filesystem path as identity.** Obsidian (vault path), VSCode single-folder mode. Clone is trivial: the clone's target path IS the project identity. Post-clone "register this project" is implicit in "open this folder."
- **Workspace file as identity.** VSCode multi-root workspaces use `.code-workspace` files. A cloned repo becomes a workspace folder via explicit add-to-workspace.
- **UUID or registered name.** Some editors (Notion-like) require a project entry in a global registry. Clone adds an entry to the registry in addition to landing files.
- **URL as identity.** Hosted editors. N/A for on-device clone.

**How to determine it in your codebase:**
- Look at how your editor refers to a "project" internally — is it a path, a config object, a database row?
- Find the call that opens/activates a project: what arguments does it take?
- Check whether there's a "projects list" or "workspaces list" and how it's populated.

**Implication for clone:**
- **Path-as-identity:** clone orchestrator is complete after the directory exists.
- **Explicit registration model:** clone orchestrator must also register the new project after files are on disk (and before the editor opens it).

### Q4: Does your server factory expose a reconfiguration hook?

**Why it matters:** This directly chooses between Archetype B (in-server hot-swap) and Archetypes A/C (process-based) in D10.

**How to determine it in your codebase:**
- Find your server's main factory function (e.g., `createServer()`, `startHocuspocus()`, `initServer()`).
- Inspect the returned object — does it have `reconfigure` / `swapContentDir` / `reinit` / `reload` methods, or only `start` / `destroy` / `close`?
- If reconfigure is absent: trace how content-dir is used internally. If it's closed over at construction by multiple subsystems (filters, persistence, watchers, index, lock file), hot-swap requires reinitializing each. This is usually prohibitive.
- Look for an existing `destroy()` path. How many cleanup phases does it have? Does the order matter (e.g., "release lock LAST")? Any shutdown protocols like this suggest the server is tuned for process exit, not live swap.

**Implication:**
- **Reconfigure hook exists AND subsystems support swap:** Archetype B viable.
- **Only start/destroy, content-dir baked deep:** Archetype A or C.

**Prior-art examples:**
- No editor in our study exposes in-process content-dir reconfiguration. All rely on process-level new-server-per-project. This is the dominant pattern.

### Q5: Does your editor have an empty-state UI today?

**Why it matters:** Non-developer "Clone from GitHub" entry points typically live in (a) an empty state that shows when the editor launches with no project loaded, and (b) a File menu item. Power-user entry via command palette is additional. If your editor has no empty-state UI today, adding one is in-scope for the clone feature.

**How to determine it in your codebase:**
- Grep for `empty`, `no[- ]project`, `no[- ]workspace`, `ProjectPicker`, `WelcomeView` in UI code.
- Check your app shell: what renders when the user hasn't picked a project yet?
- Observe the editor on a fresh launch in a directory with no content — what's shown?

**Implication:**
- **Empty-state exists:** add a "Clone from GitHub" entry point to it.
- **No empty-state:** designing and building one is part of the clone feature scope.

**Prior-art examples:**
- VSCode's "Welcome" tab serves the empty-state role.
- GitHub Desktop's empty-repo-list screen shows "Clone / Add / Create" cards.
- Obsidian's vault picker fills this role at launch.

---

## How the five questions compose into a decision

```
Q4 (reconfigure hook?)       → Archetype choice (B vs A/C)
Q1 (auto-init on start?)     → Whether clone orchestrator needs explicit init step
Q2 (git lib present?)        → Whether D2 library selection is pre-decided
Q3 (project identity?)       → Whether post-clone registration step is needed
Q5 (empty-state UI?)         → Whether UI construction is in scope
```

A complete clone spec answers all five before choosing implementation shape.

---

## Worked-example methodology (no specific editor)

To illustrate: an implementer reads their editor's codebase and fills in the table:

| Question | Finding | Implication |
|---|---|---|
| Q1 | Auto-init on start? | e.g., Y → no explicit init step in orchestrator |
| Q2 | Git lib present? | e.g., `simple-git` already used by history feature → reuse |
| Q3 | Project identity? | e.g., filesystem path → no registration step needed |
| Q4 | Reconfigure hook? | e.g., N → use Archetype A or C |
| Q5 | Empty-state UI? | e.g., N → design and build as part of feature |

The resulting clone spec shape falls out of these answers.

---

## Gaps / follow-ups

- This methodology doesn't cover editors with unusual project models (notebook-style, one-document-per-file with no "project" concept). Those may need different framing.
- "Non-standard content models" (e.g., editors that don't write files to disk but maintain an internal database) have an additional Q6: does clone write raw files to be ingested, or bypass the filesystem and write directly to the internal store?
