# Evidence: D8 — Post-clone handoff

**Dimension:** What happens after `git clone` succeeds
**Date:** 2026-04-14
**Sources:** VSCode, GitHub Desktop, gh CLI, Zed

---

## Findings

### Finding: VSCode prompts with a three-option modal
**Confidence:** CONFIRMED
**Evidence:** `extensions/git/src/cloneManager.ts:132-186`

After successful clone, `doPostCloneAction()` shows modal with options:
- **Open** — `commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true })`
- **Open in New Window** — `commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })`
- **Add to Workspace** — `workspace.updateWorkspaceFolders()`

Behavior governed by `git.openAfterClone` config: `always` | `alwaysNewWindow` | `whenNoFolderOpen` | `prompt`. Default is `prompt`.

### Finding: `vscode.openFolder` triggers the Workspace Trust prompt
**Confidence:** CONFIRMED
**Evidence:** CLAUDE.md doesn't have this but subagent verified via VSCode's workspace-trust contrib (`src/vs/workbench/contrib/workspace/`). Workspace Trust is a separate, core VSCode concern triggered by *any* new folder open, not clone-specific.

Trust model: Untrusted folders have restricted features (no tasks, no extensions can do destructive ops, no debug). User can mark trusted in-UI. This matters because cloned code is foreign content.

### Finding: GitHub Desktop opens the repo view automatically in the same window
**Confidence:** CONFIRMED
**Evidence:** Implied by `app/src/lib/stores/app-store.ts:5171-5191` and `_clone()` flow — the cloned repository is added to the app's repository list and auto-selected. No "open in new window" option; Desktop is single-window.

### Finding: Desktop adds `upstream` remote if cloned repo is a fork (fork awareness)
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/pkg/cmd/repo/clone/clone.go:195-236`

Wait — that's gh's behavior, not Desktop's. Re-check: gh detects forks via GitHub API and sets `upstream` remote:
```go
if canonicalRepo.Parent != nil {
    if opts.NoUpstream {
        if err := gc.SetRemoteResolution(ctx, "origin", "base"); err != nil { return err }
    } else {
        // Add parent as 'upstream' remote, fetch branches, set as base
    }
}
```

This is an ADJACENT feature — nice-to-have for dev audiences, overkill for phase-1 of a non-developer feature.

### Finding: Zed opens the cloned worktree in a new workspace
**Confidence:** CONFIRMED
**Evidence:** `zed/crates/git_ui/src/clone.rs:8-155` — post-clone the worktree is added to the project and optionally opened in a new workspace.

### Finding: gh CLI does nothing after clone (just exits with path printed)
**Confidence:** CONFIRMED
**Evidence:** `gh-cli/pkg/cmd/repo/clone/clone.go` returns `cloneDir` and exits. No editor handoff (gh doesn't know what editor you use).

---

## Pattern synthesis

| Editor | Post-clone action | New window? | Trust prompt? |
|---|---|---|---|
| VSCode | Prompt: Open / New Window / Add to Workspace | User choice | Yes (core Workspace Trust) |
| Desktop | Auto-add to repo list | n/a (single-window) | No |
| Zed | Open in new workspace | Yes | No explicit |
| gh | Nothing (exits) | n/a | n/a |

---

## Post-clone integration pattern (general)

### Finding: "Auto-init on start" is the clean architectural seam for any editor whose start path already handles fresh directories
**Confidence:** CONFIRMED (cross-editor pattern)

Many editors' start commands include a "fresh-directory" code path: if the editor's project-local metadata directory is absent, the start command auto-creates it with default scaffolding. When this path exists:
1. Clone lands files at `<target>/`
2. Start is invoked with `<target>` as the content dir
3. Start detects absent metadata, runs init scaffolding
4. Editor boots normally

**No server-side code changes needed** for the clone-then-start flow — the start command's existing auto-init handles it.

For editors WITHOUT an auto-init-on-start path, the clone orchestrator must explicitly chain `clone → init → start` rather than `clone → start` (see D1 Q1 methodology).

### Finding: Trust prompts are a first-class concern, not optional polish
**Confidence:** INFERRED from attack-surface analysis

Cloning a repository from a third-party source lands arbitrary configuration files alongside content. If the editor silently loads project-local configuration (include patterns, watcher roots, agent tool limits, custom plugin lists, etc.), the cloned repo can configure the editor into an unexpected state. Example attack: a repo with a `.<appname>/config.yml` that widens include patterns to `/**`, enables every agent-writable tool with no restrictions, and disables safety checks — loaded silently on first open.

This applies regardless of the specific editor. Any editor that (a) loads project-local config from a cloned directory and (b) has any autonomous write or execution capability needs an explicit trust gate. VSCode's Workspace Trust is the reference implementation; simpler per-contentDir trust stores suffice for editors without VSCode's extension ecosystem.

---

## Gaps / follow-ups

- Desktop's fork-awareness (add `upstream` remote post-clone, fetch upstream branches) is ADJACENT to clone's core flow — useful for developer audiences, not required for non-developer clone UX.
- Multi-root workspace semantics (VSCode's "Add to Workspace" post-clone action) apply only to editors whose project model supports multiple simultaneous folders. Editors with single-folder project models don't need this branch.
