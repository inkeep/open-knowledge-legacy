# Evidence: CRDT/Y.js Collaboration Constraints

**Sources:** y-prosemirror@1.x source (GitHub: yjs/y-prosemirror), y-codemirror.next source (GitHub: yjs/y-codemirror.next), Hocuspocus@2.x source (GitHub: ueberdosis/hocuspocus), Y.js source (GitHub: yjs/yjs), y-tiptap source, community issues and discussion threads
**Date collected:** 2026-04-12
**Confidence legend:** HIGH = confirmed from source code; MEDIUM = inferred from observed behavior or community discussion; LOW = community attribution only

---

## 1. y-prosemirror Name Handling

**Confidence: HIGH**

y-prosemirror uses strict `===` comparison when identifying node types by name during Y.XmlElement-to-ProseMirror-node conversion. The relevant code in `y-prosemirror/src/lib.js` (paraphrased from source):

```javascript
// In ySyncPlugin / relativePositionToAbsolutePosition path
const type = doc.type.get(el.nodeName)  // strict string lookup
if (type === undefined) {
  // DESTRUCTIVE catch block:
  el._item.delete(transaction)  // deletes the unrecognized element from the Y.Doc
}
```

**Destructive catch block:** When y-prosemirror encounters a Y.XmlElement whose `nodeName` does not match any registered NodeType in the ProseMirror schema, it deletes the element from the Y.Doc during the reconciliation transaction. This is data loss, not a graceful skip. This behavior means:

- Schema node renames must be deployed atomically. A document created with `nodeName = 'wikiLink'` will be silently deleted by a client running a schema where the type is `'wiki-link'`.
- Unknown node types from future schema versions are destroyed when opened by older clients.

**`ychange` reserved mark name:** y-prosemirror reserves the mark name `ychange` for its own change-tracking decoration system. Defining a ProseMirror mark named `ychange` in the application schema will collide with y-prosemirror's internal mark and cause undefined behavior in change tracking and undo/redo.

```typescript
// DO NOT do this:
const schema = new Schema({
  marks: {
    ychange: { /* ... */ }  // RESERVED — collides with y-prosemirror internals
  }
});
```

---

## 2. Atom Node Concurrency Semantics

**Confidence: HIGH (LWW behavior); MEDIUM (edit+delete outcome)**

Y.js uses Last-Write-Wins (LWW) semantics for attribute mutations on `Y.XmlElement` nodes. Concurrent edits to the same element have the following outcomes:

**Concurrent edit semantics table:**

| Scenario | Outcome | Rationale |
|---|---|---|
| Two clients set **different** attrs on same node | Clean merge — both attrs applied | No conflict; different keys |
| Two clients set **same** attr to different values | LWW — higher Lamport clock wins | Single-key conflict; deterministic |
| Client A edits attr; Client B deletes node | Delete wins | Tombstone propagates; attr mutation is orphaned |
| Two clients insert child nodes at same position | Both children preserved, order by Lamport clock | Y.js sequence CRDT |
| Two clients set same attr to same value | Idempotent — no conflict | Value-equal, no divergence |

**Attribute granularity problem:** Because LWW applies per-attribute-key, coarse attribute design causes semantic conflicts. Example:

```typescript
// Coarse: single 'data' attr — ANY concurrent edit conflicts
setAttribute('data', JSON.stringify({ target: 'Page A', alias: 'link text' }))

// Fine-grained: separate attrs — concurrent edits to different fields merge cleanly
setAttribute('target', 'Page A')
setAttribute('alias', 'link text')
```

With coarse attributes, two clients editing `target` and `alias` simultaneously will lose one edit. With fine-grained attributes, the same scenario produces a clean merge.

---

## 3. Schema Evolution Impact Matrix

**Confidence: HIGH (add operations); HIGH (remove/rename consequences)**

Y.js documents are schema-agnostic at the CRDT layer. The Y.XmlElement stores `nodeName` as a plain string and attributes as a string map. Schema changes therefore have the following impacts:

**Schema evolution impact matrix:**

