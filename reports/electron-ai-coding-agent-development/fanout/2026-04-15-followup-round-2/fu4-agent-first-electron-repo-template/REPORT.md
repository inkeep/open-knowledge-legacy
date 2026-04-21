# FU-4: Agent-first Electron repo template (2026-Q2)

**Parent report:** electron-ai-coding-agent-development
**Extends:** parent as a standalone companion — adds a new "Skeleton" section; does not replace existing dimensions
**User preference signal:** strongly typed; typed by default at every boundary
**Date:** 2026-04-15
**Depth:** Deep

---

## Summary

Synthesis-of-existing-patterns proposal for a greenfield agent-first Electron skeleton. It composes four production-battle-tested shapes: (1) **electron-vite's three-folder `src/{main,preload,renderer}/` convention** with `electron.vite.config.ts` [S1][S2]; (2) **@electron-toolkit's preload/tsconfig/utils packages** shipping opinionated `electronAPI`, Electron-tuned tsconfig bases, and platform helpers [S3]; (3) **GitHub Desktop's typed-IPC + 5 custom ESLint rules** — `RequestChannels` / `RequestResponseChannels` discriminated-union maps, typed `invoke`/`on`/`send` wrappers, `no-loosely-typed-webcontents-ipc` custom rule, bare `ipcMain`/`ipcRenderer` imports banned via `no-restricted-imports` [S4][S5][S6]; (4) **GitHub Desktop's three-tier test harness** — unit, packaged E2E, unpackaged E2E — tier-switched by `DESKTOP_E2E_APP_MODE=packaged|unpackaged` [S7].

On top: typing discipline at every boundary — strict TS + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `isolatedModules` [S8]; TS project references so renderer compiles with `dom` lib and no `node` types [S9][S10]; preload exposes typed `electronAPI` with `declare global { Window.electron: ElectronAPI }` [S3]; discriminated-union channel map with optional per-channel Zod schema at the boundary only [S5][S11]; all quality gates emit machine-parseable output; one canonical gate (`bun run check`).

**Typed-IPC baseline: hand-rolled discriminated-union channel map** (GitHub Desktop pattern) — zero runtime deps, grep-able channel names, minimal bundle overhead. FU-3 confirms this as the recommended pick for <20 channels, with scale-specific overrides (`@electron-toolkit/typed-ipc` at 20-100, `@egoist/tipc` at 100+, `electron-trpc` only when hard runtime validation is required).

**Explicit non-goals:** tRPC-over-IPC (opacity for <20 channels), ElectroNG (paid), Spectron (deprecated 2022-02-01), offscreen-as-headless, utility-process HMR (no framework ships it; see FU-1).

---

## Existing templates surveyed

### electron-vite-react (`electron-vite/electron-vite-react`) [S12]
Structure: `electron/main/`, `electron/preload/`, `src/` (renderer), `electron-builder.json`, `vite.config.ts`, `vitest.config.ts`, Playwright under `test/`. **Strengths:** Vite-native DX, sub-second renderer HMR, `vite-plugin-electron` integration. **Gaps for agent-first:** no typed IPC, no custom ESLint rules, no per-process tsconfig refs, no `DESKTOP_E2E_APP_MODE` tier switch, no AGENTS.md.

### electron-vite-boilerplate (`electron-vite/electron-vite-boilerplate`) [S2]
Minimal: `electron/main/index.ts`, `electron/preload/index.ts`, `src/main.ts`. **Strengths:** very thin, overlay on official `template-vanilla-ts`. **Gaps:** Node integration enabled in renderer by default (security footgun); no typed preload; no tests; no lint.

### electron-react-boilerplate [S13]
Webpack + React Fast Refresh, not Vite. `src/main/`, `src/renderer/`, `src/__tests__/`. **Strengths:** most mature community template, ESLint + Prettier shipped. **Gaps:** Webpack config opaque compared to `electron.vite.config.ts`; no typed IPC; no project refs; agent training data noisier for Webpack Electron configs.

