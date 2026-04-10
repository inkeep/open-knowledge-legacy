# Evidence: Figma Branching and Other Production Branch-Like Systems

**Dimension:** Production editors with branching or version switching
**Date:** 2026-04-02
**Sources:** Figma docs (help.figma.com), Figma engineering blog, Notion architecture analysis

---

## Key files / pages referenced

- https://help.figma.com/hc/en-us/articles/360063144053-Guide-to-branching -- Figma branching guide
- https://www.figma.com/best-practices/branching-in-figma/ -- Best practices
- https://help.figma.com/hc/en-us/articles/5668839659415-View-and-manage-branches -- Branch management
- https://www.figma.com/blog/building-figmas-code-layers/ -- Code layers architecture

---

## Findings

### Finding: Figma branching creates full file copies, not CRDT forks
**Confidence:** CONFIRMED
**Evidence:** Figma help docs, engineering blog

Figma branching:
- Creates "an exact replica of the main file in its current state"
- Full copy -- not a CRDT fork, not a delta/snapshot
- Each branch is an independent file with its own CRDT state
- Checkpoints created at branch creation and before merge

Branch lifecycle:
1. Create branch -> full copy of main file
2. Edit branch independently (real-time collab within branch)
3. Merge branch -> server-mediated merge with manual conflict resolution
4. Merge creates a single checkpoint in main's version history

**Implications:** Figma's approach is the "separate documents" pattern -- each branch is a completely independent file. The merge is NOT CRDT-level; it's a server-side operation with UI for resolving design-specific conflicts (e.g., "both sides moved this element").

### Finding: Figma uses a custom CRDT (not Yjs) with LWW registers
**Confidence:** CONFIRMED
**Evidence:** Figma engineering blog

Figma's CRDT model:
- Every document is a tree of objects (like HTML DOM)
- Each object has an ID and properties
- Conflicts resolved by last-writer-wins register
- Eg-walker-inspired merge for handling divergent branches
- Merge "temporarily builds a CRDT structure, rearranges divergent branches, then discards"

### Finding: Notion uses hybrid CRDT/OT with server-side version history -- no branching
**Confidence:** CONFIRMED
**Evidence:** Notion architecture analysis, system design breakdown

Notion:
- CRDT for document structure, OT for text within blocks
- WebSocket-based real-time collaboration
- Server-side version history via periodic snapshots
- No branching concept -- every page has one canonical version
- "Page history" shows linear snapshots, not branches

### Finding: Google Docs uses OT with version history -- viewing a version is read-only
**Confidence:** INFERRED
**Evidence:** General knowledge, system design analysis

Google Docs version history:
- Shows a timeline of changes
- Clicking a version shows a read-only view
- "Restore this version" creates a new version with old content (append-only)
- No branching -- strictly linear version history
- Cannot edit a previous version as a branch

### Finding: VS Code handles file switching by maintaining independent state per file
**Confidence:** CONFIRMED
**Evidence:** General architecture knowledge

VS Code's approach to "multiple versions of content":
- Each open file has its own editor model (TextModel)
- Switching tabs = swapping which model the editor view renders
- No CRDT involved -- each file is independent
- Live Share (collaborative) operates per-file with separate OT state per buffer
- Git integration shows diffs but doesn't enable "edit this branch's version" inline

---

## Gaps / follow-ups

- Figma's internal merge algorithm for design-specific conflicts
- Whether any Google Workspace features enable "draft branches" of docs
