---
title: Open Knowledge Current Surfaces
description: Code trace for the current desktop bridge, command palette, workspace API, and server route patterns relevant to a gbrain search UI.
created: 2026-05-01
last-updated: 2026-05-01
---

# Open Knowledge Current Surfaces

## Findings

### CONFIRMED: The renderer can know the current project folder in desktop mode.

`packages/app/src/lib/use-workspace.ts` resolves `window.okDesktop.config.projectPath` synchronously when the desktop bridge is present. The same file falls back to `GET /api/workspace` in non-desktop mode.

Primary sources:
- `packages/app/src/lib/use-workspace.ts`
- `packages/desktop/src/shared/bridge-contract.ts`

### CONFIRMED: The command palette is the natural first UI integration point.

`packages/app/src/components/CommandPalette.tsx` already handles project-level commands, recent projects, settings, and "open in agent" actions. It has access to both `bridge.config.projectPath` and `useWorkspace()`.

Primary source:
- `packages/app/src/components/CommandPalette.tsx`

### CONFIRMED: The command palette is currently desktop-only and opens with Cmd/Ctrl+K.

`packages/app/src/components/CommandPalette.tsx` registers a keydown listener for `metaKey || ctrlKey` plus `K`. `packages/app/src/App.tsx` only mounts `<CommandPalette bridge={desktopBridge} />` when `window.okDesktop` exists, so browser support requires either making the palette host-agnostic or adding a browser-compatible palette wrapper.

Primary sources:
- `packages/app/src/components/CommandPalette.tsx`
- `packages/app/src/App.tsx`

### CONFIRMED: The file sidebar is another viable surface, but lower priority.

`packages/app/src/components/FileSidebar.tsx` owns the left sidebar header and footer. It already hosts project switching and file actions, so it can expose a persistent indicator or entry point after the command-palette integration exists.

Primary source:
- `packages/app/src/components/FileSidebar.tsx`

### CONFIRMED: The server already exposes loopback-only JSON APIs.

`packages/server/src/api-extension.ts` exposes `/api/workspace` with loopback and host-header checks, and the route table centralizes existing `/api/*` handlers. This is the right pattern for a new local-only gbrain status/search endpoint if the web app needs server-side CLI access.

Primary sources:
- `packages/server/src/api-extension.ts`
- `packages/app/src/server/hocuspocus-plugin.ts`

### CONFIRMED: The desktop bridge currently has no gbrain API.

The desktop bridge contract includes project, shell, clipboard, local operations, seed, skill, update, and MCP wiring surfaces. It does not yet expose `gbrain` status or search methods.

Primary sources:
- `packages/desktop/src/shared/bridge-contract.ts`
- `packages/desktop/src/preload/index.ts`