### electron-forge default templates (vite-typescript et al.) [S14]
`npm create electron-app@latest -- --template=vite-typescript` yields `src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `forge.config.ts`, and **three separate** `vite.main.config.ts` / `vite.preload.config.ts` / `vite.renderer.config.ts` files. **Strengths:** official Electron org. **Gaps:** triple-config surface vs electron-vite's single file; Forge's plugin-vite still experimental (parent D8); no typed IPC.

### electron-sample-apps (`hokein/electron-sample-apps`) [S15]
Reference corpus of API demos — not a template. Useful for agents as worked examples; pre-Vite.

### @electron-toolkit ecosystem (`alex8088/electron-toolkit`) [S3]
Monorepo of libraries, not a scaffolder. `@electron-toolkit/preload`, `@electron-toolkit/utils`, `@electron-toolkit/tsconfig` (three presets: `node`, `web`, `library`), `@electron-toolkit/eslint-config-ts`. **Strengths:** drop-in libs, no template lock-in. **Gaps:** no IPC shape — teams build on top.

### GitHub Desktop (`~/.claude/oss-repos/desktop/`) [S4–S7]
Production repo (not a template). Electron 40.1.0 dev branch. Ships most polished public typed-IPC discipline, 5 custom ESLint rules in `eslint-rules/`, `DESKTOP_E2E_APP_MODE` tier switch, worker-scoped Playwright fixtures. Predates electron-vite (uses Webpack + ts-node scripts) — not directly transposable, but the discipline is.

---

## Proposed skeleton

### Directory layout

```
repo-root/
├── AGENTS.md                         # toolchain-lock + quality-gate commands
├── CLAUDE.md                         # symlink or dup of AGENTS.md
├── package.json
├── electron.vite.config.ts           # one config, three sections [S1]
├── electron-builder.yml
├── tsconfig.json                     # solution-style, references per-process
├── tsconfig.base.json                # strict compiler options
├── tsconfig.main.json                # node base, lib ES2024
├── tsconfig.preload.json             # node + DOM lib
├── tsconfig.renderer.json            # DOM lib, NO node types
├── tsconfig.utility.json             # node base
├── tsconfig.shared.json              # env-agnostic
├── eslint.config.js                  # flat config; rulesdir ./eslint-rules/
├── playwright.config.ts
├── vitest.config.ts
├── biome.jsonc                       # format + baseline lint
├── .github/workflows/{ci.yml,release.yml}
├── eslint-rules/                     # ported from GitHub Desktop [S5]
│   ├── no-loosely-typed-webcontents-ipc.js
│   ├── no-ipc-main-bare-import.js
│   ├── no-ipc-renderer-bare-import.js
│   ├── no-context-isolation-false.js
│   └── no-node-integration-true.js
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc-main.ts               # typed ipcMain.handle wrappers
│   │   ├── ipc-webcontents.ts        # typed webContents.send wrappers [S6]
│   │   ├── menu.ts                   # typed MenuEvent enum [parent OQ-C]
│   │   ├── logging.ts                # electron-log + JSON formatter
│   │   ├── userdata-isolation.ts     # ELECTRON_USER_DATA → app.setPath
│   │   └── windows/
│   ├── preload/index.ts              # exposes typed electronAPI
│   ├── renderer/
│   │   ├── index.tsx
│   │   ├── ipc-renderer.ts           # typed invoke/on wrappers [S5]
│   │   └── components/
│   ├── utility/heavy-work.ts         # utilityProcess.fork targets
│   └── shared/                       # cross-process contracts
│       ├── ipc-shared.ts             # RequestChannels, RequestResponseChannels [S5]
│       ├── schemas.ts                # Zod schemas per channel (optional)
│       ├── global.d.ts               # declare global { Window.electron, .api }
│       └── config-schema.ts          # Zod config schema
└── tests/
    ├── unit/                         # *.test.ts Vitest/Bun
    ├── e2e/                          # *.e2e.ts Playwright
    │   └── playwright.config.ts      # reads DESKTOP_E2E_APP_MODE [S7]
    └── fixtures/                     # worker-scoped: userData tempdir, mock server
