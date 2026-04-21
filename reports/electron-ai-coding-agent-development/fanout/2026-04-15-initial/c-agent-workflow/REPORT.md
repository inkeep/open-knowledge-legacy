# Cluster C: AI agent workflow specifics, IPC observability, quality gates

**Dimensions:** D5, D9, D10
**Date:** 2026-04-15
**Worker:** c-agent-workflow

## Summary

Electron's multi-process model is hostile to the single-log-pipe assumption that underlies most AI coding agent loops. Three concrete frictions dominate: (1) renderer `console.*` output does **not** reach the terminal an agent is watching unless the app is launched with `--enable-logging` or CDP is attached via `--remote-debugging-port`; (2) native module rebuilds (`@electron/rebuild`) return a Promise with no structured error format, leaving agents to regex stack traces; (3) a renderer "reload" leaves main-process state fully intact, so iterating on main-process code requires a full app restart — agents must distinguish "reload the window" from "restart the app" explicitly. The ecosystem has converged on three patterns that help: **CDP attach via `webContents.debugger`** (in-process, no external port needed); **`electron-log` with `errorHandler.startCatching()` + `eventLogger.startLogging()`** to coerce both processes into one file; and **Sentry Electron's ElectronMinidump integration** (v7.11.0, 2026-04-07) to capture native crashes that would otherwise vanish.

