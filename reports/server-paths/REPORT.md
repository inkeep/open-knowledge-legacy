---
title: "Open Knowledge Server Paths"
description: "Process spawn DAG, Hocuspocus composition paths, CLI vs Electron DMG distribution, and HMR matrix for the seven collab entry points and four UI entry points. §5 maps the cross-install version-drift surface this topology exposes."
createdAt: 2026-04-22
updatedAt: 2026-04-27
subjects:
  - Hocuspocus
  - bootServer
  - createServer
  - Electron
  - Vite
  - CLI
  - Playwright
topics:
  - server entry points
  - process model
  - HMR
  - distribution
  - cross-install version drift
---

# Open Knowledge — server paths

Four views: process spawn DAG, code-path composition, distribution, HMR matrix.

---

## 1. Process model & auto-spawn DAG

```
                    bunx / npx / pnpm dlx @inkeep/open-knowledge
                    (zero-install shell adapters for the CLI)
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
        ok start              ok mcp                 ok ui
    (CLI default)           (MCP stdio)       (static :3000)
            ▲                     │                     ▲
            │                     │                     │
            │                     │ detach-spawn        │
            │                     │ (if no live         │
            │                     │  server.lock)       │
            │                     ▼                     │
            │                 ok start                  │
            │                     │                     │
            └───── auto-spawn sibling (on startup) ─────┘


    Electron desktop (spawn mode)  ── utilityProcess.fork ─▶ bootServer()
    Electron desktop (attach mode) ── reads server.lock  ─▶ binds existing server

    Playwright worker              ── spawn("bun run dev") ─▶ Vite + raw Hocuspocus

    docs/ (Next.js :3010)          ── completely independent, unrelated to collab/app
```

**Collab hosts (Hocuspocus — WS `/collab` + HTTP `/api/*`)**

| # | Entry                            | Dev | Prod | Notes                                                        |
|---|----------------------------------|-----|------|--------------------------------------------------------------|
| 1 | `ok start`                       | ✓   | ✓    | CLI default. 30-min idle-shutdown. Auto-spawns `ok ui`.      |
| 2 | `ok mcp`                         | ✓   | ✓    | MCP stdio. Detach-spawns #1 if no live lock.                 |
| 3 | `bun run dev` (Vite :5173)       | ✓   | ✗    | Dev-only. Hosts collab + app in one process.                 |
| 4 | Electron spawn mode              | ✓   | ✓    | One utility per project window.                              |
| 5 | Electron attach mode             | ✓   | ✓    | No fork — binds to existing `server.lock`.                   |
| 6 | `createTestServer()`             | test| test | Integration harness. Random port, tmpDir.                    |
| 7 | Playwright per-worker fixture    | test| test | Spawns #3 per Playwright worker.                             |

**UI / app hosts (static React + `/api/config`)**

| # | Entry                      | Serves                                                      |
|---|----------------------------|-------------------------------------------------------------|
| A | `ok ui`                    | `dist/public` via sirv :3000; proxies `/api/*` → #1         |
| B | `bun run dev`              | Same process as #3; Vite serves app source                  |
| C | Electron BrowserWindow     | `packages/app/dist` (prod) or Vite URL (dev); navigator/editor mode |
| D | `docs/` Next.js :3010      | Independent Fumadocs site — not related to collab/app       |

**Lock files in `<contentDir>/.open-knowledge/`**

```
  server.lock   ← written by:  1, 3, 4
                ← read by:     2 (spawn decision), 5 (attach), A (proxy target)

  ui.lock       ← written by:  A
```

A same-`contentDir` collision (e.g. `bun run dev` while `ok start` is alive) fails fast at `acquireServerLock` with `ServerLockCollisionError`.

---

## 2. Hocuspocus composition — three distinct wiring paths

```
   ENTRY POINT                    WIRING PATH                         OUTPUT
   ───────────                    ───────────                         ──────

   ok start           ─────┐
                           │
   Electron spawn    ─────┼──▶  bootServer()         ──▶  createServer()   ──▶  Hocuspocus
                           │    (boot.ts)                  (standalone.ts)       instance
                           │    + node:http                                      (persistence,
                           │    + ws                                              API, observers,
                           │    + server.lock                                     agent sessions,
                           │    + idle-shutdown                                   CC1 broadcaster,
                           │    + UI-sibling hook                                 file watcher,
                           │                                                      shadow repo)
   createTestServer() ─────┼─────────────────────────▶  createServer()   ──▶
                           │    (harness re-implements HTTP/WS manually)
                           │
   bun run dev        ─────┴──▶  new Hocuspocus(...)                      ──▶
   (Vite plugin)                 (hocuspocus-plugin.ts)
                                 + Vite's HTTP server
                                 + own WebSocketServer
                                 + same server.lock
```

**Reading this:** three parallel compositions of the same Hocuspocus + extensions. `bootServer()` is the canonical wrapper. The integration test harness reaches into `createServer()` directly so it can wire its own HTTP/WS for deterministic tests. The Vite plugin bypasses both because it rides on Vite's existing HTTP server — but still joins the same `server.lock` so it collides fast with `ok start`.

---

## 3. Distribution — npm CLI vs Electron DMG

```
┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│  npm install                           │   │  Electron DMG                          │
│  @inkeep/open-knowledge                │   │  @inkeep/open-knowledge-desktop        │
│  ────────────────────────              │   │  ──────────────────────────────        │
│                                        │   │                                        │
│  Adds to PATH:                         │   │  Installs: .app bundle                 │
│    • ok                                │   │                                        │
│    • open-knowledge                    │   │  Bundles:                              │
│                                        │   │    • React UI bundle                   │
│  Ships in package:                     │   │      (from packages/cli/dist/public/   │
│    • dist/cli.mjs (Commander entry)    │   │       via electron-builder             │
│    • dist/public/ (built React bundle, │   │       extraResources)                  │
│      consumed by `ok ui` at :3000)     │   │    • @inkeep/open-knowledge-core       │
│                                        │   │    • @inkeep/open-knowledge-server     │
│  Launch:                               │   │                                        │
│    bunx @inkeep/open-knowledge start   │   │  Does NOT ship:                        │
│    (or global install + `ok start`)    │   │    ✗ ok / open-knowledge bins          │
│                                        │   │    ✗ CLI package                       │
└────────────────────────────────────────┘   └────────────────────────────────────────┘
                    │                                           │
                    └────── co-exist via ───────────────────────┘
                       Electron attach mode (reads server.lock)

              Install both → Electron attaches to CLI-launched collab
              Install one  → that install's server path only
```

**Key points:**

- CLI publishes two bin names (`open-knowledge`, `ok`). Both resolve to the same `dist/cli.mjs`.
- The DMG bundles the *built React app*, not the CLI. That bundle is literally `packages/cli/dist/public/` — the CLI's own build artifact — copied by electron-builder's `extraResources` directive (`electron-builder.yml:23`).
- Installing the DMG does **not** add `ok` or `open-knowledge` to PATH. A terminal-driven workflow requires a separate `npm` / `bun` / `bunx` install.
- The two coexist cleanly: the Electron main process probes `server.lock`, and if a live same-host server is already running it enters **attach mode** (entry #5) instead of forking its own utility.

**Dev vs prod per install**

| Install          | Dev                                                     | Prod                                        |
|------------------|---------------------------------------------------------|---------------------------------------------|
| npm CLI          | monorepo `bun run dev` (Vite single-process, HMR)       | `ok start` + `ok ui` siblings (static)      |
| Electron desktop | `electron-vite dev --watch` (renderer HMR + watch-restart) | packaged `.app` loads `Resources/app/` (static) |

---

## 4. HMR matrix — which dev modes fast-refresh

```
┌──────────────────────────────────────┬──────────┬──────────────────────────────────────┐
│ Mode                                 │ HMR?     │ What reloads                         │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ bun run dev  (packages/app)          │  YES     │ React + CSS + TS via Vite HMR.       │
│                                      │          │ Hocuspocus survives across reloads   │
│                                      │          │ (same Y.Doc state; no reconnect).    │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ electron-vite dev --watch  (desktop) │  YES     │ Renderer: full Vite HMR.             │
│                                      │          │ Main / preload: rebuild + restart    │
│                                      │          │ the Electron app (not true HMR).     │
│                                      │          │ Utility process restarts with main.  │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ ok start + ok ui  (published CLI)    │  NO      │ sirv serves frozen dist/public/      │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ Packaged Electron .app / DMG         │  NO      │ file:// serves frozen Resources/app/ │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ Playwright per-worker fixture        │  (active)│ Wraps bun run dev so HMR is present, │
│                                      │          │ but tests don't exercise it.         │
├──────────────────────────────────────┼──────────┼──────────────────────────────────────┤
│ createTestServer()  (integration)    │  N/A     │ No React — server-side tests only.   │
└──────────────────────────────────────┴──────────┴──────────────────────────────────────┘
```

**Bottom line:** exactly two modes give you true fast-refresh — **`bun run dev`** for web-side iteration, and **`electron-vite dev --watch`** for desktop-side iteration. Everything else serves frozen bundles or has no UI.

---

## 5. Cross-install version drift — the surface this map exposes

Everything above is a map of *paths*. What it does not show is that those paths can hold *different versions* of the code at the same moment. The CLI and DMG are each bundled artifacts (intra-install drift does not exist), but between installs, any of these can happen:

- A CLI `ok start` holding `server.lock` can be driven over WS by an Electron DMG of a different version (attach mode, entry #5).
- Editor MCP configs written by `ok init` carry bare `npx @inkeep/open-knowledge mcp` args — every editor launch re-resolves, so MCP children can drift version silently over weeks.
- A crash-killed server from a newer binary can leave durable on-disk state (shadow repo, `.open-knowledge/`) that an older binary reads blind on cold start.

`server.lock` today carries `{pid, hostname, port, startedAt, worktreeRoot}` — no version, no protocol, no state-schema. Desktop attach gates on liveness only. There is no cold-start state-compatibility gate.

The countermeasure — add version metadata to `server.lock`, add `.open-knowledge/state.json` for cold-start schema compatibility, gate desktop attach on protocol match, and reconcile mismatches via a user-consented kill-and-restart with directional asymmetry — is scoped in the companion spec: [`specs/2026-04-24-cross-install-version-handshake/SPEC.md`](../../specs/2026-04-24-cross-install-version-handshake/SPEC.md).
