# Evidence: Spec-Primitive Analogues in Fumadocs Ecosystem

**Dimension:** D1 — Analogues to Component Blocks v2 spec primitives
**Date:** 2026-04-14
**Sources:** MDXEditor source (github.com/mdx-editor/editor), TinaCMS source (github.com/tinacms/tinacms), Keystatic source (github.com/Thinkmill/keystatic), fumadocs source (github.com/fuma-nama/fumadocs), Storybook docs (storybook.js.org), mdast-util-mdx-jsx source, Milkdown discussions, BlockSuite docs

---

## Key files / pages referenced

- MDXEditor `JsxComponentDescriptor` API: mdxeditor.dev/editor/api/interfaces/JsxComponentDescriptor
- MDXEditor `LexicalJsxNode`: github.com/mdx-editor/editor src/plugins/jsx/
- MDXEditor error handling: github.com/mdx-editor/editor/discussions/312
- TinaCMS MDX stringify: github.com/tinacms/tinacms packages/@tinacms/mdx/src/stringify/index.ts
- Keystatic content-components: keystatic.com/docs/content-components
- Keystatic react-node-views.tsx: github.com/Thinkmill/keystatic
- Storybook ArgTypes: storybook.js.org/docs/api/arg-types
- mdast-util-mdx-jsx: github.com/syntax-tree/mdast-util-mdx-jsx lib/index.js
- BlockSuite architecture: blocksuite.io/blog/document-centric.html
- Milkdown MDX discussion: github.com/orgs/Milkdown/discussions/772

---

## Findings

### Finding: gamma dirty-tracking has NO analogue in any surveyed MDX editing tool
**Confidence:** CONFIRMED
**Evidence:** Exhaustive search of MDXEditor, TinaCMS, Keystatic, Plate, BlockNote, Vrite, Milkdown

MDXEditor: Uses Lexical `DecoratorNode`. Serialization always reconstructs from structured mdast state via `mdxJsxToMarkdown`. No `sourceRaw` preservation. No dirty-tracking boolean.

TinaCMS: The `invalid_markdown` node type preserves original source verbatim for parse failures:
```typescript
// packages/@tinacms/mdx/src/stringify/index.ts:53-55
if (value?.children[0]?.type === 'invalid_markdown') {
  return value.children[0].value;
}
```
This is parse-failure fallback (type demotion), not per-node edit-tracking. Registered components always reconstruct from structured state.

Keystatic: Serializes from structured ProseMirror state. Props stored in `data-props` DOM attributes.

Plate: Reconstructs from Slate JSON. No source preservation for any node type.

Vrite: Converts to/from its own JSON format. Inline JSX is entirely dropped.

**Implications:** gamma dirty-tracking is architecturally novel. The spec's approach of tracking edit-state per PM-node to switch serialization paths is unprecedented.

### Finding: MDXEditor's JsxComponentDescriptor is the closest analogue to our descriptor registry
**Confidence:** CONFIRMED
**Evidence:** MDXEditor API documentation + source code

MDXEditor `JsxPropertyDescriptor`:
```typescript
interface JsxPropertyDescriptor {
  name: string;
  type: 'string' | 'number' | 'expression';
  required?: boolean;
}
interface JsxComponentDescriptor {
  name: string | null;
  kind: 'flow' | 'text';
  source?: string;
  defaultExport?: boolean;
  props: JsxPropertyDescriptor[];
  hasChildren?: boolean;
  Editor: ComponentType<JsxEditorProps>;
}
```

Key differences from our PropDef:
- MDXEditor: 3 types (string, number, expression). Our spec: 5 types (string, boolean, number, enum, reactnode)
- MDXEditor: No `defaultValue`. Our spec: typed `defaultValue` per PropDef variant
- MDXEditor: No `'*'` wildcard in type system (supports `'*'` as `name` for catch-all)
- MDXEditor: `Editor` field delegates ALL rendering to user-provided components. Our spec auto-generates controls from PropDef

Runtime lookup pattern:
```typescript
const descriptor =
  jsxComponentDescriptors.find((d) => d.name === mdastNode.name) ??
  jsxComponentDescriptors.find((d) => d.name === '*');
```

**Implications:** MDXEditor's descriptor structure validates our API design. Our PropDef discriminated union is a superset. The `Editor` field approach (user-provided rendering) is an alternative to our auto-generated PropPanel — both are valid, ours is more opinionated.

