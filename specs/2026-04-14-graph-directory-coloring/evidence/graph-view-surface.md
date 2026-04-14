---
name: Graph view surface inventory
description: Current graph rendering stack, node-color API, theme access — facts for the spec's §6 integration plan
sources:
  - packages/app/src/components/GraphView.tsx
  - packages/app/src/components/GraphPanel.tsx
  - packages/server/src/api-extension.ts
  - packages/server/src/backlink-index.ts
---

# Graph view surface

## Renderer
- **Library:** `react-force-graph-2d` v^1.29.1
- **Component:** `packages/app/src/components/GraphView.tsx` (rendering) wrapped in `packages/app/src/components/GraphPanel.tsx` (container)
- **Canvas-based 2D** (not SVG). All node/edge drawing goes through react-force-graph's canvas callbacks.

## Data flow
- Endpoint: `GET /api/link-graph` → `api-extension.ts:848`
- Source: `backlinkIndex.getLinkGraph()` (`backlink-index.ts:536`)
- Payload shape (actual, per `api-extension.ts:849-853`):
  ```ts
  {
    ok: true,
    nodes: Array<{ id: string, label: string }>,
    links: Array<{ source: string, target: string }>
  }
  ```
- `node.id` is the docName (e.g. `projects/alpha/notes/foo` — no `.md`, no leading `./`); `node.label` is the page title
- Server builds `enrichedNodes` by mapping docNames through `readPageTitleForDocName(id)` before returning
- Branch-scoped via the backlink index's internal maps

## Node coloring (today)
- `nodeColor` prop on the react-force-graph component (GraphView.tsx:147-149):
  ```tsx
  nodeColor={(node) =>
    node.id === activeDocName ? activeNodeColor : defaultNodeColor
  }
  ```
- Color values hardcoded (GraphView.tsx:117-118):
  ```ts
  const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
  const activeNodeColor  = isDark ? '#69a3ff' : '#3784ff';
  ```
  - Active — light: `#3784ff`, dark: `#69a3ff`
  - Default — light: `#9ca3af` (Tailwind gray-400), dark: `#6b7280` (gray-500)

## Theme access
- `useTheme()` from `next-themes`, imported in GraphView.tsx:1 and ThemeToggle.tsx:2
- `const { resolvedTheme } = useTheme()` → `'light' | 'dark'` (GraphView.tsx:50)
- localStorage key: `ok-theme-v1` (main.tsx:37)

## Existing controls
- Panel header: fullscreen toggle (`Maximize2` / `Minimize2`) + node + link counts
- No other controls. Insertion point for depth arrows: same header row, left of fullscreen.

## Shadcn patterns in use
- `Button` with `variant="ghost"` `size="icon-sm"` for header actions
- `Panel` / `PanelHeader` / `PanelTitle` / `PanelCount` from `packages/app/src/components/ui/panel.tsx`
