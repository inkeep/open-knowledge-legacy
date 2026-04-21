# Evidence: D3 — Event subscription patterns

**Dimension:** D3 (P0) — `onFoo(cb) => unsubscribe` vs raw `ipcRenderer.on`
**Date:** 2026-04-17
**Sources:** VS Code, Mattermost Desktop, Logseq, GitHub Desktop, Electron docs and GitHub issues

---

## Key references

- `vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts:124-146` — VS Code exposes `ipcRenderer.on/once/removeListener` with channel-prefix validation
- `mattermost/desktop/src/app/preload/internalAPI.js` — `onReloadConfiguration` returns `() => ipcRenderer.off(...)`; most others do not
- `logseq/resources/js/preload.js:45-64` — exposes `addListener`/`removeListener`/`removeAllListeners` as raw passthroughs plus wrapped `on/off`
- `desktop/app/src/ui/main-process-proxy.ts:174-213` — GitHub Desktop's `onAutoUpdaterError(handler)` without returned unsubscribe
- https://www.electronjs.org/docs/latest/tutorial/ipc (Pattern 3) — canonical docs example
- https://github.com/electron/electron/issues/33328 — the function-identity bug

---

## Findings

### Finding: Three production patterns for renderer-facing subscriptions, in order of safety
**Confidence:** CONFIRMED
**Evidence:** Survey of VS Code, Mattermost, Logseq, GitHub Desktop preload/proxy code

**Pattern A — `onFoo(cb) => () => void` (safest, canonical):** Register inside preload, return an unsubscribe closure.

```typescript
// preload.ts
onProjectSwitched: (cb: (cfg: Config) => void) => {
  const listener = (_: IpcRendererEvent, cfg: Config) => cb(cfg);
  ipcRenderer.on('project-switched', listener);
  return () => ipcRenderer.removeListener('project-switched', listener);
}
```

Used by: Mattermost's `onReloadConfiguration` (single example); the form is also the [Electron docs community-recommended idiom](https://www.electronjs.org/docs/latest/tutorial/ipc) though not in the official code snippet.

**Pattern B — `onFoo(cb)` (void-returning, leaky):** Register inside preload, no cleanup. The renderer cannot unsubscribe.

```typescript
// preload.ts
onServerAdded: (listener) => ipcRenderer.on(SERVER_ADDED, (_, serverId, setAsCurrentServer) => listener(serverId, setAsCurrentServer)),
```

Used by: Most of Mattermost's `on*` methods (~30+), GitHub Desktop's `onAutoUpdaterError` / `onNativeThemeUpdated` / etc.

**Pattern C — Channel-name passthrough (broken unsubscribe):** Expose `ipcRenderer.on` / `removeListener` directly with channel validation.

```typescript
// preload.ts
ipcRenderer: {
  on(channel, listener) { validateIPC(channel); ipcRenderer.on(channel, listener); return this; },
  removeListener(channel, listener) { validateIPC(channel); ipcRenderer.removeListener(channel, listener); return this; },
}
```

Used by: VS Code. **Known caveat:** because the renderer-side `listener` is a wrapped function (crossing the context bridge), `removeListener` called from the renderer with the same reference will NOT match the stored listener — the function-identity bug. VS Code's own usage pattern mostly involves listeners that live for the window's lifetime, so this is not exercised in practice, but it is latent.

**Implications:** Pattern A is the strictly correct choice for any callback that the renderer might want to unregister (e.g., React `useEffect` cleanup). Pattern B is acceptable only for listeners that live the window's lifetime. Pattern C is a footgun — should be avoided.

---

### Finding: Returning the unsubscribe fn is NOT in the official Electron docs — it's codified by community + `@electron-toolkit` ecosystem
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/ipc shows:

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateCounter: (callback) =>
    ipcRenderer.on('update-counter', (_event, value) => callback(value))
})
```

— notably **without** the return statement. The official Electron IPC tutorial's Pattern 3 example omits cleanup.

Community consensus formed through:
- `reZach/secure-electron-template` (secure-electron-template/docs) documents returning unsubscribe as the safe pattern.
- `@electron-toolkit/preload` provides an `electronAPI` surface but leaves subscription wrapping to app authors — does not itself enforce unsubscribe-returns.
- Issue #33328 ("Cannot call ipcRenderer.removeListener through contextBridge") thread: multiple users independently identify "return the unsubscribe from preload" as the workaround.

**Implications:** The pattern we propose (`onProjectSwitched(cb) => () => void`) matches community best practice but not the official docs' example. This is acceptable — the official example is known-incomplete and the community pattern is the authoritative form.

---

### Finding: React components are the primary consumer and benefit concretely from returned-unsubscribe
**Confidence:** INFERRED
**Evidence:** Standard React `useEffect` idiom:

```tsx
useEffect(() => {
  const unsub = window.okDesktop.onProjectSwitched((cfg) => { /* ... */ });
  return unsub;   // cleanup
}, []);
```

Without the returned unsubscribe, the component must use a different escape hatch (e.g., `useRef` to hold a cancellation token, or give up on cleanup and accept the leak). This fits React's hook lifecycle cleanly and is why subscription-returning-unsubscribe is so common in modern bridge designs.

**Implications:** For a React-centric renderer (per the task context), Pattern A is the idiomatic choice. Electron apps written before React hooks (or with Angular / non-hook patterns) tolerated Pattern B more readily.

---

### Finding: No production app uses an "observable"/push-stream style bridge
**Confidence:** CONFIRMED
**Evidence:** Survey of VS Code, Mattermost, Logseq, GitHub Desktop did not find any `asObservable()` / `subscribe()` / `AsyncIterable` style API at the preload boundary.

VS Code internally uses RxJS-like `Event<T>` (its own event type) extensively but only renderer-side — never as the shape exposed through `contextBridge`. The bridge surface is always plain `onFoo(cb)` function registration.

**Implications:** Observable-style bridges are theoretically possible (wrap the unsubscribe pattern into an AsyncIterator) but have no production precedent. Stick with plain function registration. If you want RxJS/Signals semantics, build them renderer-side on top of the unsubscribe function.

---

## Negative searches (for NOT FOUND)

- Searched for "contextBridge observable" / "contextBridge AsyncIterable" on GitHub code: no production usage found.
- Searched for `unsubscribe` patterns in `@electron-toolkit/preload`: library provides raw ipcRenderer exposure; wrapping is app-responsibility.

---

## Gaps / follow-ups

- No direct measurement of "how many production apps ship Pattern B leaks per window-lifetime." Theoretical worst case is high (hundreds of MB/day per issue #27039) but practical impact depends on event frequency. Our app's events (project-switch, menu-action) are very low-frequency — even Pattern B would be bearable, but Pattern A is strictly better.
