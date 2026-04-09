---
title: "Shared code boundary analysis"
date: 2026-04-08
sources:
  - init_spike/src/server/hocuspocus-plugin.ts
  - init_spike/src/server/persistence.ts
  - init_spike/src/editor/extensions/shared.ts
  - init_spike/src/editor/extensions/frontmatter.ts
  - init_spike/src/presence/identity.ts
---

# Shared Code Boundary: server ↔ editor ↔ presence

## Cross-boundary imports (server → editor)

Only TWO editor files are imported by server code:

1. `src/editor/extensions/shared.ts` → `sharedExtensions` array
   - Used by: `hocuspocus-plugin.ts:15`, `persistence.ts:19`, `agent-flow.test.ts:20`
   - Purpose: TipTap schema for MarkdownManager + getSchema()

2. `src/editor/extensions/frontmatter.ts` → `stripFrontmatter`, `prependFrontmatter`
   - Used by: `hocuspocus-plugin.ts:14`, `persistence.ts:18`
   - Purpose: frontmatter handling in persistence + agent write pipeline

## Reverse imports

- Editor → server: NONE (clean one-way boundary)
- Presence → server: NONE
- Presence → editor: NONE (types only — ActivityEntry)
- Editor → presence: `TiptapEditor.tsx:9` imports `useIdentity` (React hook, stays in app)

## What goes into packages/core/

### Extensions (schema-critical — divergence breaks CRDT sync)
- `extensions/shared.ts` — sharedExtensions array (JsxComponent, StarterKit, Table, etc.)
- `extensions/jsx-component.ts` — JsxComponent extension definition
- `extensions/frontmatter.ts` — stripFrontmatter(), prependFrontmatter()

### Types (no implementation)
- `types/awareness.ts` — AwarenessUser, AwarenessState, ActivityEntry
- `types/identity.ts` — Identity interface (pure, no React)

### Constants
- `constants/activity.ts` — ACTIVITY_TTL_MS, FLASH_DURATION_MS, FLASH_DEBOUNCE_MS

### Utils (pure functions)
- `utils/markdown.ts` — MarkdownManager factory, getSchema() wrapper
- `utils/identity.ts` — getIdentity(), generateRandomColor, generateRandomName (pure functions only, no React hooks)

## What stays in packages/open-knowledge/ (server)
- hocuspocus-plugin.ts (refactored to standalone server)
- persistence.ts
- file-watcher.ts
- agent-sessions.ts (extracted from plugin)
- api-extension.ts (extracted from plugin)
- CLI entry, config loader, MCP client adapter

## What stays in packages/app/ (React editor)
- TiptapEditor.tsx, SourceEditor.tsx
- observers.ts (bidirectional sync)
- Presence components (PresenceBar, AgentUndoButton)
- React hooks (useIdentity, usePresence)
- Design system (components/ui/*)
- Vite config, index.html
- Flash plugins (CodeMirror + TipTap)
