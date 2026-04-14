---
name: Sidebar tree + existing color primitives
description: FileTree rendering, lucide icon color injection point, existing HSL/palette utils in core — facts for §6.4 and §6.2
sources:
  - packages/app/src/components/FileTree.tsx
  - packages/core/src/utils/identity.ts
  - packages/app/src/globals.css
  - packages/app/src/main.tsx
---

# Sidebar + color primitives

## FileTree (sidebar)
- File: `packages/app/src/components/FileTree.tsx` (495 lines)
- Input: flat `DocEntry[]` from `/api/documents` (FileTree.tsx:275)
- Built into a tree via `buildTree(documents)` (FileTree.tsx:418) → hierarchical `TreeNode { path, name, kind, children }`. Each node has its **full directory path** available.
- Folder icon: `lucide-react` `Folder` / `FolderOpen` (FileTree.tsx:94)
- Color today: `stroke="var(--color-muted-foreground)"` (FileTree.tsx:103, 134) — monochrome, theme-driven via CSS var.
- Folder button wrapper (FileTree.tsx:170-177) is a plain row — can accept a left border or background tint without layout disruption.

## Expansion state (relevant to persistence precedent)
- `userExpanded` and `userCollapsed` `Set`s on the component (FileTree.tsx:253-254)
- **Session-only** — NOT persisted. So FileTree is not a strong "persist UI state" precedent.

## Color primitive precedent
File: `packages/core/src/utils/identity.ts` (144 lines)
- Manual HSL converters: `hexToHsl()`, `hslToHex()` (lines 17-46)
- `deriveIconColor(hex)` (lines 52-55) — derives a darker readable fg from a pastel bg (hue preserved; L ≈ 32%, S ≈ 45%)
- Palette: `HUMAN_COLORS` — 7 pastel hex strings (lines 5-13) — used for presence avatars
- Generator: `generateRandomColor()` (line 96) picks from `HUMAN_COLORS`
- Persistence: `safeLocalStorageGet/Set()` (lines 107-143), keys `ok-user-name-v2` + `ok-user-color-v2`

**Reusability:** The directory-color helper can (a) reuse `hexToHsl`/`hslToHex`/`deriveIconColor` directly, and (b) follow the same "two-theme palette + helper" structural shape.

## Tailwind v4 config (in-CSS)
- `packages/app/src/globals.css` uses `@theme` directive (Tailwind v4; no JS config)
- Existing semantic tokens: `--color-agent`, `--color-azure-blue`, `--color-sky-blue`, `--color-muted-foreground`, azure-50..950 scale, gray-50..950 scale
- No categorical palette for directories exists. New tokens (if desired) go here.

## UI state persistence survey
| Concern | How persisted |
| --- | --- |
| Theme | `next-themes` → localStorage `ok-theme-v1` |
| User name / color | `identity.ts` `safeLocalStorageSet` → `ok-user-name-v2`, `ok-user-color-v2` |
| Panel widths | `react-resizable-panels` default (no explicit persistence code found) |
| FileTree expanded state | Session-only (no persistence) |

**Directory-coloring depth** will follow the `identity.ts` pattern: `safeLocalStorageSet('ok-graph-depth-v1', depth)`.

## No prior art
- No d3-scale-chromatic, colorbrewer, or similar palette dep in `package.json` grep
- No existing color-blind / accessibility palette convention
- No directory-hash-to-color logic anywhere in the repo
