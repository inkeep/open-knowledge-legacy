# Evidence: D1 — contextBridge.exposeInMainWorld Callback Semantics

**Dimension:** D1 (P0) — `contextBridge.exposeInMainWorld` semantics for callbacks
**Date:** 2026-04-17
**Sources:** electronjs.org/docs (contextBridge, context-isolation, ipc), GitHub issues on electron/electron repo, ccorcos/electron-context-bridge-remove-listener-bug

---

## Key pages referenced

- https://www.electronjs.org/docs/latest/api/context-bridge — official contextBridge API reference
- https://www.electronjs.org/docs/latest/tutorial/context-isolation — security patterns and anti-patterns
- https://www.electronjs.org/docs/latest/tutorial/ipc — IPC patterns, including Pattern 3 (main-to-renderer subscriptions)
- https://github.com/electron/electron/issues/27039 — memory leak when passing IPC events over contextBridge
- https://github.com/electron/electron/issues/33328 — cannot call ipcRenderer.removeListener through contextBridge
- https://github.com/ccorcos/electron-context-bridge-remove-listener-bug — minimal reproduction of function-identity bug
- https://github.com/electron/electron/security/advisories/GHSA-jfqg-hf23-qpw2 — VideoFrame context-isolation bypass CVE

---

## Findings

### Finding: Functions are proxied across worlds, all other values are copied + frozen
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/context-bridge

> "Function values are proxied to the other context and all other values are **copied** and **frozen**."

Supported types for values passed through `exposeInMainWorld`:
- Strings, numbers, booleans, Objects, Arrays, Promises, Functions, Errors, Blobs, VideoFrames
- Anything supported by the [MDN structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

Explicit limitation: **Symbols cannot be copied across contexts so they are dropped.** Custom prototypes are lost when objects cross the bridge — instances become plain objects with copied properties.

**Implications for our bridge:** Passing a `config` object at exposure time is safe — it will be copied and frozen in the renderer's main world. Passing functions (like `onProjectSwitched(cb)`) is also the documented pattern. But (see next finding) there is a known pitfall specifically with functions passed **from renderer → preload** (callbacks).

---

### Finding: Callbacks passed renderer→preload have altered identity — cannot be removed via reference equality
**Confidence:** CONFIRMED
**Evidence:** https://github.com/ccorcos/electron-context-bridge-remove-listener-bug (reproduction repo), https://github.com/electron/electron/issues/33328

Quote from the repro README:

> "I believe the issue has to do with the context bridge changing the identity of the callback function... when those listeners are exposed through Electron's `contextBridge`... The `ipcRenderer.off()` method relies on function reference equality to remove listeners. Since the callback function passed to `on()` and the reference used in `off()` are no longer the same object (due to contextBridge wrapping), the removal fails — the listener remains attached."

From issue #33328: `ipcRenderer.removeListener` called with a renderer-side function reference **does not remove** a listener originally registered via `contextBridge`-wrapped `on()`, because the preload side sees a different (wrapped) function object.

**Implications for our bridge:** A subscription API that exposes `ipcRenderer.on` / `ipcRenderer.removeListener` as separate methods is **broken by design** for unsubscription — listener counts grow monotonically. The fix is to **never expose removeListener via the bridge**. Instead, register the listener inside the preload (where function identity is stable), and return an unsubscribe closure from `onFoo(cb)`. This is the core reason the `onFoo(cb) => () => void` unsubscribe pattern exists.

---

### Finding: Canonical subscription pattern is `onFoo(cb) => unsubscribe()`, registered inside preload
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/ipc (Pattern 3), confirmed by community consensus in issues #33328 / #27039

Official Electron IPC tutorial shows the base pattern:

```javascript
// Preload script
contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateCounter: (callback) =>
    ipcRenderer.on('update-counter', (_event, value) => callback(value))
})
```

The docs acknowledge this example **omits** the cleanup. The production-safe variant (widely adopted):

```javascript
onUpdateCounter: (callback) => {
  const listener = (_event, value) => callback(value)
  ipcRenderer.on('update-counter', listener)
  return () => ipcRenderer.removeListener('update-counter', listener)
}
```

Key property: the `listener` wrapper is created **inside preload**, so `ipcRenderer.on` and `ipcRenderer.removeListener` see the same reference. The renderer's callback function is invoked *by* the wrapper but never *is* the wrapper.

**Implications for our bridge:** `onProjectSwitched(cb: (next: Config) => void) => () => void` matches this canonical shape exactly. The returned function is an unsubscribe closure that internally holds a reference to the preload-side wrapper — safe for removal.

---

### Finding: Memory leak #27039 — high-frequency `webContents.send` → `ipcRenderer.on` accumulates memory
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/issues/27039, linked PR #27630 (landed fix)

The reported symptom: a renderer that registered an `ipcRenderer.on` listener and received frequent `webContents.send` messages (every ~100ms) grew from 350MB to 1,500MB RSS over a day. The issue was resolved in Electron via PR #27630.

The reporter also noted a working workaround: **using `handle`/`invoke` (request-response) sidesteps the leak** — at the cost of losing server-push semantics (renderer must poll).

**Implications for our bridge:** Low-frequency events like project-switch or menu-action are not at risk (a handful per session). For high-frequency streams (e.g., log tailing, awareness deltas) consider invoke-pull or `MessageChannel` transfer instead of `send`-based fan-out.

---

### Finding: Getter properties on exposed objects fire at exposure time, not at access — don't use them
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/issues/25516 (still open as enhancement request)

```javascript
contextBridge.exposeInMainWorld('vscode', {
   get something() { console.log("accessed"); }
});
// Logs "accessed" at exposure time, before renderer reads `vscode.something`.
```

VS Code's own preload (`preload.ts:95-102`) has this warning baked in as a comment block:

```text
// #######################################################################
// ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
// ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
// ###       (https://github.com/electron/electron/issues/25516)       ###
// #######################################################################
```

**Implications for our bridge:** `readonly config: {...}` declared as a plain property (value, not getter) is safe. If the config needs to be lazy-loaded, use an explicit method (`getConfig(): Config` or `resolveConfig(): Promise<Config>`) — matches VS Code's `context.configuration()` method-style.

---

### Finding: Recent context-isolation bypass via VideoFrame transfer — CVSS 8.4 (patched 39.8.0 / 40.7.0 / 41.0.0-beta.8)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/security/advisories/GHSA-jfqg-hf23-qpw2

> "Apps that pass `VideoFrame` objects (from the WebCodecs API) across the `contextBridge` are vulnerable to a context isolation bypass. An attacker with JavaScript execution capabilities could exploit bridged VideoFrame objects to access isolated worlds and exposed Node.js APIs."

**Implications for our bridge:** Not directly relevant (we don't pass VideoFrame). Mentioned here because it demonstrates that (a) contextBridge's safety guarantees are version-dependent, (b) staying current on Electron is part of the bridge's security posture, and (c) the generic advice "only pass primitives, plain objects, and functions through the bridge" is still the safest bet.

---

## Negative searches (for NOT FOUND)

- Searched electronjs.org/docs/latest/tutorial/ipc for explicit unsubscribe code → Not present in official examples (only mentioned as a consideration). The pattern is community-established.
- Searched for official guidance on callback lifecycle management through contextBridge → No authoritative doc exists as of Electron 34 / 35. Community wisdom codified in `reZach/secure-electron-template`.

---

## Gaps / follow-ups

- Electron's own recommendation for "many subscriptions, low noise" scenarios (e.g. 50+ `onFoo` methods) — no explicit guidance on whether this scales or whether an `observable` style is preferable. Not directly relevant at our scale.
