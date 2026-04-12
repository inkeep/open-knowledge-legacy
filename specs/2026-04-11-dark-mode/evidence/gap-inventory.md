---
title: Dark-mode CSS and component gap inventory
description: Exhaustive list of every surface in packages/app that will not theme correctly when `.dark` is applied, with file:line, severity, and proposed fix.
sources:
  - packages/app/src/globals.css
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/presence/PresenceBar.tsx
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx
  - packages/app/src/components/icons/claude.tsx
type: factual
---

# Gap inventory

Severity legend: HIGH = visible failure (unreadable / invisible / inverted contrast). MEDIUM = subtle contrast or polish issue. LOW = defensive / unlikely-to-render.

## HIGH severity (custom node views with hardcoded styles — added after audit)

| # | File:line | Issue | Proposed fix |
|---|---|---|---|
| H-A | `editor/Callout.tsx:1-5,20` | Pastel hex backgrounds (`#fff3cd` warning, `#cff4fc` info, `#f8d7da` error, `#f0f0f0` default) hardcoded as **inline styles** — cannot be overridden by `.dark` selectors | Refactor: move color map out of inline `style`, use Tailwind classes (`bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200`, etc.) on the wrapper |
| H-B | `editor/extensions/JsxComponentView.tsx:34` | `backgroundColor: '#f0f0f0'` inline on unknown-component fallback | Refactor inline style to Tailwind: `bg-muted dark:bg-muted/40` |
| H-C | `editor/extensions/WikiLinkView.tsx:61-63` | Resolved chip `bg-sky-50 text-sky-900 border-sky-200`; unresolved chip `bg-red-50 text-red-700 border-red-300 hover:bg-red-100` — all light-only Tailwind utilities, no `dark:` variants. Wikilinks are a primary product surface. | Add dark variants: resolved → `dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800`; unresolved → `dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-950/60` |
| H-D | `components/CreatePageDialog.tsx:86` (per audit) | `text-red-600` error message | Add `dark:text-red-400` |

## HIGH severity (CSS / SourceEditor)

| # | File:line | Issue | Proposed fix |
|---|---|---|---|
| 1 | `globals.css:228` | `.collaboration-cursor__label { color: #fff; }` — TipTap remote cursor label hardcoded white | Acceptable IF label background is always a saturated user color; verify on dark theme |
| 2 | `globals.css:254` | `.cm-ySelectionInfo { color: #fff; }` — CodeMirror remote cursor label hardcoded white | Same as above |
| 3 | `globals.css:75-113, 580` | Agent-flash and breathing keyframes use `rgba(217,119,87, 0.04..0.14)` as background tint — terracotta at low alpha disappears on dark canvas | Increase alpha on dark, OR define `.dark` keyframe overrides with stronger opacity (e.g. 0.18-0.30) |
| 4 | `globals.css:423-428` | `.ProseMirror blockquote { border-left: 3px solid var(--color-gray-300); color: var(--color-gray-600); }` — light-only grays | Add `.dark` selector with `border-color: var(--color-gray-600); color: var(--color-gray-300);` (or `dark:` utilities if migrated to `@apply`) |
| 5 | `globals.css:431-440` | `.ProseMirror pre { background: var(--color-gray-100); }` — near-white code block | `.dark .ProseMirror pre { background: var(--color-gray-900); }` |
| 6 | `globals.css:443-449` | `.ProseMirror code { background: var(--color-gray-100); }` — same | `.dark .ProseMirror code { background: var(--color-gray-900); }` (use `--color-gray-800` if `--muted` reads better) |
| 7 | `globals.css:472-475` | `.ProseMirror hr { border-top: 1px solid var(--color-gray-200); }` — invisible line on dark | `.dark .ProseMirror hr { border-color: var(--color-gray-700); }` |
| 8 | `globals.css:500-507` | `.ProseMirror th, .ProseMirror td { border: 1px solid var(--color-gray-200); }` | `.dark` override → `var(--color-gray-700)` |
| 9 | `globals.css:509-513` | `.ProseMirror th { background: var(--color-gray-50); }` — table headers near-white | `.dark` override → `var(--color-gray-900)` |
| 10 | `editor/SourceEditor.tsx:34-47` | CodeMirror EditorState has no theme — `basicSetup` defaults to white background | Install `@codemirror/theme-one-dark`, swap theme based on resolved theme via `useTheme()` |
| 11 | `editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx:70` (per audit) | Hardcoded `text-amber-700` for error display — too dark on dark | `text-amber-700 dark:text-amber-300` |

## MEDIUM severity

| # | File:line | Issue | Proposed fix |
|---|---|---|---|
| 12 | `globals.css:372-373` | TaskList checkbox `border: 1.5px solid var(--color-gray-400)` | `.dark` override → `var(--color-gray-600)` |
| 13 | `globals.css:418-419` | Strikethrough `color: var(--color-gray-400)` on completed task | `.dark` override → `var(--color-gray-500)` |
| 14 | `globals.css:460-469` | Links: `color: var(--color-azure-blue)` (#3784ff), hover `var(--color-azure-600)` darker | Test contrast; likely add `.dark` override → `var(--color-sky-blue)` for base, `var(--color-azure-300)` for hover |
| 15 | `globals.css:519-528` | `.selectedCell::after { background: var(--color-azure-100); opacity: 0.4 }` — table cell selection | `.dark` override → `var(--color-azure-800)` or `var(--color-azure-900)` at higher opacity |
| 16 | `globals.css:530-539` | `.column-resize-handle { background-color: var(--color-azure-400); }` | Probably OK on dark; verify visually |
| 17 | `presence/PresenceBar.tsx` (sync indicator) | Hardcoded hex `#f59e0b`, `#22c55e`, `#ef4444` for sync states | These are saturated enough to pass on both themes; verify |
| 18 | `presence/PresenceBar.tsx` (agent badge text) | `text-white` on `bg-agent` (terracotta) | OK contrast on terracotta in both modes |
| 19 | `editor/TiptapEditor.tsx:32` (cursor caret) | `border-color: user.color` (HUMAN_COLORS pastels from core `identity.ts`) | Pastels low-contrast on dark — accept for v1 OR derive contrast-adjusted variant; track in Future Work |

## LOW severity

| # | File:line | Issue | Proposed fix |
|---|---|---|---|
| 20 | `components/icons/claude.tsx:24` | `<rect width="24" height="24" fill="white" />` inside clip-path mask | Cosmetic; not visible in normal use; leave |

## Brand color tokens — not gaps directly

`globals.css:38-47` defines brand hexes (`--color-azure-blue`, `--color-morning-mist`, `--color-night-sky`, etc.). These are intended as *fixed brand values*, not theme-responsive — gaps appear only when they are *applied to surfaces* (catalogued above as #14, #15).

## Components confirmed already dark-ready

shadcn primitives (button, badge, input, toggle, popover, dropdown-menu, tooltip, separator, sheet, skeleton, sidebar, resizable, toggle-group), bubble menu containers, slash command menu, wiki-link suggestion container (except error text), file sidebar, editor header — all use semantic tokens that respond to `.dark`.
