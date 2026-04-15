---
"@inkeep/open-knowledge": patch
---

fix(observers): preserve CRDT Item identity through Observer A bridge cycles

Observer A (Y.XmlFragment → Y.Text) now preserves CRDT Items whose content at their position already matches what the sync would write, fixing **origin-laundering** that broke `Y.UndoManager({ trackedOrigins })` consumers — Items written under `'agent-write'` origin no longer get replaced by Items under `'sync-from-tree'` origin.

Two-path implementation:

- **Path A** (Y.Text in sync with baseline): `applyIncrementalDiff` adds a content-comparison gate before each adjacent REMOVED+ADDED hunk; if Y.Text already has the added value at that offset, both `delete` and `insert` are skipped — preserving CRDT Item identity for any unchanged region.
- **Path B** (Y.Text diverged from baseline): `applyUserDelta` is rewritten to use DMP `patch_make` + `patch_apply` (canonical three-way merge) so same-line concurrent edits (user WYSIWYG + agent API write) merge correctly, preserving Item-equal prefix/suffix regions via `applyByPrefixSuffix`.
- New optional `ObserverDeps.onMergeFailed` callback + `console.warn` diagnostic when DMP `patch_apply` reports failed patches.

Server-side cleanup: removed the two dead `Y.Map('conflicts')` write stanzas in `standalone.ts` (zero consumers; reconciliation logic, `incrementConflict()`, and the `{ kind: 'conflicts' }` return type all preserved).

Adds `AGENTS.md` precedent #9 documenting the three unclaimed bridge-quality patterns and introduces a third invariant (Item-preservation) to the CRDT Bridge Architecture section.

Internal change — no public API surface changes.
