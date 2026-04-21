---
title: "Electron desktop app — repo integration design"
date: 2026-04-15
consumes:
  - reports/electron-ai-coding-agent-development/REPORT.md
  - reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md
  - reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md
scope: 1P — maps 3P research skeleton onto Open Knowledge's actual monorepo at baseline f17ad00
status: design-draft
---

# Electron desktop app — repo integration design

Maps the FU-4 agent-first skeleton onto Open Knowledge's existing Bun + turbo + Biome monorepo. 1P concrete design; the upstream research stays portable. Greenfield — existing structure is modifiable where it makes integration cleaner.

## 1. Baseline facts (what we have today)

From `/Users/edwingomezcuellar/projects/open-knowledge/package.json` and `turbo.json` at commit `f17ad00`:

- **Package manager:** Bun `1.3.11` (engines-enforced). No pnpm.
- **Workspaces:** `packages/*` + `docs` (root `package.json#workspaces`).
- **Build orchestrator:** Turbo `^2.7.0`. Tasks: `build`, `typecheck`, `test`, `test:integration`, `test:conversion`, `test:fidelity`, `test:stress:*`, `test:fuzz`, `test:e2e`.
- **Linter:** Biome `^2.4.10`. No ESLint in the repo. Root `lint` = `biome check packages docs package.json turbo.json tsconfig.json biome.jsonc --error-on-warnings`.
- **Packages:**
  - `@inkeep/open-knowledge-core` (private) — shared extensions, schema, utils
  - `@inkeep/open-knowledge-server` (private) — Hocuspocus server library, `createServer()` exports
  - `@inkeep/open-knowledge` (published) — CLI, `bin: { open-knowledge: ./dist/cli.mjs }`, tsdown-bundled
  - `open-knowledge-app` (private) — React editor, Vite-built, no library `exports` (just produces `dist/`)
  - `open-knowledge-plugin` (private, near-empty)
- **CLI bundling policy** (`packages/cli/tsdown.config.ts`):
  - `alwaysBundle: ['@inkeep/open-knowledge-core', '@inkeep/open-knowledge-server']`
  - `neverBundle: ['@parcel/watcher', 'chokidar', 'simple-git']`
- **CLI ↔ App glue:** CLI's `start.ts:97-113` resolves asset path for the React bundle at `cliDir/public` (npm-installed) or `../../app/dist` (monorepo dev). `packages/cli/scripts/build:assets` runs `cp -r ../app/dist dist/public` after tsdown. This is the zero-config-bunx T1 shared-bundle pattern.
- **CI:** `.github/workflows/ci.yml` runs `lint` (ubuntu) → `test` matrix (ubuntu, `bun install --frozen-lockfile` + `bunx turbo run <task>`) → `playwright` (ubuntu). No per-platform matrix today. Turbo cache via `actions/cache` on `.turbo/`.
- **No tsconfig project references.** Each package has its own `tsconfig.json`; root has one; they aren't wired as a solution.
- **CLAUDE.md at repo root** already exists, substantial (~1200 lines) with architectural precedents and package docs.

## 2. What changes

**Scope of the change:** add one new package + wire it into the existing build graph + add one CI job + a handful of root-file extensions. No existing package is restructured. Existing tests, existing CLI flow, existing dev server (`cd packages/app && bun run dev`) all continue to work unchanged.

### 2.1 New package: `packages/desktop/`

