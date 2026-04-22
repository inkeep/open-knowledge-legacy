---
"@inkeep/open-knowledge-app": patch
---

fix(app): route `/collab/keepalive` as a bare WS in the Vite dev plugin, mirroring `ok start`'s prod handling. `ok mcp` opens a persistent `/collab/keepalive?pid=<mcp-pid>` WebSocket to keep the collab server out of idle-shutdown (D-034). Before this fix, the Vite dev plugin's `/collab` path-prefix check also matched `/collab/keepalive` and routed it into `hocuspocus.handleConnection`, where Hocuspocus waited for a sync-step-1 message the keepalive never sends — leaving the socket in a half-initialized state in Hocuspocus's connection registry. With `ok mcp` + `bun run dev` running together (e.g., Claude Code against a local dev server), that half-open registry entry could coexist with real browser `/collab` WSs and starve them. Dev now branches on `startsWith('/collab/keepalive')` first and handles it identically to `packages/server/src/boot.ts:210-235` — bare WS handshake, 30s ping timer, no Hocuspocus routing.
