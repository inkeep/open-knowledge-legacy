# FU-1: Utility-process hot-reload patterns

**Parent report:** electron-ai-coding-agent-development
**Extends:** §E1 (Hot-reload across main/renderer/utility) UNRESOLVED gap
**Date:** 2026-04-15
**Depth:** Moderate

## Summary

Utility-process hot-reload is, as the parent report stated, genuinely unaddressed by the three major Electron frameworks. **electron-vite / vite-plugin-electron** has a build-time primitive (`?modulePath` import suffix and multi-entry config) that *rebuilds* utility-process bundles on change, but the documented reload path stops at main-process *hot restart* and preload hot-reload — on utility-code change electron-vite effectively restarts the whole app because main-process restart kills all child utility processes. **electron-forge (plugin-vite)** exposes `WatchOptions` (a chokidar re-export) but has no utility-process awareness. **electronmon**, **electron-reloader** (Sindre), **electron-reload**, **electron-connect** are all main-process + renderer only; the two most "official" community watchers (electron-reloader v1.2.3 Feb 2022, electron-connect v0.6.0 Sept 2016) are effectively unmaintained. No `vite-plugin-utility-process` exists on npm as of 2026-04. [CONFIRMED]

The `UtilityProcess` API provides no `.respawn()` or `.restart()` primitive — you must `.kill()` and re-`.fork()`, and every restart mints fresh `MessagePortMain` identities (the parent must re-`postMessage` ports after the `'spawn'` event fires on the new child). [CONFIRMED]

The pragmatic patterns teams actually ship are: (a) chokidar-on-source + `kill()`+`fork()` inside main-process code, gated by a debounce; (b) restart the *whole* Electron app via electron-vite `--watch` and accept utility-process teardown as a side-effect; (c) escape-hatch to `child_process.fork()` + `nodemon`, losing `MessagePortMain` and renderer handoff. Every reviewed approach is untyped at the IPC boundary — no community library provides a typed respawn protocol.

## The utilityProcess API shape (primitives)

Source: https://www.electronjs.org/docs/latest/api/utility-process [CONFIRMED]

```
utilityProcess.fork(modulePath[, args][, options]) → UtilityProcess
```

Instance surface:
- `child.postMessage(message, [transfer])` — sends to child, may transfer `MessagePortMain[]`
- `child.kill()` → `boolean` — "Terminates the process gracefully. On POSIX, it uses SIGTERM but will ensure the process is reaped on exit."
- `child.pid` — `number | undefined`; undefined pre-`spawn` and post-`exit`
- `child.stdout` / `child.stderr` — only when `stdio: 'pipe'`
- Events: `'spawn'`, `'exit'`, `'message'`, `'error'` (experimental V8 fatal)

**No `.respawn()` / `.restart()` method exists.** Restart = `child.kill()` + re-`utilityProcess.fork()`. [CONFIRMED — primary source]

Child-side entrypoint is `process.parentPort` (not `process.send`), and ports arrive via `process.parentPort.on('message', e => { const [port] = e.ports; port.start(); ... })`.

Known API friction relevant to hot-reload:
- `UtilityProcess.kill()` on an already-killed process returns `false` — tracked in https://github.com/electron/electron/issues/44013. You must track liveness yourself across a reload. [CONFIRMED]
- Pre-2024 versions emitted `'exit'` twice in some paths; fixed in https://github.com/electron/electron/pull/44265 (and trop backports #44266, #44268). Any naive "restart on exit" handler must be idempotent. [CONFIRMED]
- Dev vs packaged behavior divergence — https://github.com/electron/electron/issues/42978 reports child exits immediately in packaged mode but persists in dev. This bites reload-on-respawn testing. [CONFIRMED — unresolved as of issue excerpt]

## Maintained tooling (2025-2026)