Name: `@inkeep/open-knowledge-desktop` (private — it's an app artifact, not a library).

Layout mirrors FU-4 adapted to OK's reality:

```
packages/desktop/
├── package.json
├── electron.vite.config.ts            # one config, three sections
├── electron-builder.yml               # packaging + signing + updater
├── tsconfig.json                      # solution file: references per-process tsconfigs
├── tsconfig.main.json                 # node base, ES2024, node types
├── tsconfig.preload.json              # node + DOM lib
├── tsconfig.renderer.json             # DOM lib, no node types — thin; app lives elsewhere
├── tsconfig.utility.json              # node base (utility may import @inkeep/open-knowledge-server)
├── tsconfig.shared.json               # env-agnostic
├── build/
│   ├── entitlements.mac.plist         # macOS hardened-runtime entitlements
│   └── icon.icns / icon.ico           # app icons
├── src/
│   ├── main/
│   │   ├── index.ts                   # Electron entrypoint: BrowserWindow lifecycle, menu, auto-update
│   │   ├── ipc-main.ts                # typed ipcMain.handle wrappers
│   │   ├── ipc-webcontents.ts         # typed webContents.send wrappers
│   │   ├── menu.ts                    # typed MenuEvent enum (addresses OQ-C from spec)
│   │   ├── logging.ts                 # electron-log + JSON formatter, renderer console bridge
│   │   ├── userdata-isolation.ts      # ELECTRON_USER_DATA → app.setPath, before app.whenReady()
│   │   ├── windows/
│   │   │   ├── project-navigator.ts   # 3-card empty state (per clone-from-github spec)
│   │   │   └── project-window.ts      # per-project BrowserWindow + utilityProcess wiring
│   │   └── update/
│   │       └── updater.ts             # electron-updater install-on-quit
│   ├── preload/
│   │   └── index.ts                   # contextBridge.exposeInMainWorld('api', {...})
│   ├── renderer/
│   │   └── index.html                 # thin shell — loads packages/app's built bundle from extraResources
│   ├── utility/
│   │   └── server-entry.ts            # utilityProcess entrypoint: imports createServer from @inkeep/open-knowledge-server
│   └── shared/
│       ├── ipc-shared.ts              # RequestChannels, RequestResponseChannels (hand-rolled discriminated union)
│       ├── schemas.ts                 # Zod schemas at boundary (optional per channel)
│       ├── global.d.ts                # declare global { Window.api: Api }
│       └── paths.ts                   # typed Paths module: getUserDataPath, getResourcePath, etc.
└── tests/
    ├── unit/*.test.ts                 # Vitest/Bun, DI'd main code
    ├── e2e/
    │   ├── playwright.config.ts       # reads DESKTOP_E2E_APP_MODE
    │   ├── fixtures/
    │   │   ├── userdata.ts            # worker-scoped tempdir via ELECTRON_USER_DATA
    │   │   └── app.ts                 # electron-playwright-helpers wrapper
    │   └── *.e2e.ts                   # app-launch, new-project, switch-project, clone-from-github, etc.
    └── integration/
        └── ipc-contract.test.ts       # validates RequestChannels against shared/schemas
```

**Key point: `renderer/index.html` is a thin shell.** The actual React app is `packages/app/` — its Vite build output (`packages/app/dist/`, or `packages/cli/dist/public/` in the shared-bundle pattern) is copied into the Electron app as `extraResources`. Main-process `mainWindow.loadFile()` points at the copied `index.html`. This means:

1. **Zero renderer code duplication.** The desktop app doesn't re-implement the React editor; it reuses `packages/app/`'s existing Vite-built bundle via the same pattern the CLI already uses.
2. **electron-vite builds only main + preload + utility** — not renderer. `packages/app/`'s Vite build is kept separate and consumed as an artifact. electron-vite's `renderer` section still runs for any tiny shell HTML in `packages/desktop/src/renderer/`.
3. **The renderer connects to its utilityProcess over localhost WebSocket** as in the Electron spec §8.4, receiving `wsPort` via preload bridge. The existing `ProviderPool` accepts explicit `wsUrl`; `SystemDocSubscriber` likewise.

### 2.2 Root `package.json` workspace — no changes needed

`"workspaces": ["packages/*", "docs"]` already picks up `packages/desktop/`. No edit.

**Add to root `scripts`** (delegates to turbo, same pattern as existing scripts):

```jsonc
{
  "scripts": {
    "build:desktop": "turbo run build:desktop",
    "build:desktop:dir": "turbo run build:desktop:dir",
    "check:desktop": "turbo run lint typecheck test:e2e:unpackaged --filter=@inkeep/open-knowledge-desktop"
  }
}
```

### 2.3 `turbo.json` — add 6 tasks

```jsonc
{
  "tasks": {
    // ... existing ...
    "build:desktop": {
      "dependsOn": ["^build", "@inkeep/open-knowledge#build"],
      "outputs": ["out/**", "dist/**"]
    },
    "build:desktop:dir": {
      "dependsOn": ["build:desktop"],
      "outputs": ["dist-desktop/**"],
      "env": ["ELECTRON_CACHE", "ELECTRON_MIRROR"]
    },
    "build:desktop:release": {
      "dependsOn": ["build:desktop"],
      "outputs": ["dist-desktop/**"],
      "env": [
        "ELECTRON_CACHE", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD",
        "APPLE_TEAM_ID", "AZURE_TENANT_ID", "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET", "GH_TOKEN"
      ]
    },
    "rebuild:native": {
      "cache": false,
      "dependsOn": []
    },
    "test:e2e:unpackaged": {
      "dependsOn": ["build:desktop"],
      "cache": false,
      "env": ["DESKTOP_E2E_APP_MODE", "ELECTRON_USER_DATA"]
    },
    "test:e2e:packaged": {
      "dependsOn": ["build:desktop:dir"],
      "cache": false,
      "env": ["DESKTOP_E2E_APP_MODE", "ELECTRON_USER_DATA"]
    }
  }
}
```

**The load-bearing dep:** `build:desktop` depends on `@inkeep/open-knowledge#build` explicitly. The CLI's `build:assets` script already runs `cp -r ../app/dist dist/public` — so by depending on the CLI's build, the desktop build inherits a freshly-copied React bundle at `packages/cli/dist/public/`, which electron-builder then picks up via `files:`.

### 2.4 `packages/desktop/package.json`

```jsonc
{
  "name": "@inkeep/open-knowledge-desktop",
  "private": true,
  "type": "module",
  "version": "0.0.1",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev --watch",
    "build": "electron-vite build && tsc -b --noEmit --pretty false",
    "build:dir": "bun run build && electron-builder --dir",
    "build:release": "bun run build && electron-builder --publish onTagOrDraft",
    "rebuild:native": "electron-builder install-app-deps",
    "typecheck": "tsc -b --noEmit --pretty false",
    "test:e2e:unpackaged": "bun run build && DESKTOP_E2E_APP_MODE=unpackaged playwright test --reporter=json,junit",
    "test:e2e:packaged": "bun run build:dir && DESKTOP_E2E_APP_MODE=packaged playwright test --reporter=json,junit"
  },
  "dependencies": {
    "@inkeep/open-knowledge-core": "workspace:*",
    "@inkeep/open-knowledge-server": "workspace:*",
    "electron-log": "^5.0.0",
    "electron-updater": "^6.3.0",
    "@sentry/electron": "^7.11.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "electron": "~41.0.2",
    "electron-vite": "^5.0.0",
    "electron-builder": "^26.9.0",
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/utils": "^3.0.0",
    "@electron-toolkit/tsconfig": "^1.0.0",
    "@electron/fuses": "^2.1.1",
    "@electron/notarize": "^3.1.1",
    "@electron/rebuild": "^4.0.3",
    "@playwright/test": "^1.48.0",
    "playwright": "^1.48.0",
    "electron-playwright-helpers": "^1.7.0"
  },
  "build": {
    "directories": {
      "buildResources": "build",
      "output": "dist-desktop"
    }
  }
}
```

**Workspace dependency graph:** `@inkeep/open-knowledge-desktop` depends on `@inkeep/open-knowledge-core` + `@inkeep/open-knowledge-server` (both `workspace:*`). Turbo's `^build` traverses this automatically. The CLI is NOT a dep — Electron spawns `createServer()` directly from `@inkeep/open-knowledge-server` inside `utilityProcess`. The CLI is consumed only for its built React bundle (`packages/cli/dist/public/`) at electron-builder `files:` time.

### 2.5 `packages/desktop/electron.vite.config.ts`

```ts
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: 'inline',  // prod sourcemaps uploaded to Sentry separately
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        output: { format: 'es' },
      },
    },
    resolve: {
      alias: {
        '@/shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'es' },
      },
    },
  },
  // Renderer is intentionally minimal — the real React app is packages/app/,
  // consumed as extraResources from packages/cli/dist/public/. This renderer
  // section exists for any desktop-only shell HTML (e.g., a loading splash
  // or a trust-pending banner overlay). If no desktop-shell HTML is needed,
  // point directly at the cli/dist/public index.html via mainWindow.loadFile.
  renderer: {
    build: {
      sourcemap: 'inline',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
```

**Note on the utility process:** electron-vite's built-in three-section config does NOT have a dedicated `utility` section. Per FU-1, utility-process bundling uses the `?modulePath` import suffix + `externalizeDepsPlugin()`. The utility entry `src/utility/server-entry.ts` is referenced from `src/main/windows/project-window.ts` via:

```ts
import serverEntryPath from '../../utility/server-entry?modulePath';
const child = utilityProcess.fork(serverEntryPath);
```

electron-vite rebuilds it via its dep graph. Reload on change = full main-process restart (per FU-1's unresolved-by-any-framework status).

### 2.6 `packages/desktop/electron-builder.yml`

```yaml
appId: com.inkeep.open-knowledge
productName: Open Knowledge
copyright: Copyright © 2026 Inkeep

directories:
  output: dist-desktop
  buildResources: build

# Core-assert: the CLI's build:assets step produces packages/cli/dist/public/
# (Vite build of packages/app/, copied by `cp -r ../app/dist dist/public`).
# We consume that output directly — no separate renderer build for the app.
files:
  - "out/**/*"                                     # electron-vite output (main, preload, any shell HTML)
  - "!**/*.map"                                    # sourcemaps uploaded to Sentry, not shipped
  # Workspace deps are node_modules via Bun workspaces; electron-builder picks them up automatically

extraResources:
  - from: "../cli/dist/public"                     # Shared React bundle from zero-config-bunx T1
    to: "app"
    filter: ["**/*"]

asarUnpack:
  - "**/*.node"
  - "**/@parcel/watcher/**"
  - "**/@parcel/watcher-*/**"                      # platform-specific sibling packages
  - "**/simple-git/**"                             # shells to git binary; keep unpacked for path resolution

mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [arm64, x64]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: ${env.APPLE_TEAM_ID}

win:
  target:
    - target: nsis
      arch: [x64, arm64]
  # Azure Trusted Signing (per FU-2, parent §D8) — requires US/Canada eligibility
  azureSignOptions:
    publisherName: "Inkeep, Inc."
    endpoint: "https://eus.codesigning.azure.net/"
    codeSigningAccountName: ${env.AZURE_CS_ACCOUNT}
    certificateProfileName: ${env.AZURE_CS_PROFILE}

linux:
  target:
    - target: AppImage
      arch: [x64, arm64]
  category: Office

# Electron 41 fuses — close CVE-2025-55305 attack surface
electronFuses:
  runAsNode: false
  enableCookieEncryption: true
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: true               # REQUIRED for Playwright _electron.launch
  enableEmbeddedAsarIntegrityValidation: true       # CVE-2025-55305 mitigation
  onlyLoadAppFromAsar: true                         # pair with above
  loadBrowserProcessSpecificV8Snapshot: false
  grantFileProtocolExtraPrivileges: false

publish:
  provider: github
  owner: inkeep
  repo: open-knowledge
  releaseType: release
```

### 2.7 tsconfig project references

OK doesn't use these today at the root level. We introduce them only inside `packages/desktop/` — the rest of the monorepo continues with its current per-package setup. Scoped introduction, no risk to other packages.

`packages/desktop/tsconfig.json` (solution file):

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

`packages/desktop/tsconfig.base.json` (the strict base):

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
    "composite": true
  }
}
```

Per-process tsconfigs extend `@electron-toolkit/tsconfig` presets plus `./tsconfig.base.json`. Renderer tsconfig deliberately sets `"types": []` so `import 'fs'` fails at typecheck in renderer code.

### 2.8 Biome vs the 5 custom ESLint rules — the one real tension

FU-4 specifies 5 custom ESLint rules (`no-loosely-typed-webcontents-ipc`, `no-ipc-main-bare-import`, `no-ipc-renderer-bare-import`, `no-context-isolation-false`, `no-node-integration-true`). OK uses Biome v2 and no ESLint.

**Options, ranked:**

1. **Biome-only + `no-restricted-imports` equivalent** (RECOMMENDED for rules 2, 3, 4, 5). Biome v2 supports `noRestrictedImports` which covers the import-ban rules. Biome also supports `noRestrictedGlobals` and GritQL-based custom rules as of 2.x. Rule 1 (`no-loosely-typed-webcontents-ipc`) needs GritQL or a linter escape — see option 2.

2. **Biome for baseline + tiny ESLint setup scoped to `packages/desktop/` only** for the one rule Biome can't express. Add `eslint` + `@typescript-eslint` as desktop-only devDeps; root `bun run lint` still uses Biome; `packages/desktop/package.json` adds `"lint": "eslint eslint-rules src --rulesdir eslint-rules/"` as a scoped step. ESLint runs only inside `packages/desktop/`, doesn't pollute the root.

3. **Convention-only + CI grep assertion** for the loosely-typed `webContents.send` pattern. Add a CI step: `! git grep -n 'webContents\.send\|\.webContents\?\.send' packages/desktop/src --and --not -e '// allowlist: ipc-webcontents'`. Ugly but zero new deps.

**Lean: Option 1 + Option 2 hybrid.** Use Biome for everything Biome can express (rules 2, 3, 4, 5 via `noRestrictedImports` + GritQL for typeof-shape checks); add a single ESLint rule file for rule 1 in `packages/desktop/eslint-rules/no-loosely-typed-webcontents-ipc.js` run by Biome's external-linter plugin OR a tiny ESLint CLI invocation. Research needed at implementation time on Biome v2 GritQL custom rule capability vs. Option 2 fallback. Open question for the Electron spec §OQ-C.

**Biome config addition** (`biome.jsonc` root or `packages/desktop/biome.jsonc` override):

```jsonc
{
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": [
              {
                "name": "electron",
                "importNames": ["ipcRenderer", "ipcMain"],
                "message": "Import typed wrappers from src/{main,renderer,preload}/ipc-*.ts; never bare ipcMain/ipcRenderer."
              }
            ]
          }
        }
      }
    },
    "overrides": [
      {
        "includes": [
          "packages/desktop/src/main/ipc-main.ts",
          "packages/desktop/src/renderer/ipc-renderer.ts",
          "packages/desktop/src/preload/index.ts"
        ],
        "linter": {
          "rules": {
            "style": {
              "noRestrictedImports": "off"
            }
          }
        }
      }
    ]
  }
}
```

### 2.9 Typed IPC layer — hand-rolled channel map (per FU-3 scale-match)

OK's Electron app will start with <20 channels (per FU-4 scale recommendation + user preference for minimal deps + best observability). If channel count grows past 20, FU-3 matrix suggests migration to `@electron-toolkit/typed-ipc`.

`packages/desktop/src/shared/ipc-shared.ts`:

```ts
import type { z } from 'zod';
import type { MenuEvent } from '../main/menu';

