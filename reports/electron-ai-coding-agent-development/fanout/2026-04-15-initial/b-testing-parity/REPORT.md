# Cluster B: Multi-process testing, dev↔packaged parity, integration depth

**Dimensions:** D3, D4, E3
**Date:** 2026-04-15
**Worker:** b-testing-parity

## Summary

Electron testing in 2026 has consolidated around two frameworks: **Playwright for Electron** (`_electron.launch()`, experimental-but-widely-used) and **WebdriverIO + `@wdio/electron-service`** (self-styled "spiritual successor to Spectron"). Spectron itself was formally deprecated **2022-02-01** and removed from Electron's official recommendations. Both successors drive a real Electron binary over CDP; neither is a pure-Node mock. The canonical unit-test strategy for main-process code is therefore **dependency injection + Node/Bun test runners**, not an in-process Electron mock — `vi.mock('electron')` is documented as fragile (vitest issues #4166, #425). Teams that need main-process coverage either DI the Electron surface or push it to an E2E harness.

The **canonical Playwright+Electron pattern** (reaffirmed by GitHub Desktop's e2e fixtures, `spaceagetv/electron-playwright-example`, and `electron-playwright-helpers`): package the app with `electron-builder --dir` or `electron-forge package` (skipping sign + notarize), locate the build artifact via `findLatestBuild()` + `parseElectronApp()`, launch with `{ executablePath, args: [appInfo.main] }`, interact through `firstWindow()`. Tests run **serially per worker** (GitHub Desktop: `workers: 1`, worker-scoped fixtures, `test.describe.configure({ mode: 'serial' })`) with `userData` isolated via a per-test `--user-data-dir=<tmp>` CLI flag Chromium honours. Parallelism requires per-worker tempdirs + `app.requestSingleInstanceLock()` name-space care (electron issues #35680, #30219 confirm lock collisions bite side-by-side runs).

The **dev↔packaged gap** is the dominant Electron-specific failure mode. `app.isPackaged` diverges behaviour; `asarUnpack` rules change path resolution for native modules, workers, and fonts; `@electron/fuses` can disable `RunAsNode` / `EnableNodeCliInspectArguments` / `EnableNodeOptionsEnvironmentVariable` in prod but not dev. Mitigation: a **packaged-build smoke test gate** using `electron-builder --dir` (no sign/notarize, seconds on CI) that launches the unsigned `.app`/`.exe` under Playwright and asserts `firstWindow()` renders. GitHub Desktop's `test:e2e:run:packaged` job is the reference.

**For AI coding agents**, the high-leverage investments are: (1) a machine-parseable failure format (Playwright `--reporter=json` + JUnit), (2) a unit-test seam for utility-process code so agents iterate without launching Electron, (3) a `--dir` packaged smoke gate that catches the ~80% of dev-green/prod-red bugs (missing asarUnpack, wrong path, native-module ABI mismatch) within one CI minute.

## D3 — Multi-process testing harness primitives

### Finding: Playwright's Electron API is experimental but production-used; minimum Electron v12.2.0+
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-electron
```js
const { _electron: electron } = require('playwright');
const app = await electron.launch({ args: ['main.js'] });
const window = await app.firstWindow();
const appPath = await app.evaluate(async ({ app }) => app.getAppPath());
```
Docs warn: if `launch` times out, the `nodeCliInspect` fuse must NOT be disabled — **direct dev↔packaged parity trap: flipping that fuse in prod silently breaks all Playwright tests**.

**Agent-velocity:** works but labeled experimental — pin Playwright version; the fuse-timeout gotcha needs a comment so a future agent understands why the fuse stays on.

### Finding: WebdriverIO `@wdio/electron-service` is the Spectron successor with first-class API mocking
**Confidence:** CONFIRMED
**Evidence:** https://webdriver.io/docs/wdio-electron-service/
```ts
capabilities: [{
  browserName: "electron",
  "wdio:electronServiceOptions": {
    appBinaryPath: "./path/to/built/app.exe",
    appArgs: ["foo", "bar=baz"],
  },
}]
```
Auto-detects Electron Forge, electron-builder, unpackaged. Provides "Mocking of Electron APIs via a Vitest-like API" — unique among Electron testing tools. Headless (Xvfb) from WebdriverIO 9.19.1+.

**Agent-velocity:** built-in Electron-API mocking is the one capability Playwright lacks — agents stubbing `dialog.showSaveDialog` or `autoUpdater` without hand-rolling IPC get it free with WDIO.

### Finding: Spectron formally deprecated 2022-02-01, no migration tool
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron-userland/spectron — "Spectron is officially deprecated as of February 1, 2022."

**Agent-velocity:** agents copying 2019–2021 tutorials still find Spectron — any codebase with Spectron is a migration hazard, not a reference.

### Finding: Utility-process code should be unit-tested via DI, not Electron-API mocks
**Confidence:** CONFIRMED
**Evidence:** https://github.com/vitest-dev/vitest/issues/4166 (`vi.doMock('electron')` fails, exports undefined), https://github.com/vitest-dev/vitest/issues/425 ("Can't mock `electron` api"). Working pattern: factor utility-process code as a pure Node/Bun module (server factory, file-watcher wrapper, IPC adapter) with `electron` dependencies injected at the boundary.

**Agent-velocity:** structural constraint from day 1 — once `import { app } from 'electron'` leaks into business logic, unit testing that file requires Electron or brittle mocks. Factor early, or every change requires a full E2E round-trip.

### Finding: `userData` isolation via `--user-data-dir` is the consensus pattern for parallel tests
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop `~/.claude/oss-repos/desktop/app/test/e2e/e2e-fixtures.ts:38,76`:
```ts
const userDataDir = path.join(os.tmpdir(), 'github-desktop-pw-e2e')
args: [`--user-data-dir=${userDataDir}`, `--cli-open=${smokeRepoPath}`]
fs.rmSync(userDataDir, { recursive: true, force: true })
fs.mkdirSync(userDataDir, { recursive: true })
```
Chromium honours `--user-data-dir` at process level.

**Agent-velocity:** the one-liner that unblocks concurrent runs in a worktree-orchestration setup.

### Finding: `app.requestSingleInstanceLock()` collides on "same package.json name" across versions
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/issues/35680, https://github.com/electron/electron/issues/30219 — lock is keyed on product name, not install path. Parallel test runs of the same app in different worktrees fight for one lock.

**Agent-velocity:** agents running parallel worktrees must (a) override product name in test builds, (b) skip `requestSingleInstanceLock()` when `NODE_ENV === 'test'`, or (c) serialise E2E runs per machine.

### Finding: Agent-parseable output — Playwright `--reporter=json,junit` is canonical
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/test-reporters — JSON, JUnit XML, HTML ship out of the box; multiple reporters concurrently. `testInfo.workerIndex` / `TEST_WORKER_INDEX` surface per-worker identity.

**Agent-velocity:** `playwright test --reporter=json > result.json` turns a flaky E2E suite into a structured failure doc an agent triages without parsing ANSI.

## D4 — Dev ↔ packaged parity gates

### Finding: `app.isPackaged` is the single canonical branch point — audit it
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app — "returns `true` if the app is packaged, `false` otherwise."

**Agent-velocity:** every `if (app.isPackaged)` branch is a known parity-divergence surface. A lint rule ("flag every `isPackaged` usage") plus the packaged smoke test is the minimum hedge.

### Finding: `electron-builder --dir` skips sign+notarize; seconds vs minutes; the right CI parity gate
**Confidence:** CONFIRMED
**Evidence:** https://www.electron.build/configuration — "dir target … generates the package directory without really packaging it." GitHub Desktop CI has an `e2e-smoke` job running `yarn test:e2e:run:packaged` against packaged-but-unsigned artifacts. The `DESKTOP_E2E_APP_MODE` env var in `e2e-fixtures.ts:45` switches between `packaged` (default, CI) and `unpackaged` (local, `out/main.js`, no packaging required).

**Agent-velocity:** the biggest dev↔packaged win. Agents get dev-loop speed (`unpackaged` mode) and CI gets packaged-fidelity verification from the same test file. The `DESKTOP_E2E_APP_MODE` pattern is copy-worthy.

### Finding: `asarUnpack` is auto-detected for native modules but fails silently on fonts, workers, binaries
**Confidence:** CONFIRMED
**Evidence:** https://www.electron.build/configuration — "Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set asarUnpack - please file an issue if this doesn't work." https://github.com/electron-userland/electron-builder/issues/1285 (native module not unpacked, crash on start), #7264, https://www.electronforge.io/config/plugins/auto-unpack-natives. Failure mode: packaged app throws `Cannot find module` or `dlopen` fails only in the signed DMG; dev mode never exercises the asar-read path.

**Agent-velocity:** packaged smoke test is the only reliable catch — agents modifying native deps, worker bundles, or fonts should expect at least one round-trip through packaged-smoke before merge.

### Finding: `@electron/fuses` flags that most commonly break test/debug in packaged mode
**Confidence:** CONFIRMED (partial)
**Evidence:** https://github.com/electron/fuses — `RunAsNode`, `EnableCookieEncryption`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`, `LoadBrowserProcessSpecificV8Snapshot`, `GrantFileProtocolExtraPrivileges`, `WasmTrapHandlers`. Playwright docs: "if launch times out, ensure the `nodeCliInspect` fuse is NOT disabled."

**Agent-velocity:** an agent flipping security fuses for a signed release can silently break the E2E suite. Treat fuses config as parity-critical requiring a paired test run.

### Finding: Native-module ABI rebuild failures are silent in dev, loud in packaged
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron-packager/issues/844 — packaged apps crashing because `@electron/rebuild` / `electron-builder install-app-deps` didn't re-run after an Electron version bump. Dev mode uses system Node ABI; packaged uses Electron ABI.

**Agent-velocity:** after every `electron` version bump, run `electron-builder install-app-deps` and exercise the packaged smoke test. Skip either and the next CI run fails mysteriously.

### Finding: Sourcemaps in packaged builds work but require explicit config
**Confidence:** CONFIRMED
**Evidence:** https://electron-vite.org/guide/debugging (`electron-vite --inspect --sourcemap` produces external maps), https://github.com/electron/forge/issues/3483 (sourcemaps not loading during main-process debug — known Forge+Webpack gotcha).

**Agent-velocity:** agents debugging a prod-only crash should assume sourcemaps are opt-in. Bundler config needs explicit `sourcemap: true` for main/preload.

## E3 — Integration test depth

### Finding: Canonical packaged-app launch — `findLatestBuild` + `parseElectronApp` + `executablePath`
**Confidence:** CONFIRMED
**Evidence:** `spaceagetv/electron-playwright-example/e2e-tests/main.spec.ts`:
```ts
import {
  clickMenuItemById, findLatestBuild, ipcMainCallFirstListener,
  parseElectronApp, ipcMainInvokeHandler, ipcRendererInvoke
} from 'electron-playwright-helpers'

const latestBuild = findLatestBuild()
const appInfo = parseElectronApp(latestBuild)
process.env.CI = 'e2e'
electronApp = await electron.launch({
  args: [appInfo.main],
  executablePath: appInfo.executable
})
```

**Agent-velocity:** copy-paste-ready boilerplate — an agent scaffolding an Electron project lands a working E2E test in <20 LOC via `electron-playwright-helpers`.

### Finding: Worker-scoped fixtures with `serial` mode are the default
**Confidence:** CONFIRMED
**Evidence:** GitHub Desktop `e2e-fixtures.ts:205` uses `{ scope: 'worker' }` on the `app` fixture; `app-launch.e2e.ts:30`: `test.describe.configure({ mode: 'serial' })`; `playwright.config.ts:14`: `workers: 1`. Videos + traces attached per-worker because `@playwright/test use.video` only works on BrowserContexts, not ElectronApplications — a Playwright limitation called out verbatim in a code comment.

**Agent-velocity:** don't assume `test.concurrent()` works. One Electron session per file is safe; parallel-across-files requires per-worker userData tempdirs.

### Finding: Real-IPC + main-process evaluation + renderer assertions in one test is the norm
**Confidence:** CONFIRMED
**Evidence:** `electron-playwright-example/e2e-tests/main.spec.ts`:
```ts
electronApp.evaluate(({ ipcMain }) => { ipcMain.emit('new-window') })
const r1 = await ipcRendererInvoke(page, 'how-many-windows')
const r2 = await ipcMainInvokeHandler(electronApp, 'how-many-windows')
expect(r1).toBe(r2)
```

**Agent-velocity:** the format agents should favour because it catches the most failure modes per LOC.

### Finding: GitHub Desktop's mock-update-server pattern — one real in-process HTTP server per worker — for deterministic network
**Confidence:** CONFIRMED
**Evidence:** `desktop/app/test/e2e/e2e-fixtures.ts:246-253` — worker-scoped `mockServer` fixture spins up in-process HTTP; app fixture depends on it (mock ready before app launches); tests drive via `controlMockServer('set-behavior/update-available')`. Tracing + video artifacts upload per worker.

**Agent-velocity:** hybrid — real Electron, IPC, filesystem, HTTP — but the HTTP endpoint is a local mock controllable from the test.

### Finding: Known-fragile pattern — main/renderer readiness race
**Confidence:** CONFIRMED
**Evidence:** `electron-playwright-helpers` v2.0 added automatic retry to all IPC helpers (Electron 27+ compat) — npm notes "`evaluate()` calls became unreliable". GitHub Desktop wraps `appErrorDialog.isVisible().catch(() => false)` (`app-launch.e2e.ts:34`) because the dialog may or may not exist.

**Agent-velocity:** explicit waits on DOM selectors (not fixed timeouts) are mandatory. `firstWindow()` resolves when the first BrowserWindow exists, not when it has finished loading. Wire a ready-signal over IPC rather than selector polling alone.

### Finding: Playwright's own tests separate `electron-app`, `electron-window`, `electron-tracing`, `electron-webcontentsview`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/microsoft/playwright/tree/main/tests/electron — separate specs per Electron surface, `electronTest.ts` custom harness, dedicated `electron-*.js` fixtures per scenario.

**Agent-velocity:** one "does the app boot" smoke, one per major window type / IPC channel, one for tracing+auto-update — not a mega-spec.

## Cross-dimension patterns

1. **Three-tier pyramid.** Unit (pure Node/Bun, DI'd Electron) → Integration-on-unpackaged (`out/main.js` + Playwright, ~5 s boot) → Smoke-on-packaged (`electron-builder --dir` + Playwright, ~30 s). Each tier catches a failure class the others miss. `DESKTOP_E2E_APP_MODE` is a clean knob for tier switching from one test file.
2. **Tempdirs + `--user-data-dir` is the universal isolation primitive.** D3 (parallel workers) and E3 (fixture seeding) converge on it; D4 benefits because packaged apps honour it as readily as dev.
3. **Sign+notarize is NOT in the test path.** Every reference repo (GitHub Desktop, spaceagetv, Logseq) runs E2E on unsigned output. Signing is a distribution concern validated by a separate platform matrix; tests target `--dir`.
4. **Agent-parseable output is free if you pick it up.** JUnit XML + JSON reporter + video + trace — Playwright ships them all.

## UNRESOLVED / NOT FOUND

- **`vitest-electron` as a first-class harness** → searched npm + GitHub; no widely-used package.
- **Sub-process testing for `utilityProcess` specifically** → NOT FOUND as a published pattern.
- **IPC traffic recording/replay libraries** → NOT FOUND. Teams hand-roll with `ipcMain.emit` spies or log-to-file.
- **`app.requestSingleInstanceLock` bypass for test mode** → NO first-party bypass.
- **Spectron migration tooling** → NOT FOUND. Migrations are manual.
- **Headless Electron on Linux CI status 2026** → @wdio/electron-service 9.19.1+ auto-wires Xvfb; Playwright users typically call `xvfb-run` explicitly.

## References

- Electron automated testing: https://www.electronjs.org/docs/latest/tutorial/automated-testing
- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Playwright ElectronApplication: https://playwright.dev/docs/api/class-electronapplication
- Playwright reporters / parallelism: https://playwright.dev/docs/test-reporters, https://playwright.dev/docs/test-parallel
- WebdriverIO Electron Service: https://webdriver.io/docs/wdio-electron-service/
- WebdriverIO Electron mocking: https://webdriver.io/docs/desktop-testing/electron/mocking/
- Spectron deprecation: https://github.com/electron-userland/spectron
- electron-playwright-example: https://github.com/spaceagetv/electron-playwright-example
- electron-playwright-helpers: https://github.com/spaceagetv/electron-playwright-helpers
- electron-builder config: https://www.electron.build/configuration
- ASAR archives: https://www.electronjs.org/docs/latest/tutorial/asar-archives
- @electron/fuses: https://github.com/electron/fuses
- Forge auto-unpack-natives: https://www.electronforge.io/config/plugins/auto-unpack-natives
- electron-vite debugging: https://electron-vite.org/guide/debugging
- Simon Willison TIL — Electron+Playwright+Actions: https://til.simonwillison.net/electron/testing-electron-playwright
- Playwright's own Electron tests: https://github.com/microsoft/playwright/tree/main/tests/electron
- vitest electron mock issues: https://github.com/vitest-dev/vitest/issues/4166, https://github.com/vitest-dev/vitest/issues/425
- requestSingleInstanceLock bugs: https://github.com/electron/electron/issues/35680, https://github.com/electron/electron/issues/30219
- asarUnpack / native-module packaging: https://github.com/electron-userland/electron-builder/issues/1285, #7264, https://github.com/electron/electron-packager/issues/844
- GitHub Desktop e2e reference (local disk): `~/.claude/oss-repos/desktop/app/test/e2e/{playwright.config.ts, e2e-fixtures.ts, app-launch.e2e.ts}`, `~/.claude/oss-repos/desktop/.github/workflows/ci.yml`