| Change type | Existing docs | New docs | Risk level |
|---|---|---|---|
| Add new node type | Safe — old docs unaffected | Works immediately | SAFE |
| Remove node type | DATA LOSS — y-prosemirror deletes unknown elements | N/A | DATA LOSS |
| Rename node type | DATA LOSS — old name unrecognized; elements deleted | New name works | DATA LOSS |
| Add new attribute (with default) | Safe — old docs get default on read | Works immediately | SAFE |
| Remove attribute | Safe — attr silently ignored | Attr not written | SAFE |
| Change content expression | RISKY — existing content may violate new expression | Depends | RISKY |
| Change `group` membership | Safe for CRDT; may break PM commands | Depends | LOW RISK |
| Change mark definition | RISKY — mark spans may be orphaned | Depends | RISKY |

**Community guidance (MEDIUM confidence, discuss.prosemirror.net):**
> Schema migrations for live CRDT documents require either (a) a migration step that rewrites Y.Doc content before deploying the new schema, or (b) maintaining backward-compatible NodeSpec entries (keeping old node names as aliases) until all persisted documents are migrated.

**Markdown escape hatch:** Because this codebase uses disk-persisted markdown as the source of truth and reconstructs Y.Docs from markdown on load, schema migrations can be performed by:
1. Updating the markdown serializer to write the new node name/format.
2. Updating the parser to read both old and new formats.
3. On next load, the Y.Doc is rebuilt from the updated markdown — no in-place CRDT migration needed.

This escape hatch is a significant architectural advantage of the markdown-primary persistence model.

---

## 4. y-codemirror.next Architecture

**Confidence: HIGH**

`y-codemirror.next` has zero ProseMirror coupling. It binds directly to a `Y.Text` instance and a CodeMirror 6 `EditorView`, synchronizing between them via CodeMirror's transaction system.

**Binding architecture:**

```
Y.Text ('source')
    ↕  yCollab plugin (y-codemirror.next)
CodeMirror EditorView
```

The binding operates via:
1. A CodeMirror `ViewPlugin` that observes CodeMirror transactions and applies changes to Y.Text.
2. A Y.Text observer that applies Y.js updates to CodeMirror's dispatch system.

**Sync mechanism table:**

| Direction | Trigger | Mechanism | Loop prevention |
|---|---|---|---|
| CodeMirror → Y.Text | CodeMirror transaction | `ySyncFacet` listener calls `ytext.applyDelta()` | Origin tag on Y transaction |
| Y.Text → CodeMirror | Y.Text observe callback | `view.dispatch({ changes })` | Checks `transaction.origin` === self |
| Initial sync | Plugin mount | Full text replace if diverged | N/A |

**Loop prevention:** y-codemirror.next tags its Y.js transactions with the plugin instance as the origin. The Y.Text observer skips callbacks whose origin matches the plugin itself. This prevents the CM→Y→CM→Y feedback loop.

**No PM schema involvement:** The `Y.Text('source')` field is a flat text string. There is no node type interpretation, no attribute storage, and no schema validation. This is intentional — CodeMirror source mode treats the document as plain text, and ProseMirror schema constraints are enforced only via the WYSIWYG path.

---

## 5. Hocuspocus Extension Hook Lifecycle

**Confidence: HIGH**

Hocuspocus extensions implement a defined hook interface. Schema coupling occurs at specific hook points:

**Extension hook lifecycle:**

```
onConnect → onAuthenticate → onLoadDocument → onChange → onStoreDocument → onDisconnect
```

| Hook | Schema coupling? | Notes |
|---|---|---|
| `onLoadDocument` | YES — returns Y.Doc | Must return Y.Doc compatible with client schema |
| `onChange` | Indirect | Receives Y.Doc state; no schema awareness |
| `onStoreDocument` | YES — serializes Y.Doc | Persistence reads Y.Doc structure |
| `onRequest` | No | Raw HTTP; schema-agnostic |
| `onConnect` | No | Connection metadata only |

**No server-side schema validation:** Hocuspocus does not validate Y.Doc content against any ProseMirror schema. The server is schema-agnostic — it stores and syncs Y.XmlElement trees without knowing whether they conform to the current client schema. Schema validation happens only in the client when y-prosemirror converts Y.XmlElements to ProseMirror nodes (and silently deletes unknown types, per section 1).

**Schema coupling points table:**

| Component | Coupled to schema? | How |
|---|---|---|
| Hocuspocus core | No | Passes Y.Doc opaquely |
| `onStoreDocument` (persistence) | Yes | Calls serialize on Y.XmlFragment |
| `syncTextToFragment` | Yes | Calls `mdManager.parse()` → PM schema |
| y-prosemirror ySyncPlugin | Yes | NodeType name lookup |
| `updateYFragment` | Yes | Walks PM doc tree |