```

**Why this layout:** process-boundary == folder-boundary == tsconfig-reference-boundary == ESLint-layer-boundary. Parent cross-cutting Pattern 1 made literal — five conventions on one axis.

### package.json (canonical scripts)

```jsonc
{
  "name": "electron-app",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev --watch",                                // [S1]
    "preview": "electron-vite preview",
    "build": "electron-vite build && tsc -b --noEmit",
    "build:dir": "electron-vite build && electron-builder --dir",      // CI smoke [parent D6]
    "build:prod": "electron-vite build && electron-builder",
    "rebuild": "electron-builder install-app-deps",
    "test": "vitest run --reporter=json --outputFile=out/unit.json",   // [parent D10]
    "test:watch": "vitest",
    "test:e2e": "bun run test:e2e:packaged",
    "test:e2e:packaged":   "bun run build:dir && DESKTOP_E2E_APP_MODE=packaged playwright test --reporter=json,junit",
    "test:e2e:unpackaged": "bun run build      && DESKTOP_E2E_APP_MODE=unpackaged playwright test --reporter=json,junit",
    "typecheck": "tsc -b --noEmit --pretty false",
    "lint": "eslint . --format json --output-file out/eslint.json && biome check .",
    "lint:fix": "eslint --fix . && biome check --write .",
    "check": "bun run lint && bun run typecheck && bun run test && bun run test:e2e:unpackaged"
  },
  "devDependencies": {
    "electron": "~41.0.2",                                             // [parent D8]
    "electron-vite": "^5.0.0",
    "electron-builder": "^26.9.0",
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/utils": "^3.0.0",
    "@electron-toolkit/tsconfig": "^1.0.0",
    "electron-log": "^5.0.0",
    "@sentry/electron": "^7.11.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.48.0",
    "playwright": "^1.48.0",
    "electron-playwright-helpers": "^1.7.0",
    "zod": "^3.23.0",
    "typescript": "~5.5.0",
    "@biomejs/biome": "^1.9.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0"
  }
}
```

Script names `test:e2e:packaged` / `test:e2e:unpackaged` and env-var `DESKTOP_E2E_APP_MODE` kept verbatim from GitHub Desktop `package.json` so agents trained on that corpus recognize them [S4].

### TypeScript config

`tsconfig.base.json` (strict):

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "composite": true                                 // required for project refs [S9]
  }
}
```

`tsconfig.json` (solution file):

```jsonc
{
  "files": [],
  "references": [
    { "path": "./tsconfig.shared.json" },
    { "path": "./tsconfig.main.json" },
    { "path": "./tsconfig.preload.json" },
    { "path": "./tsconfig.renderer.json" },
    { "path": "./tsconfig.utility.json" }
  ]
}
```

Per-process tsconfigs extend `@electron-toolkit/tsconfig` presets [S3]:
- `tsconfig.main.json` → `@electron-toolkit/tsconfig/tsconfig.node.json`, includes `src/main/**`, references shared.
- `tsconfig.renderer.json` → `@electron-toolkit/tsconfig/tsconfig.web.json`, lib `["ES2024","DOM","DOM.Iterable"]`, **`"types": []`** (no `node`).
- `tsconfig.preload.json` → node base + DOM lib (preload sees both).
- `tsconfig.utility.json` → node base, no DOM.
- `tsconfig.shared.json` → env-agnostic, lib `["ES2024"]`.

**Compile-time enforcement:** renderer importing `fs` fails at typecheck, not runtime. Parent D1: "build-time enforcement turns wrong-layer imports from runtime errors into typecheck errors — agents see the feedback 10-100× faster."

