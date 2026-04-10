---
name: propagation-matrix
description: Full 4×3 propagation matrix — which write surface propagates to which read surface, via what mechanism
type: factual
sources:
  - packages/app/src/editor/observers.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/persistence.ts
  - packages/server/src/file-watcher.ts
  - packages/app/src/server/hocuspocus-plugin.ts
---

# Propagation Matrix

## Write Surfaces

| ID | Surface | Entry Point | CRDT Target | Origin |
|----|---------|-------------|-------------|--------|
| W1 | WYSIWYG (ProseMirror) | TiptapEditor.tsx | Y.XmlFragment('default') | ProseMirror-internal, local |
| W2 | Source (CodeMirror) | SourceEditor.tsx | Y.Text('source') | CodeMirror-internal, local |
| W3 | Agent API | /api/agent-write-md | Y.Text + XmlFragment (server-side paired via syncTextToFragment) | 'agent-write' |
| W4 | Disk (file watcher) | handleExternalChange | Y.Text + XmlFragment (server-side paired in one transaction) | { origin: 'file-watcher' } |

## Propagation Paths (12 total)

| Write → Read | Mechanism | Code Path | Test Coverage |
|---|---|---|---|
| W1→Y.Text | Observer A (M1): debounce 50ms, incremental diff or applyUserDelta | observers.ts:262-316, 318-339 | GOOD: 5 unit, S1-S5 stress, Layer C E2E |
| W1→Disk | Persistence (M4): onStoreDocument serializes XmlFragment | persistence.ts:165-196 | THIN: 1 test (safeContentPath only) |
| W2→XmlFragment | Observer B (M2): debounce 50ms + typing defer 300ms, updateYFragment | observers.ts:354-430, 432-442 | GOOD: 4 unit, 4 observer-sync, S1 stress |
| W2→Disk | Observer B → Persistence: Observer B syncs to XmlFragment, persistence serializes | persistence.ts + observers.ts | THIN: 1 observer-sync test (PR05) |
| W3→Y.Text | Server direct write + CRDT sync to client (remote, observers skip) | api-extension.ts:145-169 | GOOD: 5 unit, S1-S5 stress, Layer C |
| W3→XmlFragment | syncTextToFragment + CRDT sync to client (remote, Observer A refreshes baseline) | agent-sessions.ts:43-66 | GOOD: unit + stress + bridge invariant |
| W3→Disk | Persistence: onStoreDocument fires after agent write transaction | persistence.ts:165-196 | UNTESTED |
| W4→Y.Text | handleExternalChange: direct ytext replace in same transaction → CRDT sync | hocuspocus-plugin.ts:135-139 | THIN: 1 observer-sync test |
| W4→XmlFragment | handleExternalChange: updateYFragment in same transaction → CRDT sync | hocuspocus-plugin.ts:129-130 | THIN: 1 observer-sync test |
| Undo→Y.Text | um.undo() reverts Y.Text items → CRDT sync | api-extension.ts:230 | GOOD unit, E2E FAILING |
| Undo→XmlFragment | syncTextToFragment after undo → CRDT sync | api-extension.ts:231 | PARTIAL: Layer C fails |
| Redo→Y.Text | um.redo() + CRDT sync | api-extension.ts:262 | THIN: 1 unit test |
| Redo→XmlFragment | syncTextToFragment after redo → CRDT sync | api-extension.ts:265 | UNTESTED |

## Coverage Summary

- **GOOD (5 paths):** W1→Y.Text, W2→XmlFragment, W3→Y.Text, W3→XmlFragment, Undo→Y.Text (unit level)
- **THIN (5 paths):** W1→Disk, W2→Disk, W4→Y.Text, W4→XmlFragment, Redo→Y.Text
- **UNTESTED (2 paths):** W3→Disk, Redo→XmlFragment
- **FAILING (1 path):** Undo→XmlFragment (Layer C browser E2E)

Note: The "4×3 matrix" framing produces 10 directional propagation paths (each write surface has 2 read targets, not 3 — writes don't propagate to themselves). Adding undo (2 surfaces) + redo (2 surfaces) = 14 total test targets. The spec uses "12-path matrix + undo/redo" as shorthand.

## Key Architectural Invariants

1. **Server-side pairing:** Agent writes (W3) and disk writes (W4) are server-side paired — clients receive pre-paired Y.Text + XmlFragment via CRDT sync. Client-side observers skip remote transactions.
2. **Only local user edits (W1, W2) rely on client-side observers** for cross-representation sync.
3. **Observer A baseline (`lastSyncedXmlMd`)** must be refreshed by every path that updates XmlFragment to prevent stale-delta bugs.
