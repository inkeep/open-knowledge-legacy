# Evidence: Open Knowledge-Specific Deep Dive (Electron vs Tauri)

**Dimension:** OK-Specific Deep Dive
**Date:** 2026-04-11
**Sources:** Electron/Tauri docs, GitHub issues, production app inspection (VS Code, AFFiNE, Codex, Claude Desktop, n8n Desktop, Beadbox)

---

## The Architectural Constraint

Open Knowledge's architecture forces a specific set of requirements on the desktop wrapper — these are non-negotiable without a redesign:

1. **Node.js 22+ runtime** — Hocuspocus is Node-native; `engines: node >=22` in root package.json
2. **`@parcel/watcher` N-API native addon** — recursive file watching via FSEvents, not pure JS (chokidar fallback would regress file-watcher bridge reliability)
3. **`simple-git` shelling out to `git` binary** — WIP ref pipeline uses git plumbing (read-tree, write-tree, commit-tree); no pure-JS alternative ships
4. **Y.Doc + DirectConnection in-memory** — `AgentSessionManager` holds Y.UndoManager references via Hocuspocus `DirectConnection`; cannot be serialized across process boundary without breaking CRDT invariants
5. **Vite + `hocuspocus-plugin.ts` co-location pattern** — dev server embeds Hocuspocus; current dev UX depends on this
6. **MCP stdio server** — `open-knowledge mcp` spawns as subprocess of AI agent; shares code with HTTP API

Everything below flows from these constraints.

---

## Key sources

