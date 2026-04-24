---
title: Current timeline + DocPanel architecture analysis
created: 2026-04-20
sources:
  - packages/app/src/components/TimelinePanel.tsx
  - packages/app/src/components/DocPanel.tsx
  - packages/app/src/components/EditorPane.tsx
  - packages/app/src/components/EditorArea.tsx
  - packages/app/src/components/EditorHeader.tsx
---

# Current state analysis

## TimelinePanel (TimelinePanel.tsx)

- Standalone Sheet component, 350px fixed width, slides from right
- Props: `open`, `onOpenChange`, `docName`, `onEntrySelect`, `selectedSha`
- Self-contained data fetching: `GET /api/history?docName=<docName>&limit=100`
- Polls every 10s while open
- Groups entries: checkpoints (always visible), WIP between checkpoints (collapsed), pre-checkpoint WIP (expanded by default)
- Internal sub-components: `WipGroup`, `EntryRow`, `checkpointVariant`, `checkpointHeadlineLabel`
- Exports used by EditorPane: `formatRelativeTime`, `displayAuthor` (for the diff banner)

## DocPanel (DocPanel.tsx)

- Tab-based switcher: Outline | Backlinks | Forward Links | Graph
- `PanelTab` union type: `'outline' | 'backlinks' | 'forward-links' | 'graph'`
- Internal `activeTab` state (uncontrolled)
- Props: `docName`, `isSourceMode`
- ARIA: `role="tablist"`, `role="tabpanel"`
- Tabs defined in `TABS` const array with `id`, `label`, `Icon`

## EditorPane (EditorPane.tsx)

- State hub for editor mode, timeline, preview, diff
- `timelineOpen: boolean` — controls Sheet visibility
- `previewEntry: TimelineEntry | null` — selected historical version
- `editorMode: EditorMode` — 'wysiwyg' | 'source' | 'diff'
- `modeBeforeDiffRef` — remembers mode to restore after exiting diff
- History button: `onTimelineToggle={() => setTimelineOpen(o => !o)}`

## Bug: stale diff on file switch

`EditorPane.tsx:101-108` — the useEffect only fires when `activeTarget?.kind === 'folder'`. File-to-file navigation doesn't trigger it because:
- `activeTarget` changes but its `kind` is still `'file'` (or `'missing'`)
- The early return `if (activeTarget?.kind !== 'folder') return` prevents any cleanup
- Result: `previewEntry` stays set, `editorMode` stays `'diff'`, user sees stale diff

Fix: watch `activeDocName` directly and clear diff state on any change.

## EditorArea layout (EditorArea.tsx)

Desktop mode:
```
ResizablePanelGroup (horizontal)
├── ResizablePanel (editor, ~75%, min 30%)
├── ResizableHandle (draggable)
└── ResizablePanel (DocPanel, ~25%, min 300px, collapsible)
```

Mobile/sheet mode:
```
div (flex)
├── Editor content (full width)
└── Sheet (DocPanel inside)
```

DocPanel min width constraint: `minSize="300px"` on the ResizablePanel.
