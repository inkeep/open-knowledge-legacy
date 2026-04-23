---
title: "Electron App Development for AI Coding Agents 2026"
description: "How teams structure Electron app repos for AI-coding-agent-first development velocity. 13 dimensions across repo structure, CI/CD, multi-process testing, dev↔packaged parity gates, agent-specific workflow affordances, IPC observability, quality gates, worktree isolation, hot-reload orchestration, headless CI, and toolchain readiness. 5 parallel cluster workers; primary-source evidence from Electron docs, electron-vite, electron-forge, electron-builder, Playwright, Sentry, electron-log, plus GitHub Desktop and Logseq reference repos on disk."
createdAt: 2026-04-15
updatedAt: 2026-04-15
subjects:
  - Electron
  - electron-vite
  - electron-forge
  - electron-builder
  - Playwright
  - WebdriverIO
  - electron-log
  - electron-trpc
  - Sentry
  - Electronegativity
  - pnpm
  - Xvfb
  - Claude Code
  - Codex
topics:
  - Electron repo structure for AI agents
  - multi-process test harness primitives
  - dev-vs-packaged parity gates
  - hot-reload orchestration
  - headless Electron in CI
  - typed IPC observability
  - worktree isolation
  - packaged-build smoke tests
  - AI agent developer velocity
---

# Electron App Development for AI Coding Agents 2026

**Purpose:** Map the 2026-Q2 landscape of Electron repo structure, CI/CD, testing, dev-loop ergonomics, and toolchain readiness with a specific lens: what keeps AI coding agents (Claude Code, Codex, Cursor, Windsurf) fast when the target app is an Electron multi-process application? Reader is the author of the Electron desktop-app implementation phase for Open Knowledge. Findings are 3P/external — downstream readers decide adoption.

---

## Executive Summary

Electron's multi-process architecture (main / renderer / utilityProcess / preload) imposes three structural frictions on AI coding agents that do not exist in pure-Node or pure-web codebases: **(1)** the process boundary is also the observability boundary — a single log pipe does not exist, and main-process state survives renderer reloads; **(2)** dev mode and packaged mode diverge in ways that are invisible until the signed artifact fails (`app.isPackaged` branches, `asarUnpack` misses, native-module ABI mismatches, `@electron/fuses` differences); and **(3)** main-process code cannot be hot-reloaded — every change restarts Electron and wipes renderer state. The 2026 ecosystem has well-developed primitives for each friction but no turnkey agent-first framework; teams compose patterns.