### Typed IPC layer

Baseline: hand-rolled discriminated-union channel map + typed wrappers + custom ESLint rule — GitHub Desktop pattern ported verbatim. See FU-3 for scale-specific overrides.

**`src/shared/ipc-shared.ts`** (pattern from Desktop `app/src/lib/ipc-shared.ts:23-90`) [S5]:

```ts
export type RequestChannels = {
  'window-minimize': () => void;
  'menu-event': (name: MenuEvent) => void;
  'log': (level: LogLevel, message: string) => void;
};

export type RequestResponseChannels = {
  'get-app-path': (kind: PathKind) => Promise<string>;
  'save-file': (p: SaveFilePayload) => Promise<{ ok: true; path: string } | { ok: false; reason: string }>;
};
```

**`src/renderer/ipc-renderer.ts`** (pattern from Desktop `app/src/lib/ipc-renderer.ts:1-60`) [S5]:

```ts
import { RequestChannels, RequestResponseChannels } from '../shared/ipc-shared';
// eslint-disable-next-line no-restricted-imports
import { ipcRenderer, IpcRendererEvent } from 'electron';

export function invoke<T extends keyof RequestResponseChannels>(
  channel: T,
  ...args: Parameters<RequestResponseChannels[T]>
): ReturnType<RequestResponseChannels[T]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<RequestResponseChannels[T]>;
}

export function send<T extends keyof RequestChannels>(
  channel: T, ...args: Parameters<RequestChannels[T]>
): void { ipcRenderer.send(channel, ...args); }

export function on<T extends keyof RequestChannels>(
  channel: T,
  listener: (ev: IpcRendererEvent, ...args: Parameters<RequestChannels[T]>) => void,
): () => void {
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.off(channel, listener as never);
}
```

**`src/main/ipc-webcontents.ts`** — gated by `no-loosely-typed-webcontents-ipc` [S6]:

```ts
import { WebContents } from 'electron';
import { RequestChannels } from '../shared/ipc-shared';

export function sendToRenderer<T extends keyof RequestChannels>(
  wc: WebContents, channel: T, ...args: Parameters<RequestChannels[T]>
): void {
  wc.send(channel, ...args);  // only place bare wc.send is allowed (lint allowlist)
}
```

**Optional Zod validation at boundary** [S11]. `src/shared/schemas.ts` maps `keyof RequestResponseChannels` → Zod schema; `ipcMain.handle` wrappers call `schema.parse(payload)` before dispatch. Runtime validation only at the process boundary; business logic consumes parsed data. Addresses parent D9 "schema validation at boundary is non-negotiable" without tRPC opacity.

**Why not tRPC-over-IPC in baseline:** for <20 channels, grep-able channel names + no bundle overhead + no opaque envelope win. Parent D9 + FU-3 both land the same default. Revisit trigger in exclusions table.

### Preload bridge

`src/preload/index.ts` layers on `@electron-toolkit/preload` [S3]:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { RequestResponseChannels } from '../shared/ipc-shared';

