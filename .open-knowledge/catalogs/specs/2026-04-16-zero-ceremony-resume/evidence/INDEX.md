---
title: evidence
description: ""
generated: true
schema_version: 1
---

## Articles

- **[Idle-shutdown primitive MUST bypass Hocuspocus connection count](specs/2026-04-16-zero-ceremony-resume/evidence/idle-shutdown-directconnection.md)** — Evidence for D-017 revision: Hocuspocus `getConnectionsCount()` includes DirectConnections; CC1 broadcaster (standalone.ts:861) and AgentSessionManager hold persistent ones. Counting total would prevent idle-shutdown from ever firing. Solution: intercept `httpServer.on('upgrade')` at `/collab` and maintain own WebSocket client counter. Tags: evidence, idle-shutdown, directconnection, hocuspocus
- **[launch.json runtimeArgs + port hardcode — investigation](specs/2026-04-16-zero-ceremony-resume/evidence/launch-json-and-port.md)** — Investigation of OQ-1.2 (launch.json runtimeArgs shape) and OQ-1.3 (port 3000 hardcode). Result: single launch.json entry pointing at `ok ui` (UI only); MCP stdio handles collab spawn separately. Port 3000 remains hardcoded but now applies to `ok ui`'s bind port, not `ok start`. Tags: evidence, launch-json, claude-code, investigation
- **[OQ-1.4 resolution — `ok ui` lock-collision proxy mode](specs/2026-04-16-zero-ceremony-resume/evidence/oq-1-4-resolution.md)** — Resolves OQ-1.4 (Claude Code `preview_start` behavior when ok ui exits 0 on lock collision). Under autoPort:true, Claude Code may pick a different port than our lock's port; exit 0 leaves the preview pane's proxy target unlistened. Fix: ok ui's collision handler starts a reverse HTTP proxy listening on the requested PORT env var, forwarding to the lock's port. Works in all scenarios. Tags: evidence, oq-1-4, preview-start, resolution
- **[UI client-tracking for idle-shutdown — investigation](specs/2026-04-16-zero-ceremony-resume/evidence/ui-client-tracking.md)** — Investigation of OQ-1.1: what mechanism should `ok ui` use to know when to idle-shutdown? Result: UI has no WebSocket/SSE of its own today; tying UI lifetime to collab is simpler and avoids new infra. Tags: evidence, idle-shutdown, investigation
