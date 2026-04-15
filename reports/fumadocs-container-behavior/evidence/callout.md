# Callout — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/callout.js`

## Architecture

Pure render component. No `'use client'` directive (SSR-compatible). No Radix primitives.

## Children handling

```js
export function Callout({ children, title, ...props }) {
    return (_jsxs(CalloutContainer, { ...props,
      children: [
        title && _jsx(CalloutTitle, { children: title }),
        _jsx(CalloutDescription, { children: children })
      ]
    }));
}
```

**Pure pass-through.** `children` go into `CalloutDescription` which is a styled `<div>`.

### CalloutContainer (callout.js:15-28)
```js
export function CalloutContainer({ type: inputType = 'info', icon, children, className, style, ...props }) {
    const type = resolveAlias(inputType);
    return (_jsxs("div", {
      className: cn('flex gap-2 my-4 rounded-xl border bg-fd-card p-3 ps-1 text-sm text-fd-card-foreground shadow-md', className),
      style: {
        '--callout-color': `var(--color-fd-${type}, var(--color-fd-muted))`,
        ...style,
      },
      // icon picker + children
    }));
}
```

## Dependencies

- `cn()` utility (class merging)
- Icon components from `../icons.js` (Info, TriangleAlert, CircleX, CircleCheck, Sun) — inline SVGs
- CSS custom properties: `--color-fd-card`, `--color-fd-card-foreground`, `--color-fd-info`, `--color-fd-warning`, `--color-fd-error`, `--color-fd-success`, `--color-fd-idea`, `--color-fd-muted`

## In-Editor Behavior Prediction

**Prediction: WORKS structurally, BUT unstyled** ⚠️

1. No children filtering, no context requirements ✅
2. No Radix dependencies ✅
3. No framework provider requirements ✅
4. BUT: uses `--color-fd-*` CSS variables which are NOT defined in our editor ⚠️
5. The callout will render with correct structure but transparent/missing colors

## Context Requirements: NONE

No router, no layout context, no framework provider. Pure presentational.

## Confidence: HIGH
