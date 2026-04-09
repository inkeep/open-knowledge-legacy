---
title: "Dev mode connectivity and WS URL"
date: 2026-04-08
sources:
  - init_spike/src/editor/TiptapEditor.tsx:64
  - init_spike/src/server/hocuspocus-plugin.ts:165-188
---

# Dev mode: how the React app connects to Hocuspocus

## Current state
- HocuspocusProvider URL is **hardcoded** to `ws://localhost:5173/collab` (TiptapEditor.tsx:64)
- Vite plugin intercepts WebSocket upgrades on `/collab` path via `prependListener('upgrade')`
- The app cannot connect to a standalone server on a different port without code change

## Required change for packages/ split
The WS URL must be derived from `window.location` or injected via env/config:
```typescript
// Derive from current page — works for both dev (Vite on 5173) and prod (CLI on 3000)
const wsUrl = `ws://${window.location.host}/collab`;
```

This is a one-line fix that makes the app work with any server on any port.

## Dev mode options after split
1. **Option A (proxy):** `packages/app/` runs Vite on 5173, proxies `/collab` to standalone server on 3000. Vite config: `server.proxy: { '/collab': { target: 'ws://localhost:3000', ws: true } }`
2. **Option B (embedded):** Keep the Vite plugin in `packages/app/` for dev mode. The plugin imports from `@inkeep/open-knowledge-core` for shared extensions.
3. **Option C (connect directly):** Set WS URL to standalone server port. No proxy needed if CORS allows it.

Option B preserves the current dev experience (single `bun run dev` starts everything). Option A is cleaner separation but requires running two processes.
