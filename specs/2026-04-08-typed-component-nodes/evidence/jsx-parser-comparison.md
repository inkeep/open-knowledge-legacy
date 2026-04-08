---
title: JSX Parser Options Comparison
description: Bundle size, capability, and trade-off analysis for @babel/parser vs acorn+acorn-jsx vs custom regex parser for parsing JSX component strings.
created: 2026-04-08
last-updated: 2026-04-08
---

## Bundle Size Comparison

| Library | Minified | Gzipped | Tree-shakeable |
|---------|----------|---------|----------------|
| @babel/parser | 475 KB | 148 KB | Limited |
| acorn + acorn-jsx | 58+15 KB | ~23 KB | Yes |
| Custom regex/state-machine | ~2-5 KB | ~1-2 KB | Yes |

## Capability Comparison

| Capability | @babel/parser | acorn+acorn-jsx | Custom regex |
|------------|--------------|-----------------|--------------|
| Self-closing tags | Yes | Yes | Yes |
| Boolean props | Yes | Yes | Yes |
| String props | Yes | Yes | Yes |
| Expression props (`{42}`) | Yes | Yes | Limited |
| Complex expressions (`{fn()}`) | Yes | Yes | No |
| Multi-line opening tags | Yes | Yes | Fragile |
| Nested JSX in children | Yes | Yes | **No** |
| Markdown in children | Yes | Yes | Yes |
| Requires wrapper for bare JSX | Yes (`<>...</>`) | Yes (`<>...</>`) | No |

## Critical Edge Case: Nested JSX

```jsx
<Callout>
  <strong>Warning:</strong> Do this
</Callout>
```

Regex parsers match `</strong>` as the closing tag → incorrect parse. AST parsers (both babel and acorn) handle this correctly via proper nesting.

## Recommendation

**acorn + acorn-jsx** — best balance of correctness (real AST parser) and bundle size (6x smaller than babel). Handles all JSX patterns we need. Zero external dependencies beyond acorn itself.

The spec's original leaning toward @babel/parser was for correctness, but acorn provides identical correctness at 1/6 the bundle cost.
