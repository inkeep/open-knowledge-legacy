---
title: Hocuspocus DirectConnection API and Vite embedding
type: evidence
sources:
  - npm:@hocuspocus/server@3.4.4
  - github:ueberdosis/hocuspocus
  - https://tiptap.dev/docs/hocuspocus
verified: 2026-04-07
---

# Hocuspocus DirectConnection API

## API shape (@hocuspocus/server v3.4.4)

```ts
// Get a DirectConnection from a running server
const conn = await hocuspocus.openDirectConnection('document-name', optionalContext)

// Modify the Y.Doc using raw Yjs APIs
await conn.transact((doc) => {
  // doc is a Hocuspocus Document wrapping Y.Doc
  // Use standard Yjs methods: getXmlFragment, getText, getMap, etc.
  doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')])
})

// Disconnect (triggers store hooks, unloads doc if no other connections)
await conn.disconnect()
```

## Known issues
1. **State corruption (#832):** Fixed in [v2.13.2](https://github.com/ueberdosis/hocuspocus/releases/tag/v2.13.2). The spike's pinned version (^3.4.0) includes this fix. If unexpected sync behavior occurs when DirectConnection opens before any WebSocket client, check for a regression.
2. **Memory leak (#846):** Document not unloaded on disconnect if a store hook fails. (Status unverified for v3.4.x.)
3. **Context propagation (#833):** Fixed — context now propagates to lifecycle hooks.

## Hocuspocus in Vite (configureServer pattern)

No official plugin. Manual WebSocket upgrade interception. **IMPORTANT:** Vite's `server.ws` is its internal HMR WebSocket server — it does NOT expose `handleUpgrade()`. You must create a standalone `ws.WebSocketServer({ noServer: true })`.

```ts
import { Hocuspocus } from '@hocuspocus/server'
import { WebSocketServer } from 'ws'
import type { Plugin } from 'vite'

export function hocuspocusPlugin(): Plugin {
  const hocuspocus = new Hocuspocus({ /* extensions */ })
  return {
    name: 'hocuspocus',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            hocuspocus.handleConnection(ws, req)
          })
        }
      })
    }
  }
}
```

Key issue: intercept WebSocket `upgrade` BEFORE Vite's HMR handler claims it. Vite's HMR filters by `sec-websocket-protocol` header — filtering by URL path (`/collab`) should be sufficient. Hocuspocus does NOT need `listen()` called when embedding — `handleConnection(ws, req)` is sufficient.

## simple-git and arbitrary refs
No dedicated `updateRef` method. Use `.raw()` for plumbing:

```ts
const treeSha = await git.raw('write-tree')
const commitSha = await git.raw('commit-tree', treeSha.trim(), '-p', parentSha, '-m', 'WIP auto-save')
await git.raw('update-ref', 'refs/wip/main', commitSha.trim())
```
