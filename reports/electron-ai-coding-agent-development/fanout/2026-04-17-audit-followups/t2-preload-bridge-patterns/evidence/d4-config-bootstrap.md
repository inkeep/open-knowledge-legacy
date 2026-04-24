# Evidence: D4 — Config bootstrap: inject vs fetch

**Dimension:** D4 (P0) — How production apps seed renderer config
**Date:** 2026-04-17
**Sources:** VS Code, Mattermost Desktop, Logseq, electronjs.org

---

## Key references

- `vscode/src/vs/platform/windows/electron-main/windowImpl.ts:698-707` — VS Code config URL injected via `additionalArguments`
- `vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:38-67` — preload reads argv, invokes IPC to fetch
- `mattermost/desktop/src/app/preload/internalAPI.js` — `getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION)`
- https://www.electronjs.org/docs/latest/api/browser-window#new-browserwindowoptions — `webPreferences.additionalArguments`

---

## Findings

### Finding: Production apps predominantly use **fetch** (IPC invoke) rather than **inject** (property-bag in preload)
**Confidence:** CONFIRMED
**Evidence:** All three apps surveyed (VS Code, Mattermost, Logseq) use `ipcRenderer.invoke` at app startup to pull config from main, not a pre-populated object on the bridge.

**VS Code:**

```typescript
// windowImpl.ts:705-710 — main process
const webPreferences: electron.WebPreferences = {
  preload: 'preload.js',
  additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
  // ...
};

// preload.ts:40-66 — preload reads CLI arg, invokes IPC
const windowConfigIpcChannel = parseArgv('vscode-window-config');
const resolvedConfiguration = await ipcRenderer.invoke(windowConfigIpcChannel);
```

The argv is a **URL pointing to an IPC channel**, not the config itself. The config arrives via `invoke`, stored in a `let` in preload scope, and exposed via a method:

```typescript
context: {
  configuration(): ISandboxConfiguration | undefined { return configuration; },
  async resolveConfiguration(): Promise<ISandboxConfiguration> { return resolveConfiguration; },
}
```

**Mattermost:**

```javascript
// preload — fetches on demand
getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION),
getLocalConfiguration: () => ipcRenderer.invoke(GET_LOCAL_CONFIGURATION),
```

And subscribes to a reload event:

```javascript
onReloadConfiguration: (listener) => {
  ipcRenderer.on(RELOAD_CONFIGURATION, () => listener());
  return () => ipcRenderer.off(RELOAD_CONFIGURATION, listener);
}
```

**Implications:** The "inject at exposure time" pattern (`readonly config: {...}` as a frozen object on the bridge) is rare in production. The dominant pattern is:
1. **Argv hint** (optional — tells preload WHAT to fetch) via `webPreferences.additionalArguments`.
2. **Async fetch** via `ipcRenderer.invoke` during preload init.
3. **Method-based access** for the renderer (`getConfig()` or `resolveConfig()`), never a property.

---

### Finding: The "inject" pattern is valid and simpler — but doesn't scale to mid-session config changes
**Confidence:** INFERRED
**Evidence:** Community usage in `@electron-toolkit/preload` tutorials, `reZach/secure-electron-template`

Smaller apps and tutorials do use a property-bag:

```typescript
const { appVersion, platform } = getInitialConfig();  // synchronous from argv or env
contextBridge.exposeInMainWorld('okDesktop', {
  config: { appVersion, platform, collabUrl },
  // ...
});
```

Limitations:
- **Cannot change after exposure.** The frozen object can't be mutated. Mid-session updates require tearing down the window and recreating it (as VS Code does for some types of changes).
- **Must be synchronously available.** If any config value requires async resolution (e.g. "discover the collab port from a lock file"), you need an async pre-bridge setup or a fetch pattern.

**Implications for our proposed bridge:** `readonly config: {...}` is safe *if* the config values are known synchronously before `contextBridge.exposeInMainWorld` is called. For project-switch — where a new `config` must replace the existing one — we need a *separate channel* (the `onProjectSwitched(cb)` event) rather than mutating `config`. That matches the proposed shape.

---

### Finding: A hybrid pattern — inject initial + subscribe to updates — is specifically advocated by Mattermost
**Confidence:** CONFIRMED
**Evidence:** Mattermost's combination of `getConfiguration()` (invoke for current), `onReloadConfiguration(cb)` (subscribe to changes), and `updateConfiguration(saveQueueItems)` (send to mutate).

```javascript
contextBridge.exposeInMainWorld('desktop', {
  updateConfiguration: (saveQueueItems) => ipcRenderer.send(UPDATE_CONFIGURATION, saveQueueItems),
  getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION),
  // ...
  onReloadConfiguration: (listener) => {
    ipcRenderer.on(RELOAD_CONFIGURATION, () => listener());
    return () => ipcRenderer.off(RELOAD_CONFIGURATION, listener);
  },
});
```

Note the `getConfiguration()` is parameterless — the server-side keyed per-window/per-user config is resolved by window identity + current user state, not via query params. The renderer calls it once at startup and whenever `onReloadConfiguration` fires.

**Implications for our proposed bridge:** The proposed shape combines:
- A synchronous `config` property (for immediate hydration, avoiding a useEffect-async-race).
- `onProjectSwitched(cb: (next: Config) => void)` for updates.

This **is** the hybrid — it's valid. The one caveat: if the initial config requires async resolution (e.g., a freshly discovered port), either make it Promise-typed (`resolveConfig(): Promise<Config>`) or block preload init on the fetch. VS Code chooses the latter, blocking the preload's `DOMContentLoaded` handler on `await resolveConfiguration`.

---

### Finding: `webPreferences.additionalArguments` is the official mechanism for passing structured data from main to preload's argv
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/browser-window — `BrowserWindowConstructorOptions.webPreferences.additionalArguments: string[]`

> `additionalArguments string[]` (optional) - A list of strings that will be appended to `process.argv` in the renderer process of this app. Useful for passing small bits of data down to renderer process preload scripts.

The mechanism is string-only (so structured data must be JSON-stringified or URL-encoded), and only accessible via `process.argv` in preload (not the renderer main world). Works even when `sandbox: true`.

**Implications for our proposed bridge:** `additionalArguments` is the clean way to pass identifiers (e.g., a project ID or lock-file-path) to preload at window creation. For a full config object with URLs and paths, stringifying JSON into a single argv slot is acceptable (VS Code does this via `configObjectUrl` — main creates an IPC-object URL, preload invokes it to fetch the full config). For small configs, inline JSON is simpler.

---

## Negative searches (for NOT FOUND)

- Searched Electron docs for "inject config" / "window.config preload" explicit guidance → no official doc recommends one pattern over the other.
- Searched for community benchmarks on argv JSON size limits: OS-level argv limits exist (Linux ~128KB, macOS 256KB, Windows ~32KB) but no Electron-specific cap documented.

---

## Gaps / follow-ups

- Electron's behavior when `additionalArguments` exceeds platform argv limits — no explicit doc. Mitigation: for any config larger than ~4KB, use the URL-to-IPC-channel pattern (VS Code) instead of inlining JSON in argv.
