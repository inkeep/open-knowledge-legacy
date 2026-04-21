# Cluster A: Electron repo structure, CI/CD, distribution

**Dimensions:** D1, D2, D6
**Date:** 2026-04-15
**Worker:** a-structure-ops

## Summary

Three converging patterns dominate the 2026-Q2 Electron landscape. **(1) The `src/{main,preload,renderer}` triad is canonical** across electron-vite, electron-vite-react, electron-vite-boilerplate, electron-forge's Vite plugin, and (in folder-renamed form) GitHub Desktop's `app/src/{main-process,ui,lib}`. Following the convention buys "minimal configuration" from electron-vite. VS Code goes further with a six-layer model (`base`, `platform`, `editor`, `workbench`, `code`, `server`) and per-layer environment subfolders (`common`, `browser`, `node`, `electron-main`, `electron-utility`, `electron-sandbox`) enforced by a build-time import-rule checker. For an AI agent navigating a fresh repo, the directory-as-process-boundary convention removes guesswork: a function in `src/main/` cannot reach DOM APIs; a file in `src/renderer/` cannot `require('fs')`. **(2) CI builds the packaged artifact, then smoke-tests it.** GitHub Desktop's `ci.yml` runs a 4-cell matrix (`macos-14-xlarge`, `windows-2022` × `x64`, `arm64`), runs `yarn build:prod` then `yarn package`, then in a separate `e2e-smoke` job *installs* the produced `.exe`/`.app` and drives it with Playwright. Logseq fans out into 6 build jobs (linux x64/arm64, win x64/arm64, mac x64/arm64) with platform-specific `electron:make-*` scripts, each reading the same upstream `static/` artifact. Caching: yarn cache via `actions/cache` keyed on `yarn.lock`; `$HOME/.cache/electron` and `$HOME/.cache/electron-builder` recommended by electron-builder docs; native-module rebuild via `@electron/rebuild` in `postinstall`. **(3) Dev-vs-prod parity is achieved with `electron-builder --dir` (unsigned unpacked dir, fast) + a separate full DMG/NSIS/AppImage path for release**, with sourcemaps shipped and uploaded via `sentry-cli releases ... upload-sourcemaps`. Sentry's three-module split (`@sentry/electron/main`, `/renderer`, `/utility`) mirrors the process-model split — instrumentation cannot accidentally cross the boundary.

## D1 — Electron repo structure for agent navigation

