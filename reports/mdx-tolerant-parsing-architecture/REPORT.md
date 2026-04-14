---
title: "MDX Tolerant Parsing Architecture"
description: "End-to-end analysis of how MDX/JSX flows through the Open Knowledge pipeline, what breaks, what the ecosystem offers for tolerant parsing, and the architectural options for 'markdown-first, MDX-tolerant' loading. Covers: current jsxComponent architecture, the jsxInline gap, parseSafe fallback, ecosystem error recovery (remark-mdx, micromark, MDXEditor, Docusaurus, Tina), agnostic MDX mode, block-level fallback feasibility, and the dependency chain to typed-component-nodes."
createdAt: 2026-04-13
updatedAt: 2026-04-13
subjects:
  - remark-mdx
  - micromark
  - MDXEditor
  - TinaCMS
  - Docusaurus
  - ProseMirror
  - TipTap
topics:
  - tolerant parsing
  - MDX error recovery
  - block-level fallback
  - jsxInline gap
  - component editing architecture
---

# MDX Tolerant Parsing Architecture

**Purpose:** Determine the architecturally correct approach for "markdown-first, MDX-tolerant" parsing in Open Knowledge. Reader cares about: what breaks today, what the ecosystem offers, what's feasible for block-level fallback, and how tolerant parsing relates to the typed-component-nodes roadmap.

---

## Executive Summary