The **canonical agent-friendly shape** is: (a) **directory-as-process-boundary** layout — `src/{main,preload,renderer,utility,shared}/` with electron-vite's convention or VS Code's six-layer extreme when scale demands; (b) **three-tier test pyramid** — unit (DI'd Electron, pure Bun/Node) → integration-on-unpackaged (Playwright-for-Electron against `out/main.js`) → smoke-on-packaged (`electron-builder --dir` + Playwright); (c) **machine-parseable output everywhere** — Playwright `--reporter=json,junit`, ESLint `--format json`, `tsc --pretty false`; (d) **typed IPC channel maps** — GitHub Desktop's `RequestChannels` discriminated-union pattern plus a custom ESLint rule banning loose `webContents.send` closes the type-erosion hole a single custom rule; (e) **userData isolation per test worker** via `--user-data-dir=<tmp>` — the single-sharpest-edged gotcha for parallel Electron E2E under AI agent parallelism.

The **load-bearing 2026 toolchain decision** is the `electron-vite` vs `electron-forge + @electron-forge/plugin-vite` fork. They produce different config shapes, different plugin APIs, different dev-loop characteristics. Agents conflating them generate unusable configs. The 2026 convention is to lock one in a top-level instruction file (e.g., `AGENTS.md` / `CLAUDE.md`) so agents read the choice before generating any config.

The **biggest agent-hostile surprises** are (1) renderer `console.log` does not reach stdout by default; (2) `@electron/rebuild` failures emit unstructured `node-gyp` stderr; (3) `electron-builder` `files:` globs do not traverse symlinks in monorepos — silently shipping incomplete builds; (4) `app.requestSingleInstanceLock()` is keyed per-user, not per-directory, so parallel dev sessions across worktrees fight for the same lock; (5) a packaged-only bug manifests only after the ~5-15 min DMG/NSIS/AppImage build, invisible in the dev loop.

**Key Findings:**

- **Process boundary = folder boundary = build-target boundary = sourcemap boundary = HMR boundary.** Five conventions stack on the same divide. Agents that reason about `src/main` vs `src/renderer` correctly are automatically reasoning about Vite config, Sentry module, HMR behavior, and tsconfig — removing guesswork from every subsequent decision. VS Code's build-time layer-checker is the "agent-friendly extreme" but often overshoots; the electron-vite directory triad is the typical floor.
- **The packaged-build smoke gate is the single highest-leverage CI investment.** GitHub Desktop's `e2e-smoke` job — `electron-builder --dir` + Playwright against the unsigned `.app`/`.exe` — catches an estimated **~65-75% of dev-green/prod-red regressions** across a surveyed 9-class failure taxonomy ([FU-2](fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md)): native-module resolution, packager dep-collection regressions, asarUnpack misses, extraResources misconfig, most path-resolution drift, ESM/CJS boundary failures. A full sign+notarize second gate catches the residual ~25-35% (code-signing failures, fuses-post-sign clobber, auto-update-at-runtime, cross-arch drift).
- **Playwright for Electron + WebdriverIO are the two viable E2E frameworks; Spectron is deprecated.** Playwright's `_electron.launch()` is labeled experimental in upstream docs but has broad production usage (Playwright's own test suite, GitHub Desktop, `spaceagetv/electron-playwright-example`); WebdriverIO's `@wdio/electron-service` is the only option with first-class Electron-API mocking. Canonical Playwright-Electron boilerplate is `findLatestBuild()` + `parseElectronApp()` + `electron.launch({ executablePath, args: [appInfo.main] })`.
- **Main-process code cannot be hot-reloaded.** electron-vite `dev --watch` gives renderer HMR + main/preload rebuild-restart; renderer state is lost on main restart. Agents iterating on Electron should lean on preload/renderer for logic, keep main thin — the CRDT editor case where main restart forces re-sync is a pure-cost architectural tax.
- **No canonical agent-first Electron framework exists in 2026.** Community has shipped primitives (electron-log, Sentry Electron, electron-trpc, `webContents.debugger` CDP attach, `DESKTOP_E2E_APP_MODE` tier-switch pattern) but no integrated "drop in this skeleton and you get agent-velocity for free." Rolling one by composing patterns is the work.
- **Electron 41.2.0 is current stable (GA 2026-04-07, Chromium 146, Node 24.14.0); 3-version support window is 41/40/39.** Safe production target for a 2026-Q2 spec is Electron 40.8.5 (oldest still-supported N-1) or Electron 41.2.0 (current, accepts early-major risk; pin `~41.0.2` minimum per Electron's own blog recommendation).
- **The single-sharpest gotcha for parallel agents: `userData` collisions.** Playwright `electron.launch()` has no `userDataDir` option (feature request #11240 was closed as P3-collecting-feedback; workaround remains canonical). Workaround: `env: { ELECTRON_USER_DATA: tmpdir }` + call `app.setPath('userData', process.env.ELECTRON_USER_DATA)` in main.js before `app.whenReady()`. Without isolation, parallel Playwright-for-Electron tests share `userData`, corrupt IndexedDB, and flake non-deterministically.

---

## Follow-up research (2026-04-15 round 2)

Four parallel follow-ups landed as nested-fanout research instances after the initial pass. Each produces a standalone fanout report + extends the parent here:

- **[FU-1 — Utility-process hot-reload patterns](fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/REPORT.md)** (Moderate) — closes §E1 UNRESOLVED. Confirms no framework ships utility-process-selective reload. Documents the synthesized chokidar + `kill()`+`fork()` supervisor pattern + the escape hatch (`child_process.fork` + `nodemon` in dev only).
- **[FU-2 — Packaged-build regression taxonomy](fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md)** (Moderate) — replaces the "majority" soft claim in §D4 with a 9-class taxonomy from ~65 issues surveyed across electron-builder/forge/electron 2024-04 → 2026-04. Native-module resolution (~25-30%) + packager dep-collection (~15-20%) dominate. Gate-catch rate: ~65-75%.
- **[FU-3 — Typed Electron IPC comparison](fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md)** (Moderate-Deep) — evaluates 7 typed-IPC libraries across 11 axes with reference implementations. Two families: **named-channel** (GitHub Desktop hand-rolled, `@electron-toolkit/typed-ipc`, `@egoist/tipc`, `electron-typescript-ipc`) vs **opaque-envelope** (`electron-trpc`, `trpc-electron`). Scale-based recommendation below.
- **[FU-4 — Agent-first Electron repo skeleton (2026-Q2)](fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md)** (Deep) — synthesis of the above + existing templates (electron-vite-react, electron-vite-boilerplate, electron-forge templates, `@electron-toolkit`) into a greenfield skeleton. Typed by default at every boundary. See §"Agent-first Electron repo skeleton" below.

---

## Follow-up research (2026-04-17 audit follow-ups)

Three additional fanout reports landed as follow-ups to the Electron desktop-app spec audit (spec at `specs/2026-04-11-electron-desktop-app/`). Each closes a specific open risk or sharpens an API-design decision identified by the audit:

- **[T1 — @napi-rs/keyring in utilityProcess + keychain UX](fanout/2026-04-17-audit-followups/t1-keyring-utility-process/REPORT.md)** (Deep) — closes R15 (utility-process compat for `@napi-rs/keyring`) and R16 (keychain UX) open risks. Key findings: (a) `@napi-rs/keyring` viable in Electron `utilityProcess.fork()` on Electron ≥ 34 (PR #46380 fixed asar+utility crash); (b) macOS keychain prompt uses app name from `CFBundleDisplayName`, NOT helper-process name — this corrects earlier audit speculation; (c) bundle ID + Apple Developer Team stable across updates = ACL preserved; (d) delete+recreate anti-pattern destroys ACL on every refresh (use `set_password` upsert); (e) direct-DMG does NOT need `com.apple.security.personal-information.keychain` entitlement; (f) Linux fail-loud (no silent plaintext fallback) is correct for tokens; (g) `safeStorage` is main-only — not a drop-in replacement for utility-process architectures.
- **[T2 — Electron preload bridge patterns: typed config + subscription APIs](fanout/2026-04-17-audit-followups/t2-preload-bridge-patterns/REPORT.md)** (Deep) — locks the `OkDesktopBridge` shape for the Electron spec's D36. Key findings: (a) `contextBridge` wraps callback functions — `ipcRenderer.removeListener(channel, cb)` with renderer's cb reference silently fails ([#33328](https://github.com/electron/electron/issues/33328)); subscription methods MUST close over a preload-side listener wrapper; (b) three production patterns: narrow-channel-namespace (VS Code), method-per-channel (Mattermost, Logseq — idiomatic for small/medium surfaces), no-bridge-at-all (GitHub Desktop — legacy, not recommended); (c) config bootstrap: inject vs fetch — injection viable if values synchronously known at preload-exposure time; (d) `shell.openExternal` under `sandbox: true` MUST be IPC-relay (not direct preload call); (e) `navigator.clipboard.writeText` works from `http://localhost` but not `file://`; (f) getter/setter properties on the bridge fire at exposure time, not at access ([#25516](https://github.com/electron/electron/issues/25516)).
- **[T3 — Multi-window Electron: per-window subprocess lifecycle + crash recovery](fanout/2026-04-17-audit-followups/t3-multi-window-subprocess-lifecycle/REPORT.md)** (Deep) — benchmarks the "one utility per BrowserWindow + file-based lock + runClean + collision-dialog" design against 9 production Electron apps. Key findings: (a) VS Code's `WindowUtilityProcess` with `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` is a 1:1 match for our design — use these Electron API flags directly; (b) post-exit PID-liveness probe (1s `process.kill(pid, 0)` → SIGTERM if alive) is production necessity, not paranoia — `exit` event alone is unreliable ([VS Code Issue #194477](https://github.com/microsoft/vscode/issues/194477)); (c) use `will-quit.preventDefault()` as drain gate, NOT `before-quit` (too early); (d) join pattern for per-window drain coordination — `e.join(id, promise)` + `Promises.settled(joiners)`; (e) budgeted auto-restart (3 crashes / 5 min rolling window) before modal prompt is canonical crash-recovery UX; (f) collision dialog is divergent from industry — ZERO of 9 surveyed apps show a confirmation dialog (all silent focus-existing); (g) file-based lock matches our multi-instance design — VS Code's in-process check works only for single-instance apps; (h) `proper-lockfile` uses `mkdir` not `O_EXCL` (atomic on NFS); mtime heartbeat for runtime staleness detection.

---

## Research Rubric

13 dimensions across 5 clusters. All dimensions are P0 or Deep except D6, D9, D10 (Moderate).

| # | Dimension | Depth | Cluster |
|---|---|---|---|
| D1 | Electron repo structure for agent navigation | P0 | A |
| D2 | Cross-platform CI/CD + packaged build matrix | P0 | A |
| D3 | Multi-process testing harness primitives | P0 | B |
| D4 | Dev build ↔ packaged build parity gates | P0 | B |
| D5 | AI coding agent workflow specifics with Electron | P0 | C |
| D6 | Distribution + debug build parity | Moderate | A |
| D7 | Worktree isolation + parallel runs | P0 | D |
| D8 | Electron toolchain readiness 2026 | Deep | E |
| D9 | IPC observability + typed contextBridge | Moderate | C |
| D10 | Quality gates + machine-parseable output | Moderate | C |
| E1 | Hot-reload across main/renderer/utility | P0 | D |
| E2 | Running Electron headless in CI + scripts | P0 | D |
| E3 | Integration test depth | P0 | B |

**Non-goals** (covered by prior reports, not re-researched here):
- Electron vs Tauri/Wails framework comparison → `reports/web-to-macos-desktop-wrapping-2025/`
- Code signing economics, notarization mechanics → `reports/electron-desktop-app-operations-2025/`
- Generic TypeScript monorepo CI patterns → `reports/ts-monorepo-ci-test-pipeline-patterns/`
- Browser automation for non-Electron web apps → `reports/agent-browser-vs-playwright-crdt-testing/`
- Open Knowledge codebase analysis — research is 3P; downstream spec applies to OK

**Stance:** factual / external. Findings land as "X exists with tradeoff Y"; recommendations in decision-triggers tables, not prose.

---

## Detailed Findings

Evidence links below reference `fanout/2026-04-15-initial/<cluster>/REPORT.md` where each finding has confidence label, primary-source URL or file:line, quoted snippet, and implications. See [`evidence/README.md`](evidence/README.md) for the dimension-to-cluster map.

### D1 — Electron repo structure for agent navigation

**Finding:** Three tiers of repo structure exist in the wild. **Tier 1 (canonical):** `src/{main,preload,renderer}` — electron-vite's auto-detected convention. **Tier 2 (GitHub Desktop variant):** `app/src/{main-process,ui,lib,models,...}` — folder-as-boundary but predates `contextIsolation` defaults (no `preload/`). **Tier 3 (VS Code):** six-layer model (`base`, `platform`, `editor`, `workbench`, `code`, `server`) with per-layer environment subfolders (`common`, `browser`, `node`, `electron-main`, `electron-utility`, `electron-sandbox`) + build-time import-rule checker. Tier 3 is the "agent-friendly extreme" — an agent can mechanically determine "which APIs are available here?" from the folder name alone, and wrong-layer imports fail at typecheck, not runtime. Tier 1 is the sensible default for a new app.

**Evidence:** [fanout/a-structure-ops §D1](fanout/2026-04-15-initial/a-structure-ops/REPORT.md) — electron-vite docs quote "work with **minimal configuration**" given the triad convention; VS Code wiki specifies the build-time layer check.

**Implications for agent velocity:**
- Directory-as-process-boundary removes ~every "which module can I import here?" decision from the agent's reasoning path — it's implied by the folder.
- Build-time enforcement (VS Code style) turns wrong-layer imports from runtime errors into typecheck errors — agents see the feedback 10-100× faster.

**Decision triggers:**
- If the app has >50 source files spanning main/renderer, consider adopting tsconfig project references OR an ESLint `no-restricted-imports` rule to enforce the boundary at lint time. Without enforcement, an agent editing renderer code can `import 'fs'` and only discover the failure at bundle time.
- If the app is small (<50 files), the electron-vite triad convention with no extra enforcement is fine; agent mistakes surface at runtime but the loop is fast enough.

**Remaining uncertainty:** No canonical TypeScript-project-references template for Electron surfaces in research. Teams DIY or skip it. A spec that wants strict boundary enforcement will write its own tsconfig setup.

---

### D2 — Cross-platform CI/CD + packaged build matrix

**Finding:** The industry-baseline CI shape is a **build-then-package-then-install-then-smoke-test** pipeline per platform cell. GitHub Desktop's `.github/workflows/ci.yml` runs `lint → build (yarn build:prod + yarn package + yarn test:unit per cell) → e2e-smoke (installs the produced `.exe`/`.app` and drives it with Playwright)` across a 4-cell matrix (`macos-14-xlarge` × `windows-2022` × `x64`/`arm64`). Logseq extends to 6 cells adding linux-{x64,arm64}. Both cache yarn cache via `actions/cache` keyed on `yarn.lock` + electron-builder recommends additionally caching `$HOME/.cache/electron` and `$HOME/.cache/electron-builder`.

**Evidence:** [fanout/a-structure-ops §D2](fanout/2026-04-15-initial/a-structure-ops/REPORT.md) — GitHub Desktop `ci.yml:213-266`, Logseq `build-desktop-release.yml:75-85,243-245`.

**Implications for agent velocity:**
- Packaged-build smoke test catches "ships fine in dev, broken in packaged build" regressions — asar pathing, missing `extraResources`, native-module rebuild misses, code-sign-broken IPC. Without it, agents ship regressions to release.
- Per-platform native module rebuilds (`electron-builder install-app-deps`, `@electron/rebuild`) require explicit `--target_arch` flags for cross-arch CI; silent wrong-prebuild-loaded failures are common.

**Decision triggers:**
- If the app ships to Linux: add `ubuntu-22.04` or `ubuntu-latest` cells with `npx playwright install --with-deps` (GitHub Actions Ubuntu 24.04 rollover broke plain `_electron.launch()` in early 2026).
- If the agent loop is multi-platform: the 4-cell matrix is the floor. Without it, a macOS-only change silently breaks Windows after a merge.
- If CI budget is tight: `electron-builder --dir` (unsigned unpacked dir) is ~1-2 min per cell vs ~5-15 min for a full signed installer; acceptable for every-PR gating while full signed builds run on tagged releases only.

**Remaining uncertainty:** No consensus on `buildDependenciesFromSource` adoption — the flag exists in electron-builder but neither Desktop nor Logseq uses it.

---

### D3 — Multi-process testing harness primitives

**Finding:** Two viable frameworks dominate: **Playwright for Electron** (`_electron.launch()`, experimental label, minimum Electron v12.2.0+) and **WebdriverIO + `@wdio/electron-service`** (self-described Spectron successor; first-class Electron-API mocking; auto-detects Forge/electron-builder/unpackaged). Spectron was formally deprecated **2022-02-01**. The canonical unit-test strategy for main-process code is **dependency injection + pure-Bun/Node test runners**, not an in-process Electron mock — `vi.mock('electron')` is documented as fragile (vitest #4166, #425).

**Evidence:** [fanout/b-testing-parity §D3](fanout/2026-04-15-initial/b-testing-parity/REPORT.md) — Playwright docs, WebdriverIO service docs, Spectron deprecation notice.

**Implications for agent velocity:**
- Playwright's broader community footprint = better agent training data for test generation. WebdriverIO's Electron-API mocking solves `dialog.showSaveDialog` / `autoUpdater` stubbing that Playwright lacks.
- Main-process code structured for DI (factor `electron` imports to the edge, inject from boundary) is testable without Electron — unit loop stays <1s, not 30-120s.

**Decision triggers:**
- Choose Playwright if: agent generates most tests (Playwright test fixtures are well-represented in training data), tests primarily drive the UI through renderer, mocking Electron APIs is not critical.
- Choose WebdriverIO if: tests need to stub `dialog.*` / `autoUpdater` / `shell.openExternal` without hand-rolling IPC, team has existing WDIO ecosystem investment.
- Never: start a new project with Spectron.

**Remaining uncertainty:** No widely-adopted `vitest-electron` or similar first-class harness for testing main-process code with a real `electron` module imported. The DI-only pattern is the consensus.

---

### D4 — Dev build ↔ packaged build parity gates

**Finding:** The `app.isPackaged` branch is the canonical divergence point. `asarUnpack` auto-detects native modules but silently drops fonts, workers, and binary assets. `@electron/fuses` can disable `RunAsNode` / `EnableNodeCliInspectArguments` / `EnableNodeOptionsEnvironmentVariable` in prod but not dev — Playwright docs explicitly warn: "if launch times out, ensure the `nodeCliInspect` fuse is NOT disabled." Native-module ABI rebuild failures silently skip in dev and explode in packaged mode.

**Evidence:** [fanout/b-testing-parity §D4](fanout/2026-04-15-initial/b-testing-parity/REPORT.md) — `@electron/fuses` GitHub, electron-builder config docs, electron-builder issues #1285 / #7264, electron-packager #844, Playwright `_electron.launch` docs.

**Implications for agent velocity:**
- GitHub Desktop's `DESKTOP_E2E_APP_MODE=packaged|unpackaged` env-var pattern lets the same test file switch tiers: agents get dev-loop speed locally (`unpackaged` mode, ~5s boot) and CI gets packaged fidelity (`packaged` mode, ~30s).
- `electron-builder --dir` (unsigned unpacked dir) is seconds to build vs minutes for a full DMG — the right CI-gate artifact.
- An ESLint rule flagging every `app.isPackaged` callsite surfaces the divergence surface for code review.

**Decision triggers:**
- Add a packaged-smoke CI job (seconds, unsigned `--dir` + Playwright smoke) to every-PR pipeline. This single gate catches ~65-75% of dev-green/prod-red regressions across the 9-class taxonomy ([FU-2](fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md)).
- Smoke scenarios MUST exercise: (a) a code path that `require`s one of the app's native modules, (b) a code path that loads a non-trivial `extraResources` asset, (c) a code path that reads `app.getPath('userData')`. "Window opens" alone misses Classes 1, 4, 5, 6.
- Add a second, slower gate (nightly or pre-release): full sign+notarize + `@electron/fuses read` post-sign verification. Catches the residual ~25-35%: code-signing failures (Class 3), fuses-post-sign clobber (Class 8 — verified security regression in electron-builder #9428), auto-update-at-runtime, cross-arch drift.
- After any `electron` version bump: require `electron-builder install-app-deps` + packaged smoke before merge. Skip either and the next CI run fails mysteriously.
- If shipping with `@electron/fuses`: enable `EnableNodeCliInspectArguments` (required for Playwright `_electron.launch`) or accept that E2E tests can't run against the final fuses config.
- **Typed-approach mitigations** (per FU-2): typed resource manifest catches Class 5 (`extraResources`) at compile time; typed `Paths` module + banned raw `__dirname` / `process.env.FOO` catches Class 6 (path/isPackaged drift); `verbatimModuleSyntax: true` + strict `exports`/`imports` catches most of Class 7 (ESM/CJS). Combined, typed approaches structurally prevent ~25-30% of surveyed regressions before they reach the smoke gate.

**Remaining uncertainty:** FU-2's ~65 issue sample is directional not statistical; the ranking is robust, absolute shares are not. VS Code / Logseq / GitHub Desktop internal labels weren't reachable via `gh search` string filters.

---

### D5 — AI coding agent workflow specifics with Electron

**Finding:** Three agent-hostile Electron realities: **(1)** renderer `console.*` does not reach stdout the terminal agent is watching unless launched with `--enable-logging` or `ELECTRON_ENABLE_LOGGING=1`; **(2)** `@electron/rebuild` failures emit unstructured `node-gyp` stderr with no JSON mode; **(3)** renderer reload (`Cmd+R` / `webContents.reload()`) leaves main-process state fully intact, so main-process code iteration requires full app restart. The **in-process CDP attach via `webContents.debugger`** (docs: `debugger.attach('1.3')` + `Runtime.enable` + `Runtime.consoleAPICalled`) solves renderer log capture without external ports — under-used in tutorials but canonical.

**Evidence:** [fanout/c-agent-workflow §D5](fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) — Electron docs, electron/electron#48395, electron-log, Sentry Electron SDK v7.11.0.

**Implications for agent velocity:**
- A dev-loop harness that doesn't wire renderer logs to the terminal blinds the agent to renderer-side failures entirely. The `webContents.debugger` in-process attach pattern is the cleanest fix (no port, no `chrome-remote-interface` dep).
- Main-process code restart losing renderer state is pure dev-loop cost. CRDT editors where the renderer holds live WebSocket state pay this every main-process edit — architectural pressure to keep main thin.
- Sentry Electron's 3-module split (main/renderer/utility) is the only turnkey path that captures native crashes (Chromium minidumps) — JS-level `process.on('uncaughtException')` alone misses segfaults and native-module crashes.

**Decision triggers:**
- Wire `webContents.on('console-message', ...)` to main-process stdout for all dev/test builds. Free; fixes half the renderer-blindness problem.
- Structured logs (JSON lines) to a tailable file is the minimum for multi-process log aggregation agents can grep. `electron-log` with a custom JSON formatter is the baseline.
- Wrap `@electron/rebuild` invocations in a try/catch that stringifies to a structured log file — don't rely on `node-gyp` stderr.

**Remaining uncertainty:** No structured error format exists for `@electron/rebuild`. No "machine-applicable suggestions" equivalent (rustc-style) for multi-process TypeScript Electron.

---

### D6 — Distribution + debug build parity

**Finding:** Three loops coexist in agent-friendly Electron repos, ordered fastest to slowest: (1) `electron-vite dev --watch` — HMR/restart, sub-second for renderer; (2) `electron-builder --dir` — unsigned unpacked dir, ~1-2 min; (3) full make (DMG/NSIS/AppImage, signed, notarized) — ~5-15 min. Sourcemaps are shipped to production + uploaded to Sentry via `sentry-cli releases upload-sourcemaps`. Sentry's three-module split (`@sentry/electron/{main,renderer,utility}`) mirrors the process-model split — all renderer events are forwarded through main to produce a single ordered event log per user session.

**Evidence:** [fanout/a-structure-ops §D6](fanout/2026-04-15-initial/a-structure-ops/REPORT.md) — Sentry docs, Logseq `build-desktop-release.yml:155-166`.

**Implications for agent velocity:**
- Agent debugging a production-only crash gets TS source file:line back (via sourcemaps) instead of `app:///app/dist/background.min.js:1:48291`.
- Three-tier loop means agents pick the right tool for the problem: UI tweak → tier 1 (HMR); packaged-path bug → tier 2 (`--dir`); signing/notarization issue → tier 3 (full make).

**Decision triggers:**
- CI uploads sourcemaps on every release build; agents use Sentry issue URLs as the entry point into debugging prod crashes.
- Bundler config (electron-vite, Forge Webpack, tsdown) must explicitly set `sourcemap: true` for main/preload; default is no sourcemap. An agent debugging a prod-only crash should check bundler config first.

---

### D7 — Worktree isolation + parallel runs

**Finding:** Electron binaries are cached at platform-global paths (`~/Library/Caches/electron/`, `$XDG_CACHE_HOME/electron/`, `$LOCALAPPDATA/electron/Cache`) — machine-global by default, so N worktrees × same Electron version = one download. `electron-rebuild` headers cache at `~/.electron-gyp` (also machine-global). **pnpm is the only mainstream package manager with cross-worktree deduplication** — Bun installs use a global cache but still write full `node_modules` per project. Playwright `electron.launch()` has **no documented `userDataDir` option** (feature request #11240 was closed as P3-collecting-feedback — not actively tracked upstream); teams work around with `env: { ELECTRON_USER_DATA: tmpdir }` + `app.setPath('userData', ...)` in main.js. `app.requestSingleInstanceLock()` is keyed per-user — parallel dev instances across worktrees collide.

**Evidence:** [fanout/d-dev-loop §D7](fanout/2026-04-15-initial/d-dev-loop/REPORT.md) — Electron installation docs, pnpm worktrees docs, Playwright #11240, Electron #24447 / #35680 / #30219.

**Implications for agent velocity:**
- `userData` collisions are the single-sharpest-edged gotcha for parallel Electron E2E. Without isolation, IndexedDB + SQLite WAL contention makes tests non-deterministic under agent parallelism.
- Two parallel dev Electron instances (two worktrees, same app ID) running `requestSingleInstanceLock()` → second self-terminates. Silent failure mode. Test-mode bypass via `NODE_ENV=test` gate is the workaround.
- pnpm's cross-worktree store amortizes install cost for N worktrees × M native deps. Bun/npm/yarn pay M×N disk + install.

**Decision triggers:**
- Parallel agent runs on same machine: require explicit `userData` isolation + `requestSingleInstanceLock` bypass in test/dev mode.
- Worktree-heavy workflow with native Electron deps (keytar, better-sqlite3, `@parcel/watcher`): pnpm saves significant install time. Bun is acceptable if native-dep count is low.
- Ubuntu CI: always `npx playwright install --with-deps` or pin `ubuntu-22.04`. Ubuntu 24.04's rollover broke `_electron.launch()` without deps in early 2026.

**Remaining uncertainty:** No published benchmarks for max parallel Playwright-for-Electron workers on typical CI runners. Anecdotal: `ubuntu-latest` (4 CPU, 16GB) typically handles 2-4 parallel.

---

### D8 — Electron toolchain readiness 2026

**Finding:** Current stable is **Electron 41.2.0** (GA 2026-04-07, Chromium 146, Node 24.14.0, V8 14.6). Supported majors are 41/40/39 per the 3-version policy. Electron 42 ships 2026-05-05. Canonical 2026 pairing is **either** `electron-vite v5.0.0 + electron-builder v26.9.0` (community, mature Vite-native DX, separate packager) **or** `@electron-forge/cli v7.11.1 + @electron-forge/plugin-vite` (official, experimental Vite plugin). electron-vite v6.0.0-beta.1 adds Rolldown dual-support but is not yet GA. The whole `@electron/*` suite (asar 4.2.0, fuses 2.1.1, rebuild 4.0.3, notarize 3.1.1, packager 19.1.0) requires Node ≥22.12.0 and publishes SLSA v1 provenance.

**Reference-app version audit (CONFIRMED where source available):** VS Code 1.115.0 on Electron 39.8.5 (N-2), GitHub Desktop dev branch on 40.1.0 (N-1), Notion on 40.8.5 (N-1), Discord on 37 (N-4). None run 41. Median is N-1.

**Evidence:** [fanout/e-toolchain-readiness](fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md) — releases.electronjs.org, electronjs.org/blog/electron-{39,40,41}-0, electron-vite CHANGELOG, Forge issues #3506 / #3715, electron-builder issues #956 / #1376 / #9025 / #8345.

**Implications for agent velocity:**
- **Agents trained on older material generate outdated Electron configs** — electron-vite v6 shifts the resolve-config contract, Forge+Vite has shipped undocumented breaking changes. Pinning versions explicitly in any agent-written scaffolding is the 2026 convention.
- **The 39 → 40 upgrade is a Node 22 → 24 ABI break** — every native module must be rebuilt; renderer `clipboard` API deprecated. New repos targeting Electron 40+ from day one avoid the ABI migration; renderer `clipboard` is lint-blockable.
- **Electron 41.0.0 had post-GA bugs**; the Electron blog recommends `41.0.2+` as minimum. Agents accepting `^41.0.0` without the patch pin risk inheriting known regressions.

**Decision triggers:**
- **Safe production target for 2026-Q2 spec:** Electron 40.8.5 (oldest still-supported N-1, EOL 2026-06-30) or 41.2.0 (current, accepts early-major risk). Decide based on CVE-2025-55305 tolerance — 41 has the ASAR integrity digest requiring `@electron/asar` ≥ 4.1.0; 40 requires manual fuse enablement.
- **Toolchain pairing lock:** if the repo will be touched by agents trained on mixed corpora, lock the electron-vite-vs-Forge choice in `AGENTS.md` / `CLAUDE.md` at the top of the repo so the config shape is unambiguous from first read. Without that, mixed-config hybrids are a recurring agent failure.
- **Monorepo with pnpm/Bun workspaces + electron-builder:** expect `files:` glob misses on symlinked deps (#956 / #9025). Use explicit `FileSet` objects + a CI assertion that `.asar` content matches expected file list.
- **Windows signing:** Azure Trusted Signing is US/Canada-only with 3-year business history. Verify eligibility before the spec locks Windows day-0.

**Remaining uncertainty:** Claude Desktop / Cursor / Slack post-Tahoe exact Electron versions are undisclosed. Linear is wrapped via ToDesktop (abstracted). ASAR integrity digest tool support in Electron Forge is "planned for the near future" per the 41 blog — not landed yet.

---

### D9 — IPC observability + typed contextBridge

**Finding:** Three options span the tradeoff space. **(1) Hand-rolled typed channel maps** — GitHub Desktop's `RequestChannels` / `RequestResponseChannels` discriminated unions in `ipc-shared.ts` + typed `on<T extends keyof RequestChannels>(...)` wrappers + a custom ESLint rule `no-loosely-typed-webcontents-ipc` + `no-restricted-imports` banning bare `ipcMain`/`ipcRenderer`. Zero runtime deps, fully Grep-able. **(2) tRPC-over-IPC** — `electron-trpc` v0.7.1 or `trpc-electron` (tRPC v11 fork) — queries/mutations/subscriptions with full type inference, schema validation via Zod. Channel becomes opaque (single `trpc` envelope). **(3) `@electron-toolkit/preload` + `@electron-toolkit/typed-ipc`** — prebuilt `electronAPI` + typed-channel helpers, middle-ground opinionated. All three require `contextIsolation: true` (Electron default since 12.0.0).

**Evidence:** [fanout/c-agent-workflow §D9](fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) — GitHub Desktop `app/src/lib/ipc-shared.ts:27-90`, `main-process/ipc-main.ts:22-51`, `eslint-rules/no-loosely-typed-webcontents-ipc.js`, electron-trpc GitHub, `@electron-toolkit/preload` docs.

**Implications for agent velocity:**
- Discriminated-union channel maps produce crisp TS errors at every callsite when a signature changes — agents refactoring IPC get compile-time feedback, not runtime stack traces.
- tRPC's opaque `trpc`-envelope channel is harder to debug (`console.log` on channel name no longer tells you what was sent). Trade-off: type inference + runtime validation vs. observability.
- `contextBridge.exposeInMainWorld` does structured-clone serialization — class instances lose prototypes. Agents shipping class instances across the bridge hit silent method disappearance; pattern: expose pure-function APIs + plain data.

**Decision triggers (scale-based, per [FU-3](fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md)):**

FU-3 evaluated 7 libraries across 11 axes with reference implementations. The real fork is **observability** (channel-name visibility), not type-inference — all 7 give end-to-end typing. Named-channel family (GitHub Desktop hand-rolled, `@electron-toolkit/typed-ipc`, `@egoist/tipc`, `electron-typescript-ipc`) keeps procedure name = IPC channel name; grep-able. Opaque-envelope family (`electron-trpc`, `trpc-electron`) routes every call through the single `'electron-trpc'` channel with the procedure name buried in a JSON envelope.

| Scale | Recommended | Why |
|---|---|---|
| <20 channels | **Hand-rolled discriminated-union channel map** (GitHub Desktop pattern, ~150 LOC) | Zero deps, best observability, ESLint-enforceable via `no-loosely-typed-webcontents-ipc`, grep-able channel names |
| 20-100 channels | **`@electron-toolkit/typed-ipc`** | Named channels + `IpcListener`/`IpcEmitter` classes remove per-channel boilerplate |
| 100+ channels, tRPC-feel DX | **`@egoist/tipc`** | Named-channel-per-procedure + subscriptions + React Query adapter |
| Hard runtime validation required (untrusted renderer, compliance) | **`electron-trpc`** | Only option with first-class `.input(zodSchema)`; accept the opacity tax |

**Hidden cost of opaque-envelope approaches:** tRPC's single-channel routing hides procedure names in DevTools, logs, and `console.log` output. For AI-coding-agent iteration where debugging leans on observability, the opacity tax compounds. FU-3 scores opaque-envelope libraries ~8 points lower on the decision matrix despite equivalent type-inference.

**Runtime schema validation without tRPC:** hand-rolled channel map + optional per-channel Zod schema at the `ipcMain.handle` boundary gives runtime validation without channel opacity. `src/shared/schemas.ts` maps `keyof RequestResponseChannels` → Zod schema; boundary wrappers call `schema.parse(payload)` before dispatch.

**Remaining uncertainty:** bundle-size comparisons in FU-3 are INFERRED (bundlephobia unreachable during research). `@egoist/tipc` channel-naming convention MEDIUM confidence. No IPC recording/replay tool for Electron — "wireshark for Electron IPC" does not exist; teams hand-roll manual logging at every handler.

---

### D10 — Quality gates + machine-parseable output

**Finding:** Electron-specific security linting has atrophied. **Electronegativity (Doyensec) is unmaintained** (last release v1.10.0, 2022-12-07); commercial ElectroNG is paid. **`electron/eslint-config` is stale** (v1.0.1, 2021-11-08). **Teams write their own rules** — GitHub Desktop ships 5 custom ESLint rules in `eslint-rules/` covering `insecure-random`, React lifecycle hygiene, and `no-loosely-typed-webcontents-ipc`. Every quality gate emits machine-parseable output: ESLint `--format json`, `tsc --pretty false --noEmit`, Playwright `--reporter=json,junit`, Vitest `--reporter=json`. Electron's 2026 CVE density is high (CVE-2026-34767, 34769, 34770, 34773, 34778, 34779, 34780 all in one quarter) — `npm audit --json` / `bun audit --json` is the CVE gate.

**Evidence:** [fanout/c-agent-workflow §D10](fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) — Electronegativity GitHub (unmaintained), `electron/eslint-config` GitHub (stale), ESLint formatters docs, GitHub Advisory Database.

**Implications for agent velocity:**
- All quality gates emit agent-parseable output if you pick it up. Not wiring `--reporter=json,junit` is the easy miss.
- No off-the-shelf "Electron security ESLint pack" is maintained — agents either roll their own rules (GitHub Desktop model) or use `@electron-toolkit/eslint-config-ts`. Copy GitHub Desktop's `eslint-rules/` as a starting point.
- Biome v2 (Rust, fast) covers lint+format but has no Electron-specific rules. Defensible split: Biome for format+baseline lint + ESLint for custom Electron rules.

**Decision triggers:**
- Every CI gate must emit `--reporter=json,junit` or equivalent. Agent triage requires structured output, not ANSI.
- Custom ESLint rules for Electron security (ban bare `ipcMain`/`ipcRenderer`, ban loose `webContents.send`, ban `contextIsolation: false`) are the 2026 SOTA — no packaged replacement exists.
- `npm audit` / `bun audit` as a gate given Electron's CVE density. Auto-patching tool for Electron doesn't exist; `electron-builder`/`electron-forge` don't version-pin Electron for you.

---

### E1 — Hot-reload across main/renderer/utility

**Finding:** electron-vite `dev --watch` is the 2026 de-facto for hot reload. Docs explicitly state: "Hot reloading ... is not true hot reloading (which updates code without restart), it provides a similar development experience." Main-file change → full Electron restart (~1-3s). Preload change → rebuild preload + reload renderer windows (since v0.29.0 emits `electron-vite&type=hot-reload` event). Renderer change → native Vite HMR (sub-100ms). **Renderer state does NOT survive main-process restart.** **Utility-process hot reload is unaddressed** by electron-vite, electron-forge, and electron-builder; agents iterating on utility code need full Electron restart.

**Evidence:** [fanout/d-dev-loop §E1](fanout/2026-04-15-initial/d-dev-loop/REPORT.md) — electron-vite HMR docs.

**Implications for agent velocity:**
- Agent UI-iteration loop is sub-second (Vite HMR). Main-process iteration pays ~1-3s per edit. Utility-process iteration pays full restart (~3-5s).
- CRDT editors where renderer holds live WebSocket state lose selection + re-sync on every main restart — architectural pressure to keep main thin, push logic into preload + renderer.

**Decision triggers:**
- Keep main-process code minimal: window management, OS integrations, menu. Anything else → preload or utility.
- For utility-process iteration speed: DIY watch + `UtilityProcess.kill()` + respawn from main on change. ~100 LOC; captures most of the utility-reload value electron-vite misses. [FU-1](fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/REPORT.md) synthesizes a ~30-line supervisor pattern composed from electron-vite's `?modulePath` primitive + chokidar + `kill()`/`fork()` + `once('exit')` — no canonical community gist exists, but the shape is stable. Known landmines to work around: `.kill()` on an already-killed process returns `false` (electron #44013), dev-vs-packaged behavior divergence (electron #42978), pre-2024 duplicate `'exit'` events (fixed in #44265).
- For utility state that's expensive to rebuild (indexes, WebSocket servers, open file handles, MCP client connections): architect the utility process to persist state to disk on SIGTERM; restore on next spawn. Pair with exponential-backoff reconnect on renderer/external-client side. No library ships this — it's bespoke per app.
- If hot-reload of utility code is P0 dev-experience: accept the dual-code-path cost — `child_process.fork()` + `nodemon` in dev, `utilityProcess.fork()` in production. Loses renderer-direct `MessagePortMain` handoff in dev; makes types harder to reconcile across the boundary.

**Remaining uncertainty:** FU-1 confirms no published `vite-plugin-utility-process`, no typed-IPC library with a respawn story, no canonical reference-impl gist. The shape is stable enough to write your own; it just isn't packaged.

---

### E2 — Running Electron headless in CI + scripts

**Finding:** Linux CI requires **Xvfb** — Electron's docs state "Being based on Chromium, Electron requires a display driver to function. If Chromium can't find a display driver, Electron will fail to launch." Canonical command: `xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" -- npx playwright test`. **macOS and Windows CI runners run Electron headed natively** — no special config. **`BrowserWindow({ webPreferences: { offscreen: true } })` is for rendering-to-texture, not a headless substitute** — Electron still needs a display driver to start on Linux. **Playwright `_electron.launch()` is the canonical scripted-drive API** with `env`, `args`, `executablePath`, `timeout` options.

**Evidence:** [fanout/d-dev-loop §E2](fanout/2026-04-15-initial/d-dev-loop/REPORT.md) — Electron testing-on-headless-ci docs, offscreen-rendering docs, Playwright Electron docs, Simon Willison TIL.

**Implications for agent velocity:**
- Linux CI needs 1 line: wrap with `xvfb-run` or start `Xvfb :99 &` + `export DISPLAY=:99`. No code change in the Electron app.
- Scripted agent harnesses that launch Electron outside Playwright (e.g., `electron . --headless --run-scenario=X`) are not canonical; the standard is Playwright `_electron.launch()` with `env: { E2E_TEST_MODE: '1' }` gates in main.js.
- Graceful shutdown via `app.close()` (Playwright) or `app.quit()` + `before-quit` hook (plain) — SIGTERM skips cleanup hooks.

**Decision triggers:**
- Linux in CI matrix: `xvfb-run` wrapper is the 1-line cost. Don't skip Linux without an explicit reason — it's where most developer/agent environments live.
- Scripted agent runs: expose `E2E_TEST_MODE` / `NODE_ENV=test` gates in main.js that disable auto-updater, telemetry, recovery dialogs. Without them, scripted Electron runs trigger update checks against GitHub Releases under load.

**Remaining uncertainty:** Whether offscreen rendering + software rendering can launch on Linux without Xvfb — inferred no from docs ("will fail to launch"), not explicitly tested.

---

### E3 — Integration test depth: full-stack driven

**Finding:** The canonical Playwright-for-Electron pattern is `findLatestBuild()` + `parseElectronApp()` + `electron.launch({ executablePath, args: [appInfo.main] })` from `electron-playwright-helpers`. Tests run **serially per worker** (GitHub Desktop: `workers: 1`, worker-scoped fixtures, `test.describe.configure({ mode: 'serial' })`) with `userData` isolated via `--user-data-dir=<tmp>` CLI flag. Real-IPC + main-process evaluation + renderer assertions in one test is the norm: `electronApp.evaluate(({ ipcMain }) => ipcMain.emit('new-window'))` + `ipcRendererInvoke(page, 'how-many-windows')` + `ipcMainInvokeHandler(electronApp, 'how-many-windows')`. GitHub Desktop additionally uses a worker-scoped in-process mock HTTP server fixture for deterministic network (update-server stubbing).

**Evidence:** [fanout/b-testing-parity §E3](fanout/2026-04-15-initial/b-testing-parity/REPORT.md) — electron-playwright-example, electron-playwright-helpers npm notes, GitHub Desktop `app/test/e2e/*`.

**Implications for agent velocity:**
- One test file can express full-stack invariants ("renderer and main agree on window count") — real main, real renderer, real IPC, real filesystem. The format catches the most failure modes per LOC.
- Parallel-across-files (`workers: N`) requires per-worker userData tempdirs + per-worker port allocation for any in-process server + per-worker `app.requestSingleInstanceLock` bypass.
- Known-fragile: main/renderer readiness race. `firstWindow()` resolves when the first BrowserWindow exists, not when it's loaded. Wire a ready-signal over IPC rather than selector polling alone.

**Decision triggers:**
- Copy `spaceagetv/electron-playwright-example` as E2E scaffolding — working test file in <20 LOC. Extend from there.
- Pair integration tests with the `DESKTOP_E2E_APP_MODE` env-var pattern so the same file runs against both unpackaged (local dev) and packaged (CI gate) binaries.
- Avoid `test.concurrent()` with Electron — Playwright-for-Electron doesn't support it cleanly. Parallelism happens at the worker level (across files).

**Remaining uncertainty:** IPC recording/replay libraries don't exist; teams hand-roll with `ipcMain.emit` spies or log-to-file for regression debugging.

---

## Agent-first Electron repo skeleton (FU-4 synthesis)

[FU-4](fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md) composes the load-bearing decisions across all 13 dimensions + the 3 follow-ups into a greenfield skeleton. Not an invention — a synthesis of existing production patterns (electron-vite, `@electron-toolkit`, GitHub Desktop's IPC + ESLint discipline, GitHub Desktop's three-tier test harness). **Typed by default at every boundary** per the consuming reader's preference.

### Directory layout

```
repo-root/
├── AGENTS.md                         # toolchain-lock + quality-gate commands
├── CLAUDE.md                         # symlink or dup of AGENTS.md
├── electron.vite.config.ts           # one config, three sections
├── electron-builder.yml
├── tsconfig.{base,main,preload,renderer,utility,shared}.json   # solution-style, project refs
├── eslint.config.js                  # flat config; rulesdir ./eslint-rules/
├── eslint-rules/                     # 5 custom rules (ported from GitHub Desktop)
│   ├── no-loosely-typed-webcontents-ipc.js
│   ├── no-ipc-main-bare-import.js
│   ├── no-ipc-renderer-bare-import.js
│   ├── no-context-isolation-false.js
│   └── no-node-integration-true.js
├── src/
│   ├── main/{index,ipc-main,ipc-webcontents,menu,logging,userdata-isolation}.ts
│   ├── preload/index.ts              # exposes typed electronAPI
│   ├── renderer/{index.tsx, ipc-renderer.ts, components/}
│   ├── utility/heavy-work.ts         # utilityProcess.fork targets
│   └── shared/                       # cross-process contracts
│       ├── ipc-shared.ts             # RequestChannels, RequestResponseChannels
│       ├── schemas.ts                # Zod schemas per channel (optional)
│       ├── global.d.ts               # declare global { Window.electron, .api }
│       └── config-schema.ts          # Zod config schema
└── tests/{unit,e2e,fixtures}/
```

**Why:** process-boundary == folder-boundary == tsconfig-reference-boundary == ESLint-layer-boundary. Five conventions on one axis (Cross-cutting Pattern 1 made literal).

### Canonical scripts

```jsonc
{
  "scripts": {
    "dev": "electron-vite dev --watch",
    "build": "electron-vite build && tsc -b --noEmit",
    "build:dir": "electron-vite build && electron-builder --dir",
    "build:prod": "electron-vite build && electron-builder",
    "rebuild": "electron-builder install-app-deps",
    "test": "vitest run --reporter=json --outputFile=out/unit.json",
    "test:e2e:packaged":   "bun run build:dir && DESKTOP_E2E_APP_MODE=packaged playwright test --reporter=json,junit",
    "test:e2e:unpackaged": "bun run build      && DESKTOP_E2E_APP_MODE=unpackaged playwright test --reporter=json,junit",
    "typecheck": "tsc -b --noEmit --pretty false",
    "lint": "eslint . --format json --output-file out/eslint.json && biome check .",
    "check": "bun run lint && bun run typecheck && bun run test && bun run test:e2e:unpackaged"
  }
}
```

`DESKTOP_E2E_APP_MODE=packaged|unpackaged` is the tier-switch knob — verbatim from GitHub Desktop. `bun run check` is the single canonical gate.

### Typing discipline — baseline (hand-rolled channel map per FU-3 scale-match)

```ts
// src/shared/ipc-shared.ts
export type RequestResponseChannels = {
  'get-app-path': (kind: PathKind) => Promise<string>;
  'save-file': (p: SaveFilePayload) => Promise<
    | { ok: true; path: string }
    | { ok: false; reason: string }
  >;
};

// src/renderer/ipc-renderer.ts — the only file that bare-imports ipcRenderer
export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<RequestResponseChannels[T]>;
}
```

Renderer callsites: `window.api.invoke('save-file', payload)` — full IntelliSense on channel name + payload shape. Wrong channel = `keyof` miss at compile time. ESLint rules enforce that bare `ipcMain` / `ipcRenderer` imports only exist in the designated wrapper files.

### Typing discipline — per boundary

| Boundary | Schema location | Compile-time failure on violation |
|---|---|---|
| Renderer↔main IPC | `src/shared/ipc-shared.ts` | Wrong channel → `keyof` miss; wrong payload → `Parameters<>` miss |
| Preload↔renderer global | `src/shared/global.d.ts` | Undefined surface → TS error |
| Menu actions | `MenuEvent` enum | String not in union → TS error (addresses parent OQ-C) |
| App config | `src/shared/config-schema.ts` Zod | Missing key → TS error; bad runtime value → Zod throw at boundary |
| Main→renderer (main side) | `src/main/ipc-webcontents.ts` | Lint: `no-loosely-typed-webcontents-ipc` bans bare `wc.send(...)` |
| Per-process lib boundary | per-process `tsconfig.*.json` | `import 'fs'` in renderer → `Cannot find module 'fs'` (renderer has `types: []`) |
| Unsafe TS escape | ESLint `@typescript-eslint/no-unsafe-*` | `as any` → lint failure |

### AGENTS.md / CLAUDE.md at repo root

The highest-leverage agent-first artifact. Locks toolchain choice at repo top (resolves §D8's electron-vite-vs-Forge ambiguity on first read):

```md
## Toolchain (LOCKED)
- Electron ~41.0.2 — Node 24.14.0, Chromium 146
- electron-vite v5 — `electron.vite.config.ts`
- electron-builder v26 — `electron-builder.yml`, NOT forge.config.ts
- Bun 1.3+ as package manager and test runner
- Playwright-for-Electron v1.48+; Spectron deprecated, do not suggest

## Quality gate: `bun run check`

## IPC
NEVER import ipcRenderer/ipcMain directly outside src/{main,renderer,preload}/ipc-*.ts. Lint fails.
NEVER call webContents.send directly. Use sendToRenderer() from src/main/ipc-webcontents.ts.

## Parallel agents
Each Playwright worker gets its own ELECTRON_USER_DATA tempdir via
env-var + app.setPath('userData', ...) in main.js before whenReady().
```

### Agent affordances enumerated

1. Directory-as-process-boundary (5 conventions on one axis).
2. Toolchain-lock at repo root (AGENTS.md / CLAUDE.md).
3. Machine-parseable output everywhere (`out/` collects JSON reports).
4. One canonical gate: `bun run check`.
5. Tier-switched E2E via one env var.
6. Per-test `userData` isolation — parallel agents don't collide.
7. Typed IPC with grep-able channel names — `rg "'save-file'"` finds all uses.
8. Typed menu actions (no string-discriminated single-channel indirection).
9. Renderer-to-main console bridge via `webContents.on('console-message', …)`.
10. JSON-lines logs — `jq`-friendly, not ANSI soup.
11. Packaged-smoke CI gate — catches ~65-75% of dev-green/prod-red regressions (per FU-2) in <2 min/cell.
12. Worker-scoped Playwright fixtures — real main + real renderer + real IPC in one file.
13. `eslint-rules/` checked-in, not a dep — agents can read and extend.
14. Biome + ESLint split: Biome for format + baseline speed, ESLint for custom Electron rules.
15. Zero reliance on deprecated tooling (Spectron, Electronegativity, Webpack).

### What the skeleton explicitly excludes

| Excluded | Why | Revisit trigger |
|---|---|---|
| tRPC-over-IPC | Opacity tax — hidden channel names in DevTools + logs. <20 channels, hand-rolled wins. | Channel count >20 with streaming/subscription surface OR Zod-at-boundary across all channels required. |
| ElectroNG | Paid; free predecessor (Electronegativity) unmaintained since 2022. | Never. |
| Spectron | Deprecated 2022-02-01. | Never. |
| Offscreen as "headless" | Offscreen is rendering-to-texture; Electron still needs display driver on Linux. | Never for headless. |
| Utility-process HMR | No framework ships it. DIY supervisor ~100 LOC per FU-1. | FU-1 supervisor pattern matures into a published plugin. |
| Webpack | Agent training data cleaner for electron-vite. | Team has deep Webpack investment. |
| electron-forge as packager | Plugin-vite experimental, shipped undocumented breaking changes (per §D8). electron-builder v26 mature. | Forge Vite plugin stabilizes + ASAR integrity digest lands. |
| Node integration in renderer | Security + layer discipline. Renderer has no `types: ["node"]`. | Never. |
| Class instances across contextBridge | Structured-clone strips prototypes (§D9). | Never; architectural invariant. |

See [FU-4 report](fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md) for full primary-source citations per decision + the complete package.json + tsconfig + ESLint + CI snippets.

---

## Cross-cutting Patterns

### Pattern 1: Process boundary is the unifying axis

Five conventions stack on the process-model divide: folder boundary (D1), build-target boundary (D1/D2), sourcemap boundary (D6), HMR boundary (E1), observability boundary (D5/D9). An agent that reasons about `src/main` vs `src/renderer` correctly is automatically reasoning about Vite config, Sentry module, HMR behavior, and tsconfig. Repos that violate the convention (one giant `src/`) make every debug step harder.

### Pattern 2: Three-tier test pyramid

Unit (DI'd Electron, pure Bun/Node, <1s) → Integration-on-unpackaged (Playwright + `out/main.js`, ~5s) → Smoke-on-packaged (`electron-builder --dir` + Playwright, ~30s). Each tier catches a failure class the others miss. GitHub Desktop's `DESKTOP_E2E_APP_MODE` env-var is a clean knob for tier switching from a single test file.

### Pattern 3: Tempdirs + `--user-data-dir` is the universal isolation primitive

D3 (parallel workers) and E3 (fixture seeding) converge on it; D7 extends to cross-worktree parallel runs. Chromium honours `--user-data-dir` at process level, bypassing Electron's default-path logic. The single-line fix for 80% of parallelism failures.

### Pattern 4: `electronApp.evaluate()` is the Playwright escape hatch

Missing `userDataDir` option? `evaluate` to call `app.setPath`. Need force quit? `evaluate` to call `app.exit(0)`. Need runtime config? `evaluate` to return `app.getPath('userData')`. The single most important Playwright-for-Electron primitive for scripted work.

### Pattern 5: Custom ESLint rules beat packaged Electron rulesets

The 2021-era `electron/eslint-config` and Electronegativity's 2022 freeze mean the current SOTA is "read GitHub Desktop's `eslint-rules/` and port." A gap an agent-first repo can close in ~5 custom rules (no-loosely-typed-webcontents-ipc, insecure-random, no-restricted-imports for bare `ipcMain`/`ipcRenderer`, react-no-unbound-dispatcher-props, react-proper-lifecycle-methods).

### Pattern 6: Machine-global caches, per-worktree mutable state

Electron binaries (`~/Library/Caches/electron/`), rebuild headers (`~/.electron-gyp`), and pnpm store are machine-global and deduplicate across worktrees cleanly. `node_modules/<native-pkg>/build/` (compiled binaries) and `userData` paths are per-worktree/per-test and need explicit isolation. Mixing up which is which is a recurring agent failure mode — e.g., hard-linking a `build/Release/<module>.node` across worktrees on different Electron versions produces mysterious ABI crashes.

### Pattern 7: Real hot-reload only exists for renderer

Main-process code is rebuild-and-restart, not hot-swap. Everything downstream (test-mode gates, renderer state preservation, dev-loop latency) flows from this. Keep main thin; push logic into preload + renderer.

---

## Convergences and divergences across clusters

**Convergences (3+ clusters agree):**
- Directory-as-process-boundary as the 2026 convention (D1, D6, E1)
- Playwright for Electron as the canonical E2E path (D3, D4, E3, D7, E2)
- `--user-data-dir` + tempdirs as the universal isolation primitive (D3, D7, E3)
- Machine-parseable output via JSON/JUnit reporters (D3, D10)
- Main-process minimality as architectural pressure (D5, E1)

**Divergences flagged during research:**
- **electron-vite vs electron-forge+Vite toolchain choice** — vendor bias on both sides; the Electron org's own FAQ positions electron-vite as "experimental testing ground we port from." Spec authors should lock one pairing explicitly. Evidence: [D8, Cluster E](fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md).
- **Typed-IPC approach** — hand-rolled channel maps (GitHub Desktop, no runtime deps, grep-able) vs tRPC-over-IPC (schema validation, opaque channel) vs `@electron-toolkit` (opinionated middle). No single convergence; picks are tradeoff-sensitive. Evidence: [D9, Cluster C](fanout/2026-04-15-initial/c-agent-workflow/REPORT.md).
- **Production Electron version target** — reference apps span N-4 (Discord) to N-1 (GitHub Desktop, Notion) to N-2 (VS Code). No "safe everyone uses X." Evidence: [D8, Cluster E](fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md).

---

## Limitations & Open Questions

### Dimensions with remaining uncertainty

- **Utility-process hot reload** (E1) — unaddressed by all major Electron frameworks (electron-vite, electron-forge, electron-builder). DIY pattern (`UtilityProcess.kill()` + respawn) exists but no canonical implementation.
- **Parallel Playwright-for-Electron worker capacity** (D7) — no published benchmarks. Anecdotal estimates only.
- **Measured reload latencies across main/renderer/utility** (E1) — no community benchmarks; teams measure in-repo.
- **Reference-app exact Electron versions** (D8) — Claude Desktop, Cursor, Slack, Linear are undisclosed or abstracted.
- **TypeScript "machine-applicable suggestions" equivalent** (D5) — no rustc-style structured fix-its for multi-process Electron TypeScript. Closest is ESLint `fixable` rules.
- **IPC recording/replay tool** (D9) — no maintained library. "Wireshark for Electron IPC" does not exist.

### Out of scope (per rubric)

- Framework comparison (Electron vs Tauri/Wails) → covered in `reports/web-to-macos-desktop-wrapping-2025/`
- Code signing + notarization mechanics → covered in `reports/electron-desktop-app-operations-2025/`
- General TypeScript monorepo CI patterns → covered in `reports/ts-monorepo-ci-test-pipeline-patterns/`
- Browser automation for web apps → covered in `reports/agent-browser-vs-playwright-crdt-testing/`

---

## References

### Evidence files (fanout reports)

**Initial pass (2026-04-15):**
- [fanout/2026-04-15-initial/a-structure-ops/REPORT.md](fanout/2026-04-15-initial/a-structure-ops/REPORT.md) — D1, D2, D6 (repo structure, CI/CD, distribution)
- [fanout/2026-04-15-initial/b-testing-parity/REPORT.md](fanout/2026-04-15-initial/b-testing-parity/REPORT.md) — D3, D4, E3 (multi-process testing, dev↔packaged parity, integration depth)
- [fanout/2026-04-15-initial/c-agent-workflow/REPORT.md](fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) — D5, D9, D10 (agent workflow, IPC observability, quality gates)
- [fanout/2026-04-15-initial/d-dev-loop/REPORT.md](fanout/2026-04-15-initial/d-dev-loop/REPORT.md) — D7, E1, E2 (worktree isolation, hot-reload, headless)
- [fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md](fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md) — D8 (toolchain readiness)

**Follow-up round 2 (2026-04-15):**
- [fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/REPORT.md](fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/REPORT.md) — closes §E1 UNRESOLVED; supervisor pattern + escape hatch
- [fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md](fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md) — 9-class taxonomy from ~65 issues; 65-75% smoke-gate catch rate
- [fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md](fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md) — 7 libraries × 11 axes; named-channel vs opaque-envelope families; scale-matched picks
- [fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md](fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md) — synthesis skeleton with citations per decision

- [evidence/README.md](evidence/README.md) — dimension-to-cluster evidence map

### Run coordination

- [meta/runs/2026-04-15-initial/RUN.md](meta/runs/2026-04-15-initial/RUN.md) — worker prompts, output contracts, canonical source anchors

### Related Research (see-also; not evidence)

- [../rust-napi-rs-best-practices-2026/REPORT.md](../rust-napi-rs-best-practices-2026/REPORT.md) — structural template; D1-D10 here mirror D1-D10 there with Electron-specific adaptations
- [../electron-desktop-app-operations-2025/REPORT.md](../electron-desktop-app-operations-2025/REPORT.md) — signing, notarization, auto-update (complementary; we skipped this scope per non-goals)
- [../web-to-macos-desktop-wrapping-2025/REPORT.md](../web-to-macos-desktop-wrapping-2025/REPORT.md) — framework selection (Electron vs Tauri)
- [../agent-browser-vs-playwright-crdt-testing/REPORT.md](../agent-browser-vs-playwright-crdt-testing/REPORT.md) — Playwright for web browser testing (narrower scope)
- [../worktree-orchestration-landscape/REPORT.md](../worktree-orchestration-landscape/REPORT.md) — parallel agent isolation (orthogonal but intersecting at D7)
- [../ts-monorepo-ci-test-pipeline-patterns/REPORT.md](../ts-monorepo-ci-test-pipeline-patterns/REPORT.md) — generic TS monorepo CI patterns (non-Electron)

### Top external sources

**Electron core:**
- https://www.electronjs.org/docs/latest/tutorial/process-model
- https://www.electronjs.org/docs/latest/tutorial/automated-testing
- https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci
- https://www.electronjs.org/docs/latest/api/debugger
- https://www.electronjs.org/docs/latest/api/context-bridge
- https://releases.electronjs.org/ + /schedule

**Frameworks:**
- https://electron-vite.org/guide/{dev,hmr-and-hot-reloading,debugging}
- https://www.electronforge.io/config/plugins/vite
- https://www.electron.build/{configuration,multi-platform-build,cli,file-patterns}

**Testing:**
- https://playwright.dev/docs/api/class-electron + /class-electronapplication
- https://webdriver.io/docs/wdio-electron-service/
- https://github.com/spaceagetv/electron-playwright-example + electron-playwright-helpers

**Observability + quality:**
- https://github.com/megahertz/electron-log
- https://github.com/getsentry/sentry-electron
- https://github.com/jsonnull/electron-trpc + https://github.com/mat-sz/trpc-electron
- https://github.com/alex8088/electron-toolkit
- https://github.com/doyensec/electronegativity (unmaintained, SARIF output)

**Reference apps (on disk):**
- `~/.claude/oss-repos/desktop/` (GitHub Desktop) — `app/src/{main-process,ui,lib}/`, `app/test/e2e/`, `.github/workflows/ci.yml`, `eslint-rules/`
- `~/.claude/oss-repos/logseq/` — `resources/{forge.config.js,package.json}`, `.github/workflows/build-desktop-release.yml`

**CVE + versioning:**
- https://github.com/advisories (Electron CVE cluster 2026-34767/…/34780)
- https://github.com/advisories/GHSA-vmqv-hx8q-j7mg (CVE-2025-55305)
