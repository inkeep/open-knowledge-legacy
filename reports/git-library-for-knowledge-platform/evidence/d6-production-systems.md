# Evidence: What Production Systems Use

**Dimension:** D6 — What production systems use
**Date:** 2026-04-02
**Sources:** VS Code source, GitButler blog, GitHub Desktop dugite, GitKraken blog

---

## Key files / pages referenced

- https://deepwiki.com/microsoft/vscode/5.2-git-extension — VS Code git extension architecture
- https://github.com/gitbutlerapp/gitbutler — GitButler repo
- https://github.com/GitoxideLabs/gitoxide/issues/1287 — GitButler oxidize issue
- https://github.com/gitbutlerapp/gitbutler/pull/4670 — gitoxide performance PR
- https://github.com/desktop/dugite — GitHub Desktop's dugite
- https://github.com/desktop/dugite/issues/98 — Dugite vs Nodegit decision
- https://cursor.com/help/integrations/git — Cursor git integration

---

## Findings

### Finding: VS Code uses native git CLI via child_process
**Confidence:** CONFIRMED
**Evidence:** VS Code source code analysis (extensions/git/src/)

VS Code's Git extension "locates the system git binary, builds a process-level CLI wrapper, discovers repositories in the workspace." The exec method "internally calls spawn and awaits stdout, stderr, and exit code via Promise.all." Methods such as status, add, commit, push, pull, checkout, stash, log, diff, getCommit, blame are all "translating to a concrete git CLI invocation."

**Implications:** The most widely-used code editor chose the native git CLI approach over any library binding.

### Finding: GitHub Desktop switched FROM nodegit TO native git (dugite)
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop dugite repo, dugite issue #98

Reasons for the switch:
1. **Command coverage:** "NodeGit doesn't support the full set of Git commands, arguments and formatting that Git core does"
2. **Behavioral compatibility:** "subtle behaviour changes between libgit2 and Git core led to support issues which remain unresolved"
3. **Memory management:** "By invoking Git out-of-process, the memory footprint avoids affecting the current process"
4. **Development velocity:** "Shelling out to Git simplifies development, gives access to all of the latest Git features without having to reimplement or wait for support in libgit2"

They created dugite-native (bundled git binaries for Mac/Win/Linux) and dugite (lightweight Node.js wrapper using execFile).

**Implications:** The GitHub Desktop team, with deep git expertise, explicitly chose CLI-over-binding after trying both. Their reasoning directly applies to our use case.

### Finding: GitButler uses libgit2 (Rust) but is migrating to gitoxide
**Confidence:** CONFIRMED
**Evidence:** GitButler repo, gitoxide issue #1287, PR #4670

GitButler historically used libgit2 via git2-rs (Rust bindings). They are actively migrating to gitoxide (pure Rust git implementation). PR #4670 shows "branch details with gix: 2.6x faster" — significant performance improvement from the migration.

Sebastian Thiel (gitoxide creator) is contracted by GitButler for this work.

**Implications:** Even in Rust where libgit2 bindings are mature, the trend is toward native implementations. This is a Rust-specific pattern not directly transferable to Node.js, but the principle (correctness + performance from native implementation) is informative.

### Finding: Cursor uses libgit2 (via Electron)
**Confidence:** INFERRED
**Evidence:** Cursor forum discussions, Electron dependency analysis

Cursor, built on Electron, reportedly uses libgit2 v1.6.4 (bundled with Electron). This is inherited from VS Code's Electron base rather than a deliberate choice — Cursor's primary git operations likely go through VS Code's git extension (which uses native CLI).

**Implications:** Cursor's use of libgit2 is incidental to its Electron stack, not a recommendation.

### Finding: Azure Fluid Relay uses isomorphic-git for in-memory git operations
**Confidence:** CONFIRMED
**Evidence:** Microsoft 365 Developer Blog (July 2024)

Azure Fluid Relay uses "isomorphic-git with memfs, a memory-based file system, to create a single JSON filesystem payload for each summary." They chose isomorphic-git specifically for in-memory tree building to minimize storage operations.

**Implications:** isomorphic-git is used in production at Microsoft for a pattern very similar to our WIP auto-commit pipeline — in-memory tree construction without touching disk.

---

## Summary Table

| Product | Git Approach | Why |
|---------|-------------|-----|
| VS Code | Native git CLI (child_process) | Full feature coverage, simplicity |
| GitHub Desktop | Native git CLI (dugite) | Switched from nodegit; correctness, full coverage |
| GitButler | libgit2 → gitoxide (Rust) | Performance, Rust ecosystem |
| Cursor | libgit2 (via Electron) + native CLI | Inherited from VS Code/Electron |
| Azure Fluid Relay | isomorphic-git | In-memory tree building |

---

## Gaps / follow-ups

* Check if any Hocuspocus-based products use git for persistence
* Investigate TinaCMS (switched from simple-git to isomorphic-git per issue #885)
