---
type: evidence
source: synthesis of nested-mdx-trace, tinacms-plate-mdx, milkdown-remark, slate-yjs, y-prosemirror sub-reports
date: 2026-04-03
test_case: deployment-guide with 3-level nested JSX, expression props, YAML frontmatter
---

# Pipeline Comparison: Plate/Slate vs Milkdown/ProseMirror

## End-to-End Trace Summary

A test MDX document with Tabs > Tab > Callout nesting, expression props
(`data={chartData}`), YAML frontmatter, and standard markdown was traced
through both pipelines.

### Pipeline A: Plate (Slate) + slate-yjs

| Stage | Result |
|-------|--------|
| MDX -> MDAST | Structurally perfect (remark-mdx produces correct tree) |
| MDAST -> Slate | CATASTROPHIC LOSS: unknown JSX tags flatten to paragraph text, all attributes stripped, expression props lost |
| Slate -> Yjs | Faithful (but damage already done) |
| Yjs -> Slate -> MDAST -> MDX | Invalid MDX output (JSX tags are character data, not structural) |

**Root cause**: `customMdxDeserialize.ts` lines 57-76 in Plate's markdown
plugin. For unregistered flow elements, wraps in paragraph with literal
tag strings. Attributes, expression props, and structural nesting are
destroyed.

**YAML frontmatter**: No yaml rule in defaultRules.ts. Silently dropped.

**CRDT safety**: DANGEROUS. JSX tags become character-level text. Concurrent
edits can interleave characters within tag strings, producing malformed
JSX like `"<Tab title=\"Kub</Tab>\nernetes\">"`.

### Pipeline B: Milkdown (ProseMirror) + y-prosemirror

| Stage | Result |
|-------|--------|
| MDX -> MDAST | No remark-mdx; JSX becomes raw HTML nodes |
| MDAST -> ProseMirror | HTML atoms preserve tag strings opaquely; nesting lost |
| ProseMirror -> Yjs | Faithful (atoms are opaque named deltas) |
| Yjs -> PM -> MDAST -> MDX | Syntactically valid HTML/JSX but nesting/indent lost |

**Root cause**: remark-mdx is not included in Milkdown's default pipeline.
JSX tags are treated as raw HTML, wrapped in paragraphs as inline atoms.

**YAML frontmatter**: No remark-frontmatter. `---` becomes thematicBreak
(horizontal rule). Content between delimiters becomes mangled headings/paragraphs.

**CRDT safety**: SAFER than Pipeline A. Atoms are opaque blocks; concurrent
edits target different structural locations. But no structural validation
that open/close tags match.

## Feature-by-Feature Comparison

| Feature | Pipeline A (Plate/Slate) | Pipeline B (Milkdown/PM) |
|---------|--------------------------|--------------------------|
| Standard markdown | Preserved | Preserved |
| Bold/italic/code marks | Preserved | Preserved |
| Links | Preserved | Preserved |
| JSX structure (nesting) | DESTROYED (flattened to paragraphs) | DESTROYED (flattened to atoms) |
| JSX attributes (string) | LOST (stripped in fallback) | PRESERVED (opaque atom string) |
| Expression props | LOST (no deserializer) | PRESERVED (opaque atom string) |
| Self-closing JSX | LOST (open+close text wrapping) | PRESERVED (atom contains full tag) |
| YAML frontmatter | DROPPED (no rule) | DESTROYED (thematicBreak) |
| Import/export ESM | THROWS ERROR (TinaCMS), varies (Plate) | Not applicable without remark-mdx |
| Concurrent edit safety | DANGEROUS (character interleaving in tags) | MODERATE (atoms are opaque) |

## What Each Pipeline Gets Right

**Plate/Slate**: Better parser (remark-mdx produces correct MDAST).
When applications register Plate plugins for each JSX component, the
MDAST-to-Slate conversion can work correctly. TinaCMS demonstrates this
for components declared in its template schema.

**Milkdown/ProseMirror**: Better extension architecture. The remark plugin
system makes adding remark-mdx trivial ($remark wrapper). The bidirectional
spec co-location pattern (parseMarkdown + toMarkdown on every schema node)
enforces round-trip completeness. Milkdown's emphasis marker preservation
pattern shows how to maintain source-level fidelity.

## What Each Pipeline Gets Wrong

**Plate/Slate**: The generic fallback for unknown JSX is destructive beyond
recovery. TinaCMS's schema-dependent approach rejects expression props,
imports, and MDX expressions entirely. Plate's own fallback is slightly
better (preserves tag strings) but still loses all attributes.

**Milkdown/ProseMirror**: No MDX support at all in the default pipeline.
Adding remark-mdx requires writing ProseMirror node schemas for every MDX
MDAST type (mdxJsxFlowElement, mdxJsxTextElement, mdxjsEsm,
mdxFlowExpression, mdxTextExpression). Community attempts hit this wall
(Discussion #772).

## Binding Layer Comparison

| Dimension | slate-yjs | y-prosemirror |
|-----------|-----------|---------------|
| Node mapping | Element -> Y.XmlText | Element -> Y.XmlElement (v1) / named delta (v2) |
| Attribute granularity | Per-key (concurrent safe) | Per-key (concurrent safe) |
| Nested object props | LWW on entire object | LWW on entire object |
| Text CRDT | Native Yjs delta | Native Yjs delta (v1) or lib0/delta (v2) |
| Custom node types | Type-agnostic (no modification needed) | Type-agnostic (just a name string) |
| Schema enforcement | Post-hoc normalization | ProseMirror schema validates on apply |
| Last maintained | July 2023 (abandoned) | v1: stable; v2: pre-release |
| Known critical bugs | #390 (inline void crash), #386 (null parent), #382 (offline duplication) | Fewer; v1 stable in production |
| Overlapping marks | Not natively supported | Hash-suffixed names (v1), native in delta (v2) |

Source: slate-yjs sub-report section 5; y-prosemirror sub-report section 7
