# D7: Attribute Shape — Nested vs Flat

## ProseMirror: Technically supports nested objects

The `AttributeSpec` places no type constraint on values:

```typescript
interface AttributeSpec {
  default?: any
  validate?: string | ((value: any) => void)
}
```

`computeAttrs` copies values without type checking. So `attrs: { sourceFence: { char: '`', length: 3 } }` works at the PM level.

Source: [prosemirror-model/src/schema.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts)

## Marijn's guidance: Discouraged

> "Technically, if it's JSON, you can put it into an attribute."

But he **discourages** complex nested structures because attrs are **atomic** -- the entire attribute must be replaced wholesale, not updated incrementally.

Source: [discuss.prosemirror.net/t/full-documents-inside-node-attributes/1894](https://discuss.prosemirror.net/t/full-documents-inside-node-attributes/1894)

## Validation constraints

The `validate` field supports pipe-separated type strings: `"number"`, `"string"`, `"boolean"`, `"null"`, `"undefined"`. There is **no `"object"` type string** in the built-in validator. Nested object attrs require a custom validation function.

## JSON round-trip

Nested objects survive `toJSON()` / `Node.fromJSON()` round-trip. `toJSON()` includes attrs directly:

```typescript
for (let _ in this.attrs) { obj.attrs = this.attrs; break }
```

`fromJSON()` passes `json.attrs` to `nodeType.create()`. Preserved through `JSON.parse(JSON.stringify(...))`.

Source: [prosemirror-model/src/node.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/node.ts)

## Y.js / y-prosemirror: CRITICAL CONSTRAINT

`Y.XmlElement.setAttribute()` is typed as:

```typescript
setAttribute(name: string, value: string | Y.AbstractType): void
```

y-prosemirror's sync plugin calls `yDomFragment.setAttribute(key, pAttrs[key])` for each attr.

- **String attrs**: Work correctly (documented contract)
- **Number/boolean attrs**: Stored at runtime (Yjs doesn't enforce type) but violate type contract
- **Nested object attrs**: Stored as object references. Works in practice but relies on **undocumented** Yjs internal encoding behavior

Source: [Yjs docs: Y.XmlElement](https://docs.yjs.dev/api/shared-types/y.xmlelement)

## Performance: `eq()` / `compareDeep`

`sameMarkup()` calls `compareDeep(this.attrs, other.attrs)` which performs recursive structural comparison:

```typescript
function compareDeep(a, b) {
  if (a === b) return true
  if (!(a && typeof a == "object") || !(b && typeof b == "object")) return false
  // recursive traversal for arrays and objects
}
```

- **Flat primitive attrs**: Hit `a === b` early exit -- O(1) per attr
- **Nested objects**: Full recursive traversal every time
- Called during every transaction (findDiffStart/findDiffEnd), view update, and CRDT sync

Source: [prosemirror-model/src/comparedeep.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/comparedeep.ts)

## Decision matrix

| Concern | Flat attrs | Nested object attrs |
|---------|-----------|-------------------|
| ProseMirror core | Works | Works (any JSON-serializable) |
| `validate` string | Supported | Must use custom function |
| JSON round-trip | Preserved | Preserved |
| `compareDeep` / `eq()` | O(1) per attr | O(n) recursive |
| Y.XmlElement.setAttribute | Documented contract | **Undocumented behavior** |
| y-prosemirror sync | Works | Works in practice, violates type contract |
| CRDT atomic update | Fine | Entire nested object replaced atomically |
| Marijn recommendation | Preferred | "Technically works" but discouraged |

## Recommendation for this codebase

**Use flat attrs** for fidelity metadata:

```typescript
// Instead of: sourceFence: { char: '`', length: 3 }
// Use:
attrs: {
  sourceFenceChar: { default: '`', validate: 'string' },
  sourceFenceLength: { default: 3, validate: 'number' },
}
```

This ensures documented Y.js compatibility, O(1) equality checks, and avoids reliance on undocumented CRDT behavior.

The existing codebase already follows this pattern (e.g., `fenceDelimiter` + `fenceLength` as separate attrs in CodeBlockFidelity).
