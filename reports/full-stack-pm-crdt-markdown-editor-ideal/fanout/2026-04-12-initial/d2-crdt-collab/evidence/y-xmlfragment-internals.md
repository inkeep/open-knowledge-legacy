# Evidence: Y.XmlFragment/Element/Text Internals

## Source
- `node_modules/yjs/src/types/YXmlFragment.js` (v13.6.30)
- `node_modules/yjs/src/types/YXmlElement.js`
- `node_modules/yjs/src/types/YXmlText.js`
- `node_modules/yjs/src/types/AbstractType.js`
- `node_modules/yjs/src/structs/ContentFormat.js`
- `node_modules/yjs/src/structs/ContentAny.js`
- `node_modules/yjs/src/structs/Item.js`

## Type Hierarchy

```
AbstractType (base — linked list of Items, attribute map)
├── YXmlFragment (ordered children, no name, no attributes)
│   └── YXmlElement extends YXmlFragment (adds nodeName + attributes)
└── YText (text content with formatting)
    └── YXmlText extends YText (adds sibling pointers for DOM structure)
```

## Attribute Type Support

Y.XmlElement attributes accept all JavaScript types via `typeMapSet()` (AbstractType.js lines 846-879):

| JavaScript Type | Y.js Content Wrapper | CRDT Merge Semantics |
|----------------|---------------------|---------------------|
| `string` | ContentAny | Last-write-wins (atomic) |
| `number` | ContentAny | Last-write-wins (atomic) |
| `boolean` | ContentAny | Last-write-wins (atomic) |
| `object` (plain) | ContentAny | Last-write-wins (**whole object replaced**) |
| `Array` | ContentAny | Last-write-wins (**whole array replaced**) |
| `Date` | ContentAny | Last-write-wins (atomic) |
| `BigInt` | ContentAny | Last-write-wins (atomic) |
| `Uint8Array` | ContentBinary | Last-write-wins (atomic) |
| `null` | ContentAny | Last-write-wins |
| `Y.Doc` (subdocument) | ContentDoc | Subdocument CRDT semantics |
| `Y.Map` | ContentType | **Fine-grained CRDT merge** |
| `Y.Array` | ContentType | **Fine-grained CRDT merge** |
| `Y.Text` | ContentType | **Character-level CRDT merge** |

### Key Insight: Objects Are Atomic

Plain JavaScript objects stored as attributes are serialized via `ContentAny` and treated as **opaque atomic values**. Concurrent edits to different properties of the same object attribute result in **last-write-wins for the entire object**, not a property-level merge.

```javascript
// DON'T: object attribute loses concurrent edits to different fields
elem.setAttribute('config', { width: 100, height: 200 })
// User A: setAttribute('config', { width: 150, height: 200 })
// User B: setAttribute('config', { width: 100, height: 300 })
// Result: one of { width: 150, height: 200 } OR { width: 100, height: 300 }
//         NOT { width: 150, height: 300 }

// DO: use Y.Map for fine-grained merge
const config = new Y.Map()
config.set('width', 100)
config.set('height', 200)
elem.setAttribute('config', config)
// Now concurrent edits to width and height merge cleanly
```

## Attribute Storage Internals

### `typeMapSet` (AbstractType.js lines 846-879)

```javascript
export const typeMapSet = (transaction, parent, key, value) => {
  const left = parent._map.get(key) ?? null
  const doc = transaction.doc
  let content
  // Type dispatch based on constructor
  if (value == null) {
    content = new ContentAny([value])
  } else {
    switch (value.constructor) {
      case Number: case Object: case Boolean: case Array: case String:
      case Date: case BigInt:
        content = new ContentAny([value])
        break
      case Uint8Array:
        content = new ContentBinary(value)
        break
      case Doc:
        content = new ContentDoc(value)
        break
      default:
        if (value instanceof AbstractType) {
          content = new ContentType(value)
        } else {
          throw new Error('Unexpected content type')
        }
    }
  }
  // Create new Item with parentSub=key (attribute name)
  new Item(createID(doc.clientID, getState(doc.store, doc.clientID)),
    left, left?.lastId, null, null, parent, key, content)
}
```

### `typeMapGet` (AbstractType.js lines 889-893)

```javascript
export const typeMapGet = (parent, key) => {
  const val = parent._map.get(key)
  return val !== undefined && !val.deleted
    ? val.content.getContent()[val.length - 1]
    : undefined
}
```

Returns the **last non-deleted value** — this is the last-write-wins resolution.

## Child Element Storage

Children are stored as a **doubly-linked list** of Items:

```
type._start → Item(content: ContentType(YXmlElement)) 
                    ↕ left/right
              Item(content: ContentType(YXmlText))
                    ↕ left/right
              Item(content: ContentType(YXmlElement))
                    → null (end)
```

### Key properties:
- `type._start` — pointer to first Item in child list
- `type._length` — count of non-deleted children
- Each Item has `left`, `right` pointers for traversal
- Deleted items remain in list (tombstones) with `deleted: true`
- Items with `parentSub: null` are list children; `parentSub: string` are map (attribute) entries

### `typeListForEach` (AbstractType.js lines 501-514)

```javascript
export const typeListForEach = (type, f) => {
  let n = type._start
  while (n !== null) {
    if (n.countable && !n.deleted) {
      const c = n.content.getContent()
      for (let i = 0; i < c.length; i++) {
        f(c[i], index++, type)
      }
    }
    n = n.right
  }
}
```

## Y.XmlText Formatting Internals

### ContentFormat (ContentFormat.js)

```javascript
export class ContentFormat {
  constructor(key, value) {
    this.key = key      // Format name (e.g., "bold", "link--hash")
    this.value = value  // Format value (e.g., {}, {href: "..."}, or null for removal)
  }
  getLength() { return 1 }
  isCountable() { return false }  // Formats don't affect text length
}
```

### Text + Format Interleaving

Y.XmlText stores text and formatting in the same linked list:

```
[ContentFormat("bold", {})]          ← format marker: bold ON
[ContentString("hello")]             ← text content
[ContentFormat("bold", null)]        ← format marker: bold OFF
[ContentString(" world")]            ← text content
[ContentFormat("italic", {})]        ← format marker: italic ON
[ContentString("!")]                 ← text content
[ContentFormat("italic", null)]      ← format marker: italic OFF
```

The `toDelta()` method (YText.js) iterates this list and produces delta operations:
```javascript
[
  { insert: "hello", attributes: { bold: {} } },
  { insert: " world" },
  { insert: "!", attributes: { italic: {} } }
]
```

## Implications for ProseMirror Schema Design

1. **Node attributes should use simple types** (string, number, boolean) for best collaborative behavior
2. **Complex structured attributes should use Y.Map** instead of plain objects for fine-grained merge
3. **y-prosemirror uses `getAttributes()` which returns plain values** — nested Y.Map attributes would need custom handling in `createNodeFromYElement`
4. **Text formatting (marks) is well-supported** — the linked-list interleaving provides character-level format boundaries
5. **Tombstones accumulate** — deleted nodes remain in the CRDT structure, which can affect document size over time (Y.js garbage collection mitigates this)
6. **Y.XmlFragment is the root** — it has no nodeName or attributes, mapping naturally to ProseMirror's `doc` node
