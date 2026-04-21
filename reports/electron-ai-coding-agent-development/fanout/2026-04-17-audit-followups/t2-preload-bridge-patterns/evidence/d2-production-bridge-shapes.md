# Evidence: D2 — Production preload bridge API shapes

**Dimension:** D2 (P0) — Shape of `window.X` API in production Electron apps
**Date:** 2026-04-17
**Sources:** VS Code (local clone), Mattermost Desktop (GitHub API), Logseq (local clone), GitHub Desktop (local clone)

---

## Key files referenced

- `~/.claude/oss-repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts` — VS Code main preload (sandbox-compatible)
- `~/.claude/oss-repos/vscode/src/vs/base/parts/sandbox/electron-browser/preload-aux.ts` — VS Code aux preload for secondary windows
- `~/.claude/oss-repos/vscode/src/vs/base/parts/sandbox/electron-browser/globals.ts` — type definitions for `window.vscode`
- `~/.claude/oss-repos/vscode/src/vs/base/parts/sandbox/electron-browser/electronTypes.ts` — copied Electron types
- `~/.claude/oss-repos/vscode/src/vs/platform/windows/electron-main/windowImpl.ts` (L706-710) — main-side configuration passing
- `~/.claude/oss-repos/logseq/resources/js/preload.js` — Logseq preload
- `~/.claude/oss-repos/desktop/app/src/lib/ipc-renderer.ts` — GitHub Desktop typed IPC wrapper
- `~/.claude/oss-repos/desktop/app/src/ui/main-process-proxy.ts` — GitHub Desktop proxy surface
- `~/.claude/oss-repos/desktop/app/src/lib/ipc-shared.ts` — GitHub Desktop shared channel types
- Mattermost Desktop `src/app/preload/internalAPI.js` (via `gh api repos/mattermost/desktop/contents/...`)

---

## Findings

### Finding: VS Code exposes a **narrow, typed, method-only** surface named `window.vscode`
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:251`

```typescript
contextBridge.exposeInMainWorld('vscode', globals);
```

Where `globals` is an object containing five namespaces:

```typescript
const globals = {
  ipcRenderer: { send, invoke, on, once, removeListener },  // all channel-validated
  ipcMessagePort: { acquire },
  webFrame: { setZoomLevel },
  webUtils: { getPathForFile },
  process: { platform, arch, env, versions, type, execPath, cwd(), shellEnv(), ... },
  context: {
    configuration(): ISandboxConfiguration | undefined,
    resolveConfiguration(): Promise<ISandboxConfiguration>,
  },
};
```

Every exposed `ipcRenderer.send/invoke/on` call invokes `validateIPC(channel)` which throws unless the channel starts with `vscode:`:

```typescript
function validateIPC(channel: string): true | never {
  if (!channel?.startsWith('vscode:')) {
    throw new Error(`Unsupported event IPC channel '${channel}'`);
  }
  return true;
}
```

**Implications:** VS Code exposes raw IPC primitives but **narrows the channel namespace** rather than wrapping each channel. Safer than unrestricted IPC exposure but less restrictive than Mattermost/Logseq's method-per-channel wrapping. The trade is extensibility (new channels don't require preload changes) vs. audit surface (any channel prefixed `vscode:` is callable).

---

### Finding: VS Code's config-bootstrap pattern uses `additionalArguments` + `ipcRenderer.invoke`
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/platform/windows/electron-main/windowImpl.ts:705-710`, `preload.ts:40-67`

Main process creates an IPC object URL and passes it as a CLI argument:

```typescript
const webPreferences: electron.WebPreferences = {
  preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js').fsPath,
  additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
  v8CacheOptions: ...,
};
```

Preload reads the CLI arg and fetches config via `ipcRenderer.invoke`:

```typescript
const windowConfigIpcChannel = parseArgv('vscode-window-config');
const resolvedConfiguration = await ipcRenderer.invoke(windowConfigIpcChannel);
// ...
webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);
```

Renderer accesses config via a method, not a property:

```typescript
context: {
  configuration(): ISandboxConfiguration | undefined { return configuration; },
  async resolveConfiguration(): Promise<ISandboxConfiguration> { return resolveConfiguration; },
},
```

