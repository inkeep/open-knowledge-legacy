---
title: Existing dark-mode token infrastructure in packages/app
description: Catalog of `.dark` token block, `@custom-variant` setup, and existing `dark:` utility usage already present in the editor SPA before this spec.
sources:
  - packages/app/src/globals.css
type: factual
---

# Existing dark-mode token infrastructure

## Tailwind v4 dark variant (already configured)

`packages/app/src/globals.css:8`:
```css
@custom-variant dark (&:is(.dark *));
```

This means any descendant of an element with class `dark` (typically `<html>`) gets `dark:*` utility classes applied. **Activation requires only adding `.dark` to `<html>`** — no Tailwind config change.

## Full `.dark` semantic token block

`packages/app/src/globals.css:710-742` defines dark variants for every shadcn semantic token:
- background, foreground
- card, card-foreground
- popover, popover-foreground
- primary (= `var(--color-sky-blue)` in dark), primary-foreground
- secondary, secondary-foreground
- muted, muted-foreground
- accent, accent-foreground
- destructive
- border, input, ring
- chart-1..5
- sidebar, sidebar-foreground, sidebar-primary, sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border, sidebar-ring

Light defaults at `globals.css:672-708` (`:root`).

## Components/styles already opted into dark via `dark:` classes

| Surface | Location | What's already dark-aware |
|---|---|---|
| ProseMirror body text | `globals.css:287` | `text-gray-800 dark:text-white/80` |
| ProseMirror highlight mark | `globals.css:296` | `bg-amber-100 dark:bg-amber-900/50` |
| Empty paragraph placeholder | `globals.css:550` | `text-muted-foreground/60` (semantic) |
| Subtle scrollbar | `globals.css:616` | `dark:scrollbar-thumb-muted-foreground/50` |
| shadcn UI primitives (`button`, `badge`, `input`, `toggle`, etc.) | `packages/app/src/components/ui/*` | All use semantic tokens; ready |
| Sidebar (`Sidebar`, `FileSidebar`) | `packages/app/src/components/ui/sidebar.tsx`, `FileSidebar.tsx` | Uses `bg-sidebar`, `text-sidebar-foreground` semantic tokens |
| Bubble menu, slash command menu, wiki-link menu | `editor/bubble-menu/*`, `editor/slash-command/SlashCommandMenu.tsx`, `editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx` | Use `bg-popover`, `bg-background`, `bg-accent` — semantic |

## Mechanism gaps (no infrastructure to activate)

1. No `ThemeProvider` in `packages/app/src/main.tsx`.
2. No theme-toggle UI anywhere.
3. No persistence (no `localStorage` reads/writes for theme).
4. No `prefers-color-scheme` listener.
5. No code adds/removes `.dark` on `<html>`.
6. `packages/app/index.html` has no `color-scheme` meta and no inline FOUC-prevention script.
7. `next-themes` not in `packages/app/package.json` dependencies.

## Observation

Because tokens are already in place and most components use semantic classes, the bulk of dark-mode work is **mechanism + targeted CSS gap-fill**, not theme design.
