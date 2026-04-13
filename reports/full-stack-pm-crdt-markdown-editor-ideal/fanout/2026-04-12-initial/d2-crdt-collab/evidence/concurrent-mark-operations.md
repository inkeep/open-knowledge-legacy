# Evidence: Concurrent Mark Operations in y-prosemirror

## Source
- `node_modules/y-prosemirror/src/plugins/sync-plugin.js` (v1.3.7), lines 1045-1130
- `node_modules/yjs/src/types/YText.js` — ContentFormat internals

## Mark Storage Model

ProseMirror marks are stored as **Y.XmlText formatting attributes**. The key insight: marks are not stored as tree structure (like XML elements) but as flat key-value formatting applied to text spans.

### marksToAttributes (line 1121-1130)

```javascript
const marksToAttributes = (marks, meta) => {
  const pattrs = {}
  marks.forEach((mark) => {
    if (mark.type.name !== 'ychange') {
      const isOverlapping = map.setIfUndefined(
        meta.isOMark, mark.type,
        () => !mark.type.excludes(mark.type)
      )
      pattrs[isOverlapping
        ? `${mark.type.name}--${utils.hashOfJSON(mark.toJSON())}`
        : mark.type.name
      ] = mark.attrs
    }
  })
  return pattrs
}
```

### Two Mark Categories

**Non-overlapping marks** (mark type excludes itself):
- Bold, italic, code, strikethrough
- Storage key: plain name (e.g., `"bold"`)
- Value: mark attributes (e.g., `{}` for bold, `{language: "js"}` for code)
- Concurrent semantics: **last-write-wins** — same key, new value replaces old

**Overlapping marks** (mark type does NOT exclude itself):
- Link, comment, annotation
- Storage key: `"${type.name}--${hash}"` (e.g., `"link--8aB9c2x"`)
- Hash is SHA-256 of `mark.toJSON()`, convolved to 6 bytes, base64-encoded
- Concurrent semantics: **both coexist** — different hashes = different keys

### attributesToMarks (line 1105-1115) — Reverse Direction

```javascript
export const attributesToMarks = (attrs, schema) => {
  const marks = []
  for (const markName in attrs) {
    marks.push(schema.mark(yattr2markname(markName), attrs[markName]))
  }
  return marks
}

// Hash stripping (line 1093-1097)
const hashedMarkNameRegex = /(.*)(--[a-zA-Z0-9+/=]{8})$/
export const yattr2markname = attrName =>
  hashedMarkNameRegex.exec(attrName)?.[1] ?? attrName
```

### Concurrent Scenario Analysis

#### Scenario 1: Two Users Apply Different Marks to Overlapping Ranges

User A: bold on [0, 10]
User B: italic on [5, 15]

Result: Both marks apply cleanly. Bold on [0,10], italic on [5,15], overlap [5,10] has both.

Reason: `"bold"` and `"italic"` are different keys in the Y.XmlText format attributes. Y.js merges format operations on different keys independently.

#### Scenario 2: Two Users Apply Same Non-Overlapping Mark

User A: bold on [0, 10]
User B: bold on [5, 15]

Result: Bold on [0, 15] (union of both ranges).

Reason: Both operations set `"bold": {}` on their respective ranges. Y.js format operations are additive — applying the same format key to adjacent/overlapping ranges produces the union.

#### Scenario 3: Two Users Change Link href Concurrently

User A: changes link href to "new-a.com" on [0, 10]
User B: changes link href to "new-b.com" on [0, 10]

Result: **Both links coexist** (potentially doubled link rendering).

Reason: Since link is overlapping (`!mark.type.excludes(mark.type)`), each produces a different hash:
- `"link--hash_a"`: `{href: "new-a.com"}`
- `"link--hash_b"`: `{href: "new-b.com"}`

Both are applied. ProseMirror may render this as two nested `<a>` tags or may apply its own mark coalescing.

#### Scenario 4: One User Applies Bold, Another Removes It

User A: applies bold on [0, 10]
User B: removes bold on [3, 7]

Result: Bold on [0,3] and [7,10], gap at [3,7].

Reason: Remove sets `"bold": null` on [3,7]. Y.js ordering determines final state — the null-set and the value-set are both applied positionally.

### Format Operations in Y.XmlText (from YText.js)

Y.XmlText stores formatting as **ContentFormat items** interspersed with ContentString items in the linked list:

```
[ContentFormat("bold", {})] → [ContentString("hello")] → [ContentFormat("bold", null)] → [ContentString(" world")]
```

- `ContentFormat` items are **not countable** — they don't affect text length
- They act as **markers** that toggle format on/off
- The `applyDelta()` method with `{ retain: N, attributes: {...} }` inserts format markers at position boundaries

### The Delimiter Attribute Question

For a markdown editor preserving source-text fidelity (e.g., `*` vs `_` for emphasis), delimiter choice is stored as a mark attribute:

```javascript
// e.g., emphasis mark with delimiter attribute
{ type: 'italic', attrs: { delimiter: '_' } }
```

If two users concurrently change the delimiter of the same emphasis mark:
- **Non-overlapping mark (italic):** Both write to `"italic"` key. Last-write-wins. One delimiter wins.
- This is **acceptable behavior** — delimiter preference is cosmetic, and last-write-wins produces a valid result.

## Implications for Schema Design

1. **Non-overlapping marks (bold, italic, code) have clean concurrent semantics** — union of ranges, last-write-wins for attributes
2. **Overlapping marks (link, comment) can duplicate** — two users independently creating links on the same range produces two links with different hashes
3. **Mark attribute conflicts are last-write-wins for non-overlapping marks** — acceptable for cosmetic attributes like delimiter choice
4. **Hash-based deduplication is deterministic** — same mark with same attributes always produces the same hash, so no phantom duplicates from identical operations
5. **The `ychange` mark name is reserved** — schema must not use a mark named `ychange`
