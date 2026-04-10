---
type: evidence
source: github-issues
date: 2026-04-03
repos_searched:
  - mdx-js/mdx
  - syntax-tree/mdast-util-mdx-jsx
---

# Relevant GitHub Issues for CRDT Round-Trip

## CRITICAL: Indentation drift on multiline expressions
- **mdx-js/mdx#2533** (CLOSED, won't fix)
- Template literals inside JSX gain 2 spaces per round-trip on continuation lines
- Upstream says "expected behavior" - indent is part of serialization formatting
- This is a CRDT-blocking issue requiring a workaround in our layer

## OPEN: Adjacent expressions create spurious newline
- **mdx-js/mdx#2653** (OPEN)
- `{props.foo} {props.bar}` at block level creates newline child instead of space
- Affects expression interpolation in block context
- Not yet resolved

## CLOSED (fixed): Extraneous indent for inline JSX in flow JSX
- **syntax-tree/mdast-util-mdx-jsx#9** (CLOSED, fixed)
- Was: `<div>Lorem <span>dolor</span></div>` gained extra spaces on round-trip
- Fixed in mdast-util-mdx-jsx - the containerFlow indent was applying to
  mdxJsxTextElement serialization results

## CLOSED (won't fix): Leading spaces in multiline props removed
- **mdx-js/mdx#2574** (CLOSED, won't fix)
- Multiline attribute expressions have leading spaces stripped (2 per indent)
- This is the PARSE side of the indent drift - micromark strips indent during parse
- Combined with the serialize side adding indent back, creates the drift

## CLOSED (fixed): Line breaks in block JSX create unexpected whitespace
- **mdx-js/mdx#843** (CLOSED, fixed)
- Historical issue about whitespace handling in block JSX children
- Relevant because it established the current behavior of newline handling

## RFC: Interleaving Markdown in JSX
- **mdx-js/mdx#628** (CLOSED, implemented in v2)
- This RFC established the blank-line rule for markdown inside JSX
- Key design decision: blank lines inside JSX trigger markdown parsing
- Without blank lines, content is treated as raw text
- This is now the standard behavior we depend on

## Summary for CRDT Design

| Issue | Impact | Status | Workaround Needed |
|-------|--------|--------|-------------------|
| #2533 indent drift | CRITICAL - data corruption | Won't fix | YES - strip/normalize indent |
| #2653 adjacent exprs | MEDIUM - whitespace | Open | Maybe - normalize whitespace |
| #2574 space stripping | LOW - parse-side of #2533 | Won't fix | Covered by #2533 fix |
| #843 whitespace | NONE - already fixed | Fixed | No |
| #628 markdown in JSX | DESIGN - current behavior | Implemented | No - design around it |
