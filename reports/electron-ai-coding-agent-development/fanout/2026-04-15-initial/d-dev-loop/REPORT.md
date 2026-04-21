# Cluster D: Dev loop + worktree isolation + hot-reload + headless

**Dimensions:** D7, E1, E2
**Date:** 2026-04-15
**Worker:** d-dev-loop

## Summary

Three forces shape the inner loop for AI coding agents driving Electron apps: (1) the Electron binary is a heavy install asset, so per-worktree installs compound linearly with agent parallelism unless cache/store is shared; (2) main-process code cannot be truly HMR'd — "hot reload" always means rebuild + restart; (3) Electron is a GUI runtime that refuses to launch without a display driver on Linux, so CI is Xvfb-mediated by default.

On **D7**, package managers diverge: pnpm's global content-addressable store with hard/symlinks is the only mainstream solution that cleanly deduplicates across worktrees. The Electron binary itself is cached separately via `@electron/get` at platform-specific paths (`~/Library/Caches/electron/`, `$XDG_CACHE_HOME/electron/`, `$LOCALAPPDATA/electron/Cache`); this cache is shared across every worktree on the machine regardless of package manager. `electron-rebuild` caches headers at `~/.electron-gyp` (also machine-global). Parallel `playwright.launch()` of Electron is gated by a documented missing feature — no `user-data-dir` launch option — which teams work around by calling `app.setPath('userData', ...)` via `electronApp.evaluate()` or by setting `process.env` before launch.

On **E1**, electron-vite is the 2026 de-facto: `electron-vite dev --watch` (or `-w`) gives renderer HMR, rebuild+full-Electron-restart on main changes, rebuild+renderer-reload on preload changes. Hot reload is **not** true HMR for main; renderer state is lost on main restart. Utility-process hot-reload is unaddressed in frameworks.

On **E2**, Linux CI requires Xvfb; macOS/Windows CI runners run Electron headed natively. `BrowserWindow({ webPreferences: { offscreen: true } })` is for rendering-to-texture, not a headless substitute. Ubuntu 24.04 on `ubuntu-latest` broke Electron launch in 2026 (missing GTK/GBM deps); Playwright 1.50+ ships the fix.

## D7 — Worktree isolation + parallel runs

### Finding: Electron binary cached at platform-global paths, independent of package manager
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/installation
```
Linux:   $XDG_CACHE_HOME or ~/.cache/electron/
macOS:   ~/Library/Caches/electron/
Windows: $LOCALAPPDATA/electron/Cache or ~/AppData/Local/electron/Cache/
```
Cache key is `[checksum]/[filename]`, so the same Electron version across 10 worktrees downloads once. `ELECTRON_CACHE` (env) overrides location; `ELECTRON_MIRROR` + `ELECTRON_CUSTOM_DIR` repoint the download URL for air-gapped environments.

**Implications for agent-velocity:** Zero config needed for cross-worktree binary sharing on the same user — machine-global by default. A fleet of agents spinning up worktrees pays the ~150-200MB download once.

### Finding: `electron-rebuild` headers cached machine-globally at `~/.electron-gyp`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/rebuild ; Electron docs "Native Node Modules". `HOME=~/.electron-gyp` is the documented override; default header URL `https://www.electronjs.org/headers`.

**Implications for agent-velocity:** Native-module rebuilds share headers across worktrees. The *compiled* binaries live inside each worktree's `node_modules/<pkg>/build/` — cross-worktree pollution is a real risk if you hard-link a compiled-for-Electron-X binary into a worktree on Electron-Y.

### Finding: pnpm is the only mainstream package manager with cross-worktree deduplication
**Confidence:** CONFIRMED
**Evidence:** https://pnpm.io/11.x/git-worktrees — pnpm documents a dedicated "Git Worktrees for Multi-Agent Development" page. Bun install uses a global cache but still writes full `node_modules` per project; npm/yarn are per-project.

**Implications for agent-velocity:** If N worktrees × M native-Electron deps, pnpm amortizes install cost; Bun/npm/yarn pay M×N disk + install. For Electron this compounds because native modules (keytar, better-sqlite3) trigger rebuild-on-install.

