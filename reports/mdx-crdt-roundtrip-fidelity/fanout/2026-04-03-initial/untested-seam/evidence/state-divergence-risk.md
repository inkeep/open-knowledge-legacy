---
type: evidence
source: MDX serialization analysis + Yjs persistence architecture + remark-mdx behavior
date: 2026-04-03
confidence: high (multiple independent failure vectors identified)
---

# State Divergence Risk: Yjs -> MDX -> Yjs Round-Trip Drift

## The Core Problem

The full round-trip is:

```
Session N:   Yjs state -> serialize to Slate -> serialize to MDX -> write to git
Session N+1: read from git -> parse MDX -> deserialize to Slate -> initialize Yjs
```

If the Yjs state at the end of Session N+1's initialization does NOT match the
Yjs state at the end of Session N, we have drift. Over multiple sessions, drift
accumulates.

## Drift Vector 1: MDX Whitespace Normalization

MDX serialization (mdast-util-to-markdown + mdast-util-mdx-jsx) does not
guarantee round-trip whitespace fidelity.

Source: [MDX Issue #1193](https://github.com/mdx-js/mdx/issues/1193)

When markdown content is inside JSX tags, serialization adds indentation.
On re-parse, this indentation changes the semantic meaning (e.g., continuation
paragraphs inside list items). The MDX project fixed the worst cases with
micromark/remark@13, but whitespace around JSX boundaries remains fragile.

**Impact**: The Yjs text content "Hello\n\nWorld" inside a component may
serialize to "  Hello\n\n  World" in MDX. On re-parse, this may be
interpreted as a single indented block rather than two paragraphs.
The Slate node structure changes. The new Yjs state has different
content than the original.

## Drift Vector 2: Attribute Serialization Lossy-ness

### Expression attributes lose their AST

MDX expression attributes like `data={chartData}` are stored in mdast as:

```javascript
{
  type: 'mdxJsxAttribute',
  name: 'data',
  value: {
    type: 'mdxJsxAttributeValueExpression',
    value: '{chartData}',
    data: { estree: Program } // full ESTree AST
  }
}
```

When serialized to MDX text: `data={chartData}`
When re-parsed: The ESTree is re-generated from source.

The ESTree AST is structurally equivalent but not referentially identical.
If any intermediate layer compares by reference (Object.is) rather than
deep equality, this creates a spurious "change" on every session load.

### Boolean and numeric attribute coercion

Y.XmlElement.setAttribute technically expects strings (per Yjs docs).
Both bindings pass non-string values. On Y.XmlElement.getAttribute,
the type of the returned value depends on internal Yjs serialization.

y-prosemirror Issue #116 documents this: numbers stored via setAttribute
come back as numbers, but the XML spec says they should be strings. If
any serialization step stringifies them, you get `"14"` instead of `14`.
On the next parse, the MDX attribute `fontSize={14}` becomes the number 14,
but the Yjs attribute was the string "14". Different types = divergence.

## Drift Vector 3: JSX Formatting Preferences

mdast-util-mdx-jsx serialization options include:

- `printWidth`: controls line wrapping of JSX attributes
- `quote` / `quoteSmart`: controls single vs double quotes
- Attribute ordering is not guaranteed to match source

If the MDX serializer formats:
```
<Callout type="warning" title="Note" />
```
but the original source was:
```
<Callout
  title="Note"
  type="warning"
/>
```

The next parse will produce the same semantic attrs, but if the Slate/PM
representation preserves any formatting metadata (raw source positions,
attribute ordering), these will differ.

## Drift Vector 4: Empty Text Nodes and Void Elements

Slate requires every Element to contain at least one Text descendant, even
void elements. slate-yjs preserves this invariant.

But MDX components may be self-closing: `<Chart data={data} />`
No children. No text. When parsed to Slate, a synthetic `{text: ''}` child
is added. When serialized back to MDX, this empty text may or may not
produce trailing content. If it does, the MDX changes on every save.

## Drift Vector 5: Doc-Level Attributes Stripped

y-prosemirror Issue #48 documents that `prosemirrorJSONToYDoc` removes
all doc.attrs on conversion. If any MDX frontmatter or document-level
metadata is stored as doc attrs, it is lost on every Yjs initialization.

This is a y-prosemirror-specific issue. slate-yjs does not have this
problem because the root Y.XmlText's attributes persist normally.

## Drift Vector 6: Yjs Tombstone Growth vs Fresh Parse

A Yjs document that has been collaboratively edited accumulates tombstones
(deleted content markers) in its internal state. When the same content is
created fresh by parsing MDX, the Yjs state has zero tombstones.

This means:
- Binary Yjs state from Session N (with edit history): 50KB
- Fresh Yjs state from parsing the same MDX: 5KB

The documents are logically equivalent but structurally different. If any
component compares Yjs state vectors (for sync protocol), a fresh parse
appears as a completely new document. This forces a full re-sync on every
session start.

## Cumulative Drift Assessment

| Vector | Severity | Likelihood | Mitigation Difficulty |
|--------|----------|------------|----------------------|
| Whitespace normalization | HIGH | Near-certain for nested JSX+MD | Hard (MDX spec gap) |
| Expression attr re-parse | LOW | Certain but semantically harmless | Low (use deep equality) |
| Boolean/numeric coercion | MEDIUM | Likely for numeric props | Medium (normalize on load) |
| JSX formatting changes | LOW | Cosmetic git diffs only | Low (pin serializer config) |
| Empty text node injection | MEDIUM | Certain for void components | Medium (strip on serialize) |
| Doc-level attrs stripped | HIGH (PM path) | Certain if used | Hard (binding limitation) |
| Tombstone divergence | HIGH | Certain | Hard (architectural) |

**Overall verdict**: The Yjs-to-MDX-to-Yjs round-trip WILL drift on every
session boundary. Some vectors are cosmetic (formatting), some are semantic
(whitespace changing parse structure), and one is architectural (tombstone
growth means fresh-parsed Yjs state never matches edited Yjs state).