### Finding: Keystatic content-components has the richest field vocabulary
**Confidence:** CONFIRMED
**Evidence:** Keystatic documentation + source

Keystatic five-kind taxonomy:
```
wrapper({ label, schema: { author: fields.text(), role: fields.text() } })
block({ label, schema: { ... } })
inline({ label, schema: { ... } })
mark({ ... })
repeating({ children: [...] })
```

Field types: `fields.text()`, `fields.select()`, `fields.integer()`, `fields.image()`, `ChildField`, `ObjectField`, `ConditionalField`, `ArrayField`.

Maps to ProseMirror:
| Kind | ProseMirror | Children? |
|------|-------------|-----------|
| `block` | Atom node | No |
| `wrapper` | Node with `content: 'block+'` | Rich text |
| `inline` | Inline node | No |
| `mark` | Mark | Wraps text |
| `repeating` | Constrained container | Specific types |

**Implications:** Keystatic's wrapper/block/inline/mark/repeating taxonomy maps directly to our jsxComponent (wrapper/block) + jsxInline (inline) split. The repeating kind is relevant to our container components (Steps→Step, Tabs→Tab).

### Finding: Storybook ArgTypes is the strongest prior art for "schema drives UI controls"
**Confidence:** CONFIRMED
**Evidence:** Storybook documentation

```typescript
SBType.name: 'boolean' | 'string' | 'number' | 'function' | 'symbol' | 'array' | 'object' | 'enum' | 'union' | 'intersection' | 'other'
```
Control types: `'boolean'`, `'text'`, `'number'`, `'range'`, `'select'`, `'radio'`, `'check'`, `'color'`, `'date'`, `'file'`, `'object'`

**Implications:** Validates the PropDef → auto-generated control pattern. Storybook's ArgTypes → Controls pipeline has been production-tested at massive scale.

### Finding: findFallbackRegion single-pass structural enumeration has NO analogue
**Confidence:** CONFIRMED
**Evidence:** Exhaustive search

- MDXEditor: Falls back to full source mode on parse error (binary: parses or doesn't)
- micromark-extension-mdx/mdxjs: Hard-fail on syntax errors, no error recovery
- fumadocs-mdx: Build-time compiler, build fails on MDX errors
- TinaCMS: Per-node valid/invalid (binary per element, not per-region)
- No tool attempts per-block degradation within a partially-broken MDX document

**Implications:** The spec's `enumerateFallbackRegions` + `findFallbackRegion` algorithm is novel. The ecosystem's standard is binary (whole-doc-parses or fallback-to-source).

### Finding: mdast-util-mdx-jsx's depth-aware indentation CAUSES the 4-space hazard our spec fixes
**Confidence:** CONFIRMED
**Evidence:** mdast-util-mdx-jsx source + ecosystem issue reports

The library uses `inferDepth(state)` to count JSX ancestors and applies indentation via `state.indentLines()`. At nesting depth >= 2, accumulated indentation exceeds CommonMark's 4-space code-block threshold.

Known ecosystem issues:
- mdx-js/mdx#993: "Disable indented code blocks"
- mdx-js/mdx#1283: "Fenced code blocks within JSX elements with indent > 2"
- facebook/docusaurus#10220: "mdx-code-block doesn't work when indented"
- prettier/prettier#16925: "Template strings incorrectly dedented in JSX expressions"

**Implications:** The problem is well-documented but no tool has shipped a serializer-level fix. Our FR-6 flush-left handler is the first. The `fences: true` mitigation in the library is partial (prevents generation but not re-parse of indented code blocks).

---

## Negative searches

* "CRDT MDX editing" in GitHub: 0 relevant results combining CRDT + MDX editing
* "yjs mdx editor" in GitHub: 0 results for a Yjs-backed MDX component editor
* "source dirty tracking prosemirror": 0 relevant results for source-preservation dirty tracking in PM
* "mdx tolerant parsing" in npm/GitHub: 0 packages implementing per-block MDX error recovery

---

## Gaps / follow-ups

* BlockSuite/AFFiNE's adapter system (mdast↔blocksuite conversion) could be studied for additional bridge patterns
* Plate's `memoize` option for raw markdown on nodes warrants deeper investigation as a partial gamma analogue
