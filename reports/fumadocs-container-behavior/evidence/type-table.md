# TypeTable — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/type-table.js`

## Architecture

Client component (`'use client'`). Uses Radix Collapsible for expandable prop rows. Uses `fumadocs-core/link` (which requires FrameworkProvider for href links).

## Props-driven, no children

```js
export function TypeTable({ type }) {
    return (_jsxs("div", {
      className: "... bg-fd-card text-fd-card-foreground ...",
      children: [
        /* header row */,
        Object.entries(type).map(([key, value]) => (_jsx(Item, { name: key, item: value }, key)))
      ]
    }));
}
```

**TypeTable takes a `type` prop (object of type definitions), not children.** It iterates over entries and renders `Item` components for each.

### Item component
Uses `Collapsible` (Radix-based) for expand/collapse per-row. Uses `Link` from `fumadocs-core/link` for `typeDescriptionLink` prop.

## In-Editor Behavior Prediction

**Prediction: WORKS if props are provided correctly** ⚠️

1. No children filtering — data-driven rendering from `type` prop ✅
2. Radix Collapsible for per-row expand — context-based, works in any React tree ✅
3. `fumadocs-core/link` used for `typeDescriptionLink` — if href is external, renders `<a>`. If internal, requires FrameworkProvider ⚠️
4. CSS variables: `bg-fd-card`, `text-fd-card-foreground`, `fd-scroll-container` — needs fumadocs CSS ⚠️

## Confidence: HIGH

TypeTable is a leaf component (no container children). Its complexity is in the prop shape, not in React tree manipulation.