For IPC typing (D9), the landscape has a clean hierarchy. **Hand-rolled typed channel maps** (GitHub Desktop's `RequestChannels` / `RequestResponseChannels` discriminated-union pattern, paired with a `no-loosely-typed-webcontents-ipc` custom ESLint rule) remain the reference implementation for strictly-typed IPC without runtime deps. **`electron-trpc` v0.7.1 (Dec 2024) / `trpc-electron` (fork for tRPC v11)** offer the "typed procedure call" upgrade path with queries/mutations/subscriptions over `contextBridge`. **`@electron-toolkit/preload` + `@electron-toolkit/typed-ipc`** provide a middle-ground with prebuilt `electronAPI` and typed-channel helpers. All three presuppose `contextIsolation: true` (Electron default since 12.0.0).

For quality gates (D10), **Electronegativity (Doyensec) is unmaintained** as of Dec 2022 — a gap the ecosystem has not filled; its commercial successor ElectroNG is paid. **`electron/eslint-config` is stale** (v1.0.1, Nov 2021). **Teams writing their own rules** (GitHub Desktop ships 5 custom rules in `eslint-rules/`) is the observed pattern. Machine-parseable output exists in every layer (`eslint --format json`, `tsc --pretty false`, Playwright `--reporter=json,junit`) but Electron-specific security gates mostly rely on `npm audit` + manual CVE tracking — the 2026 CVE list for `electron` is substantial.

## D5 — AI coding agent workflow specifics with Electron

### Finding: Renderer console output does not reach stdout by default
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/command-line-switches and https://github.com/electron/electron/issues/48395

> "Chromium logs can be enabled via the ELECTRON_ENABLE_LOGGING environment variable. Alternatively, the command line argument --enable-logging can be passed. More specifically, passing --enable-logging will result in logs being printed on stderr."

Issue 48395 (Electron 38.1.2, 2025) notes renderer `console.log` *does* reach stdout when using a persistent session — but this is characterized as a defect, not a stable contract. Closed "not planned."

**Implications for agent-velocity:** An agent that launches Electron via `bun run dev` and greps the terminal for errors misses all renderer-side failures unless the launcher explicitly sets `ELECTRON_ENABLE_LOGGING=1` or `--enable-logging=stderr`.

### Finding: `webContents.debugger` provides in-process CDP attach without `--remote-debugging-port`
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/debugger — API: `debugger.attach([protocolVersion])`, `debugger.sendCommand(method, commandParams, sessionId)`, `debugger.on('message', ...)`. Methods "should be one of the methods defined by the remote debugging protocol." Docs example uses `Network.enable` + `Network.requestWillBeSent`; by extension `Runtime.enable` + `Runtime.consoleAPICalled` are standard CDP domains.

**Implications for agent-velocity:** A main-process harness can attach to its own renderer via `win.webContents.debugger.attach('1.3')` and forward `Runtime.consoleAPICalled` events to a structured log file — no external port, no `chrome-remote-interface` dep, no port collisions. Canonical pattern for agent-readable renderer logs.

### Finding: `--remote-debugging-port` is the external-tool path; electron-vite wires it via `REMOTE_DEBUGGING_PORT` env
**Confidence:** CONFIRMED
**Evidence:** https://electron-vite.org/guide/debugging — "electron-vite already supports `--inspect`, `--inspect-brk`, `--remote-debugging-port` and `--no-sandbox`." VS Code pattern sets `REMOTE_DEBUGGING_PORT=9222` and attaches a Chrome debugger.

**Implications for agent-velocity:** For headless agent harnesses launching Electron in CI and scraping logs from outside, `--remote-debugging-port=9222` + `chrome-remote-interface` is the pattern. Port conflicts under concurrent agent runs are the primary operational risk.

### Finding: Main-process state is preserved across renderer reload
**Confidence:** INFERRED
**Evidence:** https://www.geeksforgeeks.org/hot-reload-in-electronjs/ and https://github.com/electron/electron/issues/21725 — "When source code of files used in the Main Process are changed, the app is restarted, and when the source code of files used in the Renderer Process are changed, the page is reloaded." `webContents.reload()` or Cmd+R re-mounts the renderer window only; main-process state (IPC handlers, DB connections, `ipcMain.handle` registrations) persists.

**Implications for agent-velocity:** Agents iterating on renderer code get fast reloads; iterating on main-process or preload code requires a full process restart. A dev-loop harness must expose both as distinct commands.

### Finding: `@electron/rebuild` failure surface is Promise-reject without structured JSON
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/rebuild/blob/main/README.md (v4.0.3, 2026-01-27) — "Returns a Promise indicating whether the operation succeeded or not." No documented JSON output mode, no exit-code taxonomy. Underlying errors surface via `node-gyp` stderr.

**Implications for agent-velocity:** The "10-minute rebuild" failure mode is real and agent-hostile. Workaround: wrap `rebuild()` in try/catch, stringify `err.stack`, persist to a rebuild-log file agents can tail.

### Finding: Sentry Electron SDK v7.11.0 covers main + renderer + utility + native minidumps
**Confidence:** CONFIRMED
**Evidence:** https://github.com/getsentry/sentry-electron (v7.11.0, 2026-04-07) — "Captures Node errors in the main process (using @sentry/node), JavaScript errors in renderer processes (using @sentry/browser), native crashes (Minidump crash reports) from renderers and the main process." Separate init: `@sentry/electron/main`, `@sentry/electron/renderer`, `@sentry/electron/utility`. Preload scripts with `contextIsolation: true` require separate init.

**Implications for agent-velocity:** Sentry is the only turnkey path that captures native crashes (Chromium's `minidump.dmp` format) — `process.on('uncaughtException')` alone catches JS-level throws but not segfaults or crashes inside native modules.

### Finding: `electron-log` is the community-standard multi-process log router
**Confidence:** CONFIRMED
**Evidence:** https://github.com/megahertz/electron-log (v5 requires Electron 13+) — `log.errorHandler.startCatching()` catches unhandled errors + rejected promises. `log.eventLogger.startLogging()` monitors `certificate-error`, `render-process-gone`, webContents crashes, load failures. File transport default path: `~/Library/Logs/{app name}/main.log` (macOS). Format is template-string, NOT structured JSON by default.

**Implications for agent-velocity:** `electron-log` unifies main + renderer into one file an agent can tail, but the default format is not structured. An agent-friendly setup requires a custom `format` function emitting JSON lines.

### Finding: Multi-process `tsc --noEmit` has no Electron-specific glue
**Confidence:** INFERRED
**Evidence:** GitHub Desktop uses a single webpack compile; electron-vite uses separate `tsconfig.node.json` + `tsconfig.web.json`.

**Implications for agent-velocity:** `tsc --noEmit --pretty false` yields parseable line diagnostics per process. TypeScript emits no "machine-applicable suggestions" in the rustc sense — the equivalent is ESLint's `fixable` rules.

## D9 — IPC observability + typed contextBridge

### Finding: GitHub Desktop's typed channel map is the reference for runtime-free IPC typing
**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/desktop/app/src/lib/ipc-shared.ts:27-90` and `main-process/ipc-main.ts:22-51`

```typescript
// ipc-shared.ts
export type RequestChannels = {
  'select-all-window-contents': () => void
  'update-menu-state': (state: Array<{ id: MenuIDs; state: IMenuItemState }>) => void
  'execute-menu-item-by-id': (id: string) => void
  // ...
}
export type RequestResponseChannels = { /* invoke-style, promise returns */ }

// ipc-main.ts
export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: (event: IpcMainEvent, ...args: Parameters<RequestChannels[T]>) => void
) { ipcMain.on(channel, safeListener(listener)) }
```

Paired with `trusted-ipc-sender.ts` allowlist — every handler rejects events whose `event.sender` isn't trusted.

**Implications for agent-velocity:** Discriminated-union channel maps produce crisp TS errors at every callsite when a signature changes. No runtime deps, no bundle cost, trivially Grep-able.

### Finding: GitHub Desktop ships a custom ESLint rule to ban loose `webContents.send`
**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/desktop/eslint-rules/no-loosely-typed-webcontents-ipc.js` reports `wc.send(...)`, `*.webContents?.send(...)`, `webContents.send(...)` with message "Please use the strongly typed IPC helper methods from `ipc-webcontents` instead". `.eslintrc.yml:160-183` uses `no-restricted-imports` to ban bare `ipcMain` / `ipcRenderer` from `electron`.

**Implications for agent-velocity:** A single custom rule closes the type-erosion hole. Agents refactoring IPC can't accidentally regress to untyped channels.

### Finding: `electron-trpc` (v0.7.1, Dec 2024) + `trpc-electron` fork (tRPC v11) is the typed-RPC path
**Confidence:** CONFIRMED
**Evidence:** https://github.com/jsonnull/electron-trpc and https://github.com/mat-sz/trpc-electron

```javascript
// main
import { createIPCHandler } from 'electron-trpc/main';
createIPCHandler({ router, windows: [win] });

// preload
import { exposeElectronTRPC } from 'electron-trpc/main';
process.once('loaded', async () => { exposeElectronTRPC(); });

// renderer
import { ipcLink } from 'electron-trpc/renderer';
export const client = createTRPCProxyClient({ links: [ipcLink()] });
```

Requires `contextIsolation: true`. `trpc-electron` fork tracks tRPC v11.

**Implications for agent-velocity:** tRPC over IPC gives queries, mutations, and subscriptions with full end-to-end type inference. Downside: the IPC channel is now opaque (single `trpc` channel with payload envelopes), harder to `console.log`/grep than named channels.

### Finding: `@electron-toolkit/preload` + `@electron-toolkit/typed-ipc` is the middle tier
**Confidence:** CONFIRMED
**Evidence:** https://github.com/alex8088/electron-toolkit

```typescript
// preload.ts
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
contextBridge.exposeInMainWorld('electron', electronAPI)
```

**Implications for agent-velocity:** Opinionated scaffolding — less custom code to maintain, no Zod/TypeBox runtime validation. Canonical `electronAPI` + typed `Window.electron` gives agents a consistent shape across repos.

### Finding: Runtime schema validation at IPC boundaries is not a standard standalone pattern
**Confidence:** NOT FOUND (as a widely-adopted library)
**Evidence:** Searches for "Zod contextBridge IPC", "TypeBox electron IPC", "Valibot electron" surface individual blog posts but no adopted library. tRPC router definitions use Zod/Valibot, so `electron-trpc` users get this transitively.

**Implications for agent-velocity:** Hand-rolled channel maps have TS-only typing; an untrusted/compromised renderer can send arbitrary payloads. Pair with `isTrustedIPCSender` or tRPC's schema validation.

### Finding: `contextBridge.exposeInMainWorld` serializes structured-clone, drops prototypes
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/context-bridge — "Any data / primitives sent in the API become immutable and updates on either side of the bridge do not result in an update on the other side." "Sending custom classes will copy values but not the prototype."

**Implications for agent-velocity:** Agents shipping class instances across the bridge hit silent breakage — methods disappear. Pattern: expose pure-function APIs and plain data, not class instances.

### Finding: IPC recording/replay for debugging is not a standard library
**Confidence:** NOT FOUND
**Evidence:** Searches for "IPC record replay electron", "electron-devtools-installer IPC inspector", "redux-devtools electron IPC" surface only redux-devtools (renderer-side only) and one-off gists.

**Implications for agent-velocity:** For cross-process race debugging, agents fall back to manual logging at every `ipcMain.handle` / `ipcRenderer.invoke` callsite.

## D10 — Quality gates + machine-parseable output

### Finding: Electronegativity is unmaintained; commercial ElectroNG is the only updated path
**Confidence:** CONFIRMED
**Evidence:** https://github.com/doyensec/electronegativity — "We're no longer actively maintaining this project." v1.10.0 (2022-12-07). Output: CSV or SARIF via `-o`; programmatic API returns JSON with `severity`, `confidence`, `file location`, `check ID`.

**Implications for agent-velocity:** SARIF output is still agent-parseable and GitHub-native. No coverage for post-2022 CVEs, no Electron 30+ fuses, no new contextBridge vectors. Useful baseline; not authoritative on current attack surface.

### Finding: `electron/eslint-config` is stale; teams ship their own rules
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/eslint-config — "v1.0.1, Nov 8, 2021." GitHub Desktop's `.eslintrc.yml:24-28` enables 5 custom rules: `insecure-random`, `react-no-unbound-dispatcher-props`, `react-readonly-props-and-state`, `react-proper-lifecycle-methods`, `no-loosely-typed-webcontents-ipc`, plus `no-restricted-imports` forcing typed-wrapper usage.

**Implications for agent-velocity:** No off-the-shelf "Electron security ESLint pack" is maintained. Agents either roll their own rules (GitHub Desktop model) or use `@electron-toolkit/eslint-config-ts`.

### Finding: ESLint, TypeScript, Playwright, Vitest all emit machine-parseable output
**Confidence:** CONFIRMED
**Evidence:**
- ESLint: https://eslint.org/docs/latest/use/formatters/ — `--format json`
- TypeScript: `tsc --pretty false --noEmit`
- Playwright: `--reporter=json` / `--reporter=junit`
- Vitest: `--reporter=json` / `--reporter=junit`

**Implications for agent-velocity:** Every gate produces parseable output. The gap is Electron-specific: no tool emits "you broke IPC type contract X" as structured data — teams reduce this to TS compile errors by design (channel-map pattern).

### Finding: `npm audit` + GitHub Advisory Database is the CVE gate; 2026 Electron CVE density is high
**Confidence:** CONFIRMED
**Evidence:** https://github.com/advisories — observed 2026 Electron CVEs (one quarter): CVE-2026-34767 (HTTP header injection in custom protocols), 34769 (renderer command-line switch injection), 34770 (PowerMonitor UAF Win/macOS), 34773 (registry key path injection Win), 34778 (service worker spoofing executeJavaScript IPC replies), 34779 (AppleScript injection in moveToApplicationsFolder), 34780 (contextIsolation bypass via VideoFrame transfer).

**Implications for agent-velocity:** Electron's security surface is broad enough that CVE patching is a recurring cadence. `npm audit --json` / `bun audit --json` is the gate.

### Finding: Biome vs ESLint — Biome v2 viable but Electron ecosystem is ESLint-native
**Confidence:** INFERRED
**Evidence:** Biome v2 (stable 2025) covers lint+format in one Rust binary but has no Electron-specific rules; OSS Electron repos (GitHub Desktop, Logseq, electron-vite templates) remain ESLint-based with custom rules. Biome outputs `--reporter=github` / `--reporter=json` / `--reporter=sarif`.

**Implications for agent-velocity:** Biome speed advantage is real; tradeoff is losing `no-loosely-typed-webcontents-ipc`-style custom rules. Defensible split: Biome for format+baseline lint + ESLint for custom Electron rules.

### Finding: Bundle-size / `.asar` size gates are not standard-tool affair
**Confidence:** NOT FOUND (as Electron-specific gate)
**Evidence:** No dedicated tool surfaced; teams use `bundlewatch`, `size-limit`, or custom CI scripts against packaged `.asar` and per-platform binaries.

**Implications for agent-velocity:** Agents on size-sensitive features must add their own size-limit config.

## Cross-dimension patterns

1. **The process boundary is the observability boundary.** Every pain point (D5 log capture, D9 IPC typing, D10 schema enforcement) reduces to "Electron has no unified contract across main/renderer." Tools that work (electron-log, electron-trpc, Sentry Electron) share one trait: they init separately in each process with matched APIs.
2. **Custom ESLint rules beat packaged Electron rulesets.** The 2021-era `electron/eslint-config` and Electronegativity's 2022 freeze mean the current SOTA is "read GitHub Desktop's `eslint-rules/` and port." A gap an agent-first repo can close.
3. **CDP-via-`webContents.debugger` under-used.** The in-process CDP attach pattern is documented but rarely shown in agent tutorials. Solves renderer log capture without `--remote-debugging-port` / `chrome-remote-interface`.
4. **`contextIsolation: true` is the floor.** All three typed-IPC options require it. Electron's security checklist makes it default.

## UNRESOLVED / NOT FOUND

- **Structured error format from `@electron/rebuild`** → not found. Failures surface as `node-gyp` stderr; no `--json` flag.
- **IPC recording/replay tool for Electron** → not found as maintained library.
- **Maintained Electron security ESLint plugin** → not found. `eslint-plugin-electron` archived/inactive.
- **Zod/TypeBox IPC validation library (standalone, non-tRPC)** → not found as widespread package.
- **TypeScript "machine-applicable suggestions" equivalent for multi-process Electron** → not found.
- **Electron `.asar` / binary size gate tool** → not found as Electron-specific.

## References

Electron & Chromium:
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/debugger
- https://www.electronjs.org/docs/latest/api/context-bridge
- https://www.electronjs.org/docs/latest/api/command-line-switches
- https://www.electronjs.org/docs/latest/api/crash-reporter
- https://github.com/electron/electron/issues/48395

Logging & crash reporting:
- https://github.com/megahertz/electron-log
- https://github.com/getsentry/sentry-electron
- https://docs.sentry.io/platforms/javascript/guides/electron/
- https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/

IPC typing:
- https://github.com/jsonnull/electron-trpc
- https://github.com/mat-sz/trpc-electron
- https://github.com/alex8088/electron-toolkit
- https://github.com/JichouP/electron-typescript-ipc
- GitHub Desktop ref impl on disk: `~/.claude/oss-repos/desktop/app/src/lib/ipc-shared.ts:27-90`, `main-process/ipc-main.ts:22-51`, `eslint-rules/no-loosely-typed-webcontents-ipc.js`, `.eslintrc.yml:160-183`, `main-process/trusted-ipc-sender.ts`

Quality gates:
- https://github.com/doyensec/electronegativity
- https://github.com/electron/eslint-config
- https://eslint.org/docs/latest/use/formatters/
- https://github.com/advisories
- https://github.com/electron/rebuild

Build tooling:
- https://electron-vite.org/guide/debugging
- https://electron-vite.org/guide/cli
