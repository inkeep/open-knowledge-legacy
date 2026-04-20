---
title: "Wrapping a Web App as a Native macOS Desktop App in 2025/2026"
description: "Comprehensive analysis of desktop app frameworks (Electron, Tauri v2, Wails, SwiftUI WebView, native Swift) for wrapping a TypeScript/React web app as a native macOS desktop app. Includes primary-source tech stack investigations of 20 popular apps (Claude Desktop, ChatGPT, Codex, Obsidian, Figma, Notion, Linear, VS Code, Cursor, Raycast, Arc, Warp, etc.), quantitative tradeoffs, local server integration patterns, and a concrete recommendation for a Vite+React+Hocuspocus stack."
createdAt: 2026-04-11
updatedAt: 2026-04-20
subjects:
  - Electron
  - Tauri
  - SwiftUI WebView
  - Claude Desktop
  - ChatGPT Desktop
  - Codex
  - Obsidian
  - Figma
  - Notion
  - Linear
  - VS Code
  - Cursor
  - Raycast
  - Warp Terminal
  - electron-vite
  - ToDesktop
topics:
  - desktop app wrapping
  - macOS native apps
  - web to desktop
  - electron vs tauri
---

# Wrapping a Web App as a Native macOS Desktop App in 2025/2026

**Purpose:** Decide what stack to use for wrapping Open Knowledge (Vite + React + TipTap + Hocuspocus) as a native macOS desktop app — informed by what modern apps actually use and the 2025/2026 framework landscape.

---

## Refresh — 2026-04-20

Spot-check of the 2026-04-11 findings. The recommendation below (Electron + electron-vite + electron-forge) is unchanged. Two signals moved, both in Electron's favor for Open Knowledge's stack. See also the companion [[reports/electron-desktop-app-operations-2025/REPORT|Electron Desktop App Operations]] report.