export type RequestChannels = {
  'menu:action': (event: MenuEvent) => void;
  'window:minimize': () => void;
  'window:maximize': () => void;
  'project:switching': (payload: { contentDir: string }) => void;
  'project:switched': (payload: { contentDir: string; wsPort: number; projectName: string }) => void;
};

export type RequestResponseChannels = {
  'dialog:open-folder': () => Promise<{ ok: true; path: string } | { ok: false }>;
  'dialog:create-folder': () => Promise<{ ok: true; path: string } | { ok: false }>;
  'project:list-recent': () => Promise<Array<{ contentDir: string; projectName: string; lastOpenedAt: string; trustState: 'trusted' | 'pending' | 'unknown' }>>;
  'project:open': (payload: { contentDir: string; target: 'current-window' | 'new-window' }) => Promise<{ ok: true; wsPort: number } | { ok: false; reason: string }>;
  'project:close': () => Promise<{ ok: true }>;
  'clone:from-github': (payload: { url: string; targetDir: string }) => Promise<{ ok: true; contentDir: string } | { ok: false; reason: string }>;
  'auth:github:start-device-flow': () => Promise<{ userCode: string; verificationUri: string }>;
  'auth:github:poll': () => Promise<{ status: 'pending' | 'authorized' | 'expired' }>;
  'init:run': (payload: { projectDir: string; editors: Array<'claude-code' | 'cursor' | 'vscode' | 'windsurf'> }) => Promise<{ editors: Record<string, 'written' | 'skipped' | 'failed'> }>;
  'trust:grant': (payload: { contentDir: string }) => Promise<{ ok: true }>;
};
```

Per-channel optional Zod schemas live in `src/shared/schemas.ts`; `ipcMain.handle` wrappers in `src/main/ipc-main.ts` call `schema.parse(payload)` at boundary before dispatch.

### 2.10 CI matrix — add one job

`.github/workflows/ci.yml` addition (append-only):

```yaml
  desktop-smoke:
    needs: lint
    timeout-minutes: 25
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-14-xlarge
            arch: arm64
          - os: macos-14
            arch: x64
          - os: windows-2022
            arch: x64
          - os: ubuntu-22.04
            arch: x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: "1.3.11" }
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/electron
            ~/.cache/electron-builder
            ~/.electron-gyp
            .turbo
          key: electron-${{ runner.os }}-${{ matrix.arch }}-${{ hashFiles('bun.lock') }}
      - run: bun install --frozen-lockfile
      - run: bunx turbo run rebuild:native --filter=@inkeep/open-knowledge-desktop
      - run: bunx turbo run build:desktop:dir
      - if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb libgtk-3-0 libnotify-dev libnss3 libxss1 libasound2
          xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" -- \
            bunx turbo run test:e2e:packaged --filter=@inkeep/open-knowledge-desktop
      - if: runner.os != 'Linux'
        run: bunx turbo run test:e2e:packaged --filter=@inkeep/open-knowledge-desktop
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: desktop-smoke-${{ matrix.os }}-${{ matrix.arch }}
          path: |
            packages/desktop/test-results/
            packages/desktop/dist-desktop/