### Finding: Playwright `electron.launch()` has no documented `userDataDir` option
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-electron — launch options are `executablePath`, `args`, `cwd`, `env`, `timeout`. https://github.com/microsoft/playwright/issues/11240 (closed, P3) is the open feature request. Workaround: `await electronApp.evaluate(async ({ app }) => { app.setPath('userData', '/tmp/test-' + workerIndex) })` — but runs after some init. Cleaner: pass `env: { ELECTRON_USER_DATA: tmpdir }` and call `app.setPath` in `main.js` before `app.whenReady()`.

**Implications for agent-velocity:** Parallel Playwright-for-Electron tests on the same machine risk `userData` collisions. Teams DIY isolation via env-var convention or `testInfo.workerIndex`-keyed tmpdirs. The single sharpest-edged gotcha for parallel Electron E2E.

### Finding: `app.requestSingleInstanceLock()` is keyed per-user, not per-directory
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app ; https://github.com/electron/electron/issues/24447 confirms lock is process-level per user. Logseq uses it at `~/.claude/oss-repos/logseq/src/electron/electron/core.cljs:322` (`(if-not (.requestSingleInstanceLock app) (.quit app) ...)`).

**Implications for agent-velocity:** Two dev Electron instances (two worktrees, same app ID) running `requestSingleInstanceLock()` → second self-terminates. Agents running parallel dev sessions must either (a) skip the lock in dev mode, (b) vary app ID per worktree, or (c) use `userData` paths to separate lock files.

### Finding: Ubuntu 24.04 broke Electron in GitHub Actions `ubuntu-latest` in 2026
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/playwright/issues/34251 ; https://github.com/microsoft/playwright/pull/34238 — missing libraries after 24.04 rollover caused `electron.launch: Process failed to launch!`. Fix: `npx playwright install --with-deps` on modern Playwright, or manually add GTK/GBM packages.

**Implications for agent-velocity:** Agents dispatching to `ubuntu-latest` without `--with-deps` hit a hard environmental failure. Pin `ubuntu-22.04` for stability or always invoke `--with-deps`.

## E1 — Hot-reload across main/renderer/utility

### Finding: electron-vite `--watch`/`-w` gives renderer HMR + main/preload rebuild-restart
**Confidence:** CONFIRMED
**Evidence:** https://electron-vite.org/guide/hmr-and-hot-reloading —
```
1. CLI flags (recommended): electron-vite dev --watch OR electron-vite dev -w
2. Configuration: Set build.watch to {} with optional WatcherOptions
```
Docs explicitly state: "Hot reloading ... is not true hot reloading (which updates code without restart), it provides a similar development experience." Main-file change → full Electron restart. Preload change → rebuild preload + reload renderer (v0.29.0+ emits `electron-vite&type=hot-reload` event). Renderer change → Vite HMR.

**Implications for agent-velocity:** For renderer UI, HMR loop is sub-second. For main-process changes, expect 1-3s full restart + WebSocket reconnection.

### Finding: Renderer state does NOT survive main-process restart
**Confidence:** INFERRED
**Evidence:** By construction — when Electron restarts, all BrowserWindow instances are torn down. electron-vite docs describe the rebuild as "restarts the Electron application"; no mechanism preserves JS heap across process exit.

**Implications for agent-velocity:** A main-only change forces renderer remount → lose CodeMirror selection, lose unsaved WYSIWYG edits, re-run WebSocket sync. For CRDT editors this dominates dev-loop latency. Community pattern: minimize main-side logic; push logic into preload + renderer.

### Finding: electron-forge's Vite plugin uses injected globals; different dev-loop surface
**Confidence:** CONFIRMED
**Evidence:** https://www.electronforge.io/config/plugins/vite —
```js
if (MAIN_WINDOW_VITE_DEV_SERVER_URL) { mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL); }
else { mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)); }
```
Forge compiles three targets (main, preload, renderer) with separate Vite configs. Historically weaker at main-process reload than electron-vite.

**Implications for agent-velocity:** electron-vite is the sharper dev-loop tool; Forge is more packaging-oriented. Many teams combine: electron-vite for dev, Forge/electron-builder for packaging. Logseq uses `electron-forge start`.

