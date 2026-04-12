# Evidence: How comparable systems handle symlinks

**Dimension:** Obsidian, Foam, Dendron, VS Code, language servers
**Date:** 2026-04-12
**Sources:** Obsidian forum + help, foambubble/foam, dendronhq/dendron, microsoft/vscode issues, rust-analyzer + gopls issue trackers

---

## Findings

### Obsidian: NOT officially supported; known footgun
**Confidence:** CONFIRMED
**Evidence:**
- Obsidian Help page "Symbolic links and junctions" exists (unofficial community sentiment; official guidance is cautious). Forum thread #73264 "Can I stop Obsidian from following symlinks..."
- Obsidian Forum Symlink Manager plugin (pjeby/obsidian-symlinks) README documents failure modes verbatim:
  > "Symlinking to a target that is inside the same vault is likely to give you duplicate search results, among other issues."
  > "It's unlikely that change events will be processed for symlinked files, meaning that if you change the file directly ... Obsidian may not detect the change, update search indexes, etc."
  > "This plugin doesn't check for symlink loops ... you run the risk of Obsidian trying to load infinite subdirectories, using up all your memory, crashing Obsidian."

**Implication:** The Obsidian experience gives us the **symptoms** of naive symlink handling: duplicate indexing, missed change events, infinite-loop traversal. Any solution we ship must avoid all three.

### Foam: no specific symlink handling found; defers to VS Code FileSystem API
**Confidence:** INFERRED (NOT FOUND for explicit handling)
**Evidence:** Searched foambubble/foam — no issues or code paths specifically addressing symlinks. Foam's workspace graph uses `vscode.workspace.findFiles`, which inherits VS Code's glob/indexing behavior. By inheritance, Foam has the same issues as VS Code (below).

### Dendron: symlinks requested as a feature, not implemented
**Confidence:** CONFIRMED
**Evidence:** dendronhq/dendron discussion #2349 ("RFC 42 - Self Contained Vaults"); community request notes "Dendron first would need to be able to handle Symlinks to handle this way of doing it." No symlink dedup / realpath logic exists.

### VS Code: does NOT realpath workspace folders by default (since issue #18837 / PR #37144, Sept 2018)
**Confidence:** CONFIRMED
**Evidence:**
- microsoft/vscode issue #18837 resolved: VS Code originally called `fs.realpath` on workspace paths, which broke Perforce workflows. PR #37144 made this suppressible.
- microsoft/vscode issue #100533 (open, "out-of-scope"): the cost of NOT realpathing is that the same file can be opened in two editor tabs if reached via both the symlink and the real path.
- VS Code File Watcher Internals wiki: recursive watcher uses `@parcel/watcher`; it watches the workspace folder path as-given.

**Implication:** VS Code chose "preserve symlink identity" and accepted the "duplicate tab" cost. They use **path-based identity**, not inode/realpath identity. For our project, choosing differently (realpath dedup) is defensible because we have fewer user-visible paths — documents are addressed by a single `docName`, not by arbitrary FS path.

### TypeScript / tsserver: `preserveSymlinks` defaults to false (realpath on resolution)
**Confidence:** CONFIRMED
**Evidence:** typescriptlang.org/tsconfig — "With this option set to true, references to modules and packages (e.g. import or /// <reference types="..." />) will all be resolved relative to the location of the symbolic link file, rather than relative to the path that the symbolic link resolves to." Default: false. Matches Node's `--preserve-symlinks` flag, also false by default.

**Implication:** Default behavior of the dominant Node ecosystem is to **realpath** — TypeScript, Node require(), pnpm, Parcel bundler all resolve symlinks for module identity. Our choice to realpath-dedupe in the watcher index aligns with ecosystem defaults.

### rust-analyzer: canonicalizes explicitly; rejects symlinks in rust-project.json
**Confidence:** CONFIRMED
**Evidence:** rust-analyzer issues/PRs:
- PR #15868 — canonicalize OUT_DIR on workspaces with symlinks
- PR #14402 — reject symlinks in rust-project.json to avoid path-resolution ambiguity
- Fix: "Prevent the VFS from traversing circular symlinks" (performance fix)

**Implication:** The LSP ecosystem converged on explicit canonicalization (realpath) as the safer default. They also hard-reject certain ambiguous configurations rather than silently getting it wrong.

### gopls: known symlink bugs — both performance (symlink-to-/) and correctness (duplicate edits via aliases)
**Confidence:** CONFIRMED
**Evidence:** golang/go issues #74686 (symlink to / burns CPU), #74782 (broken symlink on Darwin), #59550 (duplicate edits to file with symlink aliases). These are cautionary tales: without realpath dedup at the identity layer, any operation that iterates files (rename, refactor, search) applies the operation twice.

---

## Synthesis across comparables

| System | Realpath workspace? | Dedupe by inode/realpath? | Follow symlinks in watcher? |
|---|---|---|---|
| Obsidian | No | No (known bug) | Inconsistent (known bug) |
| Foam | Inherits VS Code | No | Inherits VS Code |
| Dendron | No | N/A | N/A |
| VS Code | No (post-2018) | No (open bug #100533) | @parcel/watcher default |
| TypeScript / tsserver | Yes (default) | Yes | N/A |
| rust-analyzer | Yes (canonicalize) | Yes | Yes, with loop guards |
| gopls | Partial (bugs) | Partially | Yes |
| git | Stores link text | Yes (content hash of link) | N/A |

**Pattern:** Editors that treat FS paths as user-visible identity (VS Code, Obsidian) tend NOT to realpath. Tools that treat files as semantic units (TypeScript, rust-analyzer, git) DO realpath. Our docName identity is closer to the semantic-unit case.
