---
title: Reference implementation — @inkeep/agents agents-manage-ui dark mode
description: How the reference Next.js app does dark mode (next-themes provider config + theme-toggle component) and what we mirror vs adapt for the Vite SPA.
sources:
  - /Users/andrew/Documents/code/agents/agents/agents-manage-ui/src/app/layout.tsx
  - /Users/andrew/Documents/code/agents/agents/agents-manage-ui/src/components/theme-toggle.tsx
  - /Users/andrew/Documents/code/agents/agents/agents-manage-ui/src/app/globals.css
  - /Users/andrew/Documents/code/agents/agents/agents-manage-ui/package.json
type: factual
---

# Reference: agents-manage-ui dark mode

## Provider configuration

`src/app/layout.tsx:80-85`:
```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
```

Body element wraps with `suppressHydrationWarning` (`layout.tsx:78`) — Next-specific; not needed in our Vite SPA.

`package.json`: `"next-themes": "^0.4.6"`.

## Toggle component

`src/components/theme-toggle.tsx`:
- Three-state dropdown: `light` / `dark` / `system`, icons Sun / Moon / Monitor (lucide-react).
- Trigger button: ghost variant, size icon, swaps Sun/Moon via `dark:hidden` / `not-dark:hidden`.
- Uses `setTheme` from `useTheme()`.

## Tailwind v4 dark variant

`src/app/globals.css:7`:
```css
@custom-variant dark (&:is(.dark *));
```

Identical to open-knowledge — same Tailwind v4 idiom.

## What we mirror

- Three-state model with `system` default
- `attribute="class"`, `enableSystem`, `disableTransitionOnChange` provider config
- Exact `theme-toggle.tsx` UI (Sun visible in light / Moon visible in dark, dropdown of three options with icons)

## What we adapt for Vite SPA

- **No `<html lang>` / `<body>` JSX** — `index.html` is static. We mount `<ThemeProvider>` inside `main.tsx` around `<App />`.
- **No `suppressHydrationWarning`** — there's no SSR hydration to suppress.
- **FOUC strategy** — `next-themes` injects an inline script via Next's Document for SSR. In Vite SPA, we hand-write the equivalent inline script in `index.html` (reads `localStorage`, applies `.dark` to `<html>` before React mounts).
- **Storage key** — `next-themes` defaults to `theme`. Set explicitly via `storageKey="ok-theme-v1"` to namespace and allow future migrations.

## next-themes in non-Next environments

`next-themes` v0.4.x exports `ThemeProvider` and `useTheme` from the package root with no Next.js runtime dependency. Confirmed by import paths in agents-manage-ui (`import { ThemeProvider } from 'next-themes'`). Works in any React app provided the consumer:
1. Renders `<ThemeProvider>` once at the top of the React tree.
2. Optionally injects an inline FOUC script before the React bundle loads.

The package's own README documents non-Next usage.