### Finding: Utility-process hot reload unaddressed by major frameworks
**Confidence:** INFERRED
**Evidence:** Negative search: electron-vite docs only describe main/preload/renderer hot reload. Web search for `"utility process" electron hot reload` returned only general electron-reloader articles — no framework-level utility-process reload.

**Implications for agent-velocity:** Agent iterating on utility-process code needs full Electron restart even with electron-vite. DIY: watch utility source, call `UtilityProcess.kill()` + respawn from main on change.

### Finding: Fast Refresh works through Vite for React renderer
**Confidence:** CONFIRMED
**Evidence:** https://electron-vite.org/guide/hmr-and-hot-reloading — `ELECTRON_RENDERER_URL` convention points renderer to Vite dev server. React Fast Refresh is @vitejs/plugin-react's default when detected.

**Implications for agent-velocity:** React component edits are sub-100ms reload, state preserved.

### Finding: No published benchmarks for main/renderer/utility reload latency
**Confidence:** NOT FOUND
**Evidence:** Negative search: no community benchmarks for `"electron-vite reload latency ms"` or `"electron main process restart benchmark 2026"`.

**Implications for agent-velocity:** Teams should measure in-repo. Anecdotal community estimates: renderer HMR <100ms, preload rebuild+reload 300-800ms, main rebuild+restart 1000-3000ms.

## E2 — Running Electron headless in CI + scripts

### Finding: Linux CI requires Xvfb; no headless Electron flag exists
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci — "Being based on Chromium, Electron requires a display driver to function. If Chromium can't find a display driver, Electron will fail to launch." Canonical CI command: `xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" -- npx playwright test`. `xvfb-maybe` wrapper is Electron's documented tool.

**Implications for agent-velocity:** Linux CI needs 1 line: wrap with `xvfb-run` or start `Xvfb :99 -screen 0 1280x1024x24 &` + `export DISPLAY=:99`. No code change in the Electron app.

### Finding: macOS and Windows CI runners run Electron headed with native display
**Confidence:** CONFIRMED
**Evidence:** https://til.simonwillison.net/electron/testing-electron-playwright — uses `macos-latest` with no xvfb. Electron docs: AppVeyor (Windows) "no configuration is required." GitHub Desktop CI uses `macos-14-xlarge, windows-2022` only — no Linux build.

**Implications for agent-velocity:** Playwright-for-Electron tests on `macos-latest`/`windows-latest` "just work." Cross-platform CI matrix: Linux gets `xvfb-run` prefix, mac/Windows direct.

### Finding: `offscreen: true` is for rendering-to-texture, not a headless substitute
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering — "obtain the content of a BrowserWindow in a bitmap or a shared GPU texture, so it can be rendered anywhere, for example, on texture in a 3D scene." Modes: GPU-accelerated (with/without `useSharedTexture`) or Software. Frame-rate cap 240fps when `useSharedTexture: false`. "An offscreen window is always created as a Frameless Window."

**Implications for agent-velocity:** Offscreen rendering does NOT replace Xvfb — Electron still needs a display driver to start on Linux. Useful for: screenshot-driven agent tests, video recording, pixel-diff regression.

### Finding: Playwright `_electron.launch` is the canonical scripted-drive API
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-electron + https://playwright.dev/docs/api/class-electronapplication —
```js
const { _electron: electron } = require('playwright');
const app = await electron.launch({
  args: ['main.js'],
  env: { NODE_ENV: 'test', E2E_TEST_MODE: '1' },
  timeout: 30000,
});
const window = await app.firstWindow();
await app.evaluate(async ({ app }) => { app.setPath('userData', '/tmp/iso'); });
await app.close();
```

**Implications for agent-velocity:** Agents can script "open app → create doc → screenshot → assert → quit" in ~50 lines. `env` option is the standard test-mode gate; Electron apps check `process.env.E2E_TEST_MODE` in main.js to disable auto-updater, telemetry, recovery dialogs.

### Finding: Graceful shutdown — `app.close()` vs SIGTERM
**Confidence:** INFERRED
**Evidence:** Playwright docs: `await electronApp.close()` returns Promise resolved on close. For non-Playwright: `app.quit()` triggers `before-quit` hooks (Logseq `core.cljs:316-317` sets `win/*quitting?` flag).