| Tool | Latest release | Utility-process aware? | Notes |
|------|---------------|------------------------|-------|
| **electron-vite** (alex8088) | Active, 2024-2026 | **No documented utility reload.** Supports `?modulePath` build suffix and `--watch`, but reload path is main-hot-restart + preload hot-reload only. Utility code change → whole-app restart via main-process restart cascade. | https://electron-vite.org/guide/hmr-and-hot-reloading [CONFIRMED] |
| **vite-plugin-electron** | Active | Multi-entry `entry: { main, utility }` rebuilds both; reload is main-process hot-restart. No utility-selective restart. | https://github.com/electron-vite/vite-plugin-electron [CONFIRMED] |
| **@electron-forge/plugin-vite** | Active | `WatchOptions` is a chokidar passthrough. No utility-process semantics. | https://js.electronforge.io/interfaces/_electron_forge_plugin_vite.InternalOptions.WatchOptions.html [CONFIRMED] |
| **electronmon** (catdad) | v2.0.0 / March 2021 | No. Main-process restart + renderer reload only. | https://github.com/catdad/electronmon [CONFIRMED] |
| **electron-reloader** (sindresorhus) | v1.2.3 / Feb 2022 | No. Full app restart on main file change; renderer reload. | https://github.com/sindresorhus/electron-reloader [CONFIRMED — effectively unmaintained] |
| **electron-reload** (yan-foto) | Active-ish | No utility awareness. Accepts chokidar options. | https://github.com/yan-foto/electron-reload [CONFIRMED] |
| **electron-connect** (Quramy) | v0.6.0 / Sept 2016 | No. Unmaintained. | https://github.com/Quramy/electron-connect [CONFIRMED] |
| **electron-hot-reload** (valentineus) | Niche | Separate main/renderer watchers; no utility. | [CONFIRMED — via search index] |
| **electron-watch** (IceEnd) | Niche | Main-process only. | [CONFIRMED — via search index] |
| **vite-plugin-utility-process** | **Does not exist on npm.** | — | [NOT FOUND — negative result] |

**Conclusion:** No tool in the ecosystem has utility-process-aware hot reload as a documented feature. The closest first-class primitive is electron-vite's `?modulePath` import + multi-entry build config, which rebuilds the utility bundle — but the *runtime* restart is always whole-app. [CONFIRMED]

## Community DIY patterns

### Pattern 1 — electron-vite multi-entry build (canonical)

From https://github.com/electron-vite/electron-vite-react/issues/183 comment by maintainer `caoxiemeihao` (verbatim): [CONFIRMED]

```ts
// vite.config.ts
export default {
  plugins: [
    electron({
      entry: {
        main: 'electron/main.ts',
        test: 'electron/test.js', // utility process entry
      },
    }),
  ],
}
```

```js
// electron/main.ts
const { port1, port2 } = new MessageChannelMain()
const child = utilityProcess.fork(path.join(__dirname, 'test.js'))
child.stdout.on('data', (data) => { console.log(`Received chunk ${data}`) })
```

