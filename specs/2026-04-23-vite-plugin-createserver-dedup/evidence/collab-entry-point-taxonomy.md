---
name: Collab entry-point taxonomy — corrected
description: Independent verification of M6 audit finding #11's "seven entry points / three wiring paths" taxonomy claim. Corrects producer-vs-consumer conflation; re-catalogs the surface.
sources:
  - packages/cli/src/commands/mcp.ts
  - packages/cli/src/mcp/server-discovery.ts
  - packages/desktop/src/main/window-manager.ts
  - packages/app/tests/stress/_helpers/fixtures.ts
  - packages/app/playwright.config.ts
  - packages/server/src/boot.ts
  - packages/server/src/standalone.ts
  - packages/app/src/server/hocuspocus-plugin.ts
  - packages/app/tests/integration/test-harness.ts
gathered: 2026-04-23
confidence: HIGH (all claims grep-traced to file:line)
---

# Collab entry-point taxonomy

## M6 audit finding #11 prompted this verification

M6's sharpened spec claimed "seven collab entry points composing Hocuspocus via one of three wiring paths." The audit flagged this as unverified:

> "A reader cannot verify the taxonomy without grepping `createServer` / `bootServer` / `new Hocuspocus` across the repo."

Q4 of this spec carries forward that verification obligation. The traced-and-verified taxonomy below **corrects** two producer-vs-consumer conflations in M6's original enumeration.

## Producer paths (wire a `Hocuspocus` instance)

There are **three** producer paths, matching M6's count:

| # | Path | File:line | Wraps? |
|---|---|---|---|
| P1 | `bootServer()` | `packages/server/src/boot.ts:141` | Calls `createServer()`, wraps with `node:http` + `ws` + idle-shutdown + keepalive-grace |
| P2 | `createServer()` direct | `packages/server/src/standalone.ts:164` | Bare — caller must wire HTTP/WS |
| P3 | Raw `new Hocuspocus(...)` | `packages/app/src/server/hocuspocus-plugin.ts:212` | Vite plugin's hand-rolled wiring — this spec's target |

## Producer callers (each caller uses exactly one of P1/P2/P3)

Four callers, down from M6's seven:

| Caller | Path used | File:line |
|---|---|---|
| CLI `ok start` | P1 (`bootServer`) | `packages/cli/src/commands/start.ts:408` |
| Electron utility process | P1 (`bootServer`) | `packages/desktop/src/utility/server-entry.ts:230` |
| Integration test harness `createTestServer` | P2 (`createServer`) + hand-rolled HTTP | `packages/app/tests/integration/test-harness.ts:122-226` |
| Vite dev plugin (`bun run dev`) | P3 (raw `new Hocuspocus`) | `packages/app/src/server/hocuspocus-plugin.ts:212` |

## Consumer-only entry points (connect to an existing server; do NOT wire Hocuspocus)

M6 conflated these with producer callers. They share the `/collab` WS + `/api/*` HTTP surface but do not construct a Hocuspocus — they read `server.lock` and connect.

| Entry point | Mechanism | File:line |
|---|---|---|
| `ok mcp` (auto-spawn case) | Spawns `ok start` as a detached child process; connects to its server.lock port | `packages/cli/src/mcp/server-discovery.ts:93-110` |
| `ok mcp` (attach case) | Connects to existing `server.lock` if present; no spawn | `packages/cli/src/mcp/server-discovery.ts` |
| Electron **attach mode** | Reads `server.lock`; if alive + same-host + port > 0, attaches the BrowserWindow to the existing server without a utility fork | `packages/desktop/src/main/window-manager.ts:595-646` |
| Playwright per-worker fixture | Spawns `bun run dev` per worker on a kernel-assigned port; connects to its server.lock | `packages/app/tests/stress/_helpers/fixtures.ts:205-211` |
| MCP clients (Claude Desktop / Claude Code / Cursor / Codex / …) | Spawn `ok mcp`; all Hocuspocus wiring is downstream of `ok start` spawn | — |

## M6 errata

- **M6 entry #2 (`ok mcp` as spawner):** MISCLASSIFIED. `ok mcp` does not create Hocuspocus; it spawns `ok start` (which uses P1) or attaches to an existing server. No fourth wiring path hidden here.
- **M6 entry #5 (Electron attach mode):** MISCLASSIFIED. Attach mode connects to an existing server. Only Electron spawn mode uses P1 (via utility `server-entry.ts`).
- **M6 entry #7 (Playwright per-worker fixture):** MISCLASSIFIED. Each Playwright worker spawns `bun run dev`, which uses P3. No separate wiring path.

**Correct count:** 3 producer paths (P1, P2, P3), 4 producer callers (CLI, Electron utility, test harness, Vite plugin), 4+ consumer entry points.

## What this spec reduces to

Post-refactor, the Vite plugin migrates from P3 to a hybrid: it calls `createServer()` (P2) for the server side and attaches to Vite's HTTP server for the transport side. Net effect:

- **Before:** 3 producer paths (P1 / P2 / P3).
- **After:** 2 producer paths (P1 / P2). P3 deleted.

Producer callers compress from "wiring 4 parallel code paths" to "3 consumers of P1 + 2 consumers of P2 (test harness, Vite plugin)." Approach B (Future Work NG2) would further compress to "all 4 callers use P1" by extracting the HTTP wrapping layer into a helper the test harness and plugin can share.

## Consumer-only entry points are unaffected by this spec

The four consumer-only entry points (`ok mcp`, Electron attach, Playwright fixture, external MCP clients) connect via `server.lock` regardless of which producer path is in play. They benefit from post-refactor dev/prod parity (e.g., Playwright now exercises the full `createServer()` subsystem chain) but do not themselves need modification.
