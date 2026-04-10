---
type: evidence
source: empirical-testing
date: 2026-04-03
packages:
  - remark-mdx@3.1.1
  - remark-parse@11.x
  - remark-stringify@11.x
  - remark-frontmatter@5.x
  - unified@11.x
node: v22.18.0
---

# Round-Trip Test Results

## Summary

23 edge cases tested. 14 passed byte-identical. 9 produced differences.
Most normalizations converge after 1 pass. One CRITICAL defect does not converge.

## PASSING (byte-identical round-trip)

| Case | Input |
|------|-------|
| self-closing spaced | `<Chart />` |
| blank-line-before-jsx | `# Heading\n\n<Callout>...` |
| import-statement | `import { Chart } from './Chart'` |
| import-default | `import Chart from './Chart'` |
| import-with-newline | import + blank + heading |
| export-const | `export const meta = { title: 'Test' }` |
| inline-jsx-mixed | `Hello <Badge>world</Badge> and...` |
| boolean-attr | `<Callout collapsed>` |
| spread-attr | `<Comp {...props} />` |
| fragment | `<>content</>` |
| attr-special-chars | `src="https://...?a=1&b=2"` |
| complex-expr-attr | `data={{ x: 1, y: 2 }}` |
| jsx-in-blockquote | `> <Callout>...` |
| import-export-content | import + export + content |
| member-expr-name | `<Foo.Bar baz="qux" />` |
| code-in-jsx | code block inside `<Tab>` |
| comment-expr | `{/* comment */}` |
| deep nesting | `<A><B><C>text</C></B></A>` |

## NORMALIZATIONS (converge after 1 pass)

### 1. Self-closing spacing: `<Chart/>` -> `<Chart />`
- Pass 0: `<Chart/>`
- Pass 1: `<Chart />`
- Pass 2: `<Chart />` (stable)
- **Source**: serializer always adds space before `/>`
- **Config**: `tightSelfClosing: true` option available to suppress

### 2. Quote normalization: `type='warning'` -> `type="warning"`
- Single quotes normalized to double quotes
- Converges in 1 pass
- **Config**: `quote: "'"` option available

### 3. Empty elements to self-closing: `<div></div>` -> `<div />`
- Named elements with no children become self-closing
- Converges in 1 pass
- **Code path**: `mdxElement()` line 559-560: `const selfClosing = node.name ? !node.children || node.children.length === 0 : false`
- Fragments (`<></>`) are NOT self-closed

### 4. Multiple blank lines collapsed: `\n\n\n\n` -> `\n\n`
- Standard markdown normalization (not MDX-specific)
- Converges in 1 pass

### 5. Trailing whitespace stripped: `<Callout>  ` -> `<Callout>`
- Trailing spaces on JSX opening tags removed
- Converges in 1 pass

### 6. Missing blank line inserted: `# Heading\n<Callout>` -> `# Heading\n\n<Callout>`
- Serializer always inserts blank line between flow-level siblings
- Converges in 1 pass

### 7. List bullet normalization: `-` -> `*`
- Default remark-stringify uses `*` for unordered lists
- Converges in 1 pass
- **Config**: `bullet: '-'` option available on remark-stringify

### 8. Expression child flow expansion: `<Comp>{value}</Comp>` -> `<Comp>\n  {value}\n</Comp>`
- Single-line flow JSX with expression child gets expanded to multiline
- This happens because the parser creates `mdxFlowExpression` as a block child
- Converges in 1 pass, but changes git diff significantly

## CRITICAL DEFECT: Indentation drift on template literals

### Not converging - grows indefinitely

```
Pass 0: {`link:\ntitle: front page`}
Pass 1: {`link:\n    title: front page`}     (+4 spaces)
Pass 2: {`link:\n      title: front page`}   (+2 more)
Pass 3: {`link:\n        title: front page`} (+2 more)
```

### Root cause (source-code traced)

Two indent operations compound:

1. **mdast-util-mdx-expression** `handleMdxExpression()` at lib/index.js:112-118:
   ```js
   state.indentLines(value, function (line, index, blank) {
     return (index === 0 || blank ? '' : '  ') + line
   })
   ```
   Adds 2-space indent to all continuation lines of the expression value.

2. **mdast-util-mdx-jsx** `containerFlow()` at lib/index.js:735-740:
   ```js
   state.indentLines(result, function (line, _, blank) {
     return (blank ? '' : currentIndent) + line
   })
   ```
   Adds parent-depth indent to all non-blank lines of child content.

On each round-trip, the expression value gains 2 spaces on continuation lines because:
- Parse captures the raw value including the 2-space indent from the previous serialization
- Serialize re-adds 2-space indent to continuation lines
- Net: +2 spaces per round-trip on multiline expression values

### Impact for CRDT editor
This is a **blocking issue** for any system that round-trips MDX through
parse/serialize cycles. Template literals with newlines will corrupt on every save.

### Workaround
Strip indent from expression values before serialization, or normalize the AST
post-parse to remove the indentation that was added by the previous serialize pass.

### GitHub issue
mdx-js/mdx#2533 (closed, response was "won't fix" / "expected behavior")
