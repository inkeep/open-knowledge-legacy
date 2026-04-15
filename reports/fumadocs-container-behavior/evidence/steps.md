# Steps — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/steps.js`

## Full Source (8 lines)

```js
import { jsx as _jsx } from "react/jsx-runtime";
export function Steps({ children }) {
    return _jsx("div", { className: "fd-steps", children: children });
}
export function Step({ children }) {
    return _jsx("div", { className: "fd-step", children: children });
}
```

## Children handling

**Zero filtering. Zero introspection. Pure pass-through.**

- `Steps` renders a `<div className="fd-steps">` with `{children}` — nothing else.
- `Step` renders a `<div className="fd-step">` with `{children}` — nothing else.
- No React context. No Radix primitives. No `React.Children` manipulation.
- All visual styling (numbered step indicators, vertical lines) is done via CSS — the `fd-steps` and `fd-step` classes use CSS counters and `::before`/`::after` pseudo-elements.

## In-Editor Behavior Prediction

```
<Steps>
  <NodeViewWrapper>
    <Step>Step 1 content</Step>
  </NodeViewWrapper>
  <NodeViewWrapper>
    <Step>Step 2 content</Step>
  </NodeViewWrapper>
</Steps>
```

**Prediction: WORKS PERFECTLY** ✅

1. No type checking, no context — just `{children}` pass-through ✅
2. CSS counter styling depends on `.fd-step` class being on elements inside `.fd-steps` — NodeViewWrapper doesn't break CSS descendant selectors ✅

**Caveat:** If the CSS uses direct child selectors (`.fd-steps > .fd-step`), NodeViewWrapper breaks the selector chain. Need to check the actual CSS.

## CSS Dependency Check Required

The `fd-steps` / `fd-step` classes are likely defined in fumadocs-ui's `style.css` or `css/` directory. The styling mechanism (CSS counters, borders, step numbering) needs to be verified — if it uses `>` direct child combinator, NodeViewWrapper breaks it.

## Confidence: HIGH (component logic), MEDIUM (CSS — needs stylesheet verification)

Simplest container component. Zero risk from React perspective. Only CSS selector specificity is a potential issue.