```

**Not added:** full sign+notarize per-PR — too slow, too expensive, requires real certs. That runs on tagged releases only (`.github/workflows/release.yml`, a separate file not shown here). FU-2's two-gate recommendation: this `desktop-smoke` job catches ~65-75%; the release workflow catches the signing/fuses/notarization residual.

### 2.11 `packages/desktop/src/utility/server-entry.ts` — the key handoff

This is where the Electron spec §8.3 meets the existing server package:

```ts
import { createServer, acquireServerLock, updateServerLockPort } from '@inkeep/open-knowledge-server';
import { resolveContentDir, resolveLockDir } from '@inkeep/open-knowledge/config/paths';
// ^ or: re-export from core if we move resolveContentDir/resolveLockDir out of cli
import { createServer as createHttpServer } from 'node:http';

type InitMessage = { type: 'init'; contentDir: string; projectDir: string; debounce?: number };

process.parentPort!.on('message', async (event) => {
  const msg = event.data as InitMessage;
  if (msg.type !== 'init') return;

  // Apply ELECTRON_USER_DATA-equivalent isolation if set (Playwright parallel tests)
  const contentDir = msg.contentDir;
  const lockDir = resolveLockDir(contentDir);

  // Shipped V0-1 lock protocol
  acquireServerLock(lockDir, { port: 0, worktreeRoot: msg.projectDir });

  const instance = createServer({
    contentDir,
    projectDir: msg.projectDir,
    debounce: msg.debounce ?? 2000,
    port: 0,   // kernel-assigned
    gitEnabled: true,
  });

  await instance.ready;

  // Wire HTTP server on port 0, extract real port
  const httpServer = createHttpServer((req, res) => {
    void instance.hocuspocus.hooks('onRequest', { request: req, response: res } as never).catch(() => {});
  });
  instance.hocuspocus.configure({ extensions: instance.hocuspocus.configuration.extensions });
  // (full handler wiring matches packages/cli/src/commands/start.ts)

  httpServer.listen(0, 'localhost', () => {
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    updateServerLockPort(lockDir, port);
    process.parentPort!.postMessage({ type: 'ready', port });
  });

  process.parentPort!.once('message', async (ev) => {
    if ((ev.data as { type?: string }).type === 'shutdown') {
      await instance.destroy();
      httpServer.close(() => process.exit(0));
    }
  });
});
```

**Reuses everything that's already shipped:** `createServer()` factory, `acquireServerLock()` / `updateServerLockPort()` / `releaseServerLock()` (V0-1), CC1 broadcaster (V0-2), symlink-preserving atomic writes, shadow repo, auto-init via T3.

**One cross-package cleanup:** `resolveContentDir` / `resolveLockDir` currently live in `packages/cli/src/config/paths.ts`. Moving them to `@inkeep/open-knowledge-core` (already `workspace:*` from server + cli + desktop) lets the utility process import without adding a dep on the CLI. Small refactor, ~30 LOC move.

### 2.12 Native-module rebuild wiring

`@parcel/watcher` + `simple-git` are already `neverBundle` in the CLI's tsdown config. For Electron, they must be rebuilt against Electron's Node ABI.

Two hooks:

1. **Local dev setup:** `packages/desktop/package.json` adds a `postinstall` script:
   ```jsonc
   "postinstall": "electron-builder install-app-deps"
   ```
   Runs once after `bun install` at root, rebuilds native modules in `node_modules/` against the pinned Electron version.

2. **CI:** explicit turbo task `rebuild:native` (shown above) invoked between `bun install` and `bun run build:desktop:dir`. Avoids relying on postinstall timing.

**Known tension:** `postinstall` at the package level in a Bun workspace runs at every `bun install` of the root. If someone installs without intending to work on Electron (e.g., only editing `packages/docs`), the postinstall still fires and downloads Electron headers (~150MB first time, cached after). Trade-off: simplicity + correctness vs. optional cost. Mitigation: make the postinstall a no-op if `ELECTRON_SKIP_REBUILD=1` is set.

### 2.13 CLAUDE.md update at repo root

Add a new section to the existing `CLAUDE.md` (~1200 lines already — this adds ~40 lines):

```markdown
## Package: desktop

