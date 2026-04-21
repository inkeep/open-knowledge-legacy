---
title: "Electron Preload Bridge Patterns: Typed Config + Subscription APIs (2026)"
description: "Factual reference for structuring an Electron preload bridge with contextIsolation:true + sandbox:true — production patterns from VS Code, Mattermost Desktop, Logseq, GitHub Desktop. Covers contextBridge callback semantics, event subscription patterns (onFoo(cb)→unsubscribe), config bootstrap (inject vs fetch), sandbox-blocked API proxying (shell, clipboard, dialog), and TypeScript contract conventions."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Electron
  - contextBridge
  - ipcRenderer
  - VS Code
  - GitHub Desktop
  - Mattermost Desktop
  - Logseq
  - Signal Desktop
topics:
  - preload bridge design
  - contextBridge callback semantics
  - subscription-based IPC
  - sandbox-blocked API bridging
  - renderer config bootstrap
  - TypeScript contracts for preload
---

# Electron Preload Bridge Patterns: Typed Config + Subscription APIs (2026)

**Purpose:** Factual reference for structuring a preload bridge in a production Electron app with `contextIsolation: true` + `sandbox: true`. Derived from inspection of VS Code, GitHub Desktop, Mattermost Desktop, and Logseq source plus the official Electron documentation and canonical GitHub issues.

---

## Executive Summary

**The canonical pattern is:** expose a namespaced object (`window.myApp`) via `contextBridge.exposeInMainWorld`, with (a) a synchronous or Promise-typed config method, (b) subscription methods named `onFoo(cb) => () => void` that register the listener *inside preload* and return a preload-owned unsubscribe closure, and (c) sandbox-blocked APIs (`shell`, `clipboard`, `dialog`) proxied through `ipcRenderer.invoke` to a main-process handler rather than called directly from preload.

**The proposed `OkDesktopBridge` shape is valid with two adjustments:**