const api = {
  invoke<T extends keyof RequestResponseChannels>(
    channel: T, ...args: Parameters<RequestResponseChannels[T]>
  ): ReturnType<RequestResponseChannels[T]> {
    return ipcRenderer.invoke(channel, ...args) as ReturnType<RequestResponseChannels[T]>;
  },
} as const;

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI);
  contextBridge.exposeInMainWorld('api', api);
}
export type Api = typeof api;
```

`src/shared/global.d.ts`:

```ts
import type { ElectronAPI } from '@electron-toolkit/preload';
import type { Api } from '../preload';
declare global {
  interface Window { electron: ElectronAPI; api: Api; }
}
```

Renderer callsites get `window.api.invoke('save-file', payload)` with full IntelliSense on channel name + payload shape.

### Test harness

- **Unit (`tests/unit/*.test.ts`):** Vitest; Bun test acceptable. Main-process code DI'd — no `vi.mock('electron')` (parent D3 cites as fragile).
- **Integration (`tests/e2e/*.e2e.ts`):** Playwright-for-Electron; canonical `findLatestBuild()` + `parseElectronApp()` + `electron.launch(...)` via `electron-playwright-helpers` [parent E3].
- **Tier switch:** one `playwright.config.ts` reads `DESKTOP_E2E_APP_MODE`. `packaged` → `executablePath` = `electron-builder --dir` output. `unpackaged` → `node_modules/.bin/electron` + `args: ['out/main/index.js']` [S7][parent D4].
- **Per-test userData isolation** (parent D7, the sharpest gotcha): worker-scoped fixture creates `fs.mkdtempSync()` tempdir, passes `env: { ELECTRON_USER_DATA: tmpdir }`; `src/main/userdata-isolation.ts` reads before `app.whenReady()`:

```ts
import { app } from 'electron';
const override = process.env.ELECTRON_USER_DATA;
if (override) app.setPath('userData', override);
```

Teardown calls `electronApp.evaluate(({ app }) => app.exit(0))` — parent Pattern 4.

### ESLint rules (5 custom + standard)

Port GitHub Desktop's `eslint-rules/` verbatim where possible [S5][S6]:

1. **`no-loosely-typed-webcontents-ipc`** — flags `webContents.send`, `*.webContents.send`, `wc.send`. Force `sendToRenderer()`. Verbatim from `~/.claude/oss-repos/desktop/eslint-rules/no-loosely-typed-webcontents-ipc.js` [S6] (63-line source).
2. **`no-ipc-main-bare-import`** — `no-restricted-imports` pattern: ban `import { ipcMain }` outside `src/main/ipc-main.ts`.
3. **`no-ipc-renderer-bare-import`** — symmetric: ban `ipcRenderer` outside `src/renderer/ipc-renderer.ts` and `src/preload/`.
4. **`no-context-isolation-false`** — flags `contextIsolation: false` in `BrowserWindow` webPreferences. Parent D10: no maintained packaged rule covers this.
5. **`no-node-integration-true`** — flags `nodeIntegration: true`.

**Plus @typescript-eslint rules keyed to error:** `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-return`, `no-unsafe-call`, `no-unsafe-member-access`. Turns `as any` into a lint failure — typed-by-default preference surfaced at the linter.

**Biome v2 complements ESLint** per parent D10: Biome for format + baseline speed, ESLint for custom Electron rules.

### Logging

`electron-log` with JSON formatter [parent D5]:

```ts
import log from 'electron-log/main';
log.transports.file.format = (msg) => JSON.stringify({
  level: msg.level, ts: msg.date.toISOString(),
  proc: msg.variables?.processType ?? 'main',
  msg: msg.data.join(' '),
});
log.initialize({ preload: true });
```

**Renderer → main console bridging** via `webContents.on('console-message', ...)` in every dev/test BrowserWindow. Parent D5: "Free; fixes half the renderer-blindness problem."

### Crash reporting

Sentry three-module split [parent D6]: `@sentry/electron/main` in `src/main/index.ts`, `@sentry/electron/renderer` in `src/renderer/index.tsx`, `@sentry/electron/utility` in `src/utility/*.ts`. Single DSN; events route through main. Opt-in via config gate. Sourcemaps uploaded via `sentry-cli releases upload-sourcemaps` in `release.yml` after `build:prod`.

### CI matrix (GitHub Actions)

Adapted from GitHub Desktop `ci.yml:213-266` [parent D2]:

```yaml
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
  smoke:
    needs: lint-typecheck
    strategy:
      fail-fast: false
      matrix:
        os: [macos-14-xlarge, windows-2022, ubuntu-22.04]
        arch: [x64, arm64]
        exclude: [{ os: ubuntu-22.04, arch: arm64 }]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/electron
            ~/.cache/electron-builder
            ~/.electron-gyp
          key: electron-${{ runner.os }}-${{ hashFiles('bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bun run rebuild
      - run: bun run build:dir
      - if: runner.os == 'Linux'
        run: sudo apt-get install -y xvfb && xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" -- bun run test:e2e:packaged
      - if: runner.os != 'Linux'
        run: bun run test:e2e:packaged
```

### Hot-reload

`electron-vite dev --watch` [S1]. Parent E1: main change → restart (~1-3s); preload change → rebuild + reload renderer; renderer change → Vite HMR (<100ms). Main-process minimality is architectural pressure — `src/main/index.ts` stays thin (window mgmt, menu, IPC wire-up); heavy work goes to `src/utility/*` or preload.

**Utility-process HMR:** unaddressed by all frameworks (parent E1 Remaining uncertainty; see FU-1 for synthesis of the DIY supervisor pattern). Baseline skeleton does not include; graduates from FU-1 if the supervisor pattern matures.

### Headless CI

Linux: `xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" -- <cmd>` [parent E2]. macOS/Windows: no wrapper. Pin `ubuntu-22.04` or use `npx playwright install --with-deps` (parent D7 hazard: Ubuntu 24.04 rollover broke `_electron.launch()` without deps in early 2026).

### AGENTS.md / CLAUDE.md

Highest-leverage agent-first artifact. Parent D8: lock toolchain choice at repo top so config shape is unambiguous on first read.

```md
# Agent notes

## Toolchain (LOCKED)
- Electron ~41.0.2 — Node 24.14.0, Chromium 146
- electron-vite v5 — `electron.vite.config.ts`, three sections (main/preload/renderer)
- electron-builder v26 — `electron-builder.yml`, not forge.config.ts
- Bun 1.3+ as package manager and test runner
- Playwright-for-Electron v1.48+; Spectron deprecated, do not suggest

## Quality gate
`bun run check` — lint + typecheck + unit + e2e:unpackaged. Run after every iteration.

## Test tiers
- `bun run test` — unit (Vitest)
- `bun run test:e2e:unpackaged` — fast E2E (against out/main/index.js)
- `bun run test:e2e:packaged` — slow E2E (against electron-builder --dir output)
- Tier switch via DESKTOP_E2E_APP_MODE=packaged|unpackaged

## Logging
JSON-lines to stdout. Renderer bridged via webContents.on('console-message'), see src/main/logging.ts.

## IPC
All renderer→main: `invoke` from src/renderer/ipc-renderer.ts — typed via RequestResponseChannels in src/shared/ipc-shared.ts.
NEVER import ipcRenderer / ipcMain directly outside src/{main,renderer,preload}/ipc-*.ts. Lint fails.
NEVER call webContents.send directly. Use sendToRenderer() from src/main/ipc-webcontents.ts.

## Parallel agents
Each Playwright worker gets its own ELECTRON_USER_DATA tempdir — see tests/e2e/fixtures/userdata.ts.

## Machine-parseable outputs
- `tsc --pretty false`
- `eslint --format json --output-file out/eslint.json`
- `playwright test --reporter=json,junit`
- `vitest --reporter=json --outputFile=out/unit.json`
```

`CLAUDE.md` symlinks to `AGENTS.md` (or duplicates if symlinks break on Windows clones).

---

## What this skeleton excludes (with reasons)

| Excluded | Why | Revisit trigger |
|---|---|---|
| tRPC-over-IPC | Opacity — single `trpc` envelope hides channel names in DevTools + logs [parent D9 + FU-3]. <20 channels, hand-rolled wins per LOC. | Channel count >20; streaming/subscription surface; compliance demanding Zod-at-boundary across all channels (per FU-3 matrix). |
| ElectroNG | Paid; Electronegativity (free predecessor) unmaintained since 2022 [parent D10]. | Never. |
| Spectron | Formally deprecated 2022-02-01 [parent D3]. | Never. |
| Offscreen as "headless" | Parent E2 — offscreen is rendering-to-texture; Electron still needs display driver on Linux. | Never for headless. |
| Utility-process HMR | Parent E1 unaddressed by any framework. DIY shim ~100 LOC (FU-1 synthesis). | FU-1 supervisor pattern matures into a published plugin. |
| Webpack | Agent-training data cleaner for electron-vite; parent Pattern 1 relies on single `electron.vite.config.ts`. | Team has deep Webpack investment. |
| electron-forge as packager | Parent D8 — `@electron-forge/plugin-vite` experimental, shipped undocumented breaking changes. electron-builder v26 mature. | Forge Vite plugin stable + ASAR integrity digest lands. |
| Node integration in renderer | Security + parent D1 layer discipline. Renderer has no `types: ["node"]`. | Never. |
| Class instances across contextBridge | Parent D9 — structured-clone strips prototypes. | Never; architectural invariant. |

---

## Typing discipline checklist

| Boundary | Schema location | Typed surface | Compile-time failure |
|---|---|---|---|
| Renderer↔main IPC (invoke) | `src/shared/ipc-shared.ts` `RequestResponseChannels` | `invoke('channel', payload)` | Wrong channel → `keyof` miss; wrong payload → `Parameters<>` miss; wrong return → `ReturnType<>` miss [S5]. |
| Renderer↔main IPC (send/on) | `RequestChannels` | `send(…)` / `on(…)` | Same [S5]. |
| Preload↔renderer global | `src/shared/global.d.ts` | `window.api.invoke(...)` | Undefined surface → TS error [S3]. |
| Menu actions | `MenuEvent` enum | typed methods (parent OQ-C preference) | String not in union → TS error. |
| App config | `src/shared/config-schema.ts` Zod | `z.infer<typeof ConfigSchema>` | Missing key → TS error; bad runtime value → Zod throw at boundary. |
| Main→renderer IPC (main side) | `src/main/ipc-webcontents.ts` | `sendToRenderer(wc, …)` | Lint: `no-loosely-typed-webcontents-ipc` bans bare `wc.send(...)` [S6]. |
| Main↔utility | `src/shared/utility-protocol.ts` | typed `postMessage` | Same pattern. |
| Per-process lib boundary | per-process `tsconfig.*.json` | `import { readFileSync } from 'fs'` in renderer | TS: `Cannot find module 'fs'` (no `types: ["node"]`) [S9][S10]. |
| Unsafe TS escape hatches | `eslint.config.js` | — | Lint: `@typescript-eslint/no-unsafe-*: error` on any `as any`. |

---

## Agent affordances baked in

1. Directory-as-process-boundary — five conventions on one axis [parent Pattern 1].
2. Toolchain-lock at repo root (AGENTS.md + CLAUDE.md) removes electron-vite-vs-Forge ambiguity [parent D8].
3. Machine-parseable output on every gate; `out/` collects JSON reports [parent D10].
4. One canonical quality gate `bun run check`.
5. Tier-switched E2E via one env var (`DESKTOP_E2E_APP_MODE`) [S7][parent D4].
6. Per-test `userData` isolation via `ELECTRON_USER_DATA` + `app.setPath` — parallel agents don't collide [parent D7].
7. Typed IPC with grep-able channel names — `rg "'save-file'"` finds all uses [S5].
8. Typed menu actions — no string-discriminated single-channel indirection.
9. Renderer-to-main log bridge via `webContents.on('console-message', …)` [parent D5].
10. JSON-lines logs — `jq`-friendly, not ANSI soup [parent D5].
11. Packaged-smoke CI gate — catches ~65-75% of dev-green/prod-red regressions per FU-2 taxonomy in <2 min/cell [parent D4 + FU-2].
12. Worker-scoped Playwright fixtures — real main + real renderer + real IPC in one file [parent E3].
13. `eslint-rules/` checked-in, not a dep — agents can read and extend [S5].
14. Biome + ESLint split: Biome for format + baseline speed, ESLint for custom Electron rules [parent D10].
15. Zero reliance on deprecated tooling (Spectron, Electronegativity, Webpack).

---

## Primary-source citations per decision

- **[S1]** electron-vite docs — https://electron-vite.org/guide/
- **[S2]** electron-vite-boilerplate — https://github.com/electron-vite/electron-vite-boilerplate
- **[S3]** @electron-toolkit — https://github.com/alex8088/electron-toolkit
- **[S4]** GitHub Desktop `package.json` — `~/.claude/oss-repos/desktop/package.json`
- **[S5]** Desktop `app/src/lib/ipc-shared.ts:23-90`, `app/src/lib/ipc-renderer.ts:1-60`
- **[S6]** Desktop `eslint-rules/no-loosely-typed-webcontents-ipc.js` — 63-line verbatim-portable rule
- **[S7]** Desktop `app/test/e2e/playwright.config.ts` + `package.json` scripts
- **[S8]** TS handbook — https://www.typescriptlang.org/tsconfig
- **[S9]** TS project references — https://www.typescriptlang.org/docs/handbook/project-references.html
- **[S10]** Electron process model — https://www.electronjs.org/docs/latest/tutorial/process-model
- **[S11]** Zod — https://zod.dev
- **[S12]** https://github.com/electron-vite/electron-vite-react
- **[S13]** https://github.com/electron-react-boilerplate/electron-react-boilerplate
- **[S14]** https://github.com/electron/forge/tree/main/packages/template
- **[S15]** https://github.com/hokein/electron-sample-apps
- **[parent D1–D10, E1–E3]** — resolves to dimensions in parent `REPORT.md`

---

## UNRESOLVED / NOT FOUND

- **Utility-process HMR shim maturing into a published plugin** — FU-1 synthesis only; no maintained library.
- **Canonical tsconfig template for Electron project refs** — parent D1 "no canonical template." This skeleton's split is synthesis, not citation.
- **Measured reload latencies** per process per OS — parent E1 open.
- **Max parallel Playwright-for-Electron workers** — parent D7 anecdotal (2-4 on `ubuntu-latest`).
- **Exact Electron version** for Claude Desktop / Cursor / Slack / Linear — parent D8 open.
- **electron-forge plugin-vite stability date** — parent D8 "experimental, shipped undocumented breaking changes."
- **ASAR integrity digest in Forge** — parent D8 "planned per 41 blog — not landed."

---

## References

### Primary sources (clone-and-read, first-party docs)

- GitHub Desktop on disk — `~/.claude/oss-repos/desktop/` — `app/src/lib/ipc-shared.ts`, `app/src/lib/ipc-renderer.ts`, `eslint-rules/*.js`, `package.json`, `app/test/e2e/playwright.config.ts`.
- electron-vite — https://electron-vite.org/
- electron-vite-react — https://github.com/electron-vite/electron-vite-react
- electron-vite-boilerplate — https://github.com/electron-vite/electron-vite-boilerplate
- electron-react-boilerplate — https://github.com/electron-react-boilerplate/electron-react-boilerplate
- electron-forge templates — https://github.com/electron/forge/tree/main/packages/template
- electron-toolkit — https://github.com/alex8088/electron-toolkit
- electron-sample-apps — https://github.com/hokein/electron-sample-apps
- electron-playwright-helpers — https://github.com/spaceagetv/electron-playwright-helpers
- electron-log — https://github.com/megahertz/electron-log
- @sentry/electron — https://github.com/getsentry/sentry-electron
- TS project references — https://www.typescriptlang.org/docs/handbook/project-references.html

### Parent + sibling fanouts

- Parent — `reports/electron-ai-coding-agent-development/REPORT.md`
- FU-1 — `fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/`
- FU-2 — `fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/`
- FU-3 — `fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/`