### Electron prior art
- [VS Code package.json — @parcel/watcher ^2.5.6, node-pty ^1.2.0-beta.12](https://github.com/microsoft/vscode/blob/main/package.json)
- [AFFiNE forge.config.mjs — auto-unpack-natives + FusesPlugin](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/forge.config.mjs)
- [AFFiNE native package.json — napi-rs 6-triple build](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/native/package.json)
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- [electron/electron#40031 — ESM in utilityProcess not supported](https://github.com/electron/electron/issues/40031)
- [electron/electron#8727 — child_process.fork + native modules](https://github.com/electron/electron/issues/8727)
- [@electron-forge/plugin-auto-unpack-natives](https://www.electronforge.io/config/plugins/auto-unpack-natives)
- [electron-vite dev guide](https://electron-vite.org/guide/dev)
- [parcel-bundler/watcher#181 — electron-builder win32-ia32](https://github.com/parcel-bundler/watcher/issues/181)

### Tauri prior art and open issues
- [Tauri v2: Node.js as a sidecar (official tutorial uses pkg)](https://v2.tauri.app/learn/sidecar-nodejs/)
- [tauri-apps/tauri#11992 — macOS notarization broken with externalBin](https://github.com/tauri-apps/tauri/issues/11992)
- [tauri-apps/tauri#11261 — Node sidecar dev works, production fails silently](https://github.com/tauri-apps/tauri/issues/11261)
- [tauri-apps/plugins-workspace#3062 — sidecar lifecycle plugin (open since 2024)](https://github.com/tauri-apps/plugins-workspace/issues/3062)
- [tauri-apps/tauri#8821 — optional sidecars rebuild pain](https://github.com/tauri-apps/tauri/issues/8821)
- [oven-sh/bun#19282 — @parcel/watcher prebuild not found under Bun](https://github.com/oven-sh/bun/issues/19282)
- [Beadbox: Tauri v2 + Node WebSocket sidecar (Next.js 16)](https://www.threads.com/@codeforreal/post/C74cDXuS0ja)
- [Shipping a Production macOS App with Tauri 2.0 — DEV](https://dev.to/0xmassi/shipping-a-production-macos-app-with-tauri-20-code-signing-notarization-and-homebrew-mc3)

### Cautionary tales
- [n8n-io/n8n-desktop-app (archived 2023)](https://github.com/n8n-io/n8n-desktop-app) — chose cheap Electron wrapper, abandoned
- [Hendrik Erz: chokidar horror story](https://www.hendrik-erz.de/post/electron-chokidar-and-native-nodejs-modules-a-horror-story-from-integration-hell) — 4 years of silent CPU-polling fallback

---

## Dimension-by-Dimension Findings

### Dimension 1: Node.js 22+ in-process runtime

**Electron — CONFIRMED WORKS**
- Electron 40+ bundles Node 22.14 in its own runtime process
- `utilityProcess.fork()` is the modern pattern (replaces `child_process.fork`)
- Full Node.js environment; can `require()` native modules
- **GOTCHA:** ESM not supported in `utilityProcess.fork()` targets ([electron/electron#40031](https://github.com/electron/electron/issues/40031)). OK is ESM-everywhere → **must produce CJS build of `@inkeep/open-knowledge-server` for the utilityProcess entry point**. Use `vite build --format cjs` or `tsdown` with CJS output target.

**Tauri — REQUIRES SIDECAR**
- No Node runtime in Tauri; Rust is the native runtime
- Node must be bundled as a sidecar binary via `pkg` or `@yao-pkg/pkg` (community fork; upstream pkg unmaintained)
- Alternative: `bun build --compile` produces single-file executable, but:
  - Not using Bun as runtime (OK requires Node per engines field)
  - [oven-sh/bun#19282](https://github.com/oven-sh/bun/issues/19282) — `@parcel/watcher` prebuild not found under Bun on darwin-x64
- Binary sizes: Bun compile ~57-90MB per platform; pkg Node binary ~28MB

**Verdict:** Electron ships Node natively. Tauri requires architectural translation.

---

### Dimension 2: `@parcel/watcher` native N-API addon

**Electron — PRODUCTION PROVEN (VS Code)**
- VS Code ships `@parcel/watcher@^2.5.6` — the exact same version OK uses
- Pattern: `@electron-forge/plugin-auto-unpack-natives` auto-detects `.node` files and moves to `app.asar.unpacked`
- Alternative (electron-builder): `asarUnpack: ["node_modules/**/*.node"]` + `npmRebuild: true`
- Postinstall: `electron-builder install-app-deps` rebuilds against Electron's Node ABI
- AFFiNE uses the same Forge plugin for their napi-rs native modules (6-triple build)
- **GOTCHA:** Electron ABI ≠ Node ABI. Prebuilt `node-v115` binary from npm won't load; `@electron/rebuild` or forge plugin handles rebuilding automatically
- **GOTCHA:** [parcel-bundler/watcher#181](https://github.com/parcel-bundler/watcher/issues/181) — electron-builder picks wrong arch when building ia32 on x64 hosts. Drop ia32 Windows.

**Tauri — UNCHARTED WATERS**
- No documented production case of `@parcel/watcher` in a Tauri + Node sidecar
- `pkg` does NOT bundle `.node` files natively — must ship them separately and patch loader paths
- `bun build --compile` claims to embed `.node` files but no public evidence of `@parcel/watcher` shipping this way in production
- Expected failure mode: file watcher silently breaks in packaged app (matches [Tauri #11261](https://github.com/tauri-apps/tauri/issues/11261) "works in dev, fails in production")
- **Alternative:** Rewrite file watcher in Rust using `notify` crate. Not a wrapper decision — a codebase change.

**Verdict:** VS Code is the definitive proof point for Electron. Tauri path is unproven and risky.

---

### Dimension 3: macOS code signing and notarization

**Electron — STANDARD PIPELINE**
- `electron-builder` + `electron-forge` handle deep signing + entitlements + notarization as one pipeline
- Hardened runtime + `com.apple.security.cs.disable-library-validation` for native `.node` files
- AFFiNE uses electron-forge fuses for production hardening:
  ```js
  new FusesPlugin({
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  })
  ```
- Developer ID Application cert + Apple Developer account ($99/yr)

**Tauri — KNOWN BROKEN PATH for externalBin**
- [tauri-apps/tauri#11992](https://github.com/tauri-apps/tauri/issues/11992) **open since 2024** — macOS notarization with sidecar binaries returns "The signature of the binary is invalid" / "nested code is modified or invalid"
- [discussion #12803](https://github.com/tauri-apps/tauri/discussions/12803) — sidecar binaries show as "not signed at all" after bundle signing
- Workaround requires custom `afterBundleCommand` scripts to re-sign sidecars with entitlements:
  ```xml
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.cs.allow-jit</key><true/>
  ```
- Without these, hardened runtime kills the sidecar with SIGKILL on launch (Node's V8 JIT)
- Expect **2-5 days of debugging** on first release
- Universal (arm64 + x86_64) requires separate `pkg` runs + `lipo` or two separate sidecars

**Verdict:** Electron signing is battle-tested. Tauri + externalBin signing has documented open issues.

---

### Dimension 4: Sidecar / subprocess lifecycle

**Electron — IMPLICIT via process model**
- `utilityProcess` has built-in lifecycle (spawn/kill on MessagePort events)
- `child_process.spawn` for MCP stdio server
- Standard `app.on('before-quit', ...)` → SIGTERM → SIGKILL pattern
- Port allocation: `server.listen(0)` then `server.address().port`; pass to renderer via `ipcMain.handle('get-hocuspocus-port')`
- Known libraries: `get-port`, `execa`, `tree-kill` (Node ecosystem)

**Tauri — DIY FROM SCRATCH**
- [plugins-workspace#3062](https://github.com/tauri-apps/plugins-workspace/issues/3062) **still open since 2024**: feature request for `tauri-plugin-sidecar-lifecycle` with "process spawning and monitoring, crash detection and auto-restart with backoff, port conflict resolution, health checking, graceful shutdown on app exit, process cleanup to avoid orphans, cross-platform signal handling"
- Official [v2.tauri.app/develop/sidecar/](https://v2.tauri.app/develop/sidecar/) example spawns and awaits stdout — does NOT handle exit codes, restart, or kill on app-quit
- You'd write ~800-1200 lines of Rust + TS for:
  - `OnceLock<Mutex<Option<CommandChild>>>` global state
  - Port finder + health check with timeout
  - Window close handler → SIGTERM → timeout → SIGKILL
  - Exponential backoff restart loop
  - Unix signal handling + Windows job objects for orphan cleanup
- Orphan risk: if Tauri main crashes, Node sidecar keeps running, holding file descriptors on `content/` and `.git/`

**Verdict:** Electron's process model gives this for free. Tauri requires ~1000 lines of toil.

---

### Dimension 5: Dev mode — Vite + Hocuspocus plugin

**Electron — SAME CODE PATH**
- `electron-vite` runs renderer Vite config with the existing `hocuspocus-plugin.ts` unchanged
- Dev: Vite + Hocuspocus co-located via `configureServer` hook (exactly as today)
- Prod: `main/index.ts` forks `utilityProcess` running the CJS-built standalone server
- **Two code paths** — but both import from the same `@inkeep/open-knowledge-server` package with a shared `createServer()` factory (already exists as `packages/server/src/standalone.ts`)
- Renderer code: URL changes from dev port to Electron-allocated port via preload bridge

**Tauri — TWO DIVERGENT CODE PATHS**
- Dev: Vite still runs `hocuspocus-plugin.ts` inside Vite's Node process (works because Vite is Node.js)
- Prod: sidecar binary runs separate `standalone.ts` entry; must be compiled ahead-of-time via `pkg`/`bun build --compile`
- Port handoff: dev uses 5173, production uses ephemeral port discovered by Rust and injected into webview via `invoke('get_ws_port')`
- Frontend cannot hardcode `localhost:5173` — must query port at runtime
- [tauri-apps/tauri#8821](https://github.com/tauri-apps/tauri/issues/8821) — rebuilding the sidecar before `tauri dev` / `tauri build` is annoying and manual

**Verdict:** Both require dual dev/prod paths, but Electron's is structurally simpler because both paths run in the same process model.

---

### Dimension 6: Y.Doc + DirectConnection

**Electron — ZERO MARSHALING**
- Hocuspocus runs in `utilityProcess` as a pure Node module
- `AgentSessionManager.getSession()` returns `DirectConnection` with in-memory `Y.UndoManager` reference
- `HocuspocusProvider` in renderer connects via WebSocket; agents use DirectConnection in the same Node process
- No serialization of Y.Doc state across boundaries

**Tauri — IMPOSSIBLE WITHOUT NODE SIDECAR**
- Cannot hold Y.Doc in Rust process (would require Rust port of Yjs + Hocuspocus + TipTap schema — not viable)
- Must run Hocuspocus in Node sidecar, which reintroduces all the sidecar pains above
- Alternative: port Yjs to Rust (y-crdt exists) + rewrite persistence/agent-sessions — months of work, breaks codebase

**Verdict:** This is the architectural constraint that forces Electron's hand. OK's `AgentSessionManager` design is Node-bound by construction.

---

### Dimension 7: Bundle size reality

**Reference points from real apps:**

| App | Stack | Installed Size |
|-----|-------|---------------:|
| VS Code | Electron + @parcel/watcher + node-pty | ~350 MB |
| AFFiNE | Electron + napi-rs native | ~250 MB |
| Obsidian | Electron | ~250 MB |
| Claude Desktop | Electron + MCP SDK | 623 MB (includes bundled runtime) |
| Codex Desktop | Electron + better-sqlite3 + node-pty + Rust sidecar | 442 MB |
| n8n Desktop (archived) | Electron + full n8n server, asar:false | ~400 MB |
| Tauri + Bun sidecar (theoretical) | Rust + ~60-90MB Node binary | ~110-150 MB |
| Tauri + pkg Node sidecar (Beadbox) | Rust + ~28MB pkg binary | ~70-100 MB |

**Tauri's size advantage erodes for OK:**
- Bare Tauri: ~7 MB (Rust only)
- + Node sidecar with Hocuspocus deps: +60-90 MB
- + Optional portable git (Windows, no Xcode CLT on macOS): +50 MB
- + React bundle + assets: +15 MB
- **Total: ~130-170 MB**

**Electron for OK (estimated):**
- Electron shell: ~180 MB uncompressed, ~85 MB DMG compressed
- + @inkeep/open-knowledge-server deps: ~15 MB
- + @parcel/watcher prebuilds: ~5 MB per platform
- + React bundle + assets: ~15 MB
- **Total: ~200-250 MB installed, ~90-110 MB DMG**

**Delta: ~50-100 MB. Not decisive.**

**Verdict:** Tauri's bundle advantage shrinks to ~50-100MB once you ship a Node sidecar. Not worth the complexity for this architecture.

---

### Dimension 8: MCP stdio server mode

**Electron — SAME BINARY, `--mcp` FLAG**
- Package `main/index.ts` detects `process.argv.includes('--mcp')` before `app.whenReady()`
- Skip window creation, run stdio loop directly
- Alternative: `ELECTRON_RUN_AS_NODE=1` makes Electron behave like pure Node binary
- macOS invocation: `<app>.app/Contents/MacOS/open-knowledge --mcp` (not the `.app` bundle)
- Document the exact invocation path for agents

**Tauri — SEPARATE BINARY OR SUBPROCESS**
- Can't flag-dispatch the Tauri main because Rust doesn't know about Node
- Options:
  1. Ship separate MCP binary (additional sidecar)
  2. Agent directly invokes the Node sidecar binary (bypasses Tauri)
- More moving parts, more signing, more CI complexity

**Verdict:** Electron's single-binary-with-flag is cleaner.

---

### Dimension 9: Prior art summary

**Electron success stories for OK-like apps:**

| App | Key pattern OK can borrow |
|-----|:--------------------------|
| **VS Code** | @parcel/watcher + node-pty in Electron at global scale. Forked `@vscode/sqlite3` to vendor prebuilds |
| **AFFiNE** | Electron Forge + `auto-unpack-natives` plugin + helper process for CPU-heavy work. CRDT architectural analog |
| **Codex Desktop** | better-sqlite3 + node-pty + Rust sidecar for conversation DB. Validates mixed native-module strategy |
| **Claude Desktop** | MCP SDK bundled via Electron asar. Lesson: GUI PATH problem — bundle Node or fully-resolve paths |

**Tauri + Node sidecar prior art:**

| Case | Result |
|------|:-------|
| **Beadbox** (Next.js 16 + WS) | **Only documented production-ish case.** No native addons. `NEXT_PUBLIC_*` bake issue required custom `invoke('get_ws_port')`. GUI PATH problem. |
| `@parcel/watcher` + pkg/bun | **No public production examples found.** |
| Hocuspocus + Yjs in Tauri sidecar | **Zero examples.** Architecturally novel. |

**Cautionary tale:**
- **n8n Desktop** (archived 2023) — cheapest Electron wrapper (boot server in main, asar:false). Abandoned due to size/startup/native module issues. Don't copy n8n Desktop's approach.

---

## Effort Estimate Comparison

**Electron for OK:**
- Add electron-vite to monorepo: 1 day
- Write `main/index.ts` + utilityProcess fork: 1 day
- CJS build target for `@inkeep/open-knowledge-server`: 1 day
- Configure electron-forge + auto-unpack-natives plugin: 0.5 day
- IPC bridge for port + menu bar integration: 1-2 days
- Code signing + notarization setup: 2-3 days (first time)
- Auto-updater setup with electron-updater: 1 day
- Testing packaged app end-to-end: 2-3 days
- **Total: ~10-15 days** (~2 weeks)

**Tauri v2 + Node sidecar for OK:**
- Add Tauri to monorepo + Rust scaffold: 1 day
- Configure `bun build --compile` or `pkg` for Node sidecar: 2 days
- Debug `@parcel/watcher` N-API bundling in sidecar binary: **3-7 days (risk)**
- Write ~1000 lines of Rust for sidecar lifecycle: 5-7 days
- Port allocation + health check + handoff to frontend: 2 days
- Code signing with externalBin (open issue #11992): **3-5 days of signing debugging**
- Auto-updater with Tauri updater: 1 day
- Testing packaged app end-to-end: 3-5 days
- **Total: ~20-35 days** (~4-7 weeks)

**Effort delta: 2-3× more work for Tauri, with higher risk on unproven paths.**

---

## Honest Non-Electron Reasons to Reconsider

Electron wins for OK's specific stack, but there ARE reasons to still consider alternatives:

1. **If you move to a pure web architecture** (Hocuspocus as hosted service, desktop becomes thin client) — then **Tauri** becomes viable because you no longer need a Node sidecar. The complexity delta collapses.

2. **If you target macOS only and accept Swift** — then **SwiftUI WebView** (macOS 26 Tahoe) is genuinely elegant. ~20 MB app, native menu bar, deep OS integration. But zero cross-platform, and a rewrite of the CLI/server in Swift is a different project entirely.

3. **If RAM is critical** — Electron baseline ~250 MB RAM vs Tauri ~40 MB RAM. For a long-running editor, 200 MB difference matters. But the Y.Doc itself dominates RAM for large documents, not the runtime.

4. **If you accept the "follow AFFiNE exactly" path** — helper process architecture, napi-rs for anything CPU-heavy, `FusesPlugin` for hardening. Still Electron, but with production-grade patterns from day one.

---

## Decision Matrix (OK-Specific)

| Dimension | Weight | Electron | Tauri | Winner |
|-----------|:------:|:--------:|:-----:|:------:|
| Node.js runtime compatibility | P0 | Native | Sidecar | Electron |
| @parcel/watcher proven support | P0 | VS Code scale | Unproven | Electron |
| Y.Doc + DirectConnection in-process | P0 | Works | Requires Node sidecar anyway | Electron |
| Code signing reliability | P0 | Battle-tested | Open issues | Electron |
| Subprocess lifecycle management | P0 | Built-in | ~1000 LOC DIY | Electron |
| Vite dev plugin pattern reuse | P1 | Exact fit | Divergent paths | Electron |
| Bundle size | P1 | 200-250 MB | 130-170 MB | Tauri (marginal) |
| RAM footprint | P1 | ~250 MB | ~80-120 MB | Tauri (marginal) |
| Time to first shipped build | P0 | 2 weeks | 4-7 weeks | Electron |
| Community signal for OK's category | P1 | VS Code, AFFiNE, Codex | Zero matching examples | Electron |

**Verdict: Electron wins 9/10 dimensions for OK's specific stack.**

The only Tauri wins are bundle size and RAM footprint — both marginal once you add a Node sidecar for Hocuspocus.