Electron desktop app — native macOS/Windows/Linux wrapping of the OK stack.

### Toolchain (LOCKED)
- Electron `~41.0.2` (pinned; Node 24.14.0 / Chromium 146)
- electron-vite `^5.0.0` — `packages/desktop/electron.vite.config.ts`, three sections
- electron-builder `^26.9.0` — `packages/desktop/electron-builder.yml`
- Playwright `^1.48.0` with `_electron.launch()` — NOT Spectron (deprecated)

### Process model
- Main: `packages/desktop/src/main/` — BrowserWindow lifecycle, menu, updater, IPC wiring
- Preload: `packages/desktop/src/preload/index.ts` — typed `Window.api`
- Renderer: `packages/app/dist/` (the existing Vite build, consumed as extraResources)
- Utility: `packages/desktop/src/utility/server-entry.ts` — spawns `createServer()` from `@inkeep/open-knowledge-server` per project window

### IPC discipline (LOCKED)
- All renderer → main calls: typed `window.api.invoke('channel-name', payload)`
- `RequestChannels` / `RequestResponseChannels` in `packages/desktop/src/shared/ipc-shared.ts`
- NEVER import `ipcRenderer` / `ipcMain` directly outside `packages/desktop/src/{main,renderer,preload}/ipc-*.ts` — Biome `noRestrictedImports` fails
- NEVER call `webContents.send` directly — use `sendToRenderer()` from `src/main/ipc-webcontents.ts`
- Optional Zod boundary validation per channel in `src/shared/schemas.ts`