**Implications:** Config is **fetched** at preload init, not injected at construction. The two-step design (argv → IPC invoke) means the preload is stateless on the main-side config; any config change would re-create the window. This is a reasonable design when config doesn't change during a window's lifetime — but does NOT fit a "project-switch in-place" UX.

---

### Finding: Mattermost Desktop exposes **method-per-channel** under `window.desktop`, with 40+ `onFoo(listener)` subscriptions
**Confidence:** CONFIRMED
**Evidence:** `mattermost/desktop/src/app/preload/internalAPI.js`

```javascript
contextBridge.exposeInMainWorld('desktop', {
  quit: (reason, stack) => ipcRenderer.send(QUIT, reason, stack),
  openAppMenu: () => ipcRenderer.send(OPEN_APP_MENU),
  // ... 40+ send/invoke methods
  getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION),
  getVersion: () => ipcRenderer.invoke(GET_APP_INFO),
  getDarkMode: () => ipcRenderer.invoke(GET_DARK_MODE),
  // ... 30+ onFoo subscription methods
  onServerAdded: (listener) => ipcRenderer.on(SERVER_ADDED, (_, serverId, setAsCurrentServer) => listener(serverId, setAsCurrentServer)),
  onServerRemoved: (listener) => ipcRenderer.on(SERVER_REMOVED, (_, serverId) => listener(serverId)),
  onServerSwitched: (listener) => ipcRenderer.on(SERVER_SWITCHED, (_, serverId) => listener(serverId)),
  // ...
  onReloadConfiguration: (listener) => {
    ipcRenderer.on(RELOAD_CONFIGURATION, () => listener());
    return () => ipcRenderer.off(RELOAD_CONFIGURATION, listener);  // ← only this one returns unsubscribe!
  },
});
```

Also exposes `contextBridge.exposeInMainWorld('process', { platform, env: {user, username} })` — a **separate namespace** for read-only process info.

Also exposes `contextBridge.exposeInMainWorld('timers', { setImmediate })` — a **single-function namespace** to bring back `setImmediate` which otherwise isn't available cross-isolation without explicit exposure.

**Implications:** Mattermost's subscription methods **do not** consistently return unsubscribes — only `onReloadConfiguration` does. This is a live footgun (see D1 memory-leak finding) but apparently tolerable at Mattermost's scale — listeners are registered once at React component mount and not unregistered until window close. Our design returning unsubscribe from every `on*` method is strictly safer.

---

### Finding: Logseq uses a flatter `window.apis` with both granular methods and raw `invoke`/`on` escape hatches
**Confidence:** CONFIRMED
**Evidence:** `logseq/resources/js/preload.js:36-151`

```javascript
contextBridge.exposeInMainWorld('apis', {
  doAction: async (arg) => await ipcRenderer.invoke('main', arg),
  invoke: async (channel, args) => await ipcRenderer.invoke(channel, ...args),
  addListener: ipcRenderer.on.bind(ipcRenderer),           // ← RAW exposure (antipattern per Electron docs)
  removeListener: ipcRenderer.removeListener.bind(ipcRenderer),  // ← will fail due to function-identity bug
  removeAllListeners: ipcRenderer.removeAllListeners.bind(ipcRenderer),
  on: (channel, callback) => { /* wrap */ },
  off: (channel, callback) => { /* conditional removeListener */ },
  checkForUpdates, installUpdatesAndQuitApp, openExternal, openPath,
  exportPublishAssets, toggleMaxOrMinActiveWindow,
  getFilePathFromClipboard, getClipboardData,
  setZoomFactor, setZoomLevel,
});
```

Key quirks:
- `openExternal` is called from preload directly (not proxied through main) with a protocol allowlist (`https`, `http`, `mailto`, `zotero`, `file`).
- `getClipboardData` calls `clipboard.readBuffer` from preload directly (sandbox-incompatible pattern).
- Mixes raw ipcRenderer method passthroughs (`addListener: ipcRenderer.on.bind(ipcRenderer)`) with wrapped `on(channel, callback)`. The `removeListener` passthrough is broken for callbacks registered via the wrapped `on` (function identity).

**Implications:** Logseq's pattern predates the hardening of contextBridge best practices. Serves as a counter-example: even shipping OSS apps have inconsistent patterns. Notable: preload must have access to `clipboard` module which implies `sandbox: false` is set on the renderer — confirmed by Logseq's Electron setup.

