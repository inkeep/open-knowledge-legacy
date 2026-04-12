# Evidence: Single-Command Server+UI Startup Patterns

**Dimension:** D3 — How comparable tools wire up HTTP + WebSocket + static assets + file watcher in one process
**Date:** 2026-04-11
**Sources:** open-knowledge codebase, Storybook, Vite, Docusaurus architectures

---

## Key files / pages referenced

- `packages/cli/src/commands/start.ts` — current startup command
- `packages/server/src/standalone.ts` — `createServer()` factory
- `packages/server/src/file-watcher.ts` — @parcel/watcher setup
- `packages/app/src/server/hocuspocus-plugin.ts` — Vite dev plugin (comparison)

---

## Findings

### Finding: open-knowledge already implements the single-command pattern correctly
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/commands/start.ts`

The `start` command already wires up all required components in one process:
1. **Hocuspocus server** via `createServer()` — handles CRDT collaboration, persistence, file watcher, shadow repo
2. **HTTP server** via `node:http` — API routes + static asset serving
3. **WebSocket server** via `ws` — WebSocket upgrade for `/collab` path
4. **Static asset serving** via `sirv` — serves pre-built React app with SPA fallback
5. **File watcher** — started inside `createServer()` via `startWatcher()` with @parcel/watcher

The process handles graceful shutdown (SIGINT/SIGTERM) and can optionally open the browser (`--open` flag).

**Implications:** No architectural changes needed. The startup pattern is sound. The only gap is asset resolution for npm-published packages.

### Finding: The pattern matches industry standards — Storybook, Vite, Docusaurus all follow it
**Confidence:** CONFIRMED
**Evidence:** Web search, documentation analysis

| Tool | HTTP Server | WebSocket | Static Assets | File Watch | Single Process |
|------|-------------|-----------|---------------|------------|----------------|
| Storybook | Express | HMR WebSocket | Pre-built manager UI | chokidar | Yes |
| Vite | Connect/Koa | HMR WebSocket | Served from fs | chokidar | Yes |
| Docusaurus | Express + webpack-dev-server | HMR WebSocket | Builds from source | chokidar | Yes |
| **open-knowledge** | **node:http** | **ws (raw)** | **sirv (pre-built)** | **@parcel/watcher** | **Yes** |

open-knowledge's approach is leaner than most — raw `node:http` instead of Express, `sirv` instead of a full middleware stack, `@parcel/watcher` (native, fast) instead of chokidar (JS, polling fallback).

**Implications:** The architecture is solid and follows established patterns. The "zero config" aspect is already handled by the YAML config hierarchy with sensible Zod defaults.

### Finding: Default port and auto-port-finding improve zero-config experience
**Confidence:** INFERRED
**Evidence:** Industry patterns

Most zero-config CLI tools:
1. Default to a well-known port (Vite: 5173, Storybook: 6006, Docusaurus: 3000)
2. Auto-increment if the port is taken (Vite does this)
3. Print the URL prominently after start

open-knowledge defaults to port from config (Zod defaults). It prints a banner with the URL. It does NOT auto-increment on port conflict — the user gets a "port in use" error.

**Implications:** Consider adding auto-port-finding for a smoother experience, but this is a nice-to-have, not a blocker.

### Finding: The `start` command is the default Commander.js command
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/cli.ts` (line 69)

```typescript
program.addCommand(start, { isDefault: true });
```

This means `bunx @inkeep/open-knowledge` (with no subcommand) runs `start`. The user doesn't need to know about subcommands.

**Implications:** Zero-config UX is already correct. `bunx @inkeep/open-knowledge` → starts everything.

---

## Gaps / follow-ups

* Auto-port-finding would improve resilience when the default port is occupied
* Consider `--quiet` flag for when the server is started by MCP/automation (suppress banner)
