---
title: FOUC prevention strategy for Vite SPA
description: How to prevent flash-of-light-content when loading the editor SPA with a dark theme preference, given there is no SSR.
sources:
  - packages/app/index.html
  - packages/app/src/main.tsx
  - packages/app/vite.config.ts (referenced)
type: factual
---

# FOUC prevention in Vite SPA

## Problem

`packages/app` is a Vite SPA. `index.html` is served statically by Hocuspocus (in CLI build) or Vite dev server. There is no SSR to inject a `class="dark"` attribute server-side.

Naive load order:
1. Browser parses `index.html`, applies CSS — light theme (no `.dark` class on `<html>`).
2. React bundle loads, `ThemeProvider` mounts, reads localStorage / system preference.
3. Effect adds `.dark` to `<html>`. Page repaints in dark.

The window between (1) and (3) shows a white flash for users who prefer dark. On fast hardware ~50-150ms; on slow connections, longer.

## Solution: inline FOUC script in index.html

Insert a tiny synchronous `<script>` in `<head>`, before any CSS or JS, that mirrors next-themes' resolution logic:

```html
<head>
  <meta name="color-scheme" content="light dark" />
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('ok-theme-v1') || 'system';
        var resolved = theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : theme;
        if (resolved === 'dark') {
          document.documentElement.classList.add('dark');
        }
        document.documentElement.style.colorScheme = resolved;
      } catch (e) {}
    })();
  </script>
  ...
</head>
```

Notes:
- `<meta name="color-scheme" content="light dark">` tells the UA that scrollbars, form controls, and `system-ui` colors should be theme-aware.
- The script must run *before* CSS is applied to avoid the flash. Place it as the first child of `<head>` (before `<link rel=...>` to CSS).
- `try/catch` because `localStorage` can throw in private mode or sandboxed iframes.
- Storage key `ok-theme-v1` matches what we'll pass to `<ThemeProvider storageKey="ok-theme-v1">`.
- `next-themes` stores the theme value as a **plain string** (e.g., `system`, `dark`, `light`) — NOT JSON-encoded. Read directly with `localStorage.getItem`; do not `JSON.parse`.

## Verification

Storage key compatibility verified by reading `next-themes@^0.4.6` source at `agents-manage-ui/node_modules/next-themes/dist/index.mjs`: `localStorage.setItem(storageKey, value)` writes the raw string; `localStorage.getItem(storageKey)` is consumed directly with no parse step. Our inline script must therefore also read the value as a plain string. (An earlier draft of this evidence file incorrectly claimed JSON.stringify; corrected after audit caught the discrepancy.)

## Alternative considered: skip FOUC script

Could skip the inline script if we accept a sub-second white flash for dark-mode users. Rejected because:
1. The flash is jarring and undermines the polish the rest of the editor invests in.
2. The fix is ~12 lines of inline script with zero runtime overhead.
3. The reference (next-themes in Next) gets FOUC prevention for free; not delivering it for our SPA would be a regression in user experience for the same product surface.

## Cross-tab sync

`next-themes` listens to `storage` events on `window` and updates the theme in all tabs when one tab changes preference. This is built-in. The inline FOUC script does not need to handle cross-tab sync — only initial load.