What this does: Vite treats the utility file as a second rollup bundle. On change Vite rebuilds both outputs. **Reload path:** the plugin restarts the Electron main process, which tears down any spawned utility child. No selective utility-only restart. Untyped IPC. [INFERRED from plugin's reload semantics + multi-entry build output]

### Pattern 2 — `?modulePath` suffix (electron-vite only)

From https://electron-vite.org/guide/dev (verbatim): [CONFIRMED]

```js
import { utilityProcess, MessageChannelMain } from 'electron'
import forkPath from './fork?modulePath'
const { port1, port2 } = new MessageChannelMain()
const child = utilityProcess.fork(forkPath)
```

Same runtime reload behavior — rebuilt bundle, but no runtime respawn signal. Untyped.

### Pattern 3 — Manual chokidar + kill + fork (DIY)

No single canonical gist was found as the community standard; the shape assembled from the electron docs + https://www.npmjs.com/package/spawn-auto-restart + https://github.com/IceEnd/electron-watch:

```js
import chokidar from 'chokidar';
import { utilityProcess } from 'electron';
let child = utilityProcess.fork(bundlePath);
chokidar.watch(bundlePath).on('change', () => {
  if (child.pid) child.kill();
  child.once('exit', () => { child = utilityProcess.fork(bundlePath); });
});
```

Untyped. Teams roll this by hand per-project. [INFERRED — pattern recurs across issue threads, no single reference gist]

### Pattern 4 — Escape: `child_process.fork` + `nodemon`

Discussed in https://github.com/electron/electron/issues/6656 and https://www.matthewslipper.com/2019/09/22/everything-you-wanted-electron-child-process.html. Swap `utilityProcess.fork()` for Node `child_process.fork()`, then either (a) use `nodemon --exec` on the child or (b) let the main process spawn `nodemon` directly. [CONFIRMED] Trade-offs below.

## State preservation across restart

What a `kill()` + `fork()` loses:
- **MessagePortMain pairs**: identity does not survive. Parent must re-mint ports and re-transfer. [CONFIRMED — API shape]
- **In-memory state** (indexes, caches, queues).
- **Open sockets** (WebSocket server bindings — port released with process; bind-in-use on rapid restart unless `SO_REUSEADDR` + debounce).
- **Open file handles** — released.
- **Connected clients** — disconnect; external clients see connection close. [CONFIRMED — general Node runtime semantics]

Patterns teams use (surveyed from https://websocket.org/guides/reconnection/ and general child-process-restart literature):
- **Disk-backed state**: flush index/cache on SIGTERM handler; restore on next spawn. Works for immutable corpora, fails for in-flight work.
- **Exponential-backoff reconnect** on client side: standard WebSocket convention.
- **Outbound replay buffer**: TTL ring buffer on parent so child restart replays last N messages.
- **Handoff socket pattern** (rare): pre-bound listener fd passed via `SCM_RIGHTS`. Not documented as an Electron pattern.

No Electron-specific library provides any of these out of the box. All hand-rolled per project. [CONFIRMED — negative search]

## Vite / Rollup / tsdown integration

**What works today (2026-04):**
- `electron-vite dev --watch` rebuilds main-process *and* any declared utility-process entries via multi-entry config. [CONFIRMED]
- `?modulePath` suffix gives main process a bundled-absolute-path string at import time; Vite wires rebuild via that file's dep graph. [CONFIRMED]
- After rebuild the main process is hot-restarted (not utility process selectively). Rollup watch drives the rebuild; electron-vite owns the restart. [CONFIRMED]

**What doesn't exist:**
- A published plugin that does "utility bundle rebuilt → `utilityProcess.kill()` + re-`fork()` without touching the main process." No `vite-plugin-utility-process`, no `electron-vite` HMR integration for utility code. [CONFIRMED — negative search]
- A typed IPC contract that survives respawn. [CONFIRMED — none of the reviewed libraries surface types across respawn]

**tsdown** specifically: thin rolldown/rollup wrapper with `--watch` that can output a utility bundle; same gap — you'd write the restart glue yourself.

## Escape hatch: `child_process.fork` / `worker_threads`

Electron docs explicitly recommend `utilityProcess` over `child_process.fork`: *"An Electron app can always prefer the UtilityProcess API over Node.js child_process.fork API when there is need to fork a child process from the main process."* [CONFIRMED — https://www.electronjs.org/docs/latest/api/utility-process]

Trade-offs:

| Capability | `utilityProcess.fork()` | `child_process.fork()` | `worker_threads` |
|---|---|---|---|
| MessagePort to renderer | Yes (`MessagePortMain`) | No | No (separate V8 isolate, same process) |
| Chromium services integration | Yes | No | N/A |
| Compatible with `nodemon` | Effectively no (Electron owns lifecycle) | Yes (native pattern) | No |
| `ts-node-dev` compatible | No | Yes | Partial |
| IPC shape | `postMessage` + `MessagePortMain` | `process.send` / JSON IPC | `postMessage` (structured clone) |
| Survives main-process crash | No (child-of-main) | No | No |

**Practical consequence for a dev-only hot-reload:** some teams keep two code paths — `utilityProcess.fork` in packaged builds, `child_process.fork` wrapped by `nodemon` during dev. This doubles the code path and loses renderer-direct MessagePort handoff in dev. [INFERRED — pattern surfaced across issue threads, not a single canonical source]

## Reference implementation (best pattern found)

**No single verbatim ~50-line reference exists in the community as of this research.** [NOT FOUND]

The closest viable pattern, synthesized from verbatim electron-vite example + `.kill()`/`.fork()` API + chokidar semantics (not an attributed gist):

```ts
// main/utility-supervisor.ts — synthesized, untyped IPC
import { utilityProcess, type UtilityProcess, MessageChannelMain } from 'electron';
import chokidar from 'chokidar';
import { once } from 'node:events';

export function superviseUtility(bundlePath: string, onPort: (port: Electron.MessagePortMain) => void) {
  let child: UtilityProcess | null = null;
  let restarting = false;

  const spawn = () => {
    child = utilityProcess.fork(bundlePath);
    const { port1, port2 } = new MessageChannelMain();
    child.once('spawn', () => child!.postMessage({ kind: 'init' }, [port1]));
    child.once('exit', () => { child = null; });
    onPort(port2); // parent side of fresh MessagePort; renderer must re-handoff
  };

  const restart = async () => {
    if (restarting) return; restarting = true;
    if (child?.pid) { child.kill(); await once(child, 'exit'); }
    spawn();
    restarting = false;
  };

  chokidar.watch(bundlePath, { ignoreInitial: true }).on('change', () => void restart());
  spawn();
  return { restart, kill: () => child?.kill() };
}
```

**Typing gap flag (per downstream consumer preference):** the `onPort(port2)` surface passes a bare `Electron.MessagePortMain`. Every respawn mints a new port, so any typed IPC layer on top (zod-validated envelope, tRPC link, typed-RPC contract) must re-bind on every `restart()` — no library in the ecosystem ships this. Building typed hot-reload requires either (a) a typed envelope that wraps send/recv and is re-initialized on each `'spawn'` event, or (b) accepting whole-app restart and keeping types at build time only. [CONFIRMED — ecosystem gap]

## Implications for parent §E1

Concrete additions to the parent report's §E1:

1. **The gap is real and unresolved.** No framework (electron-vite, electron-forge, electron-builder) has utility-process-selective reload. Parent report's phrasing stands.
2. **electron-vite has a build primitive but not a runtime primitive.** `?modulePath` and multi-entry *rebuild* the bundle; the only runtime response is whole-app hot-restart via main-process restart. If an AI coding-agent app's utility process holds expensive state (indexes, WebSocket servers, open file handles, MCP client connections), every main-source edit dumps that state.
3. **The `UtilityProcess` API itself is the deepest blocker.** No `.respawn()`. No port-identity preservation. `.kill()` idempotency landmine (#44013). Dev-vs-packaged behavior divergence (#42978). Any ecosystem fix has to work around these, not on top of them.
4. **The untyped-IPC tax compounds on hot-reload.** Because every respawn mints new MessagePorts, a typed IPC layer (which the downstream consumer prefers) must be re-initialized post-`'spawn'` every cycle. No library ships this; it's bespoke.
5. **Default recommendation for an agent app with expensive utility state:** (a) architect the utility process to persist state to disk every N seconds or on SIGTERM, (b) expect whole-app restart as hot-reload path, (c) implement exponential-backoff reconnect on renderer/external-client side, (d) accept untyped IPC at the boundary or wrap in a re-bindable typed envelope.
6. **If hot-reload of utility code is a P0 dev-experience requirement,** the pragmatic escape is `child_process.fork()` + `nodemon` during dev, `utilityProcess.fork()` in production, accepting the dual-code-path cost. [INFERRED]

## UNRESOLVED / NOT FOUND

- **No canonical reference-impl gist** for utility-process hot-reload exists in the community as of this search. The synthesis above is the closest approximation.
- **No typed IPC library** (trpc-electron, electron-trpc, comlink-wrapped) documents a respawn story. [NOT FOUND]
- **No published `vite-plugin-utility-process`** on npm. [NOT FOUND]
- **electron-vite HMR roadmap for utility processes** — no tracking issue surfaced. [NOT FOUND]
- **electron-forge plugin-vite utility-process handling** — docs silent; source would need to be read to confirm clean respawn vs orphan on main restart. [UNCERTAIN]

## References

- https://www.electronjs.org/docs/latest/api/utility-process — primary API doc
- https://electron-vite.org/guide/dev — `?modulePath` example verbatim
- https://electron-vite.org/guide/hmr-and-hot-reloading — hot-reload scope
- https://github.com/electron-vite/electron-vite-react/issues/183 — multi-entry utility pattern, maintainer comment verbatim
- https://github.com/electron-vite/vite-plugin-electron — plugin README
- https://js.electronforge.io/interfaces/_electron_forge_plugin_vite.InternalOptions.WatchOptions.html — chokidar passthrough
- https://github.com/electron/electron/issues/42978 — dev-vs-packaged utilityProcess divergence
- https://github.com/electron/electron/issues/44013 — `.kill()` on killed process
- https://github.com/electron/electron/pull/44265 — duplicate-`'exit'` fix
- https://github.com/electron/electron/issues/6656 — `child_process.fork` in Electron
- https://github.com/catdad/electronmon — maintenance status
- https://github.com/sindresorhus/electron-reloader — maintenance status
- https://github.com/Quramy/electron-connect — unmaintained
- https://github.com/yan-foto/electron-reload — chokidar options passthrough
- https://www.matthewslipper.com/2019/09/22/everything-you-wanted-electron-child-process.html — child_process in Electron primer
- https://websocket.org/guides/reconnection/ — reconnection patterns