1. The `onFoo(cb) => () => void` methods must create a preload-owned wrapper around the renderer cb — passing the renderer cb reference directly to `ipcRenderer.on` and `ipcRenderer.removeListener` does not work due to the known [function-identity bug](https://github.com/electron/electron/issues/33328) in `contextBridge`.
2. Route `shell.openExternal`, `clipboard`, and `dialog` through IPC to main handlers unless you've explicitly set `sandbox: false`. Under `sandbox: true` (the default for new apps), `shell` is documented as "non-sandboxed only" and direct calls from preload silently no-op or error.

**Three patterns dominate production code:**

| Pattern | Exemplar | Model for new apps? |
|---|---|---|
| Narrow-channel-namespace — expose `ipcRenderer.send/invoke/on` with channel-prefix validation | VS Code | Yes (for large surfaces) |
| Method-per-channel — expose dozens of bespoke methods per IPC channel | Mattermost Desktop, Logseq | Yes (idiomatic for small-to-medium surfaces) |
| No bridge at all — `nodeIntegration: true` + `contextIsolation: false` | GitHub Desktop | No (legacy, unsafe, not recommended) |

**Key Findings:**
- **Function identity is the #1 footgun.** A callback passed renderer→preload through contextBridge gets wrapped. `ipcRenderer.removeListener(channel, cb)` called with the renderer's cb reference does NOT match. Unsubscribe MUST be closed over the preload-side wrapper.
- **Config: prefer fetch over inject when async or changeable.** VS Code and Mattermost use `ipcRenderer.invoke('get-config')`. Static `readonly config: {...}` is valid only when values are synchronously known at bridge-exposure time AND never change mid-session.
- **Sandbox-blocked APIs require IPC-relay under `sandbox: true`.** `shell` docs explicitly: "non-sandboxed only." `clipboard` in renderer is deprecated. `dialog` has no renderer form ever — always IPC.
- **`setWindowOpenHandler` is complementary to a bridge `openExternal` method.** Set both — the first catches implicit `window.open`/`target=_blank`, the second is the typed intentional API path.
- **Getter/setter properties on the bridge fire at exposure time, not at access.** [electron/electron#25516](https://github.com/electron/electron/issues/25516) — use plain values or explicit methods.

---

## Research Rubric

| Dimension | Priority | Purpose |
|---|---|---|
| D1 — `contextBridge.exposeInMainWorld` semantics for callbacks | P0 (Deep) | Verify function-identity behavior, known pitfalls, security advisories |
| D2 — Production preload bridge API shapes | P0 (Deep) | Survey VS Code / Mattermost / Logseq / GitHub Desktop |
| D3 — Event subscription patterns | P0 (Deep) | `onFoo(cb) → unsubscribe` idiomatic form |
| D4 — Config bootstrap: inject vs fetch | P0 (Deep) | VS Code + Mattermost patterns for initial config resolution |
| D5 — `shell.openExternal` + `setWindowOpenHandler` | P1 (Moderate) | Sandbox-safe external URL routing |
| D6 — `navigator.clipboard` limitations + bridge patterns | P1 (Moderate) | When to direct-render vs IPC-relay |
| D7 — TypeScript contracts for preload | P1 (Moderate) | Namespace typing conventions |

**Non-goals (out of scope):** tRPC-over-IPC / typed-IPC library comparison (covered in prior FU3 report); CLI preload; renderer-side React patterns for consuming the bridge.

---

## Detailed Findings

### D1 — contextBridge callback semantics [P0]

**Finding:** Functions crossing the bridge are proxied; other values are copied and frozen. The known pitfall: the renderer-side identity of a callback does not match its preload-side wrapper, so `ipcRenderer.removeListener(channel, cb)` called with the renderer's cb reference silently fails.

Quoted from `contextBridge` docs: *"Function values are proxied to the other context and all other values are copied and frozen."*

Evidence: [electron/electron#33328](https://github.com/electron/electron/issues/33328), minimal reproduction at [ccorcos/electron-context-bridge-remove-listener-bug](https://github.com/ccorcos/electron-context-bridge-remove-listener-bug). Listener counts grow monotonically because the reference used in `off()` cannot match the wrapped function from `on()`.

Related: [#27039](https://github.com/electron/electron/issues/27039) reported 350MB→1500MB/day memory growth under high-frequency `webContents.send`; resolved in PR #27630 (Electron ≥13.x).

VS Code's preload has an inline warning at `preload.ts:95-102` against getter/setter properties, citing [#25516](https://github.com/electron/electron/issues/25516): getters fire at exposure time, not at access.

Security advisory: [GHSA-jfqg-hf23-qpw2](https://github.com/electron/electron/security/advisories/GHSA-jfqg-hf23-qpw2) — CVSS 8.4 context-isolation bypass via `VideoFrame` transfer; patched in 39.8.0 / 40.7.0 / 41.0.0-beta.8. Only relevant if passing WebCodecs objects through the bridge.

**Evidence:** [evidence/d1-contextbridge-callback-semantics.md](evidence/d1-contextbridge-callback-semantics.md)

**Confidence:** CONFIRMED.

**Implications:**
- Subscription methods that want `unsubscribe` semantics MUST create a preload-side wrapper and close over it:
  ```ts
  onProjectSwitched: (cb) => {
    const listener = (_: IpcRendererEvent, cfg: Config) => cb(cfg);
    ipcRenderer.on('ok:project-switched', listener);
    return () => ipcRenderer.removeListener('ok:project-switched', listener);
  }
  ```
- Bridge properties must be plain values or methods — no getters, no setters.
- WebCodecs objects (`VideoFrame`, `AudioData`) should not cross the bridge on pre-patched Electron versions.

### D2 — Production bridge API shapes [P0]

**Finding:** Surveyed four production Electron apps; three distinct patterns observed.

**VS Code** (`vscode/src/vs/base/parts/sandbox/electron-browser/preload.ts`) — narrow-channel-namespace, `window.vscode`. Exposes `ipcRenderer.send/invoke/on/once/removeListener` with channel-prefix validation (`channel.startsWith('vscode:')`). Preload blocks on `await ipcRenderer.invoke(windowConfigIpcChannel)` during init. Config accessed via method `context.configuration()`, never as a property. A parallel `preload-aux.ts` exposes a narrower subset (`Pick<IpcRenderer, 'send' | 'invoke'>`) for auxiliary windows — no subscriptions.

**Mattermost Desktop** (`src/app/preload/internalAPI.js`) — method-per-channel, `window.desktop`. 60+ explicit methods. Subscription methods mostly return `void` (leak risk); only `onReloadConfiguration` returns an unsubscribe. Separate `window.process` and `window.timers` namespaces.

**Logseq** (`resources/js/preload.js`) — hybrid, `window.apis`. Mixes granular methods with raw passthroughs (e.g., `addListener: ipcRenderer.on.bind(ipcRenderer)`). Calls `shell.openExternal` and `clipboard.readBuffer` from preload directly — requires `sandbox: false`. Uses protocol allowlist (`ALLOWED_EXTERNAL_PROTOCOLS = ['https:', 'http:', 'mailto:', 'zotero:', 'file:']`) for `openExternal`.

**GitHub Desktop** (`app/src/main-process/app-window.ts:65-72`) — no contextBridge. `webPreferences: { nodeIntegration: true, contextIsolation: false }`. Renderer imports `ipcRenderer` directly. Valuable as a reference for typed channel contract (`RequestChannels` / `RequestResponseChannels` keyof maps in `app/src/lib/ipc-shared.ts`) but not a safety model for new apps.

**Evidence:** [evidence/d2-production-bridge-shapes.md](evidence/d2-production-bridge-shapes.md)

**Confidence:** CONFIRMED.

**Implications:**
- For a ~10-method surface, method-per-channel (Mattermost style) is the idiomatic default.
- For 50+ channels, narrow-channel-namespace (VS Code style) scales better but requires channel-prefix validation to maintain the security properties of contextIsolation.
- GitHub Desktop's approach is legacy; new apps should not emulate it.

### D3 — Event subscription patterns [P0]

**Finding:** Three patterns exist in production, ranked by safety:

- **Pattern A — `onFoo(cb) => () => void` with preload-owned listener wrapper.** Safe, React-friendly (the unsubscribe is a `useEffect` cleanup). Used by: Mattermost's `onReloadConfiguration` (single example in a 60+ method surface); community consensus form.
- **Pattern B — `onFoo(cb)` void-returning.** Leaky; renderer cannot unsubscribe. Used by: ~95% of Mattermost's `on*` methods, most of GitHub Desktop's `onAutoUpdater*`.
- **Pattern C — Raw `ipcRenderer.on`/`removeListener` passthrough.** Broken due to function-identity bug (D1). Used by: VS Code's channel-validated passthrough; Logseq's `addListener`.

The [official Electron IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) shows Pattern 3 without returning an unsubscribe — an acknowledged omission in the tutorial.

Community-canonical form:

```ts
onProjectSwitched: (cb: (cfg: Config) => void) => {
  const listener = (_: IpcRendererEvent, cfg: Config) => cb(cfg);
  ipcRenderer.on('ok:project-switched', listener);
  return () => ipcRenderer.removeListener('ok:project-switched', listener);
}
```

**Evidence:** [evidence/d3-event-subscription-patterns.md](evidence/d3-event-subscription-patterns.md)

**Confidence:** CONFIRMED.

**Implications:**
- The proposed `OkDesktopBridge.onProjectSwitched: (cb) => () => void` shape is CORRECT and matches the safest pattern observed in production (strictly safer than ~95% of Mattermost's subscription surface).
- Every subscription method should follow this identical pattern for consistency.
- Exposing raw `ipcRenderer.on` / `ipcRenderer.removeListener` is broken; do not do it.

### D4 — Config bootstrap: inject vs fetch [P0]

**Finding:** Production apps predominantly **fetch** via `ipcRenderer.invoke` rather than inject via a pre-populated bridge property.

- **VS Code:** `configObjectUrl` passed via `webPreferences.additionalArguments`. Preload calls `ipcRenderer.invoke(windowConfigIpcChannel)`. Exposes via method `context.configuration()`.
- **Mattermost Desktop:** `getConfiguration: () => ipcRenderer.invoke(GET_CONFIGURATION)` plus `onReloadConfiguration(listener) => unsubscribe` for updates.

**The proposed `readonly config: {collabUrl, apiOrigin, projectPath, projectName}` is valid if:**
1. All values are synchronously available at `contextBridge.exposeInMainWorld` call time. (In our Electron design, main spawns the utilityProcess → receives the bound port → only then creates the BrowserWindow with its preload — so all values ARE known synchronously at preload-exposure.)
2. Mid-session changes flow through `onProjectSwitched(cb)` — renderer stores config in state, updates from the callback. The frozen initial object doesn't need to mutate.

If either condition fails, switch to `resolveConfig(): Promise<Config>` and make the renderer handle a loading state on mount.

`webPreferences.additionalArguments` is the official channel for small identifiers. Platform argv limits: Linux ~128KB, macOS ~256KB, Windows ~32KB. For configs larger than ~4KB, prefer VS Code's "IPC object URL" indirection over inlining JSON in argv.

**Evidence:** [evidence/d4-config-bootstrap.md](evidence/d4-config-bootstrap.md)

**Confidence:** CONFIRMED.

**Implications:**
- Our proposed `readonly config: {...}` property is VALID for the synchronous-initial + onProjectSwitched-for-updates pattern, provided main waits for the utility's bound port before creating the BrowserWindow + preload.
- If this ordering ever changes (e.g., BrowserWindow created before utility ready), switch to async `resolveConfig()`.
- For project-switch flow: main spawns a new utility → awaits `ready` → sends `project:switched` IPC with new config → preload's subscription wrapper fires renderer `cb` → renderer updates state. No re-exposure of `window.okDesktop` needed.

### D5 — `shell.openExternal` + `setWindowOpenHandler` [P1]

**Finding:** Both should be set. `setWindowOpenHandler` in main is a catch-all for renderer-initiated `window.open`/target=_blank; the bridge `shell.openExternal` is the typed intentional API path.

Electron docs on `shell`: *"Process: Main, Renderer (non-sandboxed only)"* and explicitly: *"While the shell module can be used in the renderer process, it will not function in a sandboxed renderer."* Under `sandbox: true`, the bridge method MUST IPC-relay through main.

**Canonical pattern:**
```ts
// preload
shell: {
  openExternal: (url: string) => ipcRenderer.invoke('ok:shell:open-external', url)
}
// main
ipcMain.handle('ok:shell:open-external', (_, url: string) => {
  // Allowlist + validate URL scheme before opening
  if (!isAllowedProtocol(url)) return;
  shell.openExternal(url);
});
// main also sets
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  if (isAllowedProtocol(url)) shell.openExternal(url);
  return { action: 'deny' };  // prevent Electron from creating a new window
});
```

GitHub Desktop uses IPC-relay: `openExternal = invokeProxy('open-external', 1)` at `main-process-proxy.ts:146`. Mattermost uses IPC-relay. Logseq calls direct from preload with a protocol allowlist — viable only because Logseq sets `sandbox: false`.

**Evidence:** [evidence/d5-d6-shell-clipboard.md](evidence/d5-d6-shell-clipboard.md)

**Confidence:** CONFIRMED.

**Implications:**
- Under `sandbox: true` (our design default), `shell.openExternal` via contextBridge MUST be an IPC-relay wrapper — direct call from preload will silently fail.
- Always pair `setWindowOpenHandler` (catch implicit opens) with the bridge method (catch explicit intent).
- Protocol allowlist (https, http, mailto, …) is a security hardening all production apps implement.

### D6 — `navigator.clipboard` + bridges [P1]

**Finding:** Three options for renderer-side clipboard writes:

- `navigator.clipboard.writeText` — renderer-side, sandbox-compatible, text-only, requires secure context (`https://` or `http://localhost`, not `file://`).
- `clipboard` module in preload + contextBridge — officially the docs' recommendation but deprecated in renderer; requires `sandbox: false` post-Electron-20.
- IPC-relay to main — works in any sandbox policy, all formats.

For text-only `writeText`, `navigator.clipboard` renderer-side is simplest (no bridge method needed) if the renderer loads from a secure origin. For `file://`-loaded renderers OR rich-format clipboard, IPC-relay to main.

`dialog` module has no renderer form at all — always IPC-relay. The proposed `dialog: { openFolder, createFolder }` is correctly architected as preload-wrapped `ipcRenderer.invoke` → main handler.

**Evidence:** [evidence/d5-d6-shell-clipboard.md](evidence/d5-d6-shell-clipboard.md)

**Confidence:** CONFIRMED.

**Implications:**
- If our renderer loads via `http://localhost:<port>/` (Path B bootstrap), `navigator.clipboard.writeText` works without a bridge method. If `file://`, we need an IPC-relay clipboard-write bridge method (D38 in the spec proposal).
- `dialog: { openFolder, createFolder }` as IPC-invoke is correct.

### D7 — TypeScript contracts for preload bridges [P1]

**Finding:** Two production patterns:

- **Method-typed namespaces (VS Code):** `interface IMainWindowSandboxGlobals` with `Pick<>`-narrowed variants (`ISandboxGlobals` for aux windows). Global declared via `declare global { interface Window { ... } }`. VS Code copies minimal Electron types into `electronTypes.ts` to avoid pulling `electron.d.ts` Node types into the renderer TS compilation.
- **Channel-keyed type maps (GitHub Desktop):** `RequestChannels` / `RequestResponseChannels` keyof maps shared between main and renderer; typed `invoke<T extends keyof RequestResponseChannels>(channel: T, ...args: Parameters<...>)`.

For a ~10-method bridge, method-typed namespace + `declare global { interface Window { okDesktop?: OkDesktopBridge } }` is cleanest. The `?:` (optional) matters: in the shared web/CLI distribution, the bridge is absent, and typed code should have to check.

**Evidence:** [evidence/d7-typescript-contracts.md](evidence/d7-typescript-contracts.md)

**Confidence:** CONFIRMED.

**Implications:**
- Our D36 type definition should mark `window.okDesktop` as `OkDesktopBridge | undefined` (via optional `?:` in the Window interface augmentation). Renderer code must guard: `if (window.okDesktop) { ... }`.
- Keep the type definition in a file consumed by both preload (`packages/desktop/src/preload/`) and renderer (`packages/app/src/`) to avoid drift — ideally in `@inkeep/open-knowledge-core/src/desktop-bridge.ts` or similar shared location.

---

## Alternative Bridge-Shape Archetypes

**Archetype 1 — Typed methods + synchronous config (the proposed `OkDesktopBridge` shape).**
- *Pros:* Synchronous access to initial config; no loading state; idiomatic.
- *Cons:* Requires all initial config synchronously known at preload-exposure time; frozen initial object can go stale before first `onProjectSwitched` subscription if timing is wrong.
- *Right choice when:* Small-to-medium surface, all initial config known at window creation, mid-session updates via subscription.

**Archetype 2 — All-async, methods-only (VS Code-inspired).**
- *Shape:* `resolveConfig(): Promise<Config>` instead of the `readonly config` property.
- *Pros:* Handles any async pre-init resolution (port discovery from another process); no stale-frozen-config risk.
- *Cons:* Renderer must `await` on mount (loading state).
- *Right choice when:* Any config value requires async resolution OR many mid-session changes OR large configs exceeding `additionalArguments` platform caps.

**Archetype 3 — Channel-keyed raw exposure (GitHub Desktop-inspired).**
- *Shape:* `window.okDesktop.invoke('channel-name', ...args)`; renderer repeats channel string at each call site.
- *Pros:* Zero per-method boilerplate; scales to 100+ channels.
- *Cons:* Every call site repeats the channel string; weaker discoverability; channel-prefix validation required.
- *Not applicable at our scale* (~10-20 methods).

---

## Pitfalls and Known Issues

| # | Issue | Severity | Status | Mitigation |
|---|---|---|---|---|
| 1 | [#33328](https://github.com/electron/electron/issues/33328) — `removeListener` through contextBridge fails | High | Won't-fix | Return preload-closed unsubscribe from every `onFoo(cb)` |
| 2 | [#27039](https://github.com/electron/electron/issues/27039) — memory leak on high-frequency `send` | Medium | Fixed ≥13.x | For > 1 Hz streams prefer `invoke`-pull or `MessageChannel` transfer |
| 3 | [#25516](https://github.com/electron/electron/issues/25516) — getter properties fire at exposure | Low | Open | Use values or methods only, never getters |
| 4 | [GHSA-jfqg-hf23-qpw2](https://github.com/electron/electron/security/advisories/GHSA-jfqg-hf23-qpw2) — VideoFrame context-isolation bypass | High | Patched 39.8.0 / 40.7.0 / 41.0.0-beta.8 | Only relevant with WebCodecs — avoid if not needed |
| 5 | `shell` is "non-sandboxed only" per docs | High | By design | Under `sandbox: true`, IPC-relay via `ipcRenderer.invoke` → main `ipcMain.handle` |
| 6 | `clipboard` in renderer deprecated | Medium | Deprecated | Prefer `navigator.clipboard.writeText` renderer-side, or IPC-relay to main |
| 7 | `dialog` has no renderer access | N/A | By design | Always IPC-relay |
| 8 | `additionalArguments` platform-capped (~32KB Win, ~128KB Linux, ~256KB macOS) | Low | Platform | For configs >4KB, use VS Code's IPC-object-URL indirection |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Obsidian preload:** Closed source; inspection limited to published `d.ts` files from plugin API. Patterns inferred, not directly observed.
- **Signal Desktop & Slack Desktop:** Not inspected deeply (not in `~/.claude/oss-repos/` cache). Signal is OSS but not surveyed in this pass.
- **Electron's electron-trpc / @electron-toolkit/preload ecosystem:** Mentioned briefly; not comparatively surveyed (intentional — covered in prior FU3 typed-IPC report).

### Out of Scope (per Rubric)
- tRPC-over-IPC / typed-IPC library comparison.
- CLI preload patterns (Electron only).
- Renderer-side React hooks for consuming the bridge.

---

## References

### Evidence Files
- [evidence/d1-contextbridge-callback-semantics.md](evidence/d1-contextbridge-callback-semantics.md) — contextBridge identity-wrapping, removeListener bug, security advisories
- [evidence/d2-production-bridge-shapes.md](evidence/d2-production-bridge-shapes.md) — VS Code / Mattermost / Logseq / GitHub Desktop source inspection
- [evidence/d3-event-subscription-patterns.md](evidence/d3-event-subscription-patterns.md) — Pattern A/B/C survey + canonical form
- [evidence/d4-config-bootstrap.md](evidence/d4-config-bootstrap.md) — additionalArguments, ipcRenderer.invoke, VS Code configObjectUrl
- [evidence/d5-d6-shell-clipboard.md](evidence/d5-d6-shell-clipboard.md) — shell.openExternal + setWindowOpenHandler + clipboard + dialog relay
- [evidence/d7-typescript-contracts.md](evidence/d7-typescript-contracts.md) — Method-typed namespaces vs channel-keyed maps

### External Sources
- [Electron contextBridge docs](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron ipcRenderer docs](https://www.electronjs.org/docs/latest/api/ipc-renderer)
- [Electron shell docs](https://www.electronjs.org/docs/latest/api/shell)
- [Electron IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [VS Code electron-sandbox preload.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/parts/sandbox/electron-browser/preload.ts)
- [GitHub Desktop main-process-proxy.ts](https://github.com/desktop/desktop/blob/development/app/src/ui/main-process-proxy.ts)
- [electron/electron#33328 — removeListener through contextBridge fails](https://github.com/electron/electron/issues/33328)
- [electron/electron#25516 — getter/setter firing at exposure](https://github.com/electron/electron/issues/25516)
- [electron/electron#27039 — memory leak on high-frequency send](https://github.com/electron/electron/issues/27039)
- [GHSA-jfqg-hf23-qpw2 — VideoFrame context-isolation bypass](https://github.com/electron/electron/security/advisories/GHSA-jfqg-hf23-qpw2)
- [ccorcos/electron-context-bridge-remove-listener-bug — minimal reproduction](https://github.com/ccorcos/electron-context-bridge-remove-listener-bug)

### Related Research
- [reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/](../../2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/) — typed-IPC library comparison (7 libraries × 11 axes)
