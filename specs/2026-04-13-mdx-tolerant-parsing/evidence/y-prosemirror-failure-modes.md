---
name: y-prosemirror failure modes
description: Destructive-delete behavior on schema.node() throws; schema add-only invariant; Y.Item identity under updateYFragment
date: 2026-04-13
sources:
  - node_modules/y-prosemirror/src/plugins/sync-plugin.js
  - packages/app/src/editor/observers.ts
  - packages/server/src/agent-sessions.ts
  - ~/.claude/oss-repos/y-prosemirror/src/sync-utils.js (future HEAD)
  - prosemirror-model/src/schema.ts
---

# y-prosemirror failure modes

Load-bearing evidence for D9 (schema defaults + add-only invariant) and the `rawMdxFallback` content-based shape decision.

## Finding 1: schema.node() failure is destructively propagated to the CRDT — CRDT-permanent, multi-peer, undo-resistant

**CONFIRMED** from `node_modules/y-prosemirror/src/plugins/sync-plugin.js` (installed version 1.3.7, 1306 lines), with full multi-peer propagation trace verified via P2 source analysis.

**Propagation chain:**
1. `el._item.delete(transaction)` at sync-plugin.js:807 enters `Item.delete()` at `yjs/src/structs/Item.js:612`
2. `addToDeleteSet(transaction.deleteSet, ...)` at line 620 adds the item to the delete set
3. Transaction cleanup at `Transaction.js:363-368` invokes `writeUpdateMessageFromTransaction` (line 130-138), serializing the deleteSet into a standard yjs update message
4. `doc.emit('update', ...)` fires
5. `HocuspocusProvider.documentUpdateHandler` (`HocuspocusProvider.ts:358-365`) only filters `origin === this`; `ySyncPluginKey` is NOT the provider, so the update is sent to the server and broadcast to peers
6. On peers: `readAndApplyDeleteSet` marks the Item as deleted; cleanup replaces with `ItemDeleted`/`GC`. Real CRDT tombstone, persists in update log, survives reloads, server persistence, state-vector syncs.

**Late-joining peers:** the destructive delete is applied during the initial sync handshake, BEFORE any rendering. They never observe the node existed.

**UndoManager does NOT recover the delete.** `ySyncPluginKey` is not in `UndoManager`'s tracked-origins set by default, so user-side undo will not restore the deleted content. Effectively unrecoverable via in-product affordances; only offline Y.Doc surgery restores.

**Surprise from P2 trace:** The transaction origin `ySyncPluginKey` has NO semantic effect on propagation. It only serves to tag the transaction for observers that filter by origin (e.g., to skip self-feedback loops). Yjs has no notion of "local-only" transactions at the protocol layer — every mutation broadcasts. A reader of the catch block might intuit "internal transaction → not broadcast"; that intuition is wrong.

**Mechanism — `createNodeFromYElement` at line 801:**

```javascript
try {
  const node = schema.node(el.nodeName, attrs, children)
  // ...
} catch (e) {
  // an error occured while creating the node. This is probably a result
  // of a concurrent action.
  el._item.delete(transaction)   // ← destructive: removes from Y.Doc
  mapping.delete(el)
  return null
}
```

Identical pattern at lines 834–844 for `createTextNodesFromYText` (text node creation throw → delete the parent `Y.XmlText` from the Y.Doc).

**The catch block does not merely skip rendering the node.** It issues a deletion into the Y.Doc inside a `ySyncPluginKey`-origin transaction. The deletion broadcasts to all peers via normal Yjs sync. A schema mismatch on one client propagates as data loss to every collaborator, including clients that would have materialized the node correctly.

## Finding 2: conditions that trigger schema.node() throws

From `prosemirror-model/src/schema.ts`:

| Line | Throw | Trigger |
|---|---|---|
| 34 | `RangeError: No value supplied for attribute <name>` | Attr has no `default`; Y.Doc carries a node without that attr set |
| 43 | `RangeError: Unsupported attribute <name> for node <type>` | Y.Doc carries an attr the current schema doesn't declare |
| 201 | `RangeError: Invalid content for node <type>` | Content doesn't satisfy the content expression |
| 253 | `validate()` failure | Custom attr validator rejects value |
| 653 | `RangeError: Unknown node type <name>` | Y.Doc references a node type the schema doesn't register |

## Finding 3: what `default` on every attr prevents (and what it doesn't)

**Prevents:**
- Missing-attr throw at schema.ts:34. Every attr with `default: ...` (even `null`) sets `hasDefault=true`, so `computeAttrs` never hits the missing-attr path.

**Does NOT prevent:**
- `Unsupported attribute` (schema.ts:43) — the attr exists in old Y.Doc data but was removed from the schema.
- `Unknown node type` (schema.ts:653) — the node type was registered in an old schema version but removed.
- `validate()` rejection (schema.ts:253) — attr value is present but fails validation.
- `Invalid content for node` (schema.ts:201) — content expression narrowed across schema versions.

**Implication: `default` is necessary but not sufficient.** The full invariant is:

> **Schema evolution is add-only forever.**
> - Never rename an attr (introduce new, migrate readers, then deprecate — but never delete).
> - Never remove an attr from a node type.
> - Never remove a node type from the schema.
> - Never narrow `validate()` on an existing attr.
> - Never narrow a content expression (e.g., `inline*` → `(text | emphasis)*`).
> - Always specify `default` on every new attr.

This is stricter than most ProseMirror projects need because most projects don't have CRDT sync. With CRDT sync, any schema narrowing converts to destructive data deletion on every peer running the narrower schema.

## Finding 4: y-prosemirror HEAD has removed the try/catch entirely

The OSS `~/.claude/oss-repos/y-prosemirror` HEAD uses a delta-based sync in `sync-utils.js` (310 lines) with no try/catch around `schema.node()`. Schema throws propagate and crash the render.

**Failure-mode comparison:**

|  | 1.3.7 (destructive delete) | HEAD (throw-through) |
|---|---|---|
| Y.Doc integrity | Node removed permanently (CRDT delete op) | Preserved |
| Propagation to peers | Deletion broadcasts; every peer loses the node | Each peer crashes independently; no CRDT op broadcast |
| Recovery path | None (delete is a real op — redo doesn't restore) | Fix schema mismatch, reload page, data returns |

**Data loss is strictly worse than recoverable render crash.** Pinning at 1.3.7 picks the worse failure mode. The real answer is an in-tree patch that neutralizes both failure modes at the source — replacing the destructive-delete / throw-through paths with visible-fallback-node substitution.

## Finding 5: updateYFragment behavior on in-place content changes (CORRECTED by P3 source trace)

**Corrects the earlier characterization** that attr-based atoms cause per-keystroke `delete+reinsert` of the parent Y.XmlElement. That claim applied to node-name swaps (A B → B A in the prefix/suffix scan), **not** to in-place content changes.

Per `evidence/P3-source-trace.md` (deterministic trace through `sync-plugin.js:1145-1298`):

- **`_item.delete` path** (line 1270) is reached only when `!updateLeft && !updateRight`, i.e., node-name mismatch on both sides of the unmatched middle. For in-place content changes (same node type, same position, different attrs or inner text), both `updateLeft` and `updateRight` are true → the recurse-and-update path is taken.
- **Content-based nodes** (`content: 'text*'`) recurse into `updateYText` → character-level Y.Text deltas via `simpleDiff`. Inner text Y.Item only has changed chars tombstoned; parent XmlElement Y.Item preserved.
- **Attr-based atoms** recurse into `setAttribute` (line 1160). Parent XmlElement Y.Item preserved.

Both shapes preserve Y.XmlElement identity under character-level inner edits.

**Real distinctions that DO differentiate content-based from attr-based:**

| Dimension | Content-based | Attr-based atom |
|---|---|---|
| Inner-edit sync granularity | Char-level Y.Text deltas | Whole-attr overwrite |
| Concurrent-edit merge | Character-granular CRDT | Last-writer-wins on whole string |
| Undo granularity | Per-character ops | Per-attr update |
| Sync message bytes | Delta only | Full attr value |

These justify content-based as architecturally preferable for collaborative editing, but the "cursor jumps on every keystroke" framing was overstated. For the rare-fire rawMdxFallback case, both shapes work; content-based wins on collaboration semantics and consistency with R3 jsxInline.

## Finding 5b: cascade risk (R13 supplement) — null returns can violate parent content expressions

The catch block at `sync-plugin.js:807-810` calls `mapping.delete(el)` and returns `null`. Upstream code filters out `null` from children arrays — but if the parent's content expression requires that child (e.g., `list_item` requires `paragraph` content), removing it can cause the PARENT's `schema.node()` to throw on the next reconciliation. That throw triggers ANOTHER catch → ANOTHER destructive delete, cascading up the tree.

**R13 patch must be cascade-aware.** Even with the patch substituting `rawMdxFallback` for block-context throws, the substituted node must satisfy the parent's content expression. If `rawMdxFallback` is registered as `group: 'block'` but the parent expects `list_item+`, the parent throws. Q6 verification test must include cascade scenarios.

The defensive fallthrough in the patch ("if substitution itself throws, fall through to original destructive delete") covers the worst case but reverts to data loss in that path. Better: ensure `rawMdxFallback` participates in `block+` (the most common content expression) and is robust to nesting.

## Finding 6: patch, don't pin (decision)

Applied via `bun patch` (same pattern as `@handlewithcare/remark-prosemirror`):

```diff
// sync-plugin.js:~801
 try {
   return schema.node(el.nodeName, attrs, children)
 } catch (e) {
-  el._item.delete(transaction)
-  mapping.delete(el)
-  return null
+  console.warn(`[y-prosemirror] schema.node(${el.nodeName}) threw:`, e.message)
+  const isInline = schema.nodes[el.nodeName]?.spec.inline
+  const fallbackType = isInline ? 'rawMdxInlineFallback' : 'rawMdxFallback'
+  try {
+    return schema.node(fallbackType, { reason: e.message }, [schema.text(el.nodeName)])
+  } catch {
+    el._item.delete(transaction)
+    mapping.delete(el)
+    return null
+  }
 }
```

Same pattern at `:834` for `schema.text()`.

**Properties:**
- Version-agnostic. Same patch body applies against 1.3.7 and HEAD (HEAD adds the try/catch back where 1.3.7 had it). Upgrade = re-port, not re-architect.
- Fails loud at install if upstream refactors `sync-plugin.js` — patch rejects, CI breaks.
- Failure mode is now: visible fallback node with `reason` attr; user sees the badge and the NodeName that failed; Y.Doc integrity preserved.
- Defensive fallthrough: if even the fallback throws (e.g., schema has no `rawMdxFallback`), the original destructive behavior is retained as last resort.

**Why not a Schema-level wrapper?** Wrapping `Schema.node` on the instance catches throws during normal PM flow (parseDOM, transactions, DOM parse) too, hiding programmer errors we want to surface. The patch scopes the catch to exactly the CRDT materialization call site — surgical.

## Finding 5: updateYFragment Y.Item identity under atom-node replacement

From `sync-plugin.js:1145-1298`. The algorithm is a structural diff (left-right marching prefix/suffix scan + recursive descent), NOT an LCS/Myers diff.

Key behaviors:
- **Prefix/suffix scan** at lines 1182-1206 matches children by `equalYTypePNode` (deep structural equality on name + attrs + children; line 976) OR by identity via `meta.mapping`.
- **Middle reconciliation** at lines 1209-1277 either recurses into a matched pair (preserving Y.Item identity) OR performs `delete(left, 1) + insert(left, [...])` at lines 1268-1273 (destroying the old Y.Item and creating a new one).
- **Name mismatch on a child** → automatic delete+insert. The Y.Item identity is gone.
- **Atom node with different attrs** → `equalYTypePNode` at line 983 requires deep-equal attrs; different values → delete+insert of the entire atom.

**Cursor behavior on delete+insert:**
- Selection is preserved by the sync plugin's `_typeChanged` handler (lines 592–643) via relative-to-absolute position restoration.
- When a Y.Item is tombstoned, relative positions anchored to that item resolve to a fallback position (typically end-of-deleted-region). Selection survives but **moves** — cursor jumps.
- For text inside a non-replaced node, cursor is preserved exactly.

**The atom-attrs churn problem:**

If `rawMdxFallback` holds raw source in `attrs.content: string`, every character edit in the broken region produces a different attr value. `equalYTypePNode` returns false. `updateYFragment` issues delete+insert of the entire atom. Every keystroke in source mode = one Y.Item tombstoned + one new Y.Item inserted. For peers viewing the same document in WYSIWYG: cursor jumps on every keystroke.

**Mitigation: content-based rawMdxFallback.**

```typescript
rawMdxFallback: {
  group: 'block',
  atom: false,           // content-bearing for Y.Item identity
  content: 'text*',      // inner text node holds the raw source
  isolating: true,       // WYSIWYG cursor stops at boundary
  selectable: true,
  defining: true,
  attrs: {
    originalSpan: { default: { start: 0, end: 0 } },
  },
  toDOM: () => ['div', { class: 'raw-mdx-fallback', contenteditable: 'false' }, 0],
}
```

- Character edits = Y.Text char ops on the inner text node. Parent Y.XmlElement identity preserved.
- `updateYFragment` recurses into content, diffs text granularly.
- `isolating: true` + `contenteditable: false` blocks WYSIWYG cursor entry. User must switch to source mode to edit (correct UX).

**Architectural precedent (repo-wide):** Opaque-but-content-bearing nodes for anything requiring stable Y.Item identity. Already the shape for `jsxInline` (D3).

## Finding 7: architectural implications for this spec

1. **R10 (schema defaults) must include add-only invariant** — not just `default` on every attr. Enforcement test covers both.
2. **rawMdxFallback is content-based** for collaborative-editing semantics + PM pattern consistency, not for Y.Item identity preservation (both shapes preserve identity per Finding 5).
3. **jsxInline Layer 3 shape** (`atom: false, content: 'inline*'`) is architecturally consistent with rawMdxFallback. Both use the "opaque-but-content-bearing" pattern: NodeView renders read-only chrome; `content: '...*'` holds user content; `isolating: true` scopes cursor operations.
4. **y-prosemirror is patched, not pinned (R13).** `bun patch` substitutes `rawMdxFallback` at schema-throw sites in block context; logs+skips in inline context. Version-agnostic — upgrades re-port the patch. Verified against 1.3.7; upgrade PR runs Q6 verification test.
5. **Schema-registry drift across client versions remains critical-severity.** R10 + R13 together neutralize it: add-only schema prevents throws on forward drift (default fills in); patch neutralizes throws on backward drift (unsupported-attr throw becomes a visible fallback, not data loss). Any future schema change that narrows anything must still fail the R10 gate — the patch is a safety net, not a license to narrow.