### Finding 1.1: `src/{main,preload,renderer}` is the canonical 2026 triad
**Confidence:** CONFIRMED
**Evidence:** electron-vite docs (https://electron-vite.org/guide/dev):
> "Default entry points: Main process: `<root>/src/main/{index|main}.{js|ts|mjs|cjs}`; Preload script: `<root>/src/preload/{index|preload}.{js|ts|mjs|cjs}`; Renderer: `<root>/src/renderer/index.html`."
> "With this convention, electron-vite can work with **minimal configuration**."

electron-vite-react (https://github.com/electron-vite/electron-vite-react) uses a near-equivalent layout (`electron/main`, `electron/preload`, `src` for renderer). electron-vite-boilerplate uses the same `electron/{main,preload}` + `src` shape.

**Implications for agent velocity:** An agent landing in any conformant repo immediately knows where main-process side effects live vs. where DOM code lives — no need to grep for `BrowserWindow` or `ipcRenderer` to reverse-engineer the boundary.

### Finding 1.2: electron-forge Vite plugin uses `src/main.js` + `src/preload.js` + per-renderer entries
**Confidence:** CONFIRMED
**Evidence:** electron-forge Vite plugin docs (https://www.electronforge.io/config/plugins/vite):
```javascript
build: [
  { entry: 'src/main.js',    config: 'vite.main.config.mjs' },
  { entry: 'src/preload.js', config: 'vite.preload.config.mjs' }
],
renderer: [
  { name: 'main_window', config: 'vite.renderer.config.mjs' }
]
```
Output lands at `.vite/build/{main,preload}.js`. This is **not** the same convention as electron-vite — forge prefers per-process Vite config files at the repo root rather than directory-as-config; both ship.

**Implications for agent velocity:** Agents must distinguish "electron-vite repo" from "electron-forge + Vite repo" — the former auto-detects from folder structure, the latter requires reading `forge.config.js`. Look for `electron.vite.config.ts` (electron-vite signal) vs `forge.config.js` with a `plugins: [{name:'@electron-forge/plugin-vite'}]` block.

### Finding 1.3: VS Code's layered model is the "agent-friendly" extreme
**Confidence:** CONFIRMED
**Evidence:** microsoft/vscode wiki (https://github.com/microsoft/vscode/wiki/source-code-organization):
- Six top-level layers: `base`, `platform`, `editor`, `workbench`, `code`, `server`
- Per-layer environment subfolders with strict import rules:
  - `common` — pure JS, "may use code from: (none)"
  - `browser` — Web APIs, "may use code from: common"
  - `node` — Node APIs, "may use code from: common"
  - `electron-utility` — utility-process APIs, "may use code from: common, node"
  - `electron-main` — main-process APIs, "may use code from: common, node, electron-utility"
  - `electron-sandbox` / `electron-browser` — DOM + sandboxed Electron renderer APIs

> "The codebase is divided into strict layers inside `src/vs/`, and a build-time checker enforces that lower layers cannot import from higher layers."

**Implications for agent velocity:** Strongest model in the wild — an agent can mechanically determine "which APIs are available here?" from the *folder name alone*. Build-time enforcement means an agent's wrong-layer import fails at typecheck, not at runtime in production. Cost: high ceremony, six layers may overshoot a small app.

### Finding 1.4: GitHub Desktop uses `app/src/{main-process,ui,lib,models,...}` (folder-as-boundary)
**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/desktop/app/src/`:
```
main-process/  — main.ts, app-window.ts, ipc-main.ts, ipc-webcontents.ts,
                 menu/, notifications.ts, squirrel-updater.ts, ...
ui/            — React components (renderer)
lib/           — shared (api.ts, app-state.ts, databases/, ci-checks/, ...)
models/        — domain types
crash/         — crash reporter renderer
highlighter/   — syntax-highlight worker
cli/           — CLI entry
```
`app/package.json:7` declares `"main": "./main.js"` — built from `main-process/main.ts`.

**Implications for agent velocity:** No `src/preload/` — Desktop predates context-isolation defaults. An agent should not assume the triad universally. Verifying convention requires reading `package.json#main` + the build config; the `main-process/` folder name is the tell.

### Finding 1.5: tsconfig project references are NOT a settled convention
**Confidence:** UNCERTAIN
**Evidence:** electron-vite-boilerplate ships "only a single `tsconfig.json` file at the root level." Electron-vite docs describe per-process `tsconfig.node.json` / `tsconfig.web.json` patterns in the wild but do not require them. VS Code uses a custom layer-checker, not tsconfig project references. NOT FOUND: a canonical reference Electron template using `tsc --build` with project references.

**Implications for agent velocity:** Module-boundary enforcement is mostly a *folder-name* convention, not a typecheck-level invariant. An agent editing renderer code can still accidentally `import 'fs'` and only discover the failure at bundle/runtime. Repos that *do* enforce via tsconfig (or an ESLint rule like `no-restricted-imports`) get cheaper agent error feedback.

---

## D2 — Cross-platform CI/CD + packaged build matrix

### Finding 2.1: 4-cell matrix is industry baseline (mac arm64, mac x64, win x64, win arm64; sometimes linux)
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop `~/.claude/oss-repos/desktop/.github/workflows/ci.yml:74-81`:
```yaml
strategy:
  fail-fast: false
  matrix:
    os: [macos-14-xlarge, windows-2022]
    arch: [x64, arm64]
    include:
      - os: macos-14-xlarge
        friendlyName: macOS
      - os: windows-2022
        friendlyName: Windows
```
GitHub Desktop builds 4 cells (no Linux); `macos-14-xlarge` is the M1 runner. Logseq's `build-desktop-release.yml` fans out to 6 explicit jobs. Both pin OS image versions, not `latest`.

**Implications for agent velocity:** An agent adding a feature that only works on macOS sees the win/linux cell go red within minutes of push. Cost: ~4× CI minutes per push.

### Finding 2.2: Build-then-package-then-install-then-smoke-test is the gating pattern
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop `ci.yml` has three jobs in order: `lint` → `build` (per-cell, runs `yarn build:prod` + `yarn package` + `yarn test:unit`) → `e2e-smoke` (per-cell, builds again, packages again, then *installs* the produced installer:

`ci.yml:213-217` (macOS install of packaged app):
```bash
rm -rf "/Applications/GitHub Desktop.app"
ditto "dist/GitHub Desktop-darwin-arm64/GitHub Desktop.app" "/Applications/GitHub Desktop.app"
echo "DESKTOP_E2E_APP_PATH=/Applications/GitHub Desktop.app/Contents/MacOS/GitHub Desktop" >> "$GITHUB_ENV"
```
Then `yarn test:e2e:run:packaged` runs Playwright against the *installed* binary (`ci.yml:266`).

**Implications for agent velocity:** This catches the "ships fine in dev, broken in packaged build" class of regression — asar pathing, missing `extraResources`, native-module rebuild misses, code-signing-broken IPC. An agent's PR that breaks packaged-only behavior surfaces in CI, not in the next release post-mortem.

### Finding 2.3: Caching strategy — yarn cache + Electron binary cache
**Confidence:** CONFIRMED
**Evidence:** Logseq `~/.claude/oss-repos/logseq/.github/workflows/build-desktop-release.yml:75-85`:
```yaml
- name: Cache yarn cache directory
  uses: actions/cache@v4
  with:
    path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
    key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
```
electron-builder docs recommend additionally caching `$HOME/.cache/electron` and `$HOME/.cache/electron-builder`.

**Implications for agent velocity:** Without the Electron binary cache, every CI run re-downloads ~150 MB of Electron headers + binaries per cell.

### Finding 2.4: Native modules require per-platform rebuild — `@electron/rebuild` or `install-app-deps`
**Confidence:** CONFIRMED
**Evidence:** Logseq `resources/package.json:18-19`:
```json
"rebuild:all": "electron-rebuild -v 38.4.0 -f",
"postinstall": "install-app-deps"
```
electron-builder docs: `npmRebuild: true` (default). `@parcel/watcher` known-painful — oven-sh/bun#19282, parcel-bundler/watcher#152 document `"No prebuild or local build of @parcel/watcher found"` errors. Cross-arch CI requires `--target_arch=arm64 --target_platform=linux` flags (Logseq `build-desktop-release.yml:243-245`).

**Implications for agent velocity:** An agent that adds a native dependency (or bumps Electron's version) MUST run rebuild or every renderer that loads the native binding crashes. Logseq's macOS arm64 cell uses `yarn install --ignore-platform && yarn rebuild:all` (line 527) precisely because cross-platform installs land wrong prebuilds.

### Finding 2.5: `--dir` is the fast-iteration build target; full makers are release-only
**Confidence:** CONFIRMED
**Evidence:** electron-builder CLI docs:
> `--dir`: "Build unpacked dir. Useful to test."
> `--publish never|onTag|onTagOrDraft|always`

GitHub Desktop's `package.json:17-23` has `test:e2e:build:packaged` (full `yarn package`) and `test:e2e:build:unpackaged` (`DESKTOP_SKIP_PACKAGE=1 yarn build:prod`) — the unpackaged variant skips signing and asar.

**Implications for agent velocity:** An agent debugging a packaged-only bug can use `--dir` to get a 1-2 min iteration loop instead of 8-15 min for a full DMG.

---

## D6 — Distribution + debug build parity

### Finding 6.1: Two-tier build: unsigned `--dir` for dev, full DMG/NSIS/AppImage for release
**Confidence:** CONFIRMED
**Evidence:** electron-builder docs (`--publish never` flag for non-publishing local builds). Convention across electron-vite-react template, electron-forge templates, and observed in GitHub Desktop's `DESKTOP_SKIP_PACKAGE=1` env-flag pattern. Logseq's `electron:dev` (`electron-forge start`) for inner loop, `electron:make` for distributables.

**Implications for agent velocity:** Three loops, fastest-first: (1) `electron-vite dev --watch` (HMR/restart, sub-second), (2) `electron-builder --dir` (~1-2 min, unsigned packaged), (3) full make (~5-15 min, signed installable).

### Finding 6.2: Sourcemaps shipped to production + uploaded to error reporter
**Confidence:** CONFIRMED
**Evidence:** Logseq `build-desktop-release.yml:155-166`:
```yaml
- name: Upload Sentry Sourcemaps (beta only)
  run: |
    curl -sL https://sentry.io/get-cli/ | SENTRY_CLI_VERSION=2.58.4 bash
    release_name="logseq@${{ steps.ref.outputs.version }}"
    sentry-cli releases new "${release_name}"
    sentry-cli releases files "${release_name}" upload-sourcemaps --ext map --ext js ./static/js --url-prefix '~/static/js'
    sentry-cli releases finalize "${release_name}"
```

**Implications for agent velocity:** Without sourcemap upload, a stack trace from a user's installed app shows `app:///app/dist/background.min.js:1:48291` — meaningless. An agent debugging from a Sentry issue gets file:line back into the original TS source.

### Finding 6.3: Sentry's three-module split mirrors the process model
**Confidence:** CONFIRMED
**Evidence:** Sentry Electron docs (https://docs.sentry.io/platforms/javascript/guides/electron/):
```javascript
import * as Sentry from "@sentry/electron/main";      // main.ts
import * as Sentry from "@sentry/electron/renderer";  // renderer.tsx
import * as Sentry from "@sentry/electron/utility";   // utility-process.ts
```
> "All renderer events are sent through the main process so passing `dsn`, `release` or `environment` to renderer `init` will have no effect."

**Implications for agent velocity:** An agent debugging from telemetry sees a single ordered event log per user session, not three disjoint streams.

### Finding 6.4: `--watch` for main/preload restart, native HMR for renderer
**Confidence:** CONFIRMED
**Evidence:** electron-vite HMR docs (https://electron-vite.org/guide/hmr-and-hot-reloading):
- Main process: `electron-vite dev --watch` — auto-rebuilds + restarts Electron when main or preload files change.
- Renderer: native Vite HMR via `ELECTRON_RENDERER_URL` env var.
- Preload: rebuilds + reloads renderer windows without restarting the whole app. Since v0.29.0 emits `electron-vite&type=hot-reload` event.

**Implications for agent velocity:** An agent iterating on main-process IPC code gets restart-on-save (~1-2 sec); on renderer UI gets sub-second HMR.

---

## Cross-dimension patterns

1. **Process boundary = folder boundary = build-target boundary = sourcemap boundary = HMR boundary.** All five conventions stack on the same divide. An agent that reasons about `src/main` vs `src/renderer` correctly is automatically reasoning about which Vite config rebuilds, which Sentry module to import, what HMR behavior to expect, and what tsconfig to lint with.

2. **The "packaged build is a different beast" tax is paid once in CI, or repeatedly post-release.** Without packaged-build smoke tests, asar pathing, code-sign-broken IPC, native-module-rebuild misses, and missing `extraResources` ship to users.

3. **electron-vite vs electron-forge+Vite is a real fork.** Same Vite underneath, different convention surface. electron-vite uses folder structure; electron-forge uses `forge.config.js` `build: [...]` arrays.

4. **Caching doesn't fully solve native modules.** `actions/cache` keyed on `yarn.lock` caches the npm install but not the prebuild-vs-rebuild decision per architecture.

---

## UNRESOLVED / NOT FOUND

- **Utility process hot-reload in electron-vite** — searched electron-vite docs/HMR docs → not addressed. Likely needs full restart.
- **electron-react-boilerplate's exact `src/` layout** — WebFetch returned only top-level folders; subtree not fully rendered.
- **GitHub Desktop's `main-process/` build-time enforcement** — folder exists, no evidence of import blocks at build time. Likely convention-only.
- **A canonical TS project-references template for Electron** — no widely-adopted template found. Boundary enforcement remains folder convention + ESLint rules.
- **`buildDependenciesFromSource` adoption rates** — flag exists in electron-builder docs, no observed adoption in Desktop or Logseq.

---

## References

### Primary sources (URLs)
- electron-vite dev guide: https://electron-vite.org/guide/dev
- electron-vite HMR: https://electron-vite.org/guide/hmr-and-hot-reloading
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron application distribution: https://www.electronjs.org/docs/latest/tutorial/application-distribution
- electron-forge Vite plugin: https://www.electronforge.io/config/plugins/vite
- electron-builder multi-platform: https://www.electron.build/multi-platform-build
- electron-builder CLI: https://www.electron.build/cli
- electron-builder configuration: https://www.electron.build/configuration
- VS Code source organization wiki: https://github.com/microsoft/vscode/wiki/source-code-organization
- electron-vite-react template: https://github.com/electron-vite/electron-vite-react
- electron-vite-boilerplate template: https://github.com/electron-vite/electron-vite-boilerplate
- Sentry Electron SDK: https://docs.sentry.io/platforms/javascript/guides/electron/
- Sentry Electron sourcemap upload (CLI): https://docs.sentry.io/platforms/javascript/guides/electron/sourcemaps/uploading/cli/

### Primary sources (file paths on disk)
- `~/.claude/oss-repos/desktop/.github/workflows/ci.yml` (lines 1-274)
- `~/.claude/oss-repos/desktop/package.json` (lines 7-50)
- `~/.claude/oss-repos/desktop/app/package.json` (lines 6-7)
- `~/.claude/oss-repos/desktop/app/src/main-process/` (folder listing)
- `~/.claude/oss-repos/logseq/resources/forge.config.js` (lines 1-108)
- `~/.claude/oss-repos/logseq/resources/package.json` (lines 11-19)
- `~/.claude/oss-repos/logseq/.github/workflows/build-desktop-release.yml` (lines 1-734, Sentry upload at 155-166)
