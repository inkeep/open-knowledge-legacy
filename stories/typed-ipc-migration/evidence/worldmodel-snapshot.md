---
title: "Typed IPC topology snapshot"
type: synthesis
created: 2026-04-28
---

**TLDR:** Open Knowledge's desktop package uses a hand-rolled, channel-map TypeScript contract (`OkDesktopBridge`) for Electron's main↔preload↔renderer IPC, with three duplicated copies of the contract and a Bun integration test (mis-described in the README as a Biome GritQL rule) banning raw IPC primitives. The in-source migration trigger to `@electron-toolkit/typed-ipc` or `@egoist/tipc` is already tripped (21 channels at threshold; PR #345 brings count to 23+).

## Detail

### Channel surface (CONFIRMED)
- **21 request channels** in `RequestChannels` (`packages/desktop/src/shared/ipc-channels.ts:123`); namespaces: dialog, shell, clipboard, project, navigator, update, debug, seed, mcp-wiring, skill.
- **9 event channels** in `EventChannels` (`packages/desktop/src/shared/ipc-events.ts:21`); push events from main → renderer.

### Contract triplication (CONFIRMED — deliberate, not accidental)
Three files mirror `OkDesktopBridge`:
1. `packages/core/src/desktop-bridge.ts` — canonical (457 lines, structural, zero imports)
2. `packages/desktop/src/shared/bridge-contract.ts` — desktop mirror (307 lines, imports from sibling packages)
3. `packages/app/src/lib/desktop-bridge-types.ts` — app renderer mirror (267 lines, structural, zero imports)

Why duplicated, not re-exported: per `bridge-contract.ts:1–20`, a barrel re-export from core pulls in core's mdast/CRDT module-augmentation tree, which fails to resolve under desktop's `moduleResolution: bundler`.

### Wrapper helpers (CONFIRMED)
- `createHandler(ipcMain)` — main-side typed `ipcMain.handle` (`shared/ipc-handler.ts:28–40`)
- `createInvoker(ipcRenderer)` — preload-side typed `ipcRenderer.invoke` (`shared/ipc-invoke.ts:26–31`)
- `sendToRenderer<K>(webContents, channel, payload)` — main-side typed push (`shared/ipc-send.ts:29`)

### Enforcement (CONFIRMED)
- "GritQL rule" `no-loosely-typed-webcontents-ipc` is **actually a Bun integration test**, not a Biome plugin (`packages/desktop/tests/integration/no-loosely-typed-webcontents-ipc.test.ts:11–18` documents the gap). README at `packages/desktop/README.md:114` mis-describes it.
- 6 banned regex patterns: raw `ipcMain.handle`, `ipcMain.on`, `ipcRenderer.invoke`, `ipcRenderer.on`, `ipcRenderer.once`, `webContents.send`.
- Allowlist: `shared/ipc-{invoke,handler,send,channels,events}.ts`, `preload/index.ts`, `main/index.ts`. (NOT `mcp-wiring.ts` or `auto-updater.ts`, which use `ipcMain.removeHandler` legitimately — that primitive is unbanned.)

### Drift catchers (CONFIRMED — `packages/desktop/tests/integration/m1-smoke.test.ts`)
1. `OkDesktopBridge` triplication (L123–274) — walks `interface` body in 3 files, asserts top-level + one-level-nested member-set equality. **Misses signature-level drift** (return types, arg types).
2. `EditorId` literal-union triplication (L276–364) — 4 files, pinned size assertion.
3. `KeyringSmokeResult` shape (L385–483) — 3 files, field-set equality.
4. `SWITCH_PROJECT_LABEL_WITH_ELLIPSIS` (L366–383) — TS-import equality (stronger than text extraction).

### Migration trigger status (CONFIRMED — TRIPPED)
- **PR #270 body** (older framing): "Trigger to migrate to typed-IPC: 6th IPC channel added, or a real drift escapes the catcher."
- **In-source comment** at `packages/desktop/src/shared/ipc-channels.ts:13–15` (current authority): "Scale-match trigger (FU-3): at >20 channels, migrate baseline to `@electron-toolkit/typed-ipc` or `@egoist/tipc`. **Currently 21 — past the trigger; migrate before adding more.**"
- PR #345 adds 3 more channels (`ok:find:start`, `ok:find:stop`, `ok:find:result`), bringing count to 23 request + 10 event channels.

### Latent surface (CONFIRMED — declared, not produced/consumed)
- `ok:project:switching` (`ipc-events.ts:23`) — declared, preload subscribes, no `sendToRenderer` producer (D3 was revised to spawn new windows on every project pick).
- `ok:menu-action` (`ipc-events.ts:27`) — declared, `OkMenuAction` union has 10 values, but `menu.ts` routes File-menu clicks directly to handlers instead of dispatching.
- `ok:project:get-info` (`ipc-channels.ts:172`) — registered in main, no preload caller. Renderer reads `okDesktop.config` from frozen argv-injected snapshot.

### README inaccuracies (CONFIRMED)
- `packages/desktop/README.md:114` claims a "Biome GritQL rule" — actually a Bun test.
- `packages/desktop/README.md:128` claims "the only file on the D19 direct-IPC allowlist" — `auto-updater.ts:447,606` and `mcp-wiring.ts:899,914,921,928` legitimately use `createHandler` + `removeHandler` outside that file.

### Library landscape (SUPPORTED — single web pass)

| Library | Type model | Notes |
|---|---|---|
| `@electron-toolkit/typed-ipc` | `.d.ts` channel map split into listener (one-way) + handler (request-response); `IpcListener` + `IpcEmitter` classes | Bundled with `electron-vite` scaffolds; closest API shape to OK's hand-rolled pair |
| `@egoist/tipc` | Procedure router, proxy-based client over a `Router` type | Adapter-agnostic for preload; tRPC-style; 301 stars |
| `electron-trpc` | Full tRPC router with Zod | First-class subscriptions; ships tRPC client in renderer bundle; 393 stars |
| `electron-typescript-ipc` | `GetApiType<Invoke, On>` discriminated map | 42 stars |

## Implications

- **The migration trigger is already tripped.** Any further channel additions through the current pattern compound the cleanup cost.
- **Renderer-side bridge consumption is broad.** `window.okDesktop.<namespace>.<method>(...)` is referenced extensively in `packages/app/`; preserving (or not) that shape is a load-bearing decision.
- **The triplication is intentional, not a bug.** Any migration must either preserve the deliberate-duplication pattern (and target the test-based drift catcher for replacement) or solve the underlying `moduleResolution: bundler` constraint that drove the duplication.
- **Three subsystems use raw `ipcMain.removeHandler`** legitimately (the regex bans `handle` not `removeHandler`) — `auto-updater.ts`, `mcp-wiring.ts`, `main/index.ts`. Migration must accommodate teardown semantics.

## Pointers
- `packages/core/src/desktop-bridge.ts` (canonical)
- `packages/desktop/src/shared/*.ts` (wrappers + mirrors)
- `packages/desktop/tests/integration/{no-loosely-typed-webcontents-ipc,m1-smoke,handoff-ipc}.test.ts` (enforcement + drift)
- `packages/desktop/README.md` §"IPC discipline (D14 + D19)"
- `specs/2026-04-11-electron-desktop-app/SPEC.md` §1 (FU-3 origin)

## Gaps / follow-ups
- No `bundlephobia` numbers gathered for the candidate libraries — would inform a "renderer bundle impact" assumption.
- No npm download counts confirmed (registry returned 403 in worldmodel pass) — would inform "ecosystem health" framing.
- Whether PR #270's "asset-click OS-delegation IPC surface" (referenced in #270's body) actually landed or remains unimplemented — search returned zero hits in current `packages/desktop/src/`.
