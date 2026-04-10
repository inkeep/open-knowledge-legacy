---
type: evidence
source: synthesis of remark-mdx, tinacms-plate-mdx, milkdown-remark, nested-mdx-trace sub-reports
date: 2026-04-03
---

# The Four Conversion Boundaries: Source-Level Evidence

An MDX file must cross four conversion boundaries to reach a CRDT-backed
visual editor and return:

```
B1: MDX text <-> MDAST          (remark-mdx parse/serialize)
B2: MDAST <-> Editor blocks      (Slate or ProseMirror node conversion)
B3: Editor blocks <-> Yjs types  (slate-yjs or y-prosemirror binding)
B4: Yjs types <-> MDX text       (B3 + B2 + B1 in reverse on save)
```

## Boundary 1: MDX Text to MDAST (remark-mdx)

**Package**: remark-mdx 3.1.1, which registers micromark-extension-mdxjs
(tokenizer) and mdast-util-mdx (AST construction/serialization).

**What survives**: Attribute order, member expressions (Foo.Bar), fragments,
spreads, import/export text, nested JSX structure, markdown inside JSX
children, complex expression attributes (`data={{ x: 1 }}`).

**What normalizes (converges in 1 pass)**: Self-closing space (`<X/>` ->
`<X />`), quote style (single -> double), empty-to-self-close (`<X></X>`
-> `<X />`), blank line collapse, trailing whitespace, missing blank lines
between flow siblings, list bullet character, inline-to-block expression
children.

**What does NOT converge**: Multiline expression indentation. Each
parse/serialize cycle adds 2 spaces to continuation lines of multiline
expression values. Root cause: two compounding indent operations in
mdast-util-mdx-expression `handleMdxExpression()` and mdast-util-mdx-jsx
`containerFlow()`. Filed as mdx-js/mdx#2533, closed as "expected behavior".

**Round-trip test results**: 23 edge cases tested. 14 byte-identical.
8 converge in 1 pass. 1 does not converge (indentation drift).

Source: remark-mdx sub-report, evidence/round-trip-results.md

## Boundary 2: MDAST to Editor Blocks

### Plate/Slate path (TinaCMS pipeline)

**Package**: @tinacms/mdx (packages/@tinacms/mdx/src/parse/remarkToPlate.ts)

The conversion is **schema-dependent**. JSX elements are looked up by name
in `field.templates`. If a matching template exists, the element becomes a
typed Slate node with extracted props. If no match exists, the element
degrades to an opaque `html`/`html_inline` string node.

**What is rejected outright**:
- Expression props (`data={chartData}`) -- throws parse error. The Acorn
  extraction requires `Literal`, `ArrayExpression`, or `ObjectExpression`
  nodes. Variable references are `Identifier` nodes and hit `assertType`
  failures. Source: parse/acorn.ts line 108-118.
- Import statements (`import X from 'y'`) -- throws `RichTextParseError`.
  Source: remarkToPlate.ts lines 115-123.
- MDX expressions (`{someVar}`) -- explicitly rejected for both flow and
  text. Source: remarkToPlate.ts lines 113-123 (flow), 394-401 (text).

**Children handling**: Rich-text children of registered components are
recursively parsed via `remarkToSlate()` and stored in `props.children`
as a nested `RootElement`. This makes them void in Slate's document model.

Source: tinacms-plate-mdx sub-report, sections 2-3

### Plate path (default @udecode/plate-markdown)

**Package**: plate/packages/markdown/src/lib/

For unregistered MDX flow elements, the fallback (customMdxDeserialize.ts
lines 57-76) wraps content in a paragraph with literal tag strings:
`{ text: "<Tabs>\n" }`. All attributes and expression props are lost.
YAML frontmatter has no defaultRule and is silently dropped.

Source: nested-mdx-trace sub-report, Step A.2

### Milkdown/ProseMirror path

**Package**: @milkdown/transformer (packages/transformer/src/parser/state.ts)

Without remark-mdx, JSX tags become `html` MDAST nodes. These map to
inline atom ProseMirror nodes with the raw tag string in `attrs.value`.
Expression props survive as opaque strings inside the atom value.
Nesting structure is completely flattened.

With remark-mdx added (not done by default), MDAST nodes like
`mdxJsxFlowElement` have no matching ProseMirror schema. The parser's
`#matchTarget` throws `parserMatchError`. See Milkdown Discussion #772.

Source: milkdown-remark sub-report, section 8; nested-mdx-trace, Step B.2

## Boundary 3: Editor Blocks to Yjs Types

### slate-yjs (@slate-yjs/core@1.0.2)

Every Slate Element becomes a `Y.XmlText`. Properties (type, name,
attributes) stored as individual `setAttribute(key, value)` calls.
Children become delta content. Text nodes become string inserts with
formatting attributes.

**Critical**: If props are stored as a single nested object
(`{ props: { variant: "warning", size: "lg" } }`), the entire object
is ONE Y.XmlText attribute. Concurrent edits to different sub-props
use last-writer-wins on the whole object.

Source: slate-yjs sub-report, section 1; untested-seam sub-report, section 1

### y-prosemirror (v1.3.7 / v2.0.0-2)

v1: Element -> `Y.XmlElement(nodeName)` with individual
`setAttribute(key, val)` per attribute. Text -> `Y.XmlText` with delta.

v2: Element -> named delta with attrs array. Each attribute is an
independent entry. Text -> string insert operations.

Both versions store node attributes as individual CRDT entries,
enabling clean concurrent merges of different attributes on the same node.

Source: y-prosemirror sub-report, sections 1-3

## Boundary 4: Yjs to MDX (Reverse Path)

The reverse path (Yjs -> Editor -> MDAST -> MDX) introduces additional
drift vectors beyond the forward path:

1. Yjs tombstone growth: Edited documents accumulate tombstones; fresh
   parse produces zero tombstones. State vectors will never match.
2. Empty text node injection: Slate requires void elements to have
   `{text: ''}` children, which may produce trailing content on serialize.
3. Type coercion: y-prosemirror Issue #116 documents numbers stored via
   setAttribute returning as numbers, but XML spec says strings.
4. Doc-level attrs: y-prosemirror Issue #48 -- `prosemirrorJSONToYDoc`
   removes all doc.attrs on conversion, losing frontmatter.

Source: untested-seam sub-report, section 3; evidence/state-divergence-risk.md