---

### Finding: GitHub Desktop uses `nodeIntegration: true` + `contextIsolation: false` — no contextBridge at all
**Confidence:** CONFIRMED
**Evidence:** `desktop/app/src/main-process/app-window.ts:65-72`

```typescript
webPreferences: {
  disableBlinkFeatures: 'Auxclick',
  nodeIntegration: true,
  spellcheck: true,
  contextIsolation: false,
},
```

Renderer imports `ipcRenderer` directly: `desktop/app/src/lib/ipc-renderer.ts:3`

```typescript
import { ipcRenderer, IpcRendererEvent } from 'electron'
```

And wraps it with typed `invoke`/`send`/`on`/`removeListener` helpers using `keyof RequestChannels`/`RequestResponseChannels` channel-typing pattern:

```typescript
export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as any
}
```

**Implications:** GitHub Desktop is **not** an example of modern contextBridge best practice. It's a pre-contextIsolation-default codebase running a trusted, first-party UI. Its value as a reference is in the **TypeScript channel-typing pattern** (via `RequestChannels` / `RequestResponseChannels` maps), which can be layered on top of a contextBridge-wrapped `invoke`/`send` with the same types. Mattermost's flat method-per-channel approach and VS Code's narrow-channel-namespace approach are the two patterns that *would* be safe under `contextIsolation: true`.

---

### Finding: GitHub Desktop's typed channel contract uses a `keyof`-indexed type map
**Confidence:** CONFIRMED
**Evidence:** `desktop/app/src/lib/ipc-shared.ts:27-90`

```typescript
export type RequestChannels = {
  'select-all-window-contents': () => void
  'dialog-did-open': () => void
  'update-menu-state': (state: Array<{ id: MenuIDs; state: IMenuItemState }>) => void
  'renderer-ready': (time: number) => void
  'execute-menu-item-by-id': (id: string) => void
  // ...dozens more
  'cli-action': (action: CLIAction) => void
  'notification-event': NotificationCallback<DesktopAliveEvent>
  // ...
}

export type RequestResponseChannels = {
  // ...duplex channels with Promise-wrapped return types
}
```

This contract is imported by **both** the main process handlers and the renderer proxy. TypeScript ensures the signatures match at both ends.

**Implications:** For typed bridges, the "channel as a keyof map" pattern is the industry precedent. Our proposed bridge uses typed method names directly (`onProjectSwitched`, `onMenuAction`) which is cleaner for a narrow, fixed surface. The channel-map pattern shines when you have 100+ channels and want to avoid writing 100+ preload wrappers.

---

### Finding: VS Code maintains a parallel `preload-aux.ts` with a **smaller** surface for secondary/auxiliary windows
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/base/parts/sandbox/electron-browser/preload-aux.ts:10-57`

```typescript
const globals = {
  ipcRenderer: { send, invoke },   // ← no on/once/removeListener
  webFrame: { setZoomLevel },
};
contextBridge.exposeInMainWorld('vscode', globals);
```

Quoted type contract (`globals.ts:154-157`):

```typescript
export interface ISandboxGlobals {
  readonly ipcRenderer: Pick<IpcRenderer, 'send' | 'invoke'>;
  readonly webFrame: WebFrame;
}
```

**Implications:** VS Code uses **the same global name (`window.vscode`) with a smaller surface** for secondary windows. This is a "capabilities-reduction" pattern — code that works against `ISandboxGlobals` (smaller) can run in either window type, but code requiring subscriptions gets `IMainWindowSandboxGlobals` (larger). For our app, since there's only one window type (the editor), we don't need aux. But the pattern is worth knowing for future multi-window scenarios.

---

## Negative searches (for NOT FOUND)

- Searched Signal Desktop, Standard Notes for preload scripts: repos not cached locally and not pursued further in fanout scope (D2 achieved saturation with VS Code + Mattermost + Logseq + GitHub Desktop).
- Searched for Obsidian preload: closed-source, not verifiable.

---

## Gaps / follow-ups

- None material. The four patterns cover the design-space corners: narrow-channel-namespace (VS Code), method-per-channel (Mattermost), flat-with-escape-hatch (Logseq), no-bridge-typed-IPC (GitHub Desktop).