---

## 6. y-tiptap vs y-prosemirror

**Confidence: HIGH**

`y-tiptap` is a 1:1 fork of `y-prosemirror` with TipTap-specific shims. The API surface is identical.

**Comparison table:**

| Aspect | y-prosemirror | y-tiptap |
|---|---|---|
| Core sync logic | Canonical implementation | Forked — identical |
| Plugin API | `ySyncPlugin`, `yCursorPlugin`, `yUndoPlugin` | Same names, same API |
| Extension wrapping | No TipTap extension wrapper | Wrapped as TipTap extensions |
| Import path | `y-prosemirror` | `y-tiptap` or via TipTap Collaboration extension |
| Destructive catch block | Present | Present (inherited from fork) |
| `ychange` reservation | Yes | Yes (inherited) |
| Active maintenance | Primary | Follows y-prosemirror |

In practice, TipTap's `@tiptap/extension-collaboration` wraps y-prosemirror (or y-tiptap) and is the recommended integration point. The underlying sync behavior, including the destructive unknown-node deletion, is present in both.

---

## 7. Concurrent Marks: Non-Overlapping vs Overlapping

**Confidence: HIGH (Y.js behavior); MEDIUM (hashed key pattern)**

Y.js stores marks on text spans using the Y.XmlText mark API. The semantics differ based on mark exclusivity:

**Non-overlapping marks (e.g., bold, italic):**
- Multiple marks of the same type are never applied to overlapping spans in the same CRDT operation.
- Concurrent bold/italic applications on the same span produce a union — both marks applied.
- No conflict because PM mark exclusion groups prevent overlap within a single client; concurrent clients each produce valid states that union correctly.

**Overlapping marks (e.g., links, comments):**
- Marks with attributes (e.g., `href` on a link) can overlap if two clients independently create links on the same text.
- Y.js does not deduplicate — both link marks are preserved, producing a span with two link marks.
- **Hashed key pattern (MEDIUM confidence):** Some community implementations use a per-instance hash as part of the mark name to namespace concurrent additions. This prevents the same mark from being applied twice while allowing two distinct link marks to coexist.

**Delimiter-attribute scenario:** For marks that correspond to markdown delimiters (e.g., a `wikiLinkDelimiter` mark preserving `[[` `]]`), concurrent adds from two clients would produce doubled delimiters. This is a concrete risk if delimiter preservation marks are used — prefer storing delimiter information as node attributes rather than as text marks.

---

## 8. Y.XmlFragment Internals

**Confidence: HIGH**

`Y.XmlFragment` is the root container type that y-prosemirror binds to `Y.XmlFragment('default')`. It stores children as a doubly-linked list of `Y.Item` objects, each wrapping either a `Y.XmlElement` (for PM nodes) or a `Y.XmlText` (for text runs).

**PM node → Y.js type mapping:**

| ProseMirror type | Y.js type | Notes |
|---|---|---|
| Block node (e.g., `paragraph`) | `Y.XmlElement` | `nodeName` = PM node type name |
| Inline node (non-text) | `Y.XmlElement` | `nodeName` = PM node type name |
| Text node with marks | `Y.XmlText` | Marks stored as Y.XmlText format spans |
| Root document | `Y.XmlFragment` | Named `'default'` by convention |

**Y.XmlElement attribute type support:**

| Value type | Supported? | Notes |
|---|---|---|
| `string` | YES | Direct storage |
| `number` | NO — must serialize | Convert to string; parse on read |
| `boolean` | NO — must serialize | Use `'true'`/`'false'` strings |
| `null` | Special case | `setAttribute(name, null)` removes attr |
| `Y.AbstractType` | YES | Allows nested Y.Map/Y.Array as attr value |
| Plain object `{}` | NO | Must be JSON-stringified to string |
| Array | NO | Must be JSON-stringified to string |

**Children as doubly-linked list:** Y.XmlFragment children are stored as a doubly-linked list rather than a contiguous array. This means:
- Random access by index is O(n).
- Insertion/deletion at any position is O(1) once the position is found.
- Iteration is sequential — no random access optimization.

This has implications for large documents with many sibling nodes: operations like "find the nth child" require linear traversal. The `updateYFragment` function used in `syncTextToFragment` performs a structural diff to minimize the number of item insertions/deletions.
