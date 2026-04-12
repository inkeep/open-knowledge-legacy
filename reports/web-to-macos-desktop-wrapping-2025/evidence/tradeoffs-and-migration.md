# Evidence: Tradeoffs, Local Server Integration, Migration Path

**Dimension:** Quantitative Tradeoffs + Local Server + Migration
**Date:** 2026-04-11

---

## Key sources
- [Tauri vs Electron — gethopp.app](https://www.gethopp.app/blog/tauri-vs-electron)
- [Tauri Sidecar v2 docs](https://v2.tauri.app/develop/sidecar/)
- [Tauri Node.js sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [electron-vite docs](https://electron-vite.org/guide/)
- [electron-vite-react template](https://github.com/electron-vite/electron-vite-react)
- [electron-builder auto-update](https://www.electron.build/auto-update.html)
- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Hoppscotch Tauri migration](https://blog.hoppscotch.io/hoppscotch-desktop-3)

---

## Quantitative Tradeoffs

### Tauri bundles 10-20x smaller than Electron
**Confidence:** CONFIRMED

| Metric | Electron | Tauri | Delta |
|--------|---------:|------:|------:|
| Minimal app (on disk) | 85-150 MB | <10 MB | ~15x |
| Hoppscotch migration | 165 MB | 8 MB | ~20x |
| Idle memory | 200-300 MB | 30-40 MB | ~7x |
| Cold start | 1-2 seconds | <500 ms | ~3x |

Hoppscotch migration: 165 MB → 8 MB, 70% memory reduction after Electron → Tauri.

### WKWebView vs Chromium rendering: comparable on macOS, diverges on Linux
**Confidence:** CONFIRMED

For typical web apps (React, TipTap, CodeMirror), rendering performance is comparable. Real differences:
- WKWebView lacks some modern APIs (partial Web Bluetooth, differing IndexedDB quota, flaky MediaRecorder on older macOS)
- Linux WebKitGTK is 1-2 years behind mainstream WebKit — the real pain point
- Chromium multi-process adds baseline memory/CPU

For Open Knowledge (TipTap + CodeMirror + Y.js on macOS), both engines handle these libraries fine.

### Code signing equivalent for Electron/Tauri, but Tauri+sidecar has extra friction
**Confidence:** CONFIRMED

Both require: paid Apple Developer account, Developer ID cert, notarization (2-5 min per build). Tauri-specific quirks: WebView needs JIT and unsigned-executable-memory entitlements. **Tauri sidecar binaries must be separately signed before bundling** ([Tauri issue #11992](https://github.com/tauri-apps/tauri/issues/11992)). Budget time for debugging signing if going Tauri+sidecar.

---

## Local Server / Sidecar Patterns

### Electron `utilityProcess` — modern replacement for `child_process.fork`
**Confidence:** CONFIRMED

`utilityProcess.fork()` uses Chromium's Services API, supports Node.js APIs, structured IPC via MessagePort. Built for "untrusted services, CPU intensive tasks, or crash-prone components." Alternative: bundle separate Node binary as a resource.

**For Open Knowledge:** The Hocuspocus server literally runs inside the Electron main process or utilityProcess. `@inkeep/open-knowledge-server.createServer()` drops in as-is. No subprocess, no binary packaging, no marshaling.

### Tauri sidecar — declarative bundling + `app.shell().sidecar()`
**Confidence:** CONFIRMED

```json
// tauri.conf.json
{
  "bundle": {
    "externalBin": ["binaries/my-sidecar"]
  }
}
```

Binaries must be named with target triple suffix: `my-sidecar-aarch64-apple-darwin`, `my-sidecar-x86_64-unknown-linux-gnu`.

```rust
// src-tauri/src/main.rs
app.shell().sidecar("my-sidecar")
```

**For Open Knowledge:** Would need to `bun build --compile` the `@inkeep/open-knowledge-server` + Hocuspocus setup into a single binary. Bun supports this natively. Then declare as externalBin and spawn from Rust on app launch.

### Subprocess lifecycle pattern
**Confidence:** CONFIRMED

Standard pattern (works for both Electron and Tauri):
1. Use `get-port` (2351 dependents) or `portfinder` to pick ephemeral free port
2. Spawn server subprocess, pass port via env var
3. Wait for stdout ready signal or poll `http://127.0.0.1:PORT/health`
4. Pass port to renderer via IPC
5. Register `before-quit` handler to SIGTERM → SIGKILL timeout
6. Crash recovery: listen for `exit`, restart with exponential backoff

Libraries: `get-port`, `portfinder`, `execa`, `tree-kill`.

### Obsidian vs VS Code plugin models
**Confidence:** CONFIRMED

- **Obsidian:** plugins run inside the renderer process as "elevated Node under Chromium." Full Node + DOM access, no isolation. Simple but plugins can crash Obsidian.
- **VS Code:** extension host is separate Node.js subprocess, IPC to main via JSON-RPC. Strong isolation, extension crashes don't crash VS Code.

**For Open Knowledge:** VS Code model (separate subprocess) is the right reference since the CRDT server holds persisted state and needs crash isolation.

### WebSocket to localhost works identically
**Confidence:** CONFIRMED

No special handling needed in either Electron or Tauri. `new WebSocket('ws://127.0.0.1:PORT')` works directly from the renderer. macOS WKWebView has no ATS issues for `ws://127.0.0.1`. HocuspocusProvider drops in with URL change only.

---

## Migration Path for Vite + React Apps

### Electron + Vite setup (via `electron-vite`)
**Confidence:** CONFIRMED

```bash
npm create @quick-start/electron@latest my-app -- --template=react-ts
```

Restructure:
- `src/main/` — main process (Node, Hocuspocus server lives here)
- `src/preload/` — context bridge
- `src/renderer/` — existing React app (minimal changes)

IPC via `ipcMain.handle` + `ipcRenderer.invoke`. Production build via `electron-builder`.

### Tauri v2 + Vite + React setup
**Confidence:** CONFIRMED

```bash
bunx tauri init  # add to existing Vite project
```

Scaffolds `src-tauri/` Rust workspace. Vite config needs:
```ts
server: { port: 1420, strictPort: true }
clearScreen: false
```

Rust commands via `#[tauri::command]`. Frontend calls `invoke('cmd', {...})`. Type-safety: [TauRPC](https://github.com/MatsDK/TauRPC).

For a sidecar-only Hocuspocus use case, Rust code is ~30-50 lines (spawn sidecar, expose port to JS, app lifecycle).

### Auto-update: electron-updater more mature; Tauri updater simpler
**Confidence:** CONFIRMED

**Electron options:**
- Built-in `autoUpdater` (Squirrel.Mac) — requires signed app, no Linux, no progress events
- `electron-updater` (electron-builder) — Linux support, download progress, staged rollouts, GitHub Releases / S3 / generic HTTP. De facto standard.

**Tauri updater:** Plugin-based, requires separate updater key (`tauri signer generate`). Produces `.tar.gz` from `.app`. Less flexible but simpler config.

**Sparkle:** macOS-native, not wired into either framework by default. Used by ChatGPT desktop.

### Distribution
**Confidence:** CONFIRMED

Both frameworks support DMG + notarization. Mac App Store has stricter sandboxing — bad fit for Open Knowledge's file-watcher architecture (needs `com.apple.security.network.server` + explicit file-access entitlements). **Direct-download DMG with notarization is the realistic path.**

---

## Summary for Open Knowledge

**Best fit: Electron with utilityProcess running Hocuspocus in-process**
- Zero marshaling — `@inkeep/open-knowledge-server` runs as-is
- No sidecar binary packaging, no Bun compile complexity
- File watcher (`@parcel/watcher`) works natively
- Mature tooling: electron-vite, electron-updater, electron-builder
- Cost: ~100 MB installer, ~250 MB RAM baseline

**Alternative: Tauri v2 + Bun-compiled Hocuspocus sidecar**
- ~10 MB installer, ~40 MB RAM baseline
- Requires `bun build --compile`, signing the binary, Tauri capabilities config
- Linux WebKitGTK compatibility risk for y-prosemirror/CodeMirror (macOS-only mitigates)
- Rust surface small (~50 lines for sidecar lifecycle)

**Architectural insight:** Existing `packages/app/src/server/hocuspocus-plugin.ts` (Vite plugin co-locating Hocuspocus) is structurally equivalent to Electron main process. Migration is "replace Vite plugin with Electron main." Tauri requires explicit process boundary + binary bundling.
