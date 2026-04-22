# @inkeep/open-knowledge-desktop

Native macOS Electron desktop app for Open Knowledge. Private package (not published to npm). Distributed as a signed DMG through GitHub Releases when signing lands.

See root `CLAUDE.md` → "Package: desktop" for the pointer map. Full architectural rationale (D1–D52) in [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../../specs/2026-04-11-electron-desktop-app/SPEC.md).

## Status

M1 — dev loop, local, unsigned. `bun run --filter=@inkeep/open-knowledge-desktop dev` launches the app end-to-end on macOS with Hocuspocus running in a utility process. M2 (signing + notarization + DMG) onwards is deferred; see SPEC §14 for the milestone plan and the spec's `meta/_changelog.md` for the scope calibration that landed M1 in isolation.

## Process model

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (electron/src/main)                                │
│  - BrowserWindow lifecycle (N editor windows + 1 launcher)       │
│  - Native menus, dialogs, Dock                                   │
│  - Project state (electron-store: recents + geometry)            │
│  - runClean on boot (prunes stale server.lock from crashes)      │
│  - Per-project: spawns + supervises utilityProcess               │
└───────────────┬─────────────────────────────┬──────────────────┘
                │                             │
                │ typed IPC                   │ utilityProcess.fork
                │                             │ (one per editor window)
  ┌─────────────▼───────────┐   ┌─────────────▼────────────────┐
  │ Renderer (BrowserWindow)│   │ utilityProcess (Node runtime)│
  │  - React bundle from    │   │  - bootServer(opts) from     │
  │    @inkeep/open-        │   │    @inkeep/open-knowledge-   │
  │    knowledge-app        │   │    server                    │
  │  - Navigator mode       │   │  - createServer +            │
  │    (launcher) OR        │   │    acquireServerLock         │
  │    Editor mode (doc)    │   │  - @parcel/watcher           │
  │                         │   │  - simple-git (history repo) │
  │ Connects to             │   │  - @napi-rs/keyring          │
  │ ws://localhost:<port>   │   │  - macOS parent-death poll   │
  │ /collab                 │   │                              │
  └─────────────────────────┘   └──────────────────────────────┘
```

One BrowserWindow ↔ one utilityProcess ↔ one `createServer` ↔ one `contentDir` (D6). Enforced by the shipped `server.lock` contract (V0-1).

## Directory layout

```
packages/desktop/
├── electron.vite.config.ts        # Three-section build: main / preload / renderer (empty)
├── electron-builder.yml           # macOS Universal DMG target (config validity only until M2)
├── build/entitlements.mac.plist   # Hardened-runtime entitlements
├── scripts/postinstall.mjs        # electron-builder install-app-deps + ELECTRON_SKIP_REBUILD=1 gate
├── src/
│   ├── main/
│   │   ├── index.ts               # app.whenReady, single-instance lock, menu bar
│   │   ├── window-manager.ts      # createProjectWindow — spawns BrowserWindow + utility
│   │   ├── navigator-window.ts    # createNavigatorWindow — persistent launcher
│   │   ├── state-store.ts         # electron-store for recents + window bounds
│   │   └── shell-allowlist.ts     # shell.openExternal scheme allowlist (D47)
│   ├── preload/
│   │   └── index.ts               # contextBridge.exposeInMainWorld('okDesktop', ...)
│   ├── utility/
│   │   └── server-entry.ts        # bootServer + IPC handshake + parent-death poll (D49)
│   └── shared/
│       ├── ipc-channels.ts        # RequestChannels typed map (D14)
│       ├── ipc-events.ts          # EventChannels typed map (main → renderer)
│       ├── ipc-invoke.ts          # createInvoker — preload-side typed helper
│       ├── ipc-handler.ts         # createHandler — main-side typed helper
│       └── bridge-contract.ts     # OkDesktopBridge interface (desktop-local consumer copy)
└── tests/
    ├── integration/m1-smoke.test.ts                   # M1 Definition of Done
    ├── integration/no-loosely-typed-webcontents-ipc.test.ts  # D19 rule verification
    ├── main/{shell-allowlist,state-store,window-manager}.test.ts
    ├── preload/bridge.test.ts
    ├── unit/scaffold.test.ts                           # deps-resolve smoke
    └── utility/server-entry.test.ts