### Test tiers
- `bun run test:e2e:unpackaged --filter=@inkeep/open-knowledge-desktop` — Playwright against `out/main/index.js`, ~5s boot
- `bun run test:e2e:packaged --filter=@inkeep/open-knowledge-desktop` — Playwright against `electron-builder --dir` output, ~30s boot
- Tier switch: `DESKTOP_E2E_APP_MODE=packaged|unpackaged`
- Per-test `userData` isolation: `env: { ELECTRON_USER_DATA: <tmp> }` + `app.setPath('userData', process.env.ELECTRON_USER_DATA)` in main before `whenReady()`

### Hot-reload
- `bun run dev --filter=@inkeep/open-knowledge-desktop` → `electron-vite dev --watch`
- Renderer HMR via Vite (<100ms on UI changes to `packages/app/`)
- Main/preload change → Electron restart (~1-3s)
- Utility change → full app restart (no utility-selective HMR; see `reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/` for the supervisor escape hatch)
```

### 2.14 Root `CLAUDE.md` "Commands" section — add desktop lane

Existing commands block gets 3 new entries:

```bash
bun run build:desktop                   # Build main/preload/utility + assemble React bundle from cli/dist/public
bun run build:desktop:dir               # Unsigned packaged artifact — fast CI gate (~1-2 min/platform)
bun run check:desktop                   # Desktop-scoped lint + typecheck + e2e:unpackaged
```

## 3. What we deliberately DON'T change

Restraint list — each was considered and kept as-is:

1. **Biome as the primary linter** — not swapping to ESLint. See §2.8; Biome handles 4 of 5 custom rules; the 5th is scoped.
2. **tsconfig project references** — NOT introduced at root or in other packages. Scoped to `packages/desktop/` only.
3. **Turbo dependency graph** — new tasks follow existing `dependsOn: ['^build']` pattern; no restructuring of existing task inputs/outputs.
4. **CLI's tsdown config + build:assets script** — unchanged. The desktop package consumes its output (`packages/cli/dist/public/`) via electron-builder `extraResources`. Zero disruption to the published `@inkeep/open-knowledge` CLI.
5. **Existing CI jobs** (`lint`, `test` matrix, `playwright`) — unchanged. New `desktop-smoke` job is additive.
6. **`packages/app/` Vite setup** — unchanged. Its `dist/` becomes the single-source React bundle consumed by both CLI (npm + bunx) and Electron.
7. **Server `createServer()` contract** — unchanged. Electron's utility process calls the same factory.
8. **V0-1 lock file + V0-2 CC1 protocol** — unchanged. Electron consumes the shipped contracts.
9. **Bun version pin** — `bun@1.3.11` in root engines. Desktop package inherits.
10. **Changesets** — desktop package is `private: true`, excluded from publish. Version bumps tracked separately or not at all.

## 4. Rollout sequence (implementation order)

Phase ordering minimizes risk — each phase is independently revertible, each leaves the repo in a working state.

| # | Phase | Scope | Reversible? |
|---|---|---|---|
| P1 | Create `packages/desktop/` scaffolding | New package only; nothing depends on it yet | Yes — delete the directory |
| P2 | Move `resolveContentDir` / `resolveLockDir` to `@inkeep/open-knowledge-core` | CLI + Desktop import from core | Yes — small refactor |
| P3 | Wire `turbo.json` tasks + root scripts | Additive | Yes |
| P4 | Implement main + preload + utility entry | Self-contained in `packages/desktop/src/` | Yes |
| P5 | Wire typed IPC (hand-rolled channel map) + Biome `noRestrictedImports` override | Internal to desktop package + small Biome override | Yes |
| P6 | Add Playwright E2E harness + `DESKTOP_E2E_APP_MODE` tier switch | Self-contained tests | Yes |
| P7 | Add `desktop-smoke` CI job | Additive | Yes |
| P8 | Wire Sentry + electron-log + sourcemap upload | Internal to desktop package | Yes |
| P9 | Add `electron-builder.yml` + sign+notarize infra | Requires Apple Developer + Azure Trusted Signing creds | Yes (CI-gated) |
| P10 | Add `release.yml` GitHub Action | Additive | Yes |
| P11 | Update CLAUDE.md with desktop section | Doc only | Trivially |

**First milestone (P1-P4):** desktop app boots in dev and smoke-tests pass locally. No CI gate yet.

**Second milestone (P5-P7):** typed IPC + CI gate. Every PR gets packaged-smoke verification on macOS/Windows/Linux.

**Third milestone (P8-P10):** release pipeline. First signed DMG + NSIS + AppImage artifacts shipped.

## 5. Open questions for the Electron spec

Surface back to `specs/2026-04-11-electron-desktop-app/SPEC.md`:

1. **Biome custom-rule capability for `no-loosely-typed-webcontents-ipc`.** Can Biome v2 GritQL express "flag `<expr>.webContents.send(...)` outside allowlisted files"? If not, adopt Option 2 (tiny ESLint setup scoped to `packages/desktop/`) — adds one toolchain to the repo, scoped to one package. See §2.8.
2. **Postinstall rebuild trigger.** Should `packages/desktop/package.json` have a `postinstall` that rebuilds native modules, paying the cost for every root `bun install`? Or rely solely on the CI task and require desktop contributors to run `bun run rebuild:native` manually? (§2.12)
3. **Moving `resolveContentDir` / `resolveLockDir` to core.** Small refactor (~30 LOC) that benefits desktop but touches the CLI. Is this the right phase to do it? (§2.11 + P2)
4. **Desktop-shell renderer HTML vs. direct `loadFile` of cli/dist/public/index.html.** Does the Electron spec need any desktop-native renderer code (trust-pending banner overlay, auto-update toast), or can the renderer be a pure pass-through to the existing React app? If the latter, `packages/desktop/src/renderer/` is empty and electron-vite's `renderer` section can be omitted from the config. (§2.1 + §2.5)
5. **Azure Trusted Signing eligibility** (§2.6 `win.azureSignOptions`). Inkeep must verify US/Canada + 3-year-business-history requirement before Windows day-0 is actually viable. Connects to spec §D7 / OQ-D.
6. **`ELECTRON_SKIP_REBUILD=1` as the escape hatch** (§2.12) — agreed pattern or should we design a different opt-out?

## 6. Measured cost (estimated)

- **New files:** ~35 (TypeScript + configs + YAML + one HTML shell + e2e fixtures)
- **Lines of code (desktop package, first milestone):** ~1,200 TS + ~200 YAML/JSON
- **Lines changed in existing files:** ~20 (root `package.json` scripts, `turbo.json` tasks, `CLAUDE.md` addition, one small move into core)
- **CI time added:** ~3-8 min wall-clock per PR (desktop-smoke 4-cell matrix, cached Electron binaries)
- **First-install overhead:** ~200MB (Electron binary + `@electron/rebuild` headers, machine-global cache — amortized across worktrees per FU-4 §D7)

## 7. References consumed by this design

- [`reports/electron-ai-coding-agent-development/REPORT.md`](../../../reports/electron-ai-coding-agent-development/REPORT.md) — 13-dimension synthesis
- [`reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/`](../../../reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu4-agent-first-electron-repo-template/REPORT.md) — greenfield skeleton
- [`reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/`](../../../reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu3-typed-electron-ipc-comparison/REPORT.md) — IPC library scale-match
- [`reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/`](../../../reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu2-packaged-build-regression-taxonomy/REPORT.md) — smoke-gate catch rate
- [`reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/`](../../../reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/REPORT.md) — utility-process reload reality
- [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../SPEC.md) — the consuming spec
- [`specs/2026-04-11-zero-config-bunx-packaging/SPEC.md`](../../2026-04-11-zero-config-bunx-packaging/SPEC.md) — T1 shared-bundle pattern this design inherits
- [`specs/2026-04-13-server-process-safety/SPEC.md`](../../2026-04-13-server-process-safety/SPEC.md) — V0-1 lock protocol the utility process consumes
- Open Knowledge repo at baseline `f17ad00` — `package.json`, `turbo.json`, `packages/*/package.json`, `packages/cli/tsdown.config.ts`, `packages/cli/src/commands/start.ts`, `.github/workflows/ci.yml`, `CLAUDE.md`
