# Evidence: Restore-to-Checkpoint / Time-Travel Patterns (D3)

**Dimension:** D3 — Restore-to-checkpoint patterns
**Date:** 2026-04-08
**Sources:** Figma, Google Docs, Notion, Replit, Lovable, Apple Pages documentation; Yjs docs; git documentation

---

## Key sources referenced
- Figma version restore behavior
- Google Docs "Restore this version" semantics
- Lovable revert-as-new-entry pattern
- Yjs createDocFromSnapshot documentation
- Git checkout/restore plumbing

---

## Findings

### Finding: Every modern product implements restore as a forward operation — never destructive rollback
**Confidence:** CONFIRMED
**Evidence:** Figma: restore creates a new version history node. Google Docs: restore creates a new version entry. Lovable: "Reverting creates a new edit card — nothing gets lost." Apple Pages: revert creates a checkpoint of pre-restore state. No product surveyed rewrites history.

**Implication:** Open Knowledge restore MUST create a new commit on main with old content, preserving forward history. Never `git reset --hard`.

### Finding: Read-only preview before restore is table stakes
**Confidence:** CONFIRMED
**Evidence:** All 6 products surveyed offer click-to-preview on any historical version without committing to a restore. Replit goes further with live interactive preview (running app at that state).

**Implication:** The restore flow should be: click checkpoint in timeline → preview content at that point → confirm restore.

### Finding: Branch-from-checkpoint is a power-user feature, not primary restore
**Confidence:** CONFIRMED
**Evidence:** Only Figma ("Duplicate from version") and Google Docs ("Make a copy") offer creating a new document/file from an old version. Notion, Replit, and Lovable only offer linear restore. No product makes branching the primary restore path.

**Implication:** V1 should implement forward-commit restore. "Explore from this version" (branch-from-checkpoint) can be deferred.

### Finding: Version restore and undo (Ctrl+Z) are completely separate systems
**Confidence:** CONFIRMED
**Evidence:** Every product treats session-level undo and version-level restore as independent. Restoring a version resets the undo stack. The "undo" for a bad restore is to restore again to a different version. Yjs UndoManager is session-scoped and unrelated to document-level versioning.

**Implication:** Keep Yjs UndoManager separate from version restore. A restore should clear the undo stack.

### Finding: Git-backed restore should use `git checkout <tag> -- .` + new commit
**Confidence:** INFERRED
**Evidence:** The "restore as forward operation" universal pattern maps to: `git checkout <ref> -- .` (overwrite working tree with old content) then `git commit` (create new commit preserving forward history). This avoids `git reset --hard` (destructive) and `git revert` (per-commit reversal, wrong granularity for squash commits).

**Implication:** Restore sequence: (1) `git checkout <tag> -- .`, (2) new commit on main, (3) new annotated tag, (4) rebuild Y.Doc from restored files.

### Finding: Y.Doc must be rebuilt from markdown after restore, not from CRDT snapshots
**Confidence:** INFERRED
**Evidence:** Yjs docs note that `createDocFromSnapshot` is for read-only preview, not live document restoration. Since markdown is canonical in Open Knowledge (not CRDT binary), the cleanest approach is to re-initialize Y.Doc from restored markdown files. Attempting to apply old CRDT state would require computing a diff-transform, which is complex and fragile.

**Implication:** After git restores files, destroy current Y.Doc instances, read markdown from disk, parse, populate new Y.Docs via `updateYFragment()`, broadcast to connected clients.

---

## Gaps / follow-ups
- Performance of Y.Doc rebuild from markdown for large documents (100+ files) not measured
- Client-side experience during rebuild (flash of empty content?) needs UX testing
