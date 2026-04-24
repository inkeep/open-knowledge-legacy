---
"@inkeep/open-knowledge-app": patch
---

chore(app): structured `[collab]` logs on the `bun run dev` upgrade path. Each `/collab` WebSocket upgrade now logs `upgrade received → handleUpgrade starting → handshake complete` with the request URL, `sec-websocket-protocol`, host, origin, and hocuspocus connection count. Synchronous throws from `wss.handleUpgrade` (e.g. "handleUpgrade called twice with same socket") are now caught and logged instead of escaping the listener. A `[collab] configureServer invocation=N` line is also logged so an unexpected re-run of the plugin's server-setup hook (which would orphan the previous upgrade listener) is loud in the dev console. Diagnostic-only — no behavior change on the happy path.
