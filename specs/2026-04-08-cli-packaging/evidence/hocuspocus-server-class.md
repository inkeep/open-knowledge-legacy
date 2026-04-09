---
title: "Hocuspocus Server class verification"
date: 2026-04-08
sources:
  - init_spike/node_modules/@hocuspocus/server/src/Server.ts
  - init_spike/node_modules/@hocuspocus/server/src/Hocuspocus.ts
---

# Hocuspocus Server class — onRequest and extension priority

## onRequest hook
- Receives ALL HTTP requests (no path filtering)
- Handler: `createServer(this.requestHandler)` → calls `this.hocuspocus.hooks("onRequest", { request, response, instance })`
- Extension throws empty error to signal "handled" → default response skipped
- Default response: 200 OK, "Welcome to Hocuspocus!"

## Extension priority
- Extensions sorted by `priority` property (descending — higher runs first)
- Default priority: 100
- API extension at priority 200 runs before static file extension at priority 50

## Static file serving
- `sirv` is NOT in current dependencies — needs to be added
- Can be implemented as a low-priority onRequest extension
- SPA fallback (`single: true`) serves `index.html` for non-API, non-asset routes

## Verification: Server class works for standalone use
Confirmed: `Server` class creates `node:http` server, handles WS upgrades via crossws, provides `listen(port)` + `destroy()`. Migration from Vite plugin is viable.
