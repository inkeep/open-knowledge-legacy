---
type: codebase-trace
sources:
  - node_modules/yjs/dist/src/structs/Item.d.ts
  - node_modules/yjs/dist/src/types/YText.d.ts
  - node_modules/yjs/dist/src/types/AbstractType.d.ts
---

# Y.js Item origin model — what "origin" actually means

## Critical distinction: CRDT origin vs transaction origin

`Item.origin` (type `ID | null`) is the **CRDT causal origin** — the Item that was to the LEFT when this Item was inserted. This is used for conflict resolution in the CRDT algorithm. It is **NOT** the transaction origin string (e.g., `'agent-write'`, `'sync-from-tree'`).

Transaction origins (`doc.transact(fn, 'agent-write')`) are **ephemeral** — they exist only on the `Transaction` object during execution. They are NOT stored on the Items created during the transaction.

## Implication for origin-aware diff

**You cannot read "which transaction origin created this Item" from the Item after the transaction completes.** Items don't store transaction origins.

The UndoManager doesn't need Item-level origins — it captures the SET OF ITEMS modified during each transaction (filtered by `trackedOrigins`) and records them in its stack. On undo, it reverses the modifications to those specific Items.

## The zombie content mechanism (traced at Item level)

1. Agent write: `doc.transact(() => { ytext.insert(pos, "world") }, 'agent-write')`
   → Creates Item-A. UndoManager captures Item-A because origin matches `trackedOrigins`.

2. Observer A sync: `doc.transact(() => { ytext.delete(pos, 5); ytext.insert(pos, "world") }, 'sync-from-tree')`
   → Marks Item-A as deleted. Creates Item-B. UndoManager does NOT capture Item-B because origin `'sync-from-tree'` is not in `trackedOrigins`.

3. UndoManager.undo():
   → Finds Item-A in its stack (it was captured in step 1).
   → Restores Item-A (`deleted = false`).
   → Item-B is NOT in the stack → stays alive.
   → Both Item-A and Item-B alive → zombie content.

## The fix doesn't need origin inspection

Since Items don't store transaction origins, the fix must work at the **content level**:
- Before Observer A applies a delete+insert, check if Y.Text **already contains the correct content** at that position
- If yes → skip the delete+insert → existing Items (including agent-created ones) are preserved untouched
- If no → apply normally

This is a **content comparison**, not an origin comparison. The EFFECT is the same: agent Items are preserved because if the content is already what we want, the Items creating that content are the ones we want to keep.

## Y.Text public API for this approach

- `ytext.toString()` → full text content (substring comparison via `toString().substring(offset, offset+len)`)
- `ytext.delete(index, length)` → marks Items as deleted
- `ytext.insert(index, text)` → creates new Items
- `ytext._start` → first Item in linked list (internal, fragile — avoid if possible)
- No public API for "read content at offset without copying the whole string"

For the content comparison gate, `ytext.toString()` is already called once per Observer A sync (line 306: `const currentText = ytext.toString()`). The substring comparison adds zero extra Y.js calls — it operates on the already-available `currentText` string.