- **Resolved — macOS Tahoe GPU bug:** The Electron × WindowServer performance regression flagged in §5 as an open risk is fully patched. Fix landed in Electron 36.9.2 / 37.6.0 / 38.2.0 and all later versions ([electron#48376](https://github.com/electron/electron/pull/48376), [AppleInsider coverage](https://appleinsider.com/articles/25/10/10/update-your-slack-discord-clients-the-electron-tahoe-gpu-slowdown-bug-is-fixed)). Slack, Discord, Figma have shipped updated builds. The "Electron is exposed to Apple's release-cycle risk" caveat stands in spirit but this specific instance is closed.
- **Unchanged — [tauri#11992](https://github.com/tauri-apps/tauri/issues/11992):** macOS `externalBin` code-signing / notarization is still open and marked needs-triage, 16 months after filing. Strengthens the case against a Tauri + Node-sidecar path for Open Knowledge (see OK-Specific Deep Dive below).
- **Current versions (2026-04-20):** Electron stable [41.2.1](https://releases.electronjs.org/) (released 2026-04-16), 42 in beta. Tauri stable [2.10.3](https://github.com/tauri-apps/tauri/releases) (March 2026). Normal cadence, no surprises.
- **New CVE:** [CVE-2026-34781](https://www.sentinelone.com/vulnerability-database/cve-2026-34781/) — Electron `clipboard.readImage()` DoS on malformed image data, local-only, no RCE. Fixed in 39.8.5 / 40.8.5 / 41.1.0 / 42.0.0-alpha.5. Routine dep hygiene; does not change framework choice.
- **SwiftUI WebView:** Adoption signal continues to grow (third-party polyfills being deprecated), but it remains macOS/iOS-only and does not address the cross-platform Windows/Linux requirement.

The "Not Covered" items under §Limitations (Windows/Linux packaging specifics, Tauri 2 iOS/Android deep dive, WebView feature-parity matrix) remain open and warrant a Path C extension if they become load-bearing for the decision.

---

## Executive Summary

**Electron remains the dominant choice and is the right pick for Open Knowledge specifically** — not because it's the best on paper (Tauri wins on bundle size, memory, and startup time), but because the existing architecture maps 1:1 onto Electron's main-process model with zero code restructuring.

The primary-source evidence is decisive: of 20 popular modern macOS apps inspected (bundles extracted via `otool -L` and `app.asar`), **14 use Electron**, **5 use native Swift/AppKit/SwiftUI**, and **1 uses native Rust+Metal**. Zero use Tauri in the top-tier cohort. The consumer AI apps split decisively: **Anthropic's Claude Desktop = Electron 40.8.5**, **OpenAI's ChatGPT = native Swift/SwiftUI**, **OpenAI's Codex dev tool = Electron 40.0.0**. OpenAI explicitly stated Codex uses Electron "specifically so they can support Windows and Linux" — while their consumer ChatGPT app is native Swift.

For Open Knowledge, the deciding factor is **local server integration**. The current architecture uses a Vite plugin (`packages/app/src/server/hocuspocus-plugin.ts`) that co-locates Hocuspocus with the dev server. Electron's main process is structurally identical to this — `@inkeep/open-knowledge-server` can run in-process via `utilityProcess` with zero marshaling, zero binary packaging, zero subprocess management. Tauri would require `bun build --compile` of the server into a sidecar binary with separate code signing.

**Key Findings:**

- **Electron still dominant** (~1.66M weekly npm downloads vs Tauri ~85K) but plateauing. Electron 41 ships Chromium 146. Every major Electron app in the cohort runs Electron 38-40.
- **Tauri v2 taking share fast** (+35% YoY adoption, +55% repo activity). Hoppscotch migration cut bundle 165MB→8MB with 70% memory reduction. But zero top-tier apps in our cohort use it.
- **Apple shipped first-class SwiftUI WebView at WWDC 2025** (macOS 26 Tahoe). New `WebView` + `WebPage` API with Observation framework. For macOS-only wrapping, this is now the "native path" — but it's macOS/iOS only.
- **Native is consistently 3-5× smaller**: Raycast (native Swift) is 99 MB; ChatGPT (native Swift) is 137 MB; Electron apps range 267-804 MB.
- **OpenAI's split strategy is instructive**: ChatGPT consumer = native Swift, Codex dev tool = Electron. The consumer product optimizes for polish/size; the dev tool optimizes for cross-platform and iteration speed.
- **macOS 26 Tahoe Electron bug** (October 2025): WindowServer GPU time spiked for Electron apps (Slack, Discord, VS Code). Apple patched in a Tahoe beta in November 2025. Signal: Electron is subject to Apple's release-cycle risk.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | Framework Landscape 2025/2026 | Deep | P0 |
| 2 | Modern App Case Studies (20 apps, primary-source) | Deep | P0 |
| 3 | Tradeoff Matrix (bundle, memory, startup) | Deep | P0 |
| 4 | Update Mechanisms | Moderate | P1 |
| 5 | Local Server Integration | Deep | P0 |
| 6 | What Changed in 2025/2026 | Deep | P0 |
| 7 | Practical Migration Path | Moderate | P1 |

---

## Detailed Findings

### 1. Framework Landscape 2025/2026

**Finding:** Electron remains dominant but growth has plateaued; Tauri v2 is the primary challenger; Apple introduced a first-class native option at WWDC 2025.

**Evidence:** [evidence/framework-landscape.md](evidence/framework-landscape.md)

| Framework | Current (Apr 2026) | Bundle | Memory | Cold Start | Mobile | Maturity |
|-----------|:------------------:|:------:|:------:|:----------:|:------:|:--------:|
| **Electron** | 41 (Chromium 146) | 85-150 MB | 200-300 MB | 1-2s | No | Dominant |
| **Tauri** | 2.x | <10 MB | 30-40 MB | <500ms | Yes (v2) | Growing |
| **Wails** | v2.12 stable, v3 alpha | ~8 MB | Low | Fast | No | v2 stable |
| **SwiftUI WebView** | macOS/iOS 26 (Fall 2025) | Tiny | Native | Instant | iOS | New |
| **Neutralinojs** | Active | 0.5-2 MB | Very low | Fast | No | Niche |
| **Pake** | Rolling | ~5 MB | Low | Fast | No | Tool (Tauri-based generator) |
| **RN macOS** | Active fork | Moderate | Moderate | Moderate | Separate | Microsoft-backed |
| **Flutter desktop** | 3.x | ~20 MB+ | Moderate | Moderate | Yes | Maturing |

**Key events in 2025:**
- **Tauri 2.0 stable** (October 2024) — first full year in 2025. Mobile support added.
- **Apple SwiftUI WebView** (WWDC 2025, macOS 26 Tahoe, Fall 2025) — first-class native web wrapping. Replaces boilerplate `NSViewRepresentable` wrappers.
- **macOS 26 Tahoe Electron×WindowServer GPU bug** (October-November 2025) — Slack/Discord/VS Code bogged down until Apple patched.
- **Electron "quiet period"** (December 2025) — standing policy, not decline signal.

**Implications:**
- For cross-platform: Tauri is the technical leader but Electron has the ecosystem
- For macOS-only: SwiftUI WebView is a new first-class option worth considering
- For compatibility: WKWebView lacks some modern APIs on macOS; WebKitGTK on Linux is 1-2 years behind Chromium

---

### 2. What Modern Apps Actually Use (Primary-Source Evidence)

**Finding:** Of 20 popular macOS apps inspected via bundle extraction, 14 use Electron, 5 use native Swift, 1 uses native Rust. Zero use Tauri in the top tier.

**Evidence:** [evidence/app-case-studies.md](evidence/app-case-studies.md)

All findings from direct `otool -L` and `app.asar` extraction on `/Applications/` binaries.

#### Electron cohort (14 apps)

| App | Bundle | Electron Ver | React | Notable |
|-----|-------:|:------------:|:-----:|:--------|
| **Claude Desktop** | 623 MB | **40.8.5** | 18.3 | Electron Forge + Vite, `@ant/desktop`, Anthropic MCP SDK |
| **Codex Desktop** | 442 MB | **40.0.0** | **19.2** | Electron Forge + Vite, `better-sqlite3`, `node-pty`, Oxc toolchain |
| **Cursor** | 804 MB | 39.8.1 | — | VS Code 1.105.1 fork, largest in cohort |
| **Linear** | 509 MB | 39.3.0 | — | Uses **ToDesktop** (`@todesktop/runtime`) — managed Electron packaging service |
| **Obsidian** | 482 MB | 39.8.3 | — | Dual asar pattern (shell + app) |
| **VS Code** | 374 MB | 32.2.6 | — | ESM, gulp build. Upstream lags behind forks. |
| **Slack** | 287 MB | 39.2.7 | — | Custom `boot.bundle.cjs` loader |
| **Superhuman** | 285 MB | 38.7.1 | **16.7** | Frozen on React 16.7 (ancient) |
| **Figma** | 279 MB | 39.8.4 | 18 | C++/WASM canvas inside Electron renderer |
| **Notion** | 267 MB | 39.6.0 | 18.2 | `better-sqlite3`, custom native addons |
| **Windsurf** | — | — | — | Inferred VS Code fork |
| **T3 Chat** | — | — | — | No official app; community forks are Electron |

#### Native Swift/SwiftUI cohort (5 apps)

| App | Bundle | Stack | Notable |
|-----|-------:|:------|:--------|
| **Raycast** | **99 MB** | Swift + AppKit + SwiftUI | Smallest in cohort. `SoulverCore.framework` embedded. |
| **ChatGPT Desktop** | 137 MB | Swift + SwiftUI + LiveKitWebRTC | **Xcode 26**, Sparkle updates, zero Electron |
| **Arc Browser** | 878 MB | Swift + Chromium | Native Swift shell wrapping Chromium |
| **Perplexity** | 432 MB | Swift + SwiftUI + **WKWebView** | Custom `PerplexityCore`, `MCPInterface` frameworks |
| **Bear** | — | Native Swift + AppKit | Mac App Store distribution |

#### Native Rust cohort (1 app)

| App | Stack | Notable |
|-----|:------|:--------|
| **Warp Terminal** | Rust + Metal | Public blog: "experimented with Electron, pivoted to Rust + GPU rendering" |

#### Observations

**OpenAI's mixed strategy is striking:**
- **ChatGPT** (consumer chat) = native Swift/SwiftUI. 137 MB. Polished, small, native feel.
- **Codex** (developer tool) = Electron 40 + React 19 + Vite. 442 MB. Cross-platform, fast iteration.
- Publicly stated rationale: Codex is "built in Electron specifically so they can support Windows and Linux."

**Anthropic went all-in Electron:** Claude Desktop 623 MB with Electron Forge + Vite + React 18 + Sentry + Yarn workspaces. Deeply Node-centric.

**Electron version convergence:** Most active Electron apps run 38-40. VS Code upstream lags at 32.2.6. Cursor runs 39.8.1 (newer than upstream VS Code).

**Vite is the new standard:** Claude and Codex both use `@electron-forge/plugin-vite`. VS Code still uses gulp.

**Native apps are 3-5× smaller:** Raycast 99 MB vs Electron apps 267-804 MB. Consistent pattern.

**Tauri absent from top-tier:** Zero Tauri apps in this cohort of 20. Tauri's growth is in smaller/newer apps, not established leaders.

---

### 3. Quantitative Tradeoffs

**Finding:** Tauri is 10-20× smaller and 4-7× lighter on idle memory than Electron. But Electron's `utilityProcess` model provides zero-marshaling integration with existing Node/TypeScript server code.

**Evidence:** [evidence/tradeoffs-and-migration.md](evidence/tradeoffs-and-migration.md)

| Metric | Electron | Tauri | Delta |
|--------|---------:|------:|------:|
| Minimal app (on disk) | 85-150 MB | <10 MB | ~15× |
| Hoppscotch real migration | 165 MB | 8 MB | ~20× |
| Idle memory | 200-300 MB | 30-40 MB | ~7× |
| Cold start | 1-2 seconds | <500 ms | ~3× |
| Rendering performance (macOS) | Comparable | Comparable | ~0 |
| Rendering performance (Linux) | Chromium ✓ | WebKitGTK (1-2yr behind) | Tauri loses |
| Code signing complexity | Standard | +sidecar signing friction | Electron simpler |
| Ecosystem maturity | Dominant | Growing | Electron wins |

**Decision triggers:**
- If bundle size / memory usage / startup time dominate → **Tauri**
- If integration with existing Node server code is critical → **Electron**
- If targeting macOS only and starting fresh → **SwiftUI WebView** worth evaluating
- If Linux support matters → **Electron** (WebKitGTK compatibility risk for Tauri)

---

### 4. Local Server / Sidecar Patterns — The Decisive Factor for Open Knowledge

**Finding:** Electron's `utilityProcess` API lets Open Knowledge's Hocuspocus server run in-process with zero code restructuring. Tauri requires compiling the server as a sidecar binary.

**Evidence:** [evidence/tradeoffs-and-migration.md](evidence/tradeoffs-and-migration.md)

#### Electron: zero-marshaling integration

```typescript
// src/main/index.ts (Electron main process)
import { createServer } from '@inkeep/open-knowledge-server'

app.whenReady().then(() => {
  // Hocuspocus runs directly in main process or utilityProcess
  const server = createServer({
    contentDir: getUserContentDir(),
    projectDir: getUserProjectDir(),
  })
  
  // Renderer connects via ws://127.0.0.1:PORT
  createWindow()
})
```

No subprocess, no binary packaging, no marshaling. `@inkeep/open-knowledge-server` drops in as-is. `@parcel/watcher` works natively. This is the **same structural pattern** as the existing Vite plugin `packages/app/src/server/hocuspocus-plugin.ts`.

#### Tauri: sidecar binary pattern

```bash
# Build server as single binary
bun build --compile packages/server/src/standalone.ts --outfile binaries/ok-server-aarch64-apple-darwin
```

```json
// src-tauri/tauri.conf.json
{
  "bundle": { "externalBin": ["binaries/ok-server"] }
}
```

```rust
// src-tauri/src/main.rs
use tauri_plugin_shell::ShellExt;

tauri::Builder::default()
  .setup(|app| {
    let sidecar = app.shell().sidecar("ok-server").unwrap();
    sidecar.spawn().unwrap();
    Ok(())
  })
```

Extra steps: Bun compile, target-triple naming, sidecar capabilities config, separate binary code signing ([Tauri issue #11992](https://github.com/tauri-apps/tauri/issues/11992) documents the signing friction).

#### Pattern comparison

| Aspect | Electron utilityProcess | Tauri sidecar |
|--------|:-----------------------|:--------------|
| Binary packaging | None (in-process) | Required (`bun build --compile`) |
| Code signing | App bundle only | App + each sidecar binary |
| File watcher support | Native (`@parcel/watcher`) | Works in the sidecar process |
| Crash isolation | utilityProcess provides it | Natural (separate process) |
| IPC to server | WebSocket to localhost | WebSocket to localhost |
| Code changes to server | None | None |
| Total lines of wrapper code | ~50-100 | ~30-50 Rust + binary build config |

Both work. Electron is structurally simpler because the Vite plugin pattern already uses the exact same "Node process co-located with UI" architecture.

---

### 5. What's Changed in 2025/2026

**Finding:** Three notable shifts — Tauri v2 mobile support, Apple's SwiftUI WebView, and an Electron-specific macOS Tahoe bug.

**Evidence:** [evidence/framework-landscape.md](evidence/framework-landscape.md)

1. **Tauri 2.0 stable** (October 2024). Mobile support added (iOS/Android). 2025 was its first full year. Hoppscotch migration (the most cited real-world case) showed 165MB→8MB bundle reduction and ~70% memory reduction. But **zero top-tier apps adopted Tauri** in the cohort we inspected.

2. **Apple SwiftUI WebView** (WWDC 2025, ships with macOS/iOS 26 Tahoe in Fall 2025). First-class `WebView` + `WebPage` API in SwiftUI. Replaces the old `NSViewRepresentable`/`UIViewRepresentable` boilerplate. `WebPage` exposes async JS evaluation and observable state. This makes Swift-only macOS wrapping dramatically easier. Used by apps like Glimpse (github.com/HazAT/glimpse) advertising "sub-50ms WKWebView windows with bidirectional JSON" as a native micro-UI alternative to Electron.

3. **macOS 26 Tahoe Electron GPU bug** (October-November 2025). WindowServer GPU time spiked when Electron apps (Slack, Discord, VS Code) were visible. Apple patched in a Tahoe beta in November 2025. Signal: Electron apps are exposed to Apple's release-cycle risk in a way native Swift apps aren't.

4. **Tauri's Linux WebKitGTK inconsistency** is the #1 counter-argument raised on HN/Reddit in 2025. "Write once, debug three webviews" — Chromium on Windows, WebKit on macOS, WebKitGTK (1-2 years behind) on Linux.

5. **Electron entered "quiet period"** December 2025 (standing policy, not decline). Full capacity resumed January 2026.

---

### 6. Migration Path for Open Knowledge

**Finding:** Electron-vite provides the canonical template for wrapping a Vite+React app. The Hocuspocus server can run in-process with minimal refactoring.

**Evidence:** [evidence/tradeoffs-and-migration.md](evidence/tradeoffs-and-migration.md)

#### Concrete Electron migration plan

1. **Add electron-vite to the monorepo:**
   ```bash
   cd packages
   npm create @quick-start/electron@latest app-desktop -- --template=react-ts
   ```

2. **Restructure into main/preload/renderer:**
   - `packages/app-desktop/src/main/` — Electron main process. Imports `createServer` from `@inkeep/open-knowledge-server`, spawns Hocuspocus.
   - `packages/app-desktop/src/preload/` — Context bridge for IPC.
   - `packages/app-desktop/src/renderer/` — Existing React app from `packages/app/src/`.

3. **Move Hocuspocus invocation from Vite plugin to Electron main:**
   - Current: `packages/app/src/server/hocuspocus-plugin.ts` (Vite plugin)
   - New: `packages/app-desktop/src/main/server.ts` (Electron main module)
   - The actual code is nearly identical — just moves from Vite `configureServer` to Electron `app.whenReady()`.

4. **Renderer changes:**
   - HocuspocusProvider URL changes from dev-server port to Electron-allocated port
   - Passed via preload script + `contextBridge`
   - Otherwise no changes to existing editor code

5. **Build pipeline:**
   - `electron-builder` for production DMG
   - Auto-update via `electron-updater`
   - Code signing + notarization (requires $99/yr Apple Developer account)

6. **Distribution:**
   - Direct download DMG (not Mac App Store — sandbox restrictions incompatible with file watcher)
   - GitHub Releases or S3 as update server

**Estimated effort:** 1-2 weeks for a functional desktop wrapper. Most time spent on: code signing setup, auto-update infrastructure, testing file watcher in packaged app context, OS menu bar integration, native file dialog integration.

---

## Recommendation

**Use Electron + electron-vite + electron-forge (with `auto-unpack-natives` plugin) for Open Knowledge's desktop app.**

Rationale:
1. **Structural fit:** The existing Hocuspocus-as-Vite-plugin pattern maps 1:1 onto Electron main process. No architectural changes.
2. **Zero marshaling:** `@inkeep/open-knowledge-server` runs in-process via `utilityProcess`. File watcher, persistence, agent sessions all work natively.
3. **Cross-platform preservation:** Future Windows/Linux support without re-architecting. OpenAI chose Electron for Codex specifically for this reason.
4. **Established tooling:** electron-vite, electron-forge, electron-builder, electron-updater are mature and battle-tested.
5. **Peer precedent:** Claude Desktop, Codex, Obsidian, Notion, Linear, VS Code all use Electron + Vite (or are converging on it). You're joining the dominant pattern, not fighting it.

See the "OK-Specific Deep Dive" section below for the code-level analysis of every dimension that matters for this stack.

**Accept the tradeoffs:**
- ~200-250 MB installed size (vs ~130-170 MB Tauri + Node sidecar — marginal delta)
- ~250 MB RAM baseline (vs ~80-120 MB Tauri + Node — marginal for this app)
- 1-2 second cold start (vs <500ms Tauri)
- Subject to Apple's release-cycle risk (Tahoe GPU bug)

**Revisit this decision if:**
- The app moves to a pure web architecture (Hocuspocus as hosted service, desktop becomes thin client) → Tauri becomes viable
- macOS-only becomes acceptable AND team has Swift expertise → SwiftUI WebView (macOS 26+) is viable
- A clean-room rewrite of Hocuspocus+Yjs in Rust becomes acceptable (it shouldn't)

**Implementation services to consider:**
- [ToDesktop](https://www.todesktop.com) — managed Electron packaging/update service (used by Linear). Handles signing, updates, cross-platform packaging. Worth evaluating if team wants to skip DevOps overhead.

---

## OK-Specific Deep Dive: Electron vs Tauri at the Code Level

This section adds stack-specific analysis (April 2026) grounded in Open Knowledge's actual architecture — not generic benchmarks. The question isn't "which framework is better in general" but "which framework handles the specific things OK does." Findings are informed by a worldmodel pass on the OK codebase and code-level research on both frameworks.

### The Architectural Constraint

OK's architecture forces six non-negotiable requirements on the desktop wrapper:

1. **Node.js 22+ runtime** — Hocuspocus is Node-native; `engines: node >=22` in root package.json
2. **`@parcel/watcher` N-API native addon** — recursive file watching via FSEvents
3. **`simple-git` shelling out to git binary** — WIP ref pipeline uses git plumbing
4. **Y.Doc + DirectConnection in-memory** — `AgentSessionManager` holds Y.UndoManager via in-process references; cannot cross process boundaries
5. **Vite + `hocuspocus-plugin.ts` co-location** — dev server embeds Hocuspocus
6. **MCP stdio server subcommand** — `open-knowledge mcp` spawns as subprocess of AI agent

Every dimension below flows from these.

**Evidence:** [evidence/ok-specific-deep-dive.md](evidence/ok-specific-deep-dive.md)

### Decision Matrix (OK-Specific)

| Dimension | Weight | Electron | Tauri | Winner |
|-----------|:------:|:---------|:------|:------:|
| Node.js runtime compatibility | P0 | Native in `utilityProcess` | Requires sidecar (pkg/bun) | **Electron** |
| `@parcel/watcher` proven support | P0 | VS Code ships it at global scale | Zero documented production cases | **Electron** |
| Y.Doc + DirectConnection in-process | P0 | Works in `utilityProcess` | Requires Node sidecar anyway | **Electron** |
| Code signing reliability (macOS) | P0 | Battle-tested | [tauri#11992](https://github.com/tauri-apps/tauri/issues/11992) open since 2024 | **Electron** |
| Subprocess lifecycle management | P0 | Implicit via process model | ~1000 LOC DIY ([plugins-workspace#3062](https://github.com/tauri-apps/plugins-workspace/issues/3062)) | **Electron** |
| Vite dev plugin pattern reuse | P1 | Renderer config fits existing plugin | Divergent dev/prod paths | **Electron** |
| MCP stdio subcommand | P1 | `--mcp` flag + `ELECTRON_RUN_AS_NODE` | Separate binary | **Electron** |
| Bundle size | P1 | 200-250 MB | 130-170 MB | Tauri (marginal) |
| RAM footprint | P1 | ~250 MB | ~80-120 MB | Tauri (marginal) |
| Time to first shipped build | P0 | ~2 weeks | ~4-7 weeks | **Electron** |
| Community signal for OK's category | P1 | VS Code, AFFiNE, Codex | Zero matching examples | **Electron** |

**Verdict: Electron wins 9 of 11 dimensions.** The two Tauri wins (bundle size, RAM) are marginal once you add a Node sidecar.

### Critical Findings — Things That Would Bite Us

**For Electron:**

1. **ESM not supported in `utilityProcess.fork()`** ([electron/electron#40031](https://github.com/electron/electron/issues/40031)). OK is ESM-everywhere. Fix: produce a CJS build target of `@inkeep/open-knowledge-server` via `tsdown` or `vite build --format cjs`. The existing `standalone.ts` factory can be the CJS entry.

2. **`@parcel/watcher` requires `electron-builder install-app-deps` postinstall** to rebuild against Electron's Node ABI. Bun may need `trustedDependencies` allowlist to run postinstalls.

3. **Don't run Hocuspocus in main process** — main process is the UI thread, Y.js encode/decode would cause menu/drag jank. Use `utilityProcess`.

4. **Dual dev/prod paths:** dev uses `hocuspocus-plugin.ts` inside renderer's Vite config; production spawns CJS-built server via `utilityProcess` from main. Both import from the same `createServer()` factory — structurally cheap.

5. **Code signing is the real cost:** $99/yr Apple Developer + $300-500/yr Windows EV cert for auto-update reliability.

**For Tauri (why it's worse for OK specifically):**

1. **`pkg` is the official Node sidecar path** — upstream unmaintained; community uses `@yao-pkg/pkg`. Node 22 support is recent and not battle-tested.

2. **`@parcel/watcher` in a Node sidecar has no public production examples.** `pkg` doesn't bundle `.node` files natively. `bun build --compile` has an open issue ([oven-sh/bun#19282](https://github.com/oven-sh/bun/issues/19282)) for `@parcel/watcher` prebuild not found under Bun. Expected failure mode: file watcher silently breaks in packaged app, matching [tauri#11261](https://github.com/tauri-apps/tauri/issues/11261) "works in dev, fails in production."

3. **macOS notarization with `externalBin` is broken** ([tauri#11992](https://github.com/tauri-apps/tauri/issues/11992)) — "signature of the binary is invalid" / "nested code is modified or invalid." Requires custom `afterBundleCommand` scripts to re-sign sidecars. Expect 2-5 days of first-release debugging.

4. **Sidecar lifecycle is DIY** — [plugins-workspace#3062](https://github.com/tauri-apps/plugins-workspace/issues/3062) is a still-open feature request since 2024 for process spawning/monitoring, crash recovery, health checks, graceful shutdown, orphan cleanup, cross-platform signal handling. ~800-1200 lines of Rust + TS to match what Electron gives you for free.

5. **Binary size gains evaporate:** 7 MB Rust + 28-90 MB Node sidecar + 50 MB portable git (if bundled) + 15 MB React = 100-160 MB total. Electron baseline is 200-250 MB. Delta is only 50-100 MB — not worth the engineering cost.

### Prior Art: What Comparable Apps Actually Do

**Electron success stories for OK-like apps:**

| App | Key pattern OK can borrow | Evidence |
|-----|:--------------------------|:---------|
| **VS Code** | `@parcel/watcher` + `node-pty` in Electron at global scale. Forked `@vscode/sqlite3` to vendor prebuilts | [package.json](https://github.com/microsoft/vscode/blob/main/package.json) confirms `@parcel/watcher ^2.5.6` |
| **AFFiNE** | Electron Forge + `auto-unpack-natives` plugin + helper process for CPU-heavy work. CRDT architectural analog. `FusesPlugin` hardening | [forge.config.mjs](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/forge.config.mjs) |
| **Codex Desktop** | `better-sqlite3` + `node-pty` + Rust sidecar for conversation DB. Validates mixed native-module strategy | App bundle inspection (Electron 40.0.0, React 19.2) |
| **Claude Desktop** | MCP SDK bundled via Electron asar. Lesson: bundle Node or resolve paths — GUI PATH problem | App bundle inspection (Electron 40.8.5) |

**Tauri + Node sidecar prior art — thin:**

| Case | Result |
|------|:-------|
| **Beadbox** (Next.js 16 + WebSocket sidecar) | **Only documented production-ish case.** No native addons. `NEXT_PUBLIC_*` bake issue required custom `invoke('get_ws_port')`. |
| `@parcel/watcher` + pkg/bun in Tauri sidecar | **No public production examples.** |
| Hocuspocus + Yjs in Tauri sidecar | **Zero examples.** Architecturally novel. |

**Cautionary tale:** **n8n Desktop** (archived 2023) — chose the cheapest Electron wrapper path (server in main process, `asar: false`), abandoned due to size/startup/native-module pain. Follow VS Code/AFFiNE's production-grade playbook, not n8n Desktop's minimum-effort one.

### The Effort Delta

**Electron for OK:** ~10-15 days (~2 weeks)
- Add electron-vite to monorepo: 1 day
- Write `main/index.ts` + utilityProcess fork: 1 day
- CJS build target for `@inkeep/open-knowledge-server`: 1 day
- Configure electron-forge + auto-unpack-natives: 0.5 day
- IPC bridge for port + menu bar integration: 1-2 days
- Code signing + notarization: 2-3 days (first time)
- Auto-updater with electron-updater: 1 day
- E2E packaged app testing: 2-3 days

**Tauri v2 + Node sidecar for OK:** ~20-35 days (~4-7 weeks)
- Add Tauri + Rust scaffold: 1 day
- Configure `pkg`/`bun compile` for sidecar: 2 days
- **Debug `@parcel/watcher` N-API bundling: 3-7 days (risk)**
- Write ~1000 LOC Rust for sidecar lifecycle: 5-7 days
- Port allocation + health check + handoff: 2 days
- **Code signing externalBin ([tauri#11992](https://github.com/tauri-apps/tauri/issues/11992)): 3-5 days**
- Auto-updater: 1 day
- E2E testing: 3-5 days

**Effort delta: 2-3× more work for Tauri with higher risk on unproven paths.** The Tauri path is "you are the 5% case" — the tooling is Rust-optimized and Node is second-class.

### The Recommended Architecture (Concrete)

```
packages/
  app-desktop/              ← NEW
    electron.vite.config.ts
    src/
      main/
        index.ts            ← app lifecycle, window, utilityProcess fork
        server.ts           ← spawns Hocuspocus utility
        menu.ts             ← native menu bar
        mcp-entry.ts        ← --mcp flag handler (stdio mode)
      preload/
        index.ts            ← contextBridge: port, IPC
      renderer/
        ← existing packages/app/src React code
  core/                     ← unchanged
  server/                   ← +CJS build target added
    src/
      standalone.ts         ← already exists, becomes CJS sidecar entry
      index.cjs.ts          ← NEW — CJS entry for utilityProcess
  cli/                      ← unchanged

// main/server.ts
import { utilityProcess, MessageChannelMain } from 'electron'
const hocuspocus = utilityProcess.fork(
  path.join(__dirname, '../server/standalone.cjs'),
  [`--port=0`, `--content-dir=${userContentDir}`],
  { serviceName: 'open-knowledge-server', stdio: 'pipe' }
)

// Get the resolved port via IPC, then tell the renderer
hocuspocus.once('message', ({ type, port }) => {
  if (type === 'ready') ipcMain.handle('get-ws-port', () => port)
})

// Forward to renderer via preload
contextBridge.exposeInMainWorld('api', {
  getWsPort: () => ipcRenderer.invoke('get-ws-port')
})
```

Existing code that stays unchanged:
- `packages/core/*` — TipTap extensions, jsx tokenizer, frontmatter utils
- `packages/server/src/*` (except new CJS build) — Hocuspocus, persistence, file-watcher, agent-sessions
- `packages/app/src/editor/*` — React components, observers, three-way-merge
- `packages/app/src/presence/*`
- `packages/cli/*` — Commander, config loader, MCP tools

The only real new code is in `packages/app-desktop/src/main/` and the CJS build target.

---

## Limitations & Open Questions

### Not Covered
- **Windows/Linux packaging specifics** — focus was macOS-first
- **iOS app wrapping** — different category (Tauri v2 mobile, Capacitor, native)
- **PWA as alternative** — user explicitly asked about native wrapping
- **App Store distribution** — ruled out due to sandbox restrictions for file watcher

### Uncertainties
- Whether Tauri v2 sidecar signing friction is a real blocker or just mild annoyance (would need prototype)
- Whether SwiftUI WebView's Observation framework integration works well with React state patterns (new API, limited field reports)
- Whether the macOS Tahoe Electron GPU bug is a one-time issue or a pattern

---

## References

### Evidence Files
- [evidence/framework-landscape.md](evidence/framework-landscape.md) — Electron, Tauri, Wails, SwiftUI WebView, others
- [evidence/app-case-studies.md](evidence/app-case-studies.md) — 20 apps inspected via bundle extraction
- [evidence/tradeoffs-and-migration.md](evidence/tradeoffs-and-migration.md) — Quantitative tradeoffs, sidecar vs utilityProcess, migration path
- [evidence/ok-specific-deep-dive.md](evidence/ok-specific-deep-dive.md) — OK architecture constraint analysis, dimension-by-dimension code-level research, VS Code / AFFiNE / Codex prior art, effort estimates

### External Sources
- [Electron Releases](https://releases.electronjs.org/)
- [Tauri 2.0 Release](https://v2.tauri.app/blog/tauri-20/)
- [Tauri vs Electron — gethopp.app](https://www.gethopp.app/blog/tauri-vs-electron)
- [DoltHub: Electron vs Tauri (Nov 2025)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [WebKit for SwiftUI WWDC 2025](https://dev.to/arshtechpro/wwdc-2025-webkit-for-swiftui-2igc)
- [danielsaidi: WebView for SwiftUI](https://danielsaidi.com/blog/2025/06/10/webview-is-finally-coming-to-swiftui)
- [9to5Mac: macOS Tahoe Electron bug](https://9to5mac.com/2025/11/21/mac-tahoe-electron-performance-bug/)
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- [electron-vite docs](https://electron-vite.org/guide/)
- [electron-builder auto-update](https://www.electron.build/auto-update.html)
- [Tauri Sidecar v2](https://v2.tauri.app/develop/sidecar/)
- [Tauri Node.js sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri Updater plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri sidecar signing issue #11992](https://github.com/tauri-apps/tauri/issues/11992)
- [Introducing the Codex app — OpenAI](https://openai.com/index/introducing-the-codex-app/)
- [VentureBeat: OpenAI Codex desktop app](https://venturebeat.com/orchestration/openai-launches-a-codex-desktop-app-for-macos-to-run-multiple-ai-coding)
- [DevClass: OpenAI Codex Mac-only debate](https://www.devclass.com/development/2026/02/05/openai-codex-app-looks-beyond-the-ide-devs-ask-why-mac-only/4090132)
- [How Warp Works — Warp Blog](https://www.warp.dev/blog/how-warp-works)
- [ToDesktop](https://www.todesktop.com) (used by Linear)
- [Hoppscotch Tauri migration](https://blog.hoppscotch.io/hoppscotch-desktop-3)
- [HN: We Chose Tauri for Performance-Critical App](https://news.ycombinator.com/item?id=43652476)
- [HN: Electron vs Tauri (2025)](https://news.ycombinator.com/item?id=46082291)