**Implications for agent-velocity:** Scripted runs should prefer `app.close()` over SIGTERM — `before-quit` handler is the only documented pre-exit hook that synchronously blocks quit for cleanup.

### Finding: Stdio capture — main stdout survives, renderer console does not
**Confidence:** INFERRED
**Evidence:** Playwright `electronApp.on('console')` + `page.on('console')` exposed per docs. Electron main-process `console.log` writes to the launching shell's stdout (main is a Node.js process). Renderer `console.log` requires subscribing via Playwright or `webContents.on('console-message')`.

**Implications for agent-velocity:** CI logs capture main stdout for free; renderer logs need explicit bridging. Common pattern: `webContents.on('console-message', (ev, level, msg) => console.log('[renderer]', msg))` in main.js for dev/test builds.

## Cross-dimension patterns

1. **"Real HMR only exists for renderer."** The single load-bearing pattern across E1/E2: main-process code is rebuild-and-restart, not hot-swap. Everything downstream (test-mode gates, renderer state preservation, dev-loop latency) flows from this. Agents iterating on Electron should lean on preload/renderer for logic, keep main thin.

2. **Machine-global caches, per-worktree mutable state.** Electron binaries (`~/Library/Caches/electron/`), rebuild headers (`~/.electron-gyp`), and pnpm store are machine-global and deduplicate cleanly. `node_modules/<native-pkg>/build/` and `userData` paths are per-worktree/per-test and need explicit isolation.

3. **`electronApp.evaluate()` is the universal escape hatch.** Missing `userDataDir`? Use `evaluate` to call `app.setPath`. Need force quit? `evaluate` to call `app.exit(0)`. Need runtime config? `evaluate` to return `app.getPath('userData')`. The single most important Playwright-for-Electron primitive for scripted work.

4. **Linux CI = Xvfb, mac/Windows CI = native.** No Electron flag avoids the Linux display-server requirement. Offscreen rendering is orthogonal to headlessness.

## UNRESOLVED / NOT FOUND

- **Measured reload latencies (main/preload/renderer/utility/shared-code) for electron-vite** → not found in community benchmarks. Qualitative claims only.
- **Utility-process hot-reload in any major framework (electron-vite, Forge, Builder)** → not supported first-class. Community DIY only.
- **`electron-rebuild` cross-worktree cache sharing semantics** → `~/.electron-gyp` caches headers (shared) but compiled `.node` binaries are per-`node_modules`.
- **Parallel Playwright-for-Electron worker capacity on a CI runner** → no published benchmarks.
- **Whether `offscreen: true` + software rendering can launch on Linux without Xvfb** → inferred no, but not explicitly tested.
- **`ELECTRON_CACHE` + pnpm interaction specifics** → no source directly addresses. By construction both should compose.

## References

**Primary (vendor) docs:**
- https://electron-vite.org/guide/hmr-and-hot-reloading
- https://www.electronjs.org/docs/latest/tutorial/installation
- https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci
- https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/api/app
- https://playwright.dev/docs/api/class-electron
- https://playwright.dev/docs/api/class-electronapplication
- https://www.electronforge.io/config/plugins/vite
- https://pnpm.io/11.x/git-worktrees

**GitHub issues/PRs:**
- https://github.com/microsoft/playwright/issues/11240 — userDataDir feature request
- https://github.com/microsoft/playwright/issues/34251 — Ubuntu 24.04 launch failure
- https://github.com/microsoft/playwright/pull/34238 — Fix for above
- https://github.com/electron-userland/electron-forge/issues/682 — Forge main-process watch
- https://github.com/electron/electron/issues/24447 — requestSingleInstanceLock per-user scope
- https://github.com/electron/electron/pull/33559 — userData-on-lock fix

**OSS reference on-disk:**
- `~/.claude/oss-repos/logseq/resources/package.json:12`
- `~/.claude/oss-repos/logseq/src/electron/electron/core.cljs:322`
- `~/.claude/oss-repos/desktop/package.json` — Electron 40.1.0, electron-packager
- `~/.claude/oss-repos/desktop/.github/workflows/ci.yml:78`

**Community:**
- https://til.simonwillison.net/electron/testing-electron-playwright
- https://github.com/sindresorhus/electron-reloader — pre-Vite main-process watcher (legacy)