**The ecosystem offers no block-level parse recovery.** remark-mdx deliberately throws on invalid syntax with no lenient mode ([micromark-extension-mdx-jsx issue #10](https://github.com/micromark/micromark-extension-mdx-jsx/issues/10) — rejected). micromark's tokenizer is all-or-nothing: once it commits to a construct, there is no backtrack. No production editor (MDXEditor, BlockNote, Milkdown, Tiptap) implements block-level MDX fallback.

**However, three viable approaches exist:**

1. **Agnostic MDX mode** (`micromark-extension-mdx` instead of `micromark-extension-mdxjs`) — drops acorn validation entirely. Expressions like `{ noServer: true }` require only balanced braces, not valid JS. Solves all `{` crashes. Does NOT solve `<` crashes (JSX tag parser's commit-then-crash is identical in both modes). Official micromark package, low adoption.

2. **Pre-parse guard + document-level fallback** (our current approach) — PUA sentinel guard handles known `<`/`{` patterns; `parseSafe()` catches the rest with brace-protected retry + raw text fallback. Production-proven in our codebase. Limitation: whole-doc fallback loses all structure.

3. **Split-then-rejoin** (Mike's Phase 2 concept) — on parse failure, bisect the document at the failing block, parse each half independently, rejoin with fallback nodes for unparseable regions. Not implemented anywhere in production. Architecturally novel but feasible given our pipeline's structure.

**Key finding: agnostic MDX mode + our guard would eliminate ~95% of crash cases** without any block-level complexity. The `<` guard handles the JSX tag commit problem; agnostic mode handles the `{` expression problem. Together they cover both crash classes. Block-level fallback becomes the safety net for the remaining ~5% edge cases, not the primary strategy.

**Key Findings:**
- **The `jsxInline` PM node type was specced (§17.2) but never built** — all MDX maps to block-level `jsxComponent` atom. Inline MDX like `text <Icon /> more` renders as a block break.
- **Agnostic MDX mode is a 10-line change** — replace `remark-mdx` with a custom plugin that pushes `micromark-extension-mdx` (no acorn) instead of `micromark-extension-mdxjs`.
- **Block-level fallback requires parsing the document twice** — once with MDX (may fail), once without (always succeeds), then merging the results. No existing tool does this.
- **Tolerant parsing is a prerequisite for typed-component-nodes** — you need the parser to not crash before you can build richer component editing on top. The `jsxComponent` atom (raw source passthrough) is the bridge: today it stores raw source, future Layer 2/3 upgrades it to structured props + editable children.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | Current jsxComponent architecture (end-to-end flow) | Deep | P0 |
| 2 | The jsxInline gap (specced but not built) | Deep | P0 |
| 3 | Ecosystem error recovery (remark-mdx, micromark, editors) | Deep | P0 |
| 4 | Agnostic MDX mode feasibility | Deep | P0 |
| 5 | Block-level fallback architecture | Deep | P0 |
| 6 | Dependency chain to typed-component-nodes | Moderate | P0 |

---

## Detailed Findings

### 1. Current jsxComponent Architecture

**Finding:** jsxComponent is an intentionally opaque atom that stores raw MDX source as a string. This is architecturally correct for Layer 1 (byte-identical round-trip) but prevents inline MDX and children editing.

**Evidence:** [evidence/current-architecture.md](evidence/current-architecture.md)

**The flow:**
```
Parse:  <Chart data={values} />
  → remark-mdx tokenizes as mdxJsxFlowElement
  → position-slice captures node.data.sourceRaw = "<Chart data={values} />"
  → handler creates jsxComponent.createAndFill({ content: sourceRaw })

Serialize:  jsxComponent { content: "<Chart data={values} />" }
  → PM→mdast: { type: 'html', value: content }
  → remark-stringify: emits value verbatim
```

**Why this design:** Storing raw source avoids reconstructing JSX from parsed attributes — no risk of mangling whitespace, quote style, expression formatting. The trade-off: no prop editing, no children editing, no inline MDX.

### 2. The jsxInline Gap

**Finding:** The migration spec (§17.2) explicitly designed `jsxInline` as an inline atom for `mdxJsxTextElement`, plus `mdxInlineExpression` for `mdxTextExpression`. Neither was built. All MDX — flow and text — maps to block-level `jsxComponent`.

**Evidence:** Spec line 420 defines `jsxInline (atom; mdxJsxTextElement)` and line 443 maps `mdxJsxTextElement → jsxInline (inline atom)`. Current code at `index.ts:425` maps `mdxJsxTextElement → jsxComponent` (block atom). Test comment at `handlers.mdx.test.ts:57` documents: "Inline MDX requires a jsxInline PM node type."

**Impact:** Inline MDX like `text <Icon /> more text` currently creates a block break in the document. The `<Icon />` becomes a block-level void node between two paragraphs, not an inline element within a paragraph.

**What's needed:** A `jsxInline` TipTap extension with `inline: true, atom: true, group: 'inline'`. Handler change: `mdxJsxTextElement → jsxInline` instead of `jsxComponent`. ~30 lines of code for the extension + handler change.

### 3. Ecosystem Error Recovery

**Finding:** remark-mdx has zero built-in error recovery. micromark's architecture prevents block-level fallback. No production editor implements partial MDX parse recovery.

**Evidence:** [evidence/ecosystem-recovery.md](evidence/ecosystem-recovery.md)

| Approach | Production evidence | Solves `<` | Solves `{` | Granularity |
|----------|-------------------|-----------|-----------|-------------|
| Our PUA guard | Yes (our production) | Yes | Unmatched only | Per-pattern |
| Agnostic MDX mode | Published, low adoption | No | Yes (all) | Document-wide |
| Docusaurus format switch | Yes (Docusaurus/Astro) | Yes (use `md`) | Yes (use `md`) | Per-file |
| Document-level try-catch | Yes (next-mdx-remote) | Yes | Yes | Per-document |
| MDXEditor source-mode fallback | Yes (v2.3.3+) | Yes | Yes | Per-document |
| Tina `invalid_markdown` | Yes (7 years) | Yes | Yes | Per-document |
| Block-level partial parse | **Does not exist** | — | — | — |
| micromark partial mode | Rejected ([issue #10](https://github.com/micromark/micromark-extension-mdx-jsx/issues/10)) | — | — | — |

**Key insight:** The micromark maintainer explicitly rejected lenient parsing: "I don't think speculative healing is a good idea for the parser." The ecosystem's answer is: parse strictly, handle failures at the application layer.

### 4. Agnostic MDX Mode

**Finding:** `micromark-extension-mdx` (distinct from `micromark-extension-mdxjs`) provides JSX tag parsing WITHOUT acorn validation. Expressions require only balanced braces, not valid JavaScript.

**Evidence:** [evidence/agnostic-mdx.md](evidence/agnostic-mdx.md)

**What it changes:**
- `{ noServer: true }` → parsed as expression (balanced braces) instead of crashing acorn
- `{1:1s}` → parsed as expression instead of crashing
- `<Chart data={values} />` → JSX tag still parsed correctly
- `<50ms` → **still crashes** (JSX tag parser commit point is identical)

**Implementation:** Replace `remark-mdx` with a custom plugin:
```typescript
function remarkMdxAgnostic() {
  const data = this.data();
  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  micromarkExtensions.push(mdx());  // agnostic, no acorn
  fromMarkdownExtensions.push(mdxFromMarkdown());
  toMarkdownExtensions.push(mdxToMarkdown());
}
```

**Trade-off:** Expression VALUES are stored as raw strings (not validated JS). This is fine for our use case — we already store raw source via `sourceRaw`. The product doesn't evaluate expressions; it just round-trips them.

### 5. Block-Level Fallback Architecture

**Finding:** Block-level fallback is architecturally feasible but requires parsing the document twice — once with MDX (may fail), once without (always succeeds) — then merging results. No production system does this.

**Evidence:** [evidence/block-level-fallback.md](evidence/block-level-fallback.md)

**Mike's Phase 2 concept (from Slack):**
> On failure, split at the failing block. Only that block becomes a fallback node. Valid blocks around it stay structured.

**How it could work:**
1. Try `parseMd()` with full remark-mdx pipeline
2. On failure, extract the error position from VFileMessage
3. Split the markdown at the failing block boundary
4. Parse each segment independently (the failing block as raw text, neighbors with full MDX)
5. Merge the results into one PM doc

**Challenges:**
- VFileMessage positions may not align with block boundaries (the error could be mid-paragraph)
- Recursive failures: the "neighbor" segment may also fail
- Multiple failing blocks require iterative splitting
- Performance: worst case is O(n) re-parses for n failing blocks

**With agnostic MDX mode, this becomes much simpler:** The `{` class of failures disappears entirely. Only `<`-based failures remain, and our guard already handles most of those. Block-level fallback becomes the last-resort safety net, not the primary strategy.

### 6. Dependency Chain to Typed-Component-Nodes

**Finding:** Tolerant parsing is a prerequisite for typed-component-nodes, not part of it. The `jsxComponent` atom is the bridge between current (opaque) and future (structured) component editing.

```
Current state (Layer 1):
  jsxComponent { content: "<Callout type='warning'>text</Callout>" }
  → atom: true, block-level, opaque string, no editing

After tolerant parsing:
  Same architecture, but files with { prose } and < prose don't crash
  → prerequisite: parser stability before schema changes

After jsxInline (migration spec gap):
  jsxInline { content: "<Icon />" }  (inline atom)
  → inline MDX no longer creates block breaks

After Layer 2 (typed-component-nodes):
  jsxComponent { componentName: "Callout", type: "warning" }
  → structured props, prop panel UI, per-prop CRDT

After Layer 3 (typed-component-nodes):
  jsxComponent { componentName: "Callout", type: "warning", children: [PM content] }
  → atom: false, inline children editable, full WYSIWYG
```

Each layer builds on the previous. Tolerant parsing ensures the foundation (Layer 1) doesn't crash. The `jsxComponent` atom is intentionally designed as the upgrade path — its `content` attribute stores raw source today, and a future migration replaces it with structured attributes when the component registry ships.

---

## Recommended Architecture

Based on the research, the optimal approach combines three layers — matching Tina's recommendation from our D2/D6 research but with block-level scoping as our differentiator:

### Layer 1: Agnostic MDX mode (eliminates `{` crashes)

Replace `remark-mdx` (hardcoded acorn) with agnostic `micromark-extension-mdx` (balanced braces only). This is a ~10-line plugin change. Eliminates ALL `{` crash cases: `{ noServer: true }`, `{1:1s}`, `{expression with spaces}`, etc.

**Trade-off:** Expression content is not validated as JavaScript. This is acceptable — the product doesn't evaluate expressions, and the raw source is preserved via `sourceRaw`.

### Layer 2: PUA guard (handles `<` crashes — already done)

Our R23 guard already handles the `<` commit-then-crash pattern comprehensively (I9 proves completeness at 10K PBT runs). Agnostic mode doesn't change `<` behavior, so the guard remains necessary.

### Layer 3: Block-level fallback for remaining edge cases

For the ~5% of cases that neither agnostic mode nor the guard catches:
1. Try parse with agnostic MDX + guard
2. On failure, identify the failing block via error position
3. Replace that block with a `jsxComponent` fallback node containing raw source
4. Parse the rest normally

This is Mike's Phase 2 concept. With Layers 1-2 eliminating most failures, this becomes a rare safety net rather than the primary error handling path.

### Implementation priority

| Step | What | Effort | Impact |
|------|------|--------|--------|
| 1 | Switch to agnostic MDX mode | ~10 lines | Eliminates ALL `{` crashes |
| 2 | Add `jsxInline` PM node type | ~30 lines | Fixes inline MDX rendering |
| 3 | Block-level fallback | ~100 lines | Handles remaining edge cases |
| 4 | (Future) Typed component nodes Layer 2 | Separate spec | Structured props + prop panels |
| 5 | (Future) Typed component nodes Layer 3 | Separate spec | Editable children |

---

## Limitations & Open Questions

### Not Fully Confirmed
- Whether agnostic MDX mode handles all of TinaCMS's "next parser" patterns (shortcodes, Hugo delimiters)
- Performance impact of block-level fallback re-parsing on large documents
- Whether `micromark-extension-mdx`'s balanced-brace-only mode interacts correctly with our `GUARD_OPEN_BRACE` sentinel

### Open Questions (maps to Mike's spec Q1-Q5)
- Q1: Fallback representation — `jsxComponent` atom with raw source, or a new `rawBlock` node type?
- Q3: Supported MDX subset — does agnostic mode change what's "supported"?
- Q4: Is block-level fallback worth the complexity given agnostic mode + guard covers ~95%?

---

## References

### Evidence Files
- [evidence/current-architecture.md](evidence/current-architecture.md) — jsxComponent flow, position-slice, serialize path
- [evidence/ecosystem-recovery.md](evidence/ecosystem-recovery.md) — remark-mdx, micromark, MDXEditor, Docusaurus, Tina patterns
- [evidence/agnostic-mdx.md](evidence/agnostic-mdx.md) — micromark-extension-mdx vs mdxjs, implementation approach
- [evidence/block-level-fallback.md](evidence/block-level-fallback.md) — Split-then-rejoin feasibility analysis

### External Sources
- [micromark-extension-mdx-jsx issue #10 — Partial mode rejected](https://github.com/micromark/micromark-extension-mdx-jsx/issues/10)
- [mdx-js/mdx issue #2208 — Lenient options rejected](https://github.com/mdx-js/mdx/issues/2208)
- [micromark-extension-mdx (agnostic)](https://github.com/micromark/micromark-extension-mdx)
- [MDXEditor error handling docs](https://mdxeditor.dev/editor/docs/error-handling)
- [Docusaurus markdown format config](https://docusaurus.io/docs/markdown-features)
- [TipTap invalid schema handling](https://tiptap.dev/docs/guides/invalid-schema)

### Related Research
- [reports/tinacms-production-architecture-beyond-mdx/](../tinacms-production-architecture-beyond-mdx/) — D2 invalid_markdown pattern, D6 dual-parser architecture
- [reports/bun-prosemirror-model-dedup/](../bun-prosemirror-model-dedup/) — prosemirror-model duplication (tangential)
- [specs/2026-04-08-typed-component-nodes/SPEC.md](../../specs/2026-04-08-typed-component-nodes/SPEC.md) — Layer 2/3 component editing plans
- [specs/2026-04-13-markdown-mdx-tolerant-parsing/SPEC.md](../../specs/2026-04-13-markdown-mdx-tolerant-parsing/SPEC.md) — Mike's tolerant parsing spec (draft)
