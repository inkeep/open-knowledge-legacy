# Evidence: Y.Text Formatting API as Peritext Substrate

**Dimension:** D1 — Y.Text formatting API as Peritext substrate
**Date:** 2026-04-07
**Sources:** yjs v14.0.0-rc.2 source code, Peritext paper, Yjs issue #291

---

## Key files referenced

- `yjs/src/ytype.js` lines 58-312 — ItemTextListPosition, formatting internals
- `yjs/src/structs/ContentFormat.js` — formatting mark item type
- `yjs/src/structs/ContentEmbed.js` — embedded object item type
- `yjs/src/utils/Doc.js` lines 188-210 — doc.get() unified type creation

---

## Findings

### Finding: Yjs v14 has unified YType — no separate Y.Text/Y.XmlFragment classes
**Confidence:** CONFIRMED
**Evidence:** yjs/src/ytype.js line 599, yjs/src/utils/Doc.js line 204

```javascript
// ytype.js line 597-603
/**
 * Abstract Yjs Type class
 * @template {delta.DeltaConf} [DConf=any]
 */
export class YType {
  constructor (name = null) {
    this.name = name
```

```javascript
// Doc.js line 204
get (key = '', name = null) {
  return map.setIfUndefined(this.share, key, () => {
    const t = new YType(name)
    t._integrate(this, null)
    return t
  })
}
```

There is now a single `YType<DeltaConf>` class parameterized by a delta configuration. `doc.get(key)` creates a generic YType. The old distinction between Y.Text and Y.XmlFragment is now encoded in the DeltaConf parameter, not separate classes.

**Implications:** The hard boundary between Y.Text and Y.XmlFragment that made the source-toggle problem intractable in Yjs 13 is softened in Yjs 14. The binding operates through a generic delta protocol.

### Finding: Formatting is stored as ContentFormat marker items in the CRDT sequence
**Confidence:** CONFIRMED
**Evidence:** yjs/src/structs/ContentFormat.js, yjs/src/ytype.js lines 58-175

```javascript
// ContentFormat.js
export class ContentFormat {
  constructor (key, value) {
    this.key = key   // e.g., "bold"
    this.value = value // e.g., true or null (to unset)
  }
  isCountable () { return false } // zero-length in user space
}
```

Formatting works via "control characters" — ContentFormat items are inserted into the CRDT sequence before and after formatted content. They have zero user-visible length but are real items in the CRDT list. `format(index, length, { bold: true })` inserts a ContentFormat({ key: "bold", value: true }) before the range and a ContentFormat({ key: "bold", value: null }) after it.

### Finding: Yjs does NOT implement Peritext boundary semantics
**Confidence:** CONFIRMED
**Evidence:** Peritext paper section 4.3 (boundary semantics), Yjs source code analysis, Yjs issue #291

Peritext defines four boundary behaviors per mark: "expand before start" / "expand after end" — controlling whether text inserted at a mark boundary inherits the mark. For example, bold should expand at the end (typing at the end of a bold span should be bold) but not expand at the start of a word you didn't bold.

Yjs uses a simpler model: the `insertContent` function at ytype.js line 292 calls `minimizeAttributeChanges` (line 300) which walks forward through existing format markers. New text inserted between a bold-start and bold-end marker inherits bold — always. There is no per-mark "expand" flag.

**The Peritext paper explicitly identifies this as a known anomaly in Yjs.** The paper states that Yjs's approach "can result in the entire rest of the document becoming bold" in certain concurrent editing scenarios.

GitHub issue #291 confirmed this produces inconsistent outcomes under concurrent overlapping format operations (fixed in 13.5.5 for some cases, but the fundamental boundary model remains unchanged).

### Finding: Y.Text supports embedded objects (ContentEmbed)
**Confidence:** CONFIRMED
**Evidence:** yjs/src/structs/ContentEmbed.js

```javascript
export class ContentEmbed {
  constructor (embed) {
    this.embed = embed // arbitrary JSON object
  }
  getLength () { return 1 } // occupies 1 position
  isCountable () { return true }
}
```

ContentEmbed stores an arbitrary JSON object as a single item in the CRDT sequence with length 1. This is used by y-quill for Quill embeds (images, videos, etc.). It can also store Y.XmlElement (ContentType) for complex embeds.

---

## Gaps / follow-ups

* The Peritext boundary anomaly exists but is undocumented as to frequency in practice with typical editing patterns. Most inline formatting (bold, italic) works correctly in the common case (single user or non-overlapping concurrent edits). The anomaly manifests only with concurrent overlapping format operations.
* Yjs 14 may address boundary semantics — the unified delta protocol opens the door, but no current implementation exists.