```

The canonical `OkDesktopBridge` interface also lives at [`packages/core/src/desktop-bridge.ts`](../core/src/desktop-bridge.ts) as a documentation anchor. It is intentionally **duplicated** (not re-exported) because TypeScript module augmentation through workspace barrels turned out to be brittle under `moduleResolution: bundler`. Keep the two files in sync when the shape changes.

## Running locally

From the repo root:

```bash
bun install                                       # installs desktop deps; postinstall rebuilds native modules
bun run --filter=@inkeep/open-knowledge-desktop dev
```

On first run, the app opens the Navigator window. Click "Open folder on disk" to pick a content directory — every project pick spawns a new editor window (D3 revised — there is no switch-in-place UX). Closing every editor window keeps the app and the Navigator running; click the Dock icon to bring the Navigator back.

To skip the native-module rebuild during `bun install` (faster on machines that don't need the desktop build):

```bash
ELECTRON_SKIP_REBUILD=1 bun install              # D34
```

Agents never set this — they want the full env. Add it to your shell profile if you're only iterating on non-desktop packages.

## IPC discipline (D14 + D19)

Every renderer↔main call goes through the typed channel map in `src/shared/ipc-channels.ts` (requests) or `src/shared/ipc-events.ts` (events). **Never call `ipcMain.handle` or `ipcRenderer.invoke` directly** — use `createHandler` / `createInvoker`. Biome's GritQL rule `no-loosely-typed-webcontents-ipc` (configured at the repo root, D19) fails lint on violations.

File-scoped allowlist for direct IPC access (the wrapper implementations themselves):
- `src/shared/ipc-handler.ts`
- `src/shared/ipc-invoke.ts`
- `src/preload/index.ts`

Subscription methods on the bridge (`onProjectSwitched`, `onMenuAction`, etc.) **must** use the preload-side listener-wrapper pattern — the contextBridge wraps callbacks, so passing the renderer's callback reference directly to `ipcRenderer.removeListener` silently fails ([electron/electron#33328](https://github.com/electron/electron/issues/33328)). The existing bridge in `src/preload/index.ts` is the reference.

`shell.openExternal` is proxied through main with an explicit scheme allowlist (`https | http | mailto | openknowledge`) per D47 to close the Shabarkin 2022 "1-click RCE" class via OS-native schemes. Adding a new scheme requires editing `src/main/shell-allowlist.ts` and updating its test.

## Lifecycle primitives

- **`bootServer`** from `@inkeep/open-knowledge-server`. The utility calls it with `{ attachUiSibling: false, idleShutdownMs: null }` (D36) — no `ok ui` sibling, no 30-minute idle-shutdown timer. Other opt-outs (`skipAutoInit`) stay at their defaults.
- **`utilityProcess.fork(entry, [], { windowLifecycleBound: true, windowLifecycleGraceTime: 6000 })`** (D39). The utility terminates automatically on window close after the 6 s grace window. Main runs a 1-second post-exit PID-liveness probe to catch zombies per [VS Code #194477](https://github.com/microsoft/vscode/issues/194477).
- **Parent-death detection** (D49). The utility polls `process.kill(parentPid, 0)` every 5 s; on `EPERM` / `ESRCH` it drains and exits. Linux (`PR_SET_PDEATHSIG`) and Windows (Job Objects) paths are documented in comments but not implemented — M1 is macOS-only per D51.
- **`runClean({ lockDir })`** from the CLI's clean command runs on main-process boot before spawning utilities (D44). Stale locks from crashed prior sessions are pruned automatically.

## Renderer integration

The editor renderer is the existing `packages/app/` Vite bundle, loaded through `webPreferences.additionalArguments` which injects `window.okDesktop.config` at preload-exposure time. The app's `useCollabUrl` hook (`packages/app/src/lib/use-collab-url.ts`) short-circuits on `window.okDesktop?.config.collabUrl` and skips the `/api/config` poll path used by the web/CLI distribution. When `mode === 'navigator'`, `packages/app/src/main.tsx` mounts `NavigatorApp` instead of the editor shell.

## Testing

| File | What it covers |
|---|---|
| `tests/integration/m1-smoke.test.ts` | End-to-end Definition of Done: dev loop, keyring round-trip, parent-death exit, server.lock acquire/release |
| `tests/integration/no-loosely-typed-webcontents-ipc.test.ts` | D19 rule asserts on a seeded violation and passes on current code |
| `tests/main/shell-allowlist.test.ts` | D47 scheme allowlist: accepts `https:`/`http:`/`mailto:`/`openknowledge:`, rejects `ms-msdt:`/`file:`/`javascript:` |
| `tests/main/state-store.test.ts` | electron-store shape — recents cap 20, window-bounds persistence, corrupt-file recovery |
| `tests/main/window-manager.test.ts` | Spawning + tracking + collision-dialog dispatch |
| `tests/preload/bridge.test.ts` | `window.okDesktop` config parsing, subscription wrapper correctness |
| `tests/utility/server-entry.test.ts` | IPC handshake, graceful shutdown drain, parent-death exit |
| `tests/unit/scaffold.test.ts` | Smoke: `OK_DIR` (core) and `bootServer` (server) imports resolve from desktop |

Run the full gate from the repo root (`bun run check`) or scope to this package with `cd packages/desktop && bun test`.

## Scope boundary

This package is M1 only. Work that belongs to M2–M7 is explicitly out of scope — see [`specs/2026-04-11-electron-desktop-app/SPEC.md §14`](../../specs/2026-04-11-electron-desktop-app/SPEC.md) for the milestone definitions and promote triggers. Do not expand `electron-builder.yml` into signed-build territory, do not wire `electron-updater`, do not register the `openknowledge://` protocol, do not implement the CLI-on-PATH menu item, and do not populate the MCP first-launch consent dialog until the spec for the relevant milestone is open.
