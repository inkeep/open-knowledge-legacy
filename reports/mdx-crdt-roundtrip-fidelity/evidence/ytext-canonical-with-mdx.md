# Evidence: Y.Text Canonical (Expl 6) with MDX

**Dimension:** D3 — Y.Text-as-markdown architecture with MDX
**Date:** 2026-04-07
**Sources:** @codemirror/lang-markdown docs, marked.js issues, remark-mdx source, y-codemirror.next source, ytext-canonical-prosemirror-binding report

---

## Key files referenced

- `~/.claude/oss-repos/mdast-util-mdx-jsx/lib/index.js` — JSX MDAST conversion
- `~/.claude/oss-repos/mdast-util-mdxjs-esm/lib/index.js` — ESM import/export handling
- `~/.claude/oss-repos/y-codemirror.next/` — Y.Text ↔ CodeMirror binding
- `~/.claude/oss-repos/tiptap/packages/markdown/src/MarkdownManager.ts` — @tiptap/markdown v3 (marked-based)

---

## Findings

### Finding: CodeMirror 6 has NO built-in MDX language mode
**Confidence:** CONFIRMED
**Evidence:** @codemirror/lang-markdown GitHub README, discuss.codemirror.net thread #8849, npm package docs

`@codemirror/lang-markdown` supports:
- CommonMark
- GitHub Flavored Markdown (via `extensions` option with Lezer GFM)
- Nested language highlighting for fenced code blocks (via `codeLanguages` option)
- HTML tags (via `htmlTagLanguage` option)

It does NOT support:
- JSX tags inside markdown
- Import/export statements
- MDX expressions
- Mixed JSX/markdown parsing

The `extensions` parameter accepts Lezer markdown extensions (e.g., GFM tables, strikethrough) but NOT arbitrary syntax extensions like JSX.

**Building custom MDX highlighting** would require either:
1. A custom Lezer markdown extension that adds JSX tag support (complex — requires understanding Lezer's incremental parser)
2. Using `@codemirror/lang-javascript` as a nested language for HTML tag regions (via `htmlTagLanguage` — designed for HTML, not JSX)
3. Post-hoc decoration-based highlighting (no parsing, just regex-based decoration)

### Finding: marked.js does NOT support MDX syntax
**Confidence:** CONFIRMED
**Evidence:** markedjs/marked#3465 (closed as "NFE — new feature (should be an extension)"), marked.js docs

marked.js has no MDX support. Import statements like `import { Chart } from './charts'` would be parsed as paragraph text. JSX tags like `<Chart data={metrics} />` would be partially parsed as HTML (marked has HTML pass-through support) but expression props (`data={metrics}`) would be mangled.

**Implication for ProseMirror binding:** If Y.Text stores raw .mdx content and the ProseMirror binding uses @tiptap/markdown (marked-based), it CANNOT parse:
- Import/export statements
- JSX expression props
- MDX expressions
- MDX comments

These would all be treated as paragraph text or malformed HTML.

### Finding: Two parser paths (.md → marked, .mdx → remark) introduces significant complexity
**Confidence:** INFERRED
**Evidence:** Architecture analysis of the two parser ecosystems

If the ProseMirror binding needs to handle both .md and .mdx files:
- .md files → @tiptap/markdown (marked) → works today
- .mdx files → needs remark-mdx → different AST (MDAST vs marked tokens), different conversion logic

This means:
1. Two parser implementations for the ProseMirror binding
2. Two serializer implementations
3. Two round-trip idempotency surfaces to prove
4. Two sets of edge cases to handle

Alternatively, ALL files could use remark-based parsing (dropping marked), but this abandons all existing @tiptap/markdown work and the proven shimmer/idempotency analysis.

### Finding: Concurrent editing near JSX boundaries in Y.Text can corrupt JSX syntax
**Confidence:** CONFIRMED
**Evidence:** Y.Text CRDT semantics (character-level operations), analysis of concurrent edit scenarios

**Scenario:** Y.Text contains:
```
# Heading

<Chart data={metrics} title="Sales" />

Some text below
```

User A edits `metrics` → `filteredMetrics` (position-based replacement inside expression prop).
User B simultaneously adds a line break after `<Chart data={` (cursor accidentally in JSX region).

CRDT merge result: Both insertions are applied at character level. The merged text could be:
```
<Chart data={
filteredMetrics} title="Sales" />
```

This is still valid JSX (multiline is allowed). But consider:

User A deletes `}` at position N.
User B inserts `> 0` at position N-1 (thinking they're editing markdown after the component).

CRDT merge: The deletion of `}` and insertion of `> 0` both apply. Result:
```
<Chart data={metrics> 0 title="Sales" />
```

Syntactically broken. The expression is unclosed.

**Comparison to Y.XmlFragment approach:** In Y.XmlFragment, the JSX is a single string attribute on an atom node. Concurrent edits to the string attribute are last-writer-wins on the ENTIRE attribute value. Two users cannot independently corrupt the JSX syntax — one user's version wins entirely.

### Finding: Y.Text approach makes agent writes trivially simple
**Confidence:** CONFIRMED
**Evidence:** Architecture analysis + ytext-canonical-prosemirror-binding report

Agent inserts MDX content directly to Y.Text:
```javascript
ytext.insert(offset, 
  `import { Chart } from './charts'\n\n<Chart data={metrics} />\n`
);
```

This is a single Y.Text insert operation. No need to understand ProseMirror schema, no need to construct atom nodes, no need to go through DirectConnection → updateYFragment.

### Finding: ProseMirror binding update path from Y.Text change is re-parse the changed region
**Confidence:** INFERRED
**Evidence:** ytext-canonical-prosemirror-binding report (Option C architecture)

When Y.Text changes (e.g., agent inserts MDX content):
1. Y.Text observer fires with delta (insert at position N)
2. ProseMirror binding determines affected region
3. Region is re-parsed (markdown → ProseMirror nodes)
4. ProseMirror transaction replaces the affected nodes

For the agent's MDX insert:
- The binding would need to detect that `<Chart data={metrics} />` is a JSX component
- If using marked (no MDX support), it would be parsed as paragraph text or partial HTML
- If using remark-mdx, it would be correctly parsed as an mdxJsxFlowElement
- The binding would then need to convert the MDAST JSX node into a ProseMirror void node

**Critical gap:** The re-parse-and-replace approach only works if the parser understands MDX. marked does not. remark-mdx does. This forces the .mdx parser choice.

### Finding: remark-mdx is available as a standalone parser
**Confidence:** CONFIRMED
**Evidence:** remark-mdx npm package, mdxjs.com/packages/remark-mdx/

remark-mdx can be used independently:
```javascript
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'

const tree = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .parse(mdxContent)
```

This produces an MDAST with JSX, ESM, and expression nodes. It runs in Node.js (no browser dependencies). Performance is adequate for typical files (micromark-based, streaming parser).

---

## Gaps / follow-ups

* No existing binding maps MDAST (from remark) to ProseMirror nodes — this would be new code
* The concurrent JSX corruption scenario needs quantification: how likely is it in practice?
* CodeMirror MDX highlighting would need custom work regardless of architecture choice
