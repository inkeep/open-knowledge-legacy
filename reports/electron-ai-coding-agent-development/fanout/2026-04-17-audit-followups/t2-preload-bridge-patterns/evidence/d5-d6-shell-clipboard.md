# Evidence: D5+D6 — Shell (openExternal) and Clipboard bridges

**Dimension:** D5 (P1) — `window.open` → `setWindowOpenHandler` + `shell.openExternal`
**Dimension:** D6 (P1) — `navigator.clipboard` limitations on `file://` and clipboard module
**Date:** 2026-04-17
**Sources:** electronjs.org docs, production app code

---

## Key references

- https://www.electronjs.org/docs/latest/api/shell — shell module process compatibility
- https://www.electronjs.org/docs/latest/api/clipboard — clipboard module process compatibility
- https://www.electronjs.org/docs/latest/tutorial/security — security guide on window.open / setWindowOpenHandler
- `logseq/resources/js/preload.js:82-95` — `openExternal` called from preload with protocol allowlist
- `mattermost/desktop/src/app/preload/internalAPI.js` — `openServerExternally: () => ipcRenderer.send(OPEN_SERVER_EXTERNALLY)` (routes through main)
- `desktop/app/src/ui/main-process-proxy.ts:146` — `openExternal = invokeProxy('open-external', 1)` (routes through main)

---

## Findings

### Finding: `shell.openExternal` works in renderer/preload **only when sandbox is disabled**
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/shell

> "Process: Main, Renderer (non-sandboxed only)"
>
> "While the `shell` module can be used in the renderer process, it will not function in a sandboxed renderer."

**Implications:** If the preload runs in a sandboxed renderer (which is the Electron security default for modern apps), `shell.openExternal` is NOT accessible and the call must be proxied through main via IPC. If `sandbox: false` is explicitly set, the preload can call `shell.openExternal` directly (Logseq does this).

---

### Finding: `clipboard` module in renderer/preload is **deprecated** — official guidance: call from preload or IPC-relay to main
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/clipboard

> "Using the `clipboard` API from the renderer process is deprecated."
>
> "If you need to call it from a renderer, you should place the API call in your preload script and expose it using the `contextBridge` API."

**Implications:** Placing `clipboard.writeText` in preload and exposing it via `contextBridge.exposeInMainWorld` is the documented pattern. Requires `sandbox: false` on Electron ≥ 20 (the `clipboard` module is not in the sandboxed preload API surface list per the sandbox docs).

Navigator's Clipboard API (`navigator.clipboard.writeText`) is an alternative that works in the renderer main world and does NOT require `sandbox: false`. The two trade-offs:
- **`navigator.clipboard`**: browser-standard, secure context required (`file://` may or may not qualify depending on Electron version), may prompt for permission on some platforms.
- **Electron `clipboard` module**: no permission prompts, more formats (HTML, RTF, images), but requires `sandbox: false` + preload exposure.

For simple text copy in an Electron editor, `navigator.clipboard.writeText` usually works on `file://` in modern Electron. For rich-format copy, use `clipboard` via preload.

---

### Finding: The canonical pattern for external links is `setWindowOpenHandler` in main + IPC-relay, not direct preload `shell.openExternal`
**Confidence:** CONFIRMED
**Evidence:** Electron security docs and GitHub Desktop's implementation

From https://www.electronjs.org/docs/latest/tutorial/security:

```javascript
contents.setWindowOpenHandler(({ url }) => {
  if (isSafeForExternalOpen(url)) {
    setImmediate(() => { shell.openExternal(url); });
  }
  return { action: 'deny' };
});
```

This intercepts **all** renderer-initiated `window.open` calls and `<a target="_blank">` clicks before a new Electron window is created. The default action is `deny`; trusted URLs are handed to `shell.openExternal` from main.

GitHub Desktop routes `openExternal` through main via IPC — the preload never touches `shell.openExternal`:

```typescript
// desktop/app/src/ui/main-process-proxy.ts:146
export const openExternal = invokeProxy('open-external', 1)

// main-process/main.ts (registers the invoke handler)
ipcMain.handle('open-external', async (_, url) => shell.openExternal(url));
```

Mattermost uses the same pattern: `openServerExternally: () => ipcRenderer.send(OPEN_SERVER_EXTERNALLY)` → main handles the actual `shell.openExternal` call.

Logseq is the outlier — it calls `shell.openExternal` directly from preload, mitigated by a protocol allowlist:

```javascript
// logseq/resources/js/preload.js:82-88
async openExternal (url, options) {
  const protocol = new URL(url).protocol
  if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(protocol)) {
    throw new Error('illegal protocol')
  }
  await shell.openExternal(url, options)
}
```

This is viable but requires `sandbox: false` and the protocol check becomes security-critical — a bypass means arbitrary URL execution from the renderer.

**Implications for our proposed bridge:** `shell: { openExternal }` can be implemented either way:
- **IPC-relay through main (recommended, sandbox-compatible):** `openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)` and validate the URL in main. Works with `sandbox: true`.
- **Direct-from-preload (Logseq-style):** `openExternal: (url) => shell.openExternal(url)` with renderer-side protocol allowlist. Requires `sandbox: false`.

Choose based on your sandbox setting. With `sandbox: true` (modern default), the IPC-relay is the only option.

---

### Finding: The `dialog` module (used by `dialog.openFolder`) **must be called from main** — no renderer access
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/dialog

> "Process: Main"

Unlike `shell` and `clipboard`, `dialog` has **no renderer-accessible form** at all. All `dialog.showOpenDialog` / `dialog.showMessageBox` calls must go through `ipcMain.handle` → `ipcRenderer.invoke` proxy.

**Implications:** Our proposed `dialog: { openFolder, createFolder }` is correctly architected as a preload-wrapped `ipcRenderer.invoke('dialog:open-folder')` → main handler. No choice here — this is always IPC-relayed.

---

### Finding: `setWindowOpenHandler` is set in the main process, not exposed through preload
**Confidence:** CONFIRMED
**Evidence:** Electron security docs, Mattermost, GitHub Desktop

The handler is attached at BrowserWindow creation time:

```javascript
// main process
const win = new BrowserWindow({...});
win.webContents.setWindowOpenHandler(({ url }) => { /* ... */ return { action: 'deny' } });
```

This is invisible to the renderer/preload. It's the **catch-all** for renderer-initiated window opens. Any bridge API like `okDesktop.shell.openExternal(url)` is **in addition to** this handler — the handler is for runaway `window.open('...')` / target=_blank cases that the code didn't intentionally route.

**Implications:** The proposed bridge's `shell.openExternal` method and `setWindowOpenHandler` in main are **complementary, not redundant**. Both should be set:
- `setWindowOpenHandler`: defense-in-depth for any renderer code (or injected code) that bypasses the bridge.
- `shell.openExternal` bridge method: the typed, intentional API path.

---

## Negative searches (for NOT FOUND)

- Searched for `navigator.clipboard` on `file://` limitations in Electron → documented as "works but may require HTTPS-like origin in some CSP configurations." Not blocking for typical use.
- Searched for production apps using `clipboard` module directly from sandboxed preload → not found (requires `sandbox: false`).

---

## Gaps / follow-ups

- Per-platform quirks (Windows clipboard format handling, macOS pasteboard UTI types) not covered here — ecosystem knows them, out of scope for bridge architecture.
