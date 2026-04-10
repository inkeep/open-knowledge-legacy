---
type: evidence
source: architecture analysis + slate-yjs source + Yjs CRDT semantics
date: 2026-04-03
confidence: high for happy paths, medium for edge cases (no empirical testing)
---

# Concurrent Edit Traces for MDX Components

## Scenario 1: User A changes type="info", User B edits text inside Callout

### Slate path (slate-yjs)

Initial state in Yjs:
- Y.XmlText (root) contains embedded Y.XmlText with attrs {type:"callout", variant:"warning"}
- That embedded Y.XmlText contains delta [{insert:"Important notice"}]

User A operation: `Transforms.setNodes(editor, { variant: 'info' }, { at: [0] })`
Yjs translation: `yTarget.setAttribute('variant', 'info')`

User B operation: `Transforms.insertText(editor, " about safety", { at: [0, 14] })`
Yjs translation: `yParent.insert(14, " about safety")`

**Result: CLEAN MERGE.** Attribute change and content change are independent
operations on the same Y.XmlText. No conflict. Both users converge to
variant="info" with text "Important notice about safety".

### ProseMirror path (y-prosemirror)

ProseMirror treats node attrs as immutable. Changing variant="info" requires
a `setNodeMarkup` transaction. y-prosemirror translates this by modifying
the Y.XmlElement's attributes via setAttribute.

**Result: LIKELY CLEAN** if y-prosemirror uses setAttribute directly. However,
if the binding implements attribute changes as delete-then-recreate at the
Y.XmlElement level (which some ProseMirror transaction types require), User B's
concurrent text edit would target a deleted element and be lost.

**Confidence: MEDIUM** -- this depends on y-prosemirror internals for
attribute-only changes. The binding source was not directly accessible for
verification.

---

## Scenario 2: User A adds new Callout, User B edits existing one nearby

### Slate path

User A: Insert new callout at document position [2]
Yjs: `yRoot.insertEmbed(offset_at_2, slateElementToYText(calloutNode))`

User B: Change variant on callout at position [1]
Yjs: `yTarget_at_1.setAttribute('variant', 'info')`

**Result: CLEAN MERGE.** These target different Y.XmlText instances.

**Edge case to worry about**: If User A inserts BEFORE position [1], User B's
Slate path [1] may now correspond to a different Yjs offset. But slate-yjs
resolves paths to Yjs offsets at flush time using the document snapshot
captured when the op was created, so the path should resolve correctly.

### ProseMirror path

Same logic. Independent nodes. Clean merge expected.

---

## Scenario 3: Agent writes whole new MDX component while human edits same article

### Slate path

Agent: `Transforms.insertNodes(editor, largeComponentTree, { at: [5] })`
Yjs: `yRoot.insertEmbed(offset_at_5, slateElementToYText(largeTree))`
This is a single embed insert in the root Y.XmlText.

Human editing paragraph at [2]:
Yjs: text insert/delete operations within the Y.XmlText embed at offset 2.

**Result: CLEAN MERGE if editing different nodes.** The agent's insert at
position 5 and the human's text edit at position 2 target different parts
of the root Y.XmlText content.

**DANGEROUS if editing the same node or adjacent.** If the agent replaces
content at positions [3]-[7] while the human edits text at [4], the human's
edits may be inside content the agent is deleting and replacing. Yjs handles
the delete correctly (human's inserted text within deleted range is removed),
but this creates a "lost edit" experience.

**Agent-specific concern**: Agents tend to write entire blocks at once (replace
a section). This maps to delete+insert in Yjs, which obliterates any
concurrent human edits within the replaced range. This is correct CRDT
behavior but terrible UX.

---

## Scenario 4: Both users edit different props on the same MDX component

User A: Change variant="warning" to variant="info"
Yjs: `yTarget.setAttribute('variant', 'info')`

User B: Change title="Note" to title="Warning"
Yjs: `yTarget.setAttribute('title', 'Warning')`

**Result: CLEAN MERGE.** Different attribute keys. Both changes preserved.

---

## Scenario 5: Both users edit the SAME prop (e.g., type) concurrently

User A: `yTarget.setAttribute('type', 'warning')`
User B: `yTarget.setAttribute('type', 'info')`

**Result: LAST-WRITER-WINS.** Yjs Map semantics: deterministic winner based
on client ID ordering. One value survives. No error, no notification.
Both clients converge to the same value, but one edit is silently lost.

This is the standard CRDT behavior for registers, but users will experience
it as a mysterious prop change they didn't make.

---

## Scenario 6: One user deletes an MDX component, another edits its props

User A: `Transforms.removeNodes(editor, { at: [3] })`
Yjs: Delete the Y.XmlText embed at offset 3 in the parent.

User B: `yTarget.setAttribute('variant', 'info')` on the same component
Yjs: setAttribute on a Y.XmlText that has been or will be deleted.

**Result: DELETE WINS.** The embed is removed from the parent's content.
User B's attribute change applies to the now-orphaned Y.XmlText, which
has no effect on the visible document. User B's edit is silently lost.

Both clients converge (the component is gone), but User B receives no
notification that their edit was discarded.