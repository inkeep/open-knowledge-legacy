# Evidence: Worktree vs CRDT Namespace for Drafts

**Dimension:** D4 -- Worktree vs CRDT namespace for drafts (comparative analysis)
**Date:** 2026-04-02
**Sources:** Yjs docs, Automerge docs, git docs, architectural analysis

---

## Key pages referenced

- https://docs.yjs.dev/ -- Yjs CRDT documentation
- https://automerge.org/docs/hello/ -- Automerge documentation
- https://www.inkandswitch.com/peritext/ -- Peritext rich-text CRDT
- https://git-scm.com/docs/git-worktree -- Git worktree documentation
- https://tina.io/docs/drafts/editorial-workflow/ -- TinaCMS git-backed drafts
- https://www.infoq.com/presentations/github-crdt/ -- GitHub Eon CRDT for version control

---

## Findings

### Finding: Systematic comparison -- worktree draft vs CRDT namespace draft
**Confidence:** INFERRED (synthesis of multiple confirmed sources)

| Property | Worktree Draft | CRDT Namespace Draft |
|----------|---------------|---------------------|
| **Storage** | Real files on disk | In-memory Yjs document (persisted to DB/IndexedDB) |
| **Isolation** | Separate directory per draft | Separate Yjs subdocument or namespace per draft |
| **Git-native** | Yes (it IS a git branch + working tree) | No (CRDT state must be synced to git separately) |
| **Merge semantics** | `git merge` (3-way, well-understood) | CRDT auto-merge (conflict-free by construction) |
| **Conflict handling** | Explicit conflicts possible (requires resolution) | No conflicts by design (last-writer-wins or operational transform) |
| **Real-time presence** | Not supported (single-user by design) | Built-in (Yjs awareness, cursor positions) |
| **Real-time co-editing** | Not supported without overlay | Built-in (CRDT's primary purpose) |
| **Offline support** | Full (git is offline-first) | Full (CRDTs are offline-first) |
| **History/versioning** | Git log, blame, diff (mature tooling) | CRDT snapshots, undo/redo (less mature tooling) |
| **Agent compatibility** | Excellent (agents work with files natively) | Poor (agents can't read/write Yjs docs directly) |
| **Editor integration** | File-based (any editor that reads files) | Requires Yjs binding (specific editor libraries) |
| **Disk overhead** | ~5MB per draft (1000 files) | ~negligible per namespace (in-memory/DB) |
| **Creation speed** | Sub-second (git worktree add) | Instant (JS object creation) |
| **Cleanup** | `git worktree remove` + branch delete | Delete Yjs subdocument |
| **Scalability (drafts)** | Limited by disk (trivial at KB scale) | Limited by memory/DB (also trivial at KB scale) |
| **Web server integration** | Serve files from worktree directory | Serve CRDT state via WebSocket |
| **Implementation complexity** | Low (git CLI, file I/O) | High (Yjs setup, provider, bindings, persistence) |

### Finding: CRDT advantages are real-time collaboration features
**Confidence:** CONFIRMED
**Evidence:** https://docs.yjs.dev/

The CRDT approach gives you:
1. **Real-time co-editing**: Two users typing in the same document simultaneously, with cursor awareness
2. **Conflict-free merging**: By construction, CRDT operations commute -- no merge conflicts ever
3. **Fine-grained change tracking**: Character-by-character operations (vs. line-based in git)
4. **Awareness protocol**: See who's editing what, cursor positions, selection state

These are NOT available with git worktrees alone.

### Finding: Worktree advantages are simplicity and agent compatibility
**Confidence:** INFERRED
**Evidence:** Multiple sources

The worktree approach gives you:
1. **Zero new infrastructure**: Git is already required. No Yjs, no WebSocket provider, no CRDT persistence.
2. **Agent-native**: AI agents (Claude Code, Codex, etc.) already work with git worktrees. They read files, edit files, commit, diff. No CRDT adapter needed.
3. **Mature tooling**: git log, git blame, git diff, GitHub PRs, code review tools -- all work out of the box.
4. **Universal editor support**: Any text editor or IDE can open a worktree directory. No Yjs binding required.
5. **Publishing = merge**: No sync step between CRDT state and git. Publishing a draft = `git merge worktree-branch main`.

### Finding: Automerge positions itself as a bridge between CRDT and git
**Confidence:** CONFIRMED
**Evidence:** https://automerge.org/docs/hello/

```
Automerge keeps track of the changes you make to the state, so that you can view
old versions, compare versions, create branches, and choose when to merge them.

Unlike Git, there are no merge conflicts to resolve.
```

Automerge aims to provide git-like semantics (branching, merging, diffing) with CRDT conflict-freedom. However:
- Automerge is a data structure library, not a file system
- It operates on JSON-like documents, not files
- Integration with actual git requires explicit sync

### Finding: GitHub is building CRDT-backed version control (Eon)
**Confidence:** UNCERTAIN
**Evidence:** https://www.infoq.com/presentations/github-crdt/ (QCon London 2026 talk)

Nathan Sobo (GitHub) presented on using CRDTs in "Eon" to synchronize repository changes at keystroke granularity. This suggests GitHub sees CRDTs as complementary to git, not as a replacement -- providing real-time collaboration on top of git's branching/merging model.

**Implications:** Even GitHub's vision appears to be "CRDT for real-time editing + git for branching/versioning" -- a hybrid model, not pure CRDT replacement.

### Finding: Hybrid model is the strongest option
**Confidence:** INFERRED
**Evidence:** Synthesis of above

The hybrid model:
- **Main branch (published content)**: CRDT-backed for real-time co-editing. Yjs provides presence, cursor awareness, conflict-free simultaneous editing.
- **Drafts (isolated workspaces)**: Git worktrees for draft isolation. Each draft = worktree with its own branch.
- **Single-user drafts**: No CRDT needed. Agent or human edits files directly in worktree.
- **Multi-user drafts**: CRDT overlay on worktree files (Yjs watching the worktree directory) for real-time co-editing within a draft.
- **Publishing**: `git merge worktree-branch main`. Standard git merge.
- **Review**: Standard git diff between worktree branch and main.

This gives:
- Simplicity for the 80% case (single-user drafts = just files)
- Real-time co-editing when needed (CRDT overlay)
- Full git-native workflow for publishing and review
- Agent compatibility for AI-assisted editing

### Finding: CRDT namespace adds significant implementation complexity
**Confidence:** INFERRED
**Evidence:** Architectural analysis

A pure CRDT namespace draft system requires:
1. Yjs provider setup (WebSocket or y-sweet or y-redis)
2. Yjs persistence layer (database or IndexedDB)
3. Yjs-to-git sync (writing CRDT state back to git for versioning)
4. Custom editor bindings (y-prosemirror, y-codemirror, etc.)
5. Namespace management (subdocuments, access control per namespace)
6. Conflict resolution UI (even though CRDTs prevent conflicts, the result may be semantically wrong)

A git worktree draft system requires:
1. `git worktree add` (one CLI call)
2. File serving from the worktree directory
3. `git merge` to publish
4. Cleanup via `git worktree remove`

The implementation delta is significant. The CRDT approach requires 5-6 new systems. The worktree approach requires routing + one git command.

---

## Negative searches

### Search: Git worktree real-time collaborative editing
* Searched: "git worktree real-time collaboration", "git worktree CRDT overlay"
* Result: No existing tooling combines git worktrees with CRDT for real-time co-editing within a worktree. This would be a novel integration.

### Search: CRDT namespace production examples for content management
* Searched: "Yjs subdocuments production CMS", "CRDT namespace content platform"
* Result: Most Yjs production uses are single-document (Notion, Linear use CRDTs for individual document editing). Multi-document namespace patterns (one namespace = one draft workspace with many files) are not well-documented in production systems.

---

## Gaps / follow-ups

- How to implement a CRDT overlay on a worktree (Yjs watching files in a worktree directory)
- Whether Yjs subdocuments scale to hundreds of concurrent draft namespaces
- Performance comparison: CRDT sync vs git merge for publishing
- How TinaCMS handles the "merge conflict during publish" UX
