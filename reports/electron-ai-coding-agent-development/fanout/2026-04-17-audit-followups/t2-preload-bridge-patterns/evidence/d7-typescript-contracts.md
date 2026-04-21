# Evidence: D7 — TypeScript contracts for preload bridges

**Dimension:** D7 (P1) — How production apps type the exposed surface
**Date:** 2026-04-17
**Sources:** VS Code, GitHub Desktop, `@electron-toolkit` ecosystem

---

## Key references

- `vscode/src/vs/base/parts/sandbox/electron-browser/globals.ts:118-157` — `ISandboxGlobal` / `ISandboxGlobals` / `IMainWindowSandboxGlobals`
- `vscode/src/vs/base/parts/sandbox/electron-browser/electronTypes.ts` — hand-copied minimal Electron types to avoid importing full `electron.d.ts` in renderer bundle
- `desktop/app/src/lib/ipc-shared.ts:27-90` — `RequestChannels` / `RequestResponseChannels` maps
- https://www.electronjs.org/docs/latest/tutorial/context-isolation — brief TypeScript mention

---

## Findings

### Finding: VS Code declares a **module-level interface** and a global declaration, types narrowed via `Pick<>`
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/base/parts/sandbox/electron-browser/globals.ts`

Two-tier typing:

```typescript
// Main window surface
export interface IMainWindowSandboxGlobals {
  readonly ipcRenderer: IpcRenderer;
  readonly ipcMessagePort: IpcMessagePort;
  readonly webFrame: WebFrame;
  readonly process: ISandboxNodeProcess;
  readonly context: ISandboxContext;
  readonly webUtils: WebUtils;
}

// Auxiliary window surface (subset)
export interface ISandboxGlobals {
  readonly ipcRenderer: Pick<IpcRenderer, 'send' | 'invoke'>;
  readonly webFrame: WebFrame;
}
```

The preload uses a union/global-declaration pattern:

```typescript
interface ISandboxGlobal {
  vscode: {
    readonly ipcRenderer: IpcRenderer;
    readonly ipcMessagePort: IpcMessagePort;
    // ...
  };
}

const vscodeGlobal = (globalThis as unknown as ISandboxGlobal).vscode;
export const ipcRenderer: IpcRenderer = vscodeGlobal.ipcRenderer;
export const ipcMessagePort: IpcMessagePort = vscodeGlobal.ipcMessagePort;
// ... re-export each leaf for renderer import
```

**Implications:** Consumers in the renderer don't access `window.vscode.ipcRenderer` directly — they import `{ ipcRenderer } from '.../globals'` which is already typed. The global-declaration pattern ("cast globalThis") is used exactly once, in `globals.ts`, which acts as the typed entrypoint module.

For our bridge: defining `OkDesktopBridge` as an interface, then `declare global { interface Window { okDesktop: OkDesktopBridge } }` in a `.d.ts`, is the cleanest TS pattern.

---

### Finding: VS Code **copies** minimal Electron types into the renderer tree to avoid bundling full `electron.d.ts`
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/base/parts/sandbox/electron-browser/electronTypes.ts:7-12`

```typescript
// #######################################################################
// ###                                                                 ###
// ###      electron.d.ts types we expose from electron-browser        ###
// ###                    (copied from Electron 29.x)                  ###
// ###                                                                 ###
// #######################################################################
```

The file hand-copies `IpcRenderer`, `IpcRendererEvent`, `WebFrame`, `WebUtils`, `ProcessMemoryInfo`. The rationale is that importing `electron` in renderer code drags Node.js type definitions into the renderer TS compilation. The copy is pinned to an Electron version — needs updating when Electron bumps.

**Implications for our bridge:** For a small bridge, we don't need to copy Electron types — we can use `IpcRendererEvent` as an opaque type in our event shapes. Most bridges expose no `IpcRendererEvent` to the renderer at all: the preload wrapper strips the event arg and forwards only the domain payload (see Mattermost: `onUpdateTabTitle: (listener) => ipcRenderer.on(UPDATE_TAB_TITLE, (_, viewId, title) => listener(viewId, title))` — the `_` is the dropped event).

This matters: our `onMenuAction: (cb: (a: MenuAction) => void) => () => void` signature correctly hides `IpcRendererEvent` from the renderer. Consumer components receive clean domain types.

---

### Finding: GitHub Desktop uses a **channel-keyed type map** to type both sides of IPC uniformly
**Confidence:** CONFIRMED
**Evidence:** `desktop/app/src/lib/ipc-shared.ts:27-90` + `ipc-renderer.ts:10-15`

Shared channel map:

```typescript
export type RequestChannels = {
  'select-all-window-contents': () => void
  'update-menu-state': (state: Array<{...}>) => void
  // ...
}

export type RequestResponseChannels = {
  'open-external': (url: string) => Promise<boolean>
  'show-item-in-folder': (path: string) => Promise<void>
  // ...
}
```

Typed invoke:

```typescript
export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as any
}
```

**Implications:** For a bridge with ~10 methods, the channel-map pattern is overkill; directly typing each bridge method (`openFolder(): Promise<string | null>`) is cleaner. For a bridge with 50+ methods (Mattermost scale), the channel map saves boilerplate. Both are valid choices; pick by surface size.

---

### Finding: The ecosystem pattern (`@electron-toolkit/preload`) provides typed exposure but no opinionated contract schema
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/@electron-toolkit/preload

The package exposes `electronAPI` with:
- `ipcRenderer`: `send`, `invoke`, `on`, `once`, `removeListener`, `removeAllListeners`, etc.
- `webFrame`: `insertCSS`, `setZoomFactor`, `setZoomLevel`
- `webUtils`: `getPathForFile`
- `process`: `platform`, `versions`, `env`

This is a **raw-exposure** package (similar to VS Code's pattern). It types Electron's built-ins but does not enforce a channel-naming convention or subscription-cleanup idiom — those are left to the consuming app.

**Implications:** Libraries like `@electron-toolkit/preload` save a few lines of wrapping code but don't help with the "bridge design" decision. You still need to define your domain API (`okDesktop.config`, `okDesktop.onProjectSwitched`, etc.) on top.

---

## Negative searches (for NOT FOUND)

- Searched for "contextBridge codegen" / "electron bridge TypeScript generator" → no dominant tool. `electron-trpc` and `tipc` libraries provide generic typed IPC but aren't bridge-schema focused. These were covered in prior FU3 research (see non-goals).
- Searched for official Electron `d.ts` augmentation guide → not provided beyond generic "use declaration files."

---

## Gaps / follow-ups

- None material. Typing patterns are well-established; the choice between channel-keyed-map (GitHub Desktop) and method-typed-namespace (VS Code) depends on surface size and is not a research question.
