# Evidence: Agnostic MDX Mode

**Dimension:** micromark-extension-mdx (no acorn) feasibility
**Date:** 2026-04-13
**Sources:** micromark-extension-mdx source, micromark-extension-mdxjs source, remark-mdx source

---

## Findings

### Finding: Two official MDX entry points exist — strict (mdxjs) and agnostic (mdx)
**Confidence:** CONFIRMED
**Evidence:** 
- [`micromark-extension-mdxjs`](https://github.com/micromark/micromark-extension-mdxjs) — hardcodes `acorn: Parser.extend(acornJsx())`
- [`micromark-extension-mdx`](https://github.com/micromark/micromark-extension-mdx) — calls `mdxExpression()` and `mdxJsx()` WITHOUT acorn

In agnostic mode:
- Expressions `{...}` require only balanced braces, not valid JS
- JSX attributes accept arbitrary values without acorn parsing
- JSX tag name parsing is identical (same commit-then-crash on `<`)

### Finding: remark-mdx hardcodes the strict version
**Confidence:** CONFIRMED
**Evidence:** remark-mdx source is 44 lines, imports `micromark-extension-mdxjs` (not `mdx`). No option to switch.

### Finding: Custom plugin can use agnostic mode
**Confidence:** CONFIRMED
**Evidence:** Maintainer confirmed in [issue #2208](https://github.com/mdx-js/mdx/issues/2208) that you can manipulate `data.micromarkExtensions` directly in custom remark plugins.

Implementation:
```typescript
import { mdx } from 'micromark-extension-mdx';
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx';

function remarkMdxAgnostic(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(mdx());
  (data.fromMarkdownExtensions ??= []).push(mdxFromMarkdown());
  (data.toMarkdownExtensions ??= []).push(mdxToMarkdown());
}
```

### Finding: Agnostic mode does NOT solve < crashes
**Confidence:** CONFIRMED
**Evidence:** `micromark-extension-mdx-jsx/factory-tag.js` — the tag parser's commit point (`<` + valid name character → commit, no backtrack) is shared between strict and agnostic modes. Only acorn validation inside expressions/attributes differs.
