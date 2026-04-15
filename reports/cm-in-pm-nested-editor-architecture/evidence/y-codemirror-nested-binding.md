# Evidence: Y-codemirror.next Nested Binding Feasibility

**Dimension:** D7 — Y-codemirror.next vs direct PM dispatch
**Date:** 2026-04-14
**Sources:** y-codemirror.next source (GitHub), y-prosemirror source (node_modules), Yjs source

---

## Key files / pages referenced

- `node_modules/yjs/src/types/YXmlText.js:11` — `class YXmlText extends YText`
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js:873-883` — `createTypeFromTextNodes` creates `Y.XmlText` for PM text content
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js:1297-1302` — edge case: empty Y.XmlText content deletion
- `node_modules/y-prosemirror/src/lib.js:64` — absolutePositionToRelativePosition walks Y.XmlText
- https://github.com/yjs/y-codemirror.next/blob/main/src/y-sync.js — ySync ViewPlugin

---

## Findings

### Finding: Y.XmlText extends Y.Text — inheritance confirmed
**Confidence:** CONFIRMED
**Evidence:** `node_modules/yjs/src/types/YXmlText.js:11`

```javascript
export class YXmlText extends YText {
```

Y.XmlText inherits all methods from Y.Text: `observe()`, `toDelta()`, `applyDelta()`, `insert()`, `delete()`, `toString()`. Any API that accepts `Y.Text` also accepts `Y.XmlText`.

**Implications:** y-codemirror.next's `yCollab(ytext, awareness)` function accepts `Y.Text`. Since `Y.XmlText extends Y.Text`, passing a `Y.XmlText` instance is type-safe and should work.

### Finding: y-codemirror.next uses only Y.Text API surface
**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/y-codemirror.next/blob/main/src/y-sync.js

The y-sync.js source:
- Uses `ytext.observe()` (not `observeDeep()`)
- Uses `toDelta()` for reading
- Uses `applyDelta()` for writing
- Does NOT reference Y.XmlElement, Y.XmlFragment, or any XML-specific API
- Transaction origin is a `YSyncConfig` object instance (reference equality)

**Implications:** No architectural barriers to binding y-codemirror.next to a Y.XmlText from inside a y-prosemirror managed node.

### Finding: y-prosemirror creates Y.XmlText for PM text content
**Confidence:** CONFIRMED
**Evidence:** `node_modules/y-prosemirror/src/plugins/sync-plugin.js:873-883`

```javascript
const createTypeFromTextNodes = (nodes, meta) => {
  const type = new Y.XmlText()
  const delta = nodes.map((node) => ({
    insert: node.text,
    attributes: marksToAttributes(node.marks, meta)
  }))
  type.applyDelta(delta)
  meta.mapping.set(type, nodes)
  return type
}
```

When y-prosemirror materializes a PM text node's content to Y.js, it creates a `Y.XmlText`. This means:
- A rawMdxFallback node (`content: 'text*'`) will have its text children stored as one or more `Y.XmlText` instances
- These `Y.XmlText` instances are children of the `Y.XmlElement` representing the rawMdxFallback node itself

### Finding: Accessing the Y.XmlText from a NodeView requires binding traversal
**Confidence:** CONFIRMED
**Evidence:** `node_modules/y-prosemirror/src/plugins/sync-plugin.js:305-318`

The `ProsemirrorBinding` class has a `mapping: Map<Y.AbstractType, Node | Array<Node>>` that maps Y types to PM nodes. However, this mapping is keyed Y→PM, not PM→Y. To go from a PM node position to its Y.XmlText:

1. Get the `ySyncPluginKey` state from the editor
2. Access `state.binding.mapping`
3. Iterate the mapping to find the Y.XmlElement whose PM node matches our rawMdxFallback position
4. Walk the Y.XmlElement's children to find its Y.XmlText child

Alternative approach:
1. Use `absolutePositionToRelativePosition(pos, type, mapping)` to convert PM position to Y.js position
2. The Y.js relative position includes the type reference — extract the Y.XmlText from there

### Finding: CRITICAL CONFLICT — y-codemirror.next and y-prosemirror BOTH observe the same Y.XmlText
**Confidence:** INFERRED
**Evidence:** Synthesis of y-sync.js source + sync-plugin.js source

If we bind y-codemirror.next to the Y.XmlText that y-prosemirror also manages, BOTH will:
- Observe changes on the Y.XmlText (via `observe()` / `observeDeep()`)
- Apply changes when their respective editors update
- Use different transaction origins (y-codemirror.next uses `YSyncConfig` instance; y-prosemirror uses `ySyncPluginKey`)

This creates a double-write risk:
1. User types in nested CM → y-codemirror.next writes to Y.XmlText
2. y-prosemirror observes Y.XmlText change → dispatches PM transaction updating the rawMdxFallback node's text content
3. PM NodeView's `update()` fires → sees new text → could trigger another CM update
4. Simultaneously, Observer A (XmlFragment → Y.Text) fires because XmlFragment changed

The loop prevention mechanisms:
- y-codemirror.next: checks `YSyncConfig` origin reference equality
- y-prosemirror: checks `ySyncPluginKey` meta on PM transaction
- NodeView: checks `this.updating` boolean flag

The origin guards are independent — y-prosemirror's changes come with `ySyncPluginKey` meta, which y-codemirror.next doesn't know about. y-codemirror.next's changes come with `YSyncConfig` origin, which y-prosemirror doesn't filter on.

**This is the critical architectural question.** Two possible outcomes:
1. It works because the changes are idempotent (same content arrives from both paths) and observers are smart enough to detect no-op changes
2. It causes an infinite loop or content duplication

### Finding: Direct PM dispatch approach (tutorial pattern) is proven and safe
**Confidence:** CONFIRMED
**Evidence:** https://prosemirror.net/examples/codemirror/

The ProseMirror tutorial approach bypasses y-codemirror.next entirely:
- CM uses `EditorView.updateListener` to detect changes
- Changes are forwarded to PM via `view.state.tr.replaceWith()` / `tr.delete()`
- PM → CM sync via the NodeView `update(node)` method
- Simple `updating` boolean prevents loops
- y-prosemirror handles CRDT sync at the PM level
- No conflict between two CRDT bindings on the same Y type

---

## Architectural recommendation (D7)

**RECOMMEND: Direct PM dispatch (tutorial pattern) over y-codemirror.next binding.**

Reasons:
1. **Proven pattern** — the PM tutorial is the canonical reference; no novel CRDT conflict risk
2. **Single source of truth** — y-prosemirror owns the Y.XmlText; CM is a view-only facade that dispatches PM transactions
3. **Simpler mental model** — CM → PM transaction → y-prosemirror → CRDT. One direction, one owner.
4. **Origin discipline** — fits cleanly into our existing origin-guard architecture (typed transaction origins, precedent #1)
5. **No dual-observer risk** — avoids the uncharted territory of two CRDT bindings on the same Y type

Cost: lose y-codemirror.next's collaborative cursor rendering within the nested CM. Mitigation: rawMdxFallback is a degraded/error state — collaborative cursors are low-value here. If needed later, we can add a lightweight CM decoration plugin that reads from awareness state directly.

---

## Gaps / follow-ups

- Need to verify that `NodeView.update(node)` fires reliably when remote peers edit the same rawMdxFallback text content (via y-prosemirror's sync)
- Performance of PM dispatch from nested CM with rapid keystrokes — is there measurable overhead vs direct Y.Text binding?
- Need to test that Observer A correctly serializes rawMdxFallback content when modified via nested CM dispatches
