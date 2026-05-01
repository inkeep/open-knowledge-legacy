---
name: code_channel
description: Code-channel worldmodel findings — callsite enumeration for `.open-knowledge/` rename + content config refactor
type: evidence
date: 2026-04-30
sources:
  - packages/core/src/constants/ok-dir.ts
  - packages/core/src/config/schema.ts
  - packages/server/src/content-filter.ts
  - packages/server/src/doc-extensions.ts
  - packages/server/src/server-factory.ts
  - packages/server/src/cc1-broadcast.ts
  - packages/server/src/server-lock.ts
  - packages/cli/src/commands/init.ts
  - packages/cli/src/content/init.ts
  - packages/cli/src/mcp/tools/set-config.ts
  - packages/app/src/components/settings/SettingsPane.tsx
  - .open-knowledge/.gitignore
  - .gitignore
  - PRECEDENTS.md
depth: full
---

## Counts (orienting)

- `git grep -l "\.open-knowledge"`: **347 tracked files** total (incl. specs, reports, stories). String literal `\.open-knowledge` total occurrences: **3,762**.
- Production source-only refs to `.open-knowledge` (excluding test + CHANGELOG):
  - `packages/server/src/`: **46 line-hits across 18 files** (locks, persistence-state paths, principal/conflict storage, fs-traced cardinality classifier, sync-state, upload tmpdir, skill-installed sidecar, state-manifest).
  - `packages/cli/src/`: ~20 source files, almost all routed through `OK_DIR` constant (38 OK_DIR uses in CLI src + tests).
  - `packages/desktop/src/`: ~10 site-hits (mcp-wiring marker, stats jsonl, window-manager attach trigger).
  - `packages/app/src/` + `packages/app/scripts/`: 6 files (perf-prod.sh, ConnectingBanner banner, SeedDialog UI label, hocuspocus-plugin, handoff telemetry).
  - `packages/core/src/`: 3 files — `constants/ok-dir.ts` (canonical SSOT), `config/write-config-patch.ts` (uses OK_DIR), `desktop-bridge.ts` (jsdoc only).
- The literal `OK_DIR` constant flows through `packages/core/src/constants/ok-dir.ts` and is re-exported via `@inkeep/open-knowledge-core` and `packages/cli/src/constants.ts`. **All package-source uses go through this constant** with two systematic exceptions: (a) JSDoc / comment / log strings that hardcode `.open-knowledge` for human readability, (b) test fixtures (mostly hardcoded `.open-knowledge` literal in `tests/` for test path construction).
- `OK_DIR` is imported in: cli (16 files), server (3 files: `principal.ts`, `seed/plan.ts`, `seed/apply.test.ts` + `seed/plan.test.ts`), desktop (2 test files), core (write-config-patch + barrel export). Production server code has only **one** OK_DIR-via-constant call site (`principal.ts`); the rest of `packages/server/src/` uses **literal `'.open-knowledge'`** strings (16 sites — see Section 1.B below).

---

## 1. All callsites that construct or reference `.open-knowledge/` paths

### 1.A — Single source of truth

| file:line | context | purpose |
| --- | --- | --- |
| `packages/core/src/constants/ok-dir.ts:2` | `export const OK_DIR = '.open-knowledge';` | **Canonical SSOT** — the only literal definition |
| `packages/core/src/index.ts:96` | `export { OK_DIR } from './constants/ok-dir.ts';` | Core barrel export |
| `packages/cli/src/constants.ts:4` | `export { OK_DIR } from '@inkeep/open-knowledge-core';` | CLI re-export shim |

### 1.B — Server package (literal string sites — NOT routed through OK_DIR)

| file:line | context | purpose |
| --- | --- | --- |
| `packages/server/src/api-extension.ts:5198` | `const lockDir = resolve(absDir, '.open-knowledge');` | preview-url helper resolves lockDir for cross-process discovery |
| `packages/server/src/api-extension.ts:5267` | jsdoc: `Polls <dir>/.open-knowledge/server.lock until port > 0 appears.` | doc string |
| `packages/server/src/auth-token-schema.ts:32` | jsdoc: `.open-knowledge/principal.json` | comment |
| `packages/server/src/backlink-index.ts:767` | `return resolve(this.projectDir, '.open-knowledge', 'cache', branch, 'backlinks.json');` | per-branch backlinks cache file |
| `packages/server/src/boot.ts:155` | jsdoc: `<contentDir>/.open-knowledge` | comment for `lockDir` field |
| `packages/server/src/config-file-watcher.ts:2,64` | jsdoc | comment |
| `packages/server/src/config-persistence.ts:76,86` | jsdoc | comment |
| `packages/server/src/conflict-storage.ts:4,50` | `this.storePath = join(contentDir, '.open-knowledge', 'conflicts.json');` | conflict store path |
| `packages/server/src/fs-traced.ts:49,51` | `if (p.includes(\`${sep}.open-knowledge${sep}conflict\`)) return 'conflict';` and `'ok-internal'` classifier | telemetry path classifier (cardinality discipline) |
| `packages/server/src/managed-rename-journal.ts:30` | `return resolve(contentDir, '.open-knowledge');` | rename journal dir |
| `packages/server/src/principal.ts:5,33` | `import { OK_DIR } from '@inkeep/open-knowledge-core'; const okDir = resolve(contentDir, OK_DIR);` | **Only OK_DIR-via-constant site in server src** |
| `packages/server/src/process-lock.ts:5` | jsdoc | comment |
| `packages/server/src/seed/apply.ts:78` | jsdoc | comment |
| `packages/server/src/seed/plan.ts:3,82,86,127` | imports OK_DIR + uses in error messages and `okDir = join(projectDir, OK_DIR)` | OK_DIR-via-constant; error messages contain literal text |
| `packages/server/src/seed/starter.ts:85` | seed prose: `\`.open-knowledge/config.yml\` changes` | starter content |
| `packages/server/src/seed/types.ts:123,148` | jsdoc | comment |
| `packages/server/src/server-factory.ts:213,279,447,1582` | line 279: `const lockDir = resolve(contentDir, '.open-knowledge');` (production lockDir construction); 213 jsdoc; 447 + 1582 comments | **THE production server-lock construction site (literal)** |
| `packages/server/src/server-lock.ts:9` | jsdoc | comment |
| `packages/server/src/skill-install.ts:30,86,186` | line 86: `return join(home, '.open-knowledge', SIDECAR_FILENAME);` | **`~/.open-knowledge/skill-installed-version` user-home sidecar** |
| `packages/server/src/state-manifest.ts:4,17,20,38,63,69,74` | extensive jsdoc; documents adopt-detection contract: `Manifest absent + no .open-knowledge/ AND no .git/open-knowledge/ → fresh-init` | comment-only; references both .open-knowledge/ and .git/open-knowledge |
| `packages/server/src/sync-engine.ts:224,1219,1227` | line 224: `this.statePath = resolve(this.contentDir, '.open-knowledge', 'sync-state.json');` lines 1219/1227: skip-traversal exception | sync-state path + traversal allow-listing |
| `packages/server/src/ui-lock.ts:9` | jsdoc | comment |
| `packages/server/src/upload-streaming.ts:19,82,87,204` | line 87: `return resolve(contentDir, '.open-knowledge', 'tmp');` | **upload tmpdir for atomic same-FS rename** |
| `packages/server/src/version-constants.ts:58,60` | jsdoc references `state.json` | comment |

### 1.C — CLI package

| file:line | context | purpose |
| --- | --- | --- |
| `packages/cli/src/auth/token-store.ts:77,85,142,155` | `this.authFile = authFile ?? join(homedir(), '.open-knowledge', 'auth.yml');` | **`~/.open-knowledge/auth.yml` (chmod 0600 plaintext token fallback when keyring unavailable)** |
| `packages/cli/src/bash/mtime-scan.ts:14,21,28` | imports + uses OK_DIR | bash command exclusion list |
| `packages/cli/src/bash/parse-command.ts:28,71` | imports + uses OK_DIR | bash command exclusion list |
| `packages/cli/src/cli.ts:117` | comment: `inspect + migrate \`.open-knowledge/config.yml\`` | comment |
| `packages/cli/src/commands/clone.ts:7,119,121,126,140,158,161,162,174,182` | imports OK_DIR; clone appends `${OK_DIR}/` to `<projectDir>/.git/info/exclude`; idempotent variant detection | **per-clone protection: writes to `.git/info/exclude` so cloned project's tracked `.gitignore` stays clean** |
| `packages/cli/src/commands/config.test.ts:5,32,36,52,59,77` | tests use OK_DIR + literal `.open-knowledge` paths | tests |
| `packages/cli/src/commands/init.ts:30,549,648,834,1047,1050` | imports OK_DIR; `const okDir = join(cwd, OK_DIR);` (line 834); CLI option help-text `Scaffold ${OK_DIR}/...` | runs `runInit` and prints scaffold result |
| `packages/cli/src/commands/preview.test.ts:6,40,106,117` | tests | tests |
| `packages/cli/src/commands/preview.ts:6` | jsdoc | comment |
| `packages/cli/src/commands/seed.test.ts:7,21,22,44,112,156` | uses OK_DIR + CONFIG_FILENAME | seed tests |
| `packages/cli/src/commands/start.test.ts:190,509,704,825,935` | tests; line 704 references `.git/open-knowledge/` | tests |
| `packages/cli/src/commands/start.ts:30,255,285,311,352,370,513,610` | imports OK_DIR; `const okDir = resolve(cwd, OK_DIR);` (line 352); `const lockDirForUiLookup = resolve(contentDir, OK_DIR);` (line 370); `--no-init` help text; "Scaffolded ${OK_DIR}/" announce | start-flow auto-init scaffold + lockDir resolution |
| `packages/cli/src/commands/stop.ts:33` | `targets.push({ name: 'server', pid: server.lock.pid, port: server.lock.port });` | reads parsed lockfile |
| `packages/cli/src/commands/sync.ts:4` | jsdoc | comment |
| `packages/cli/src/commands/ui.test.ts:15,69` | uses OK_DIR | tests |
| `packages/cli/src/commands/ui.ts:32,157,179,214,243` | imports ASSET_EXTENSIONS; static-serve excludes dotfiles incl. `.open-knowledge/`; reads server.lock + ui.lock | UI server lockfile read |
| `packages/cli/src/config/loader.test.ts:11,22,40,46,241` | uses OK_DIR | loader tests |
| `packages/cli/src/config/loader.ts:5,15,32,159,172,238` | imports OK_DIR; `userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME);` (159); `projectConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME);` (172) | **canonical config-loading path: ~/.open-knowledge/config.yml + ./.open-knowledge/config.yml** |
| `packages/cli/src/config/paths.test.ts:3,26,27` | uses OK_DIR | tests |
| `packages/cli/src/config/paths.ts:10,23,27` | imports OK_DIR; `return resolve(contentDir, OK_DIR);` | `resolveLockDir()` helper |
| `packages/cli/src/content/enrichment.ts:21,36` | imports OK_DIR | content enrichment exclusion |
| `packages/cli/src/content/init.test.ts:5,23,26,32,53,67,98,118,137,146,147,169,189,205,208,217,223,228,231` | drift-guard test for `.open-knowledge/.gitignore` template; verifies committed `.gitignore` matches scaffold | **drift guard for the committed `.open-knowledge/.gitignore`** |
| `packages/cli/src/content/init.ts:4,52,193,206,228` | **scaffolding owner**: `OK_DIR` import; `okDir = resolve(projectDir, OK_DIR)`; writes `${okDir}/.gitignore` + `${okDir}/${CONFIG_FILENAME}` + `${okDir}/${CACHE_DIR}/` | `initContent()` — single source of truth for `.open-knowledge/.gitignore` content |
| `packages/cli/src/content/preview.test.ts:123,162` | jsdoc + assertions | tests |
| `packages/cli/src/content/preview.ts:10,180` | jsdoc + reporter line `${OK_DIR}/config.yml → content.include / content.exclude` | terminal reporter |
| `packages/cli/src/mcp/server-discovery.test.ts:481,828,832` | uses OK_DIR + literal lockDir constructions | tests |
| `packages/cli/src/mcp/server.ts:12,194,212` | jsdoc; system instruction prose: STOP rule about `.open-knowledge/` | MCP server instructions |
| `packages/cli/src/mcp/tools.ts:12` | jsdoc | comment |
| `packages/cli/src/mcp/tools/exec.ts:61` | tool description: `STOP — native tools on in-scope markdown (when project has \`.open-knowledge/\`)` | MCP tool description |
| `packages/cli/src/mcp/tools/get-config.test.ts:110` | test uses OK_DIR | tests |
| `packages/cli/src/mcp/tools/preview-url.ts` | references | preview lockfile path |
| `packages/cli/src/mcp/tools/read-document.ts` | references | – |
| `packages/cli/src/mcp/tools/search.ts:107,108,114` | reads `config.content.include` + `config.content.exclude`; appends `OK_DIR` to native `exec` tool's exclude list | MCP search filter |
| `packages/cli/src/mcp/tools/set-config.test.ts:164,282,289,296` | tests for content.include/exclude/dir set semantics | tests |
| `packages/cli/src/mcp/tools/set-folder-rule.test.ts` | uses OK_DIR | tests |
| `packages/cli/tests/integration/multi-project-locks.test.ts` | tests | – |

### 1.D — Desktop package

| file:line | context | purpose |
| --- | --- | --- |
| `packages/desktop/electron-builder.yml:1` | `appId: com.inkeep.open-knowledge` | **Bundle ID — LOCKED forever (Keychain ACL); NOT in scope for rename** |
| `packages/desktop/electron-builder.yml:131` | `schemes: [openknowledge]` | URL scheme — NOT in scope |
| `packages/desktop/src/main/index.ts:1141` | comment: `~/.open-knowledge/skill-installed-version` | comment |
| `packages/desktop/src/main/ipc-handlers.ts:342,366` | `STATS_FILE_RELATIVE_PATH = ['.open-knowledge', 'stats.jsonl']` | **`~/.open-knowledge/stats.jsonl` user-home telemetry path** |
| `packages/desktop/src/main/mcp-wiring.test.ts:121-1306` | many `'/Users/andrew/.open-knowledge/mcp-status.json'` literals | tests for marker file location |
| `packages/desktop/src/main/mcp-wiring.ts:6,63,67,184,510` | `MCP_STATUS_DIR_NAME = '.open-knowledge';` (line 63); writes `<home>/.open-knowledge/mcp-status.json` | **first-launch consent marker file** |
| `packages/desktop/src/main/menu.ts:13,81` | menu refs: "Reveal `.open-knowledge/`" item; jsdoc references mcp-status.json | menu |
| `packages/desktop/src/main/window-manager.ts:16,461` | jsdoc + `const lockDir = resolve(projectPath, '.open-knowledge');` (461) | **attach-mode lockdir resolver — checks `.open-knowledge/server.lock` to detect existing server** |
| `packages/desktop/src/shared/bridge-contract.ts:173` | jsdoc: `~/.open-knowledge/stats.jsonl` | comment |
| `packages/desktop/src/shared/ipc-channels.ts:50,168,272` | jsdoc references `~/.open-knowledge/stats.jsonl` and `<home>/.open-knowledge/mcp-status.json` | comments |
| `packages/desktop/tests/integration/handoff-ipc.test.ts:412` | `expect(mkdirCalls).toEqual(['/Users/test/.open-knowledge']);` | tests |
| `packages/desktop/tests/main/seed-ipc.test.ts:5,19,20` | uses OK_DIR | tests |
| `packages/desktop/tests/unit/scaffold.test.ts:5,16,17` | `expect(OK_DIR).toBe('.open-knowledge');` | **smoke test that asserts the literal value — needs update on rename** |

### 1.E — App package

| file:line | context | purpose |
| --- | --- | --- |
| `packages/app/scripts/perf-prod.sh:25,27,28,93,94,118,121,257` | `SERVER_LOCK="$REPO_ROOT/.open-knowledge/server.lock"` + `UI_LOCK="$REPO_ROOT/.open-knowledge/ui.lock"` | shell script perf harness — bash-level literal |
| `packages/app/src/components/ConnectingBanner.tsx:97` | UI text: `<code>.open-knowledge/last-spawn-error.log</code>` | user-facing error guidance |
| `packages/app/src/components/SeedDialog.tsx:411` | `name: '.open-knowledge/config.yml',` | seed-dialog UI label |
| `packages/app/src/components/handoff/useHandoffDispatch.ts:7` | jsdoc | comment |
| `packages/app/src/lib/handoff/telemetry.ts:3,24` | jsdoc | comment |
| `packages/app/src/server/hocuspocus-plugin.test.ts:34,35,43,45,55,57` | tests that scaffold `.open-knowledge/config.yml` | tests |
| `packages/app/src/server/hocuspocus-plugin.ts:65` | `const configPath = resolve(projectRoot, '.open-knowledge/config.yml');` | **Vite plugin loads project config path** |
| `packages/app/tests/integration/branch-switch-live-client.test.ts:277,280` | `const ystateDir = join(contentDir, '.open-knowledge', 'ystate');` | integration test |
| `packages/app/tests/stress/perf-baseline-update.md:105` | doc | comment |

### 1.F — Repo root + meta files

| file:line | context | purpose |
| --- | --- | --- |
| `.gitignore:75` | `# .open-knowledge/.gitignore. No OK-internal paths belong here.` | comment-only invariant |
| `.codex/config.toml:1` | `[mcp_servers.open-knowledge]` | Codex MCP server name (NOT a path) |
| `.open-knowledge/config.yml:9-10` | precedence comment | repo-internal |
| `.open-knowledge/.gitignore` | template (cache/, server.lock, ui.lock, sync-state.json, principal.json, state.json, last-spawn-error.log) | **canonical scaffolded ignore content** |
| `AGENTS.md:33,95,97,…` | many references | repo-instruction |
| `PROJECT.md`, `README.md`, `STORIES.md` | references | docs |
| `.changeset/init-gitignore-consolidation.md` | description | unreleased changeset |

### 1.G — `docs/` (Next.js docs site)

52 line-hits across files including `cli-reference.mdx`, `configuration.mdx`, `content-filtering.mdx`, `getting-started.mdx`, `github-sync.mdx`, `mcp-integration.mdx`, `open-in-agent-desktop.mdx`, `internals/lifecycle.mdx`, `internals/server-lifecycle.mdx`, `internals/service-topology.mdx`, plus `docs/src/app/(home)/sticky-showcase.tsx:656` (homepage hero shows literal `.git/open-knowledge/`). User-facing docs are pervasive — see `git grep -n "\.open-knowledge" -- 'docs/'` for the full list.

---

## 2. All `.git/open-knowledge/` (shadow repo) callsites

| file:line | context | purpose |
| --- | --- | --- |
| `packages/core/src/shadow-repo-layout.ts:5,91,96` | `return resolve(projectRoot, '.git/open-knowledge');` (96) | **canonical `getShadowRepoPath()` SSOT** |
| `packages/core/src/shadow-repo-layout.test.ts:264,266,267,268,277,289,291` | tests | tests |
| `packages/server/src/shadow-repo.ts:2,9,84,91,154,467` | `'Shadow repo — attribution journal at <projectRoot>/.git/open-knowledge/'` jsdoc + R9 rename shim references; line 467: `id: 'openknowledge-service'` (writer ID, not path) | shadow init |
| `packages/server/src/shadow-repo.test.ts:39,51,96,117,119,120,134` | tests, including R9 rename shim from legacy `.git/openknowledge/` to `.git/open-knowledge/` | **rename-shim test (PRECEDENT for in-place migration)** |
| `packages/server/src/state-manifest.ts:17,62,197` | adopt-detection — manifest absent + no `.open-knowledge/` AND no `.git/open-knowledge/` → fresh-init | comment + adopt path field |
| `packages/server/src/timeline-query.test.ts:249` | test | tests |
| `packages/server/src/fs-traced.ts:29` | jsdoc shows shadow repo example | comment |
| `packages/cli/src/commands/start.test.ts:704` | comment about `.git/open-knowledge/` implicitly creating `.git/` parent | tests |
| `packages/cli/src/content/shadow-log.ts:4` | jsdoc | comment |
| `docs/content/internals/service-topology.mdx:86` | doc prose | docs |
| `docs/content/guides/getting-started.mdx:176` | doc prose | docs |
| `docs/src/app/(home)/sticky-showcase.tsx:656` | homepage UI literal | docs site |
| `reports/crdt-server-restart-recovery/evidence/d3-ok-composition.md:44` | research report | docs |
| `reports/worktree-git-shadow-repo-issue/REPORT.md:1` | research report | docs |
| `reports/vite-dev-server-diagnostic/results/*.md` | diagnostic logs (verbatim shell output) | reports |

**Out of scope but adjacent:** the writer-ID `openknowledge-service` literal (no leading dot, no path) — `packages/server/src/persistence.ts:467,478`; `packages/server/src/shadow-repo.ts:467`; `packages/core/src/shadow-repo-layout.test.ts` (lines 200-562); `packages/server/src/contributor-tracker.ts:16`. Per precedent #25 these are stable identifier strings, NOT path components — they SHOULD NOT change.

---

## 3. `content.include` / `content.exclude` / `content.dir` callsites

### 3.A — Schema definition (writes via Zod registry)

| file:line | role | purpose |
| --- | --- | --- |
| `packages/core/src/config/schema.ts:30-58` | **DEFINES** | `content.dir` / `content.include` / `content.exclude` Zod leaves with `scope: 'project'`. `content.dir`: `agentSettable: false`. `content.include` / `exclude`: `agentSettable: true`. Defaults: dir=`'.'`, include=`['**/*.md', '**/*.mdx']`, exclude=`[]`. |
| `packages/cli/src/config/schema.ts` | re-export | shim |
| `packages/cli/scripts/build-config-schema.mjs:31,126` | publishes JSON schema from Zod | dist/schemas/v0/config.project.schema.json + config.user.schema.json |

### 3.B — Production READS (consumers using config-resolved values)

| file:line | role | consumer purpose |
| --- | --- | --- |
| `packages/server/src/content-filter.ts:113,142,...` | READ via `includePatterns` + `excludePatterns` ctor args | **THE primary consumer**: builds picomatch include matcher + `ignore` library exclude rules |
| `packages/server/src/file-watcher.ts:837` | READ via `contentFilter.getWatcherIgnoreGlobs()` | feeds `@parcel/watcher` `subscribe({ ignore })` option |
| `packages/cli/src/commands/start.ts:420,427,428` | READ | passes `config.content.dir` + `include` + `exclude` to `bootServer` |
| `packages/cli/src/commands/start.ts:651,652` | READ on hot-reload | re-applies on config-watcher reload |
| `packages/cli/src/commands/init.ts:1099,1100` | READ | terminal report shows current include/exclude after init |
| `packages/cli/src/commands/preview.ts:29,30` | READ | preview reporter |
| `packages/cli/src/commands/ui.ts:174,175` | READ | UI server constructs ContentFilter |
| `packages/cli/src/config/paths.ts:19` | READ | `resolveContentDir(cwd, config) = resolve(cwd, config.content.dir)` |
| `packages/cli/src/mcp/tools/search.ts:107,108,114` | READ | MCP `search` honors include/exclude (and appends OK_DIR) |
| `packages/cli/src/mcp/tools/consolidate.ts:212` | READ | `args.topic` joined under `config.content.dir` |
| `packages/cli/src/mcp/tools/ingest.ts:145` | READ | same |
| `packages/cli/src/mcp/tools/research.ts:412` | READ | same |
| `packages/cli/src/mcp/tools/preview-url.ts:58` | READ | jsdoc states `config.content.dir` source |
| `packages/cli/src/content/folder-rules.ts:12` | READ | folder rules apply over `content.include` matched files |
| `packages/cli/src/content/preview.ts:180` | READ | reporter |
| `packages/app/src/server/hocuspocus-plugin.ts:65,72,75,81` | READ via Vite plugin's loaded YAML | dev-mode hocuspocus-plugin reads project config to derive `dir`/`include`/`exclude` |
| `packages/server/src/persistence.ts:331` | READ | content-dir-vs-projectDir relpath comment |

### 3.C — Production WRITES

| file:line | role | purpose |
| --- | --- | --- |
| `packages/cli/src/mcp/tools/set-config.ts:5-7,54,55` | WRITE | **MCP `set_config` allows `content.include` and `content.exclude` (NOT `content.dir`)** — the only agent-driven write path |
| `packages/app/src/components/settings/SettingsPane.tsx:88,93,98` | WRITE via UI | **Settings pane surfaces all three: `content.dir`, `content.include`, `content.exclude` in the "Content" section** |
| `packages/core/src/config/write-config-patch.ts` | WRITE | underlying YAML patch writer (used by both surfaces) |

### 3.D — VALIDATION + telemetry

| file:line | role | purpose |
| --- | --- | --- |
| `packages/core/src/config/errors.ts:186` | reports allowlist | error string: `Agent-settable paths: content.include, content.exclude, folders[],` |
| `packages/core/src/config/field-registry.test.ts:134-155` | invariant test | asserts `content.exclude / content.include / content.dir` are in field registry with expected scopes |
| `packages/core/src/config/yaml-patch.test.ts:73` | applied path test | expects `['content.include']` |

---

## 4. `isSupportedDocFile()` and asset extension constants

`packages/server/src/doc-extensions.ts` defines:
- `SUPPORTED_DOC_EXTENSIONS = ['.mdx', '.md'] as const`
- `isSupportedDocFile(path)` — true if extension matches
- `stripDocExtension(path)`, `getDocExtension(name)`, `registerDocExtension(...)`, `forgetDocExtension(...)`

Consumers (production):
- `packages/server/src/content-filter.ts:15` — imports `isSupportedDocFile` + `stripDocExtension`. Used in `populateDirCount` and `isExcluded` (system-doc gate at step 0).
- `packages/server/src/api-extension.ts:111` — imports both for upload + rename + restore code paths (uses lines 824, 3949, 3965, 4109, 4128, 4144, 4146).
- `packages/server/src/backlink-index.ts:16,1167,1171,1179` — used in scan; deduplicates `foo.md` vs `foo.mdx`.
- `packages/server/src/asset-walk.ts:26,115,131` — uses `isSupportedAssetFile(path, ASSET_EXTENSIONS)`.
- `packages/server/src/file-watcher.ts` — implicit via content-filter.

`ASSET_EXTENSIONS` is defined in `packages/core/src/constants/upload.ts:177` (`ReadonlySet<string>`), exported via core barrel (`packages/core/src/index.ts:101`). Consumers include `content-filter.ts` (sibling-asset rule, step 3 of D11 4-step), `asset-walk.ts`, `api-extension.ts`, `cli/src/commands/ui.ts`, `cli/src/commands/upload.ts`, `app/src/server/hocuspocus-plugin.ts`, `desktop/src/main/asset-safety-net.ts`.

`isSupportedDocFile` is enforced upstream of include matching: the content-filter's `populateDirCount` only counts files matching it, AND the `isExcluded` step-0 reserved-name check uses `stripDocExtension`. Files with non-doc, non-asset extensions are rejected before `content.include` is consulted.

---

## 5. Server lock contract

**Path:** `<contentDir>/.open-knowledge/server.lock` and `<contentDir>/.open-knowledge/ui.lock`.

**Construction:**
- `packages/server/src/server-factory.ts:279` — `const lockDir = resolve(contentDir, '.open-knowledge');` (literal). Passed to Hocuspocus `lockDir` config.
- `packages/server/src/server-lock.ts:9` — jsdoc says lockDir is `<contentDir>/.open-knowledge` by convention. Module owns `acquireServerLock`, `writeServerLock`, `releaseServerLock`, `readServerLock` (see `git grep -l server-lock`).
- `packages/server/src/process-lock.ts:5` — `process-lock` module is the underlying lockfile primitive used by both server.lock and ui.lock.
- `packages/server/src/ui-lock.ts:9` — `ui.lock` peer.
- `packages/server/src/boot.ts:155` — `bootServer` exposes `lockDir` field on returned object (jsdoc: `Absolute path to <contentDir>/.open-knowledge`).

**Boot acquisition flow:**
1. `bootServer()` (boot.ts) → `createServer()` (server-factory.ts) which computes `lockDir = resolve(contentDir, '.open-knowledge')`.
2. `acquireServerLock(lockDir, { … })` runs FIRST (BEFORE Hocuspocus init); writes `<lockDir>/server.lock` with PID + bound port. If a stale lock is detected (PID dead OR mtime > 24h), it's reclaimed.
3. On `destroy()`, `releaseServerLock(lockDir)` deletes the file.

**Discovery (read paths):**
- `packages/cli/src/mcp/server-discovery.ts:165,327,356` — MCP child reads `<lockDir>/server.lock` to find the running port.
- `packages/cli/src/mcp/keepalive.ts:23,51` — keepalive WS reconnect path.
- `packages/cli/src/commands/stop.ts:33` — reads parsed lockfile.
- `packages/cli/src/commands/ui.ts:214,243` — reads server.lock via the resolveLockDir helper at `cli/src/config/paths.ts:19,27`.
- `packages/desktop/src/main/window-manager.ts:461` — Electron checks `<projectPath>/.open-knowledge/server.lock` to decide attach-vs-spawn.
- `packages/app/scripts/perf-prod.sh:93` — bash perf harness reads `$REPO_ROOT/.open-knowledge/server.lock`.
- `packages/app/src/lib/use-collab-url.ts:8,157`, `packages/app/src/components/ConnectingBanner.tsx:61` — client UX surfaces server.lock state messages.

---

## 6. `ok init` scaffolding

`runInit` orchestrates (`packages/cli/src/commands/init.ts:649+`):
1. Calls `initContent(cwd)` (`packages/cli/src/content/init.ts:218-254`):
   - Creates `<cwd>/.open-knowledge/` (`mkdirSync(okDir, recursive)`).
   - Creates `<cwd>/.open-knowledge/cache/` subdir.
   - Calls `ensureGitignoreEntries(<okDir>/.gitignore, OK_GITIGNORE_CONTENT)` — merge-on-upgrade behavior. Template content (`OK_GITIGNORE_CONTENT`, lines 199-216) declares: `cache/`, `server.lock`, `ui.lock`, `sync-state.json`, `principal.json`, `state.json`, `last-spawn-error.log`.
   - Calls `writeIfMissing(<okDir>/config.yml, buildConfigYmlContent(PACKAGE_VERSION))`. The scaffolded `config.yml` (lines 31-152) is heavily commented; **the only un-commented section is the example `folders:` block (commented-out)**. `content.dir` / `include` / `exclude` ship commented-out with their default values shown.
2. Per-editor MCP wiring (Cursor, VS Code, Codex, Claude Desktop, Claude Code) — writes config files outside `.open-knowledge/`.
3. Conditional auto-`git init` (precedent: ensureProjectGit) creates parent `.git/` if absent.

**Idempotence + drift guard:** `packages/cli/src/content/init.test.ts:205-231` parses up the directory tree to find the committed `.open-knowledge/.gitignore` and asserts it matches `OK_GITIGNORE_CONTENT` byte-for-byte (the "committed `.open-knowledge/.gitignore` matches scaffold output" describe block).

**No content directories scaffolded.** Per the comment at `init.ts:228-229`: "Create .open-knowledge/ itself + the cache/ subdir. No scaffold content dirs — content lives wherever config.content.dir points (project root by default)." Older versions wrote `articles/`, `external-sources/`, `research/` (called out in `init.test.ts:117-121`); these are no longer scaffolded.

---

## 7. CC1 broadcast channel paths

`packages/server/src/cc1-broadcast.ts:40-61`:
```
isSystemDoc(documentName) ⇔ documentName === SYSTEM_DOC_NAME ('__system__')
isConfigDoc(documentName) ⇔ documentName ∈ CONFIG_DOC_NAMES (set of '__config__/project', '__user__/config.yml')
```

Both gates are **document-name string comparisons only — no filesystem path construction.** No `.open-knowledge/` substring use. Channels are emitted via `Document.broadcastStateless` over the `__system__` carrier doc.

CC1 does NOT touch `.open-knowledge/` paths anywhere in `cc1-broadcast.ts`. Confirmed via `git grep -n "\.open-knowledge" -- packages/server/src/cc1-broadcast.ts` → 0 hits.

The `CONFIG_DOC_NAMES` constants live in `packages/core/src/constants/cc1.ts` and were renamed in commit `3ecd260b0` (workspace→project) — see Section 8.

---

## 8. Recent rename precedents

### Commit `37e974fb2` — `standalone.ts → server-factory.ts` (PR #399)
- **Files changed: 19** | **+38 / −37** lines | **No backward-compat shim** — pure `git mv` + import-path updates.
- Touched: 1 README, 1 SPA file, 1 server boot file, 4 server file-comment refs, 5 persistence-test files, 1 CLI ui.ts, plus the renamed file pair (`standalone.{ts,test.ts}` → `server-factory.{ts,test.ts}`).
- **Out-of-scope (preserved old name):** `packages/cli/CHANGELOG.md` (historical record); shipped specs `specs/2026-04-14-clone-from-github/*` + `specs/2026-04-08-cli-output-formatting/*` (post-ship corrigendum rule).
- Pattern: hard cutover, no rename shim. JSDoc + 1 runtime `readFileSync` path were updated.

### Commit `3ecd260b0` — workspace scope → project scope (PR #392)
- **Files changed: 60** | **+448 / −454** lines | **No backward-compat shim** for the literal value (`__config__/workspace` → `__config__/project`); affected paths include:
  - Type unions (`FieldScope`, `WriteScope`, `SettingsScope`, `ConfigScopeAttr`)
  - Hocuspocus doc-name `CONFIG_DOC_NAME_WORKSPACE → CONFIG_DOC_NAME_PROJECT` (value `__config__/workspace → __config__/project`)
  - MCP `set_config` enum + `set_folder_rule` literal
  - CLI flag `--scope workspace` → `--scope project`
  - Settings pane URL `/settings/workspace → /settings/project`
  - Published JSON schema filename `config.workspace.schema.json → config.project.schema.json`
  - User-facing copy in scaffolded `config.yml`, MCP tool descs, CLI help, docs (configuration / cli-reference / mcp-integration)
- **Out of scope:** shipped specs (post-ship corrigendum rule), unrelated `workspace` uses (Bun monorepo deps in `package.json`, `/api/workspace` HTTP endpoint, `WorkspaceInfo` / `use-workspace` filesystem-path concept, Cursor URL `workspace=` query param).
- Pattern: hard cutover. Wire-format value AND the on-disk YAML key both changed in one PR. No migration shim for `__config__/workspace` → `__config__/project`. (For comparison the shadow-repo R9 `.git/openknowledge/` → `.git/open-knowledge/` rename in commit `48d4218` DID ship a one-shot `renameSync` shim — see `packages/server/src/shadow-repo.ts:91`.)

### Commit `48d4218` (shadow-repo collapse) — referenced from CHANGELOGs
- Renamed `<root>/.git/openknowledge/` → `<root>/.git/open-knowledge/` and shipped a **`renameSync` shim in `packages/server/src/shadow-repo.ts`** that silently migrates legacy shadows on first run. Test: `packages/server/src/shadow-repo.test.ts:96-134` (R9 rename shim).
- This is the closest precedent for renaming a per-machine durable directory inside a project tree.

---

## 9. Tests with non-default `content.include` / `content.exclude`

### 9.A — `packages/server/src/content-filter.test.ts`
Non-default include/exclude lines:
- L68: `includePatterns: ['**/*.md', '**/*.log']`
- L82: `excludePatterns: ['vendor/**', 'archive/**']`
- L98: `excludePatterns: ['logs/**']`
- L127: `includePatterns: ['**/*.md', '**/*.txt']`
- L144,165,228: `excludePatterns: ['vendor/**']` / `['archive/**']`
- (More — see `grep -nE "(include|exclude)Patterns: \[" packages/server/src/content-filter.test.ts`)

### 9.B — Schema + loader tests
- `packages/cli/src/config/schema.test.ts:103,107` — `exclude: ['node_modules/**', '.claude/**']`.
- `packages/cli/src/config/schema.test.ts:95` — `content: { include: [] }` (rejected by `.min(1)`).
- `packages/cli/src/config/loader.test.ts:155-164` — loads YAML with `exclude: ['**/drafts/**']`.

### 9.C — MCP tool tests
- `packages/cli/src/mcp/tools/set-config.test.ts:110,168,231,237,282,285,289,292,296` — many tests setting `content.include: ['*.md']` / `content.include: ['**/*.md']` / `content.exclude: ['drafts/**']` / and asserting `content.dir` is rejected (NOT_AGENT_SETTABLE).

### 9.D — Preview + content-init tests
- `packages/cli/src/commands/preview.test.ts:78` — `exclude: ['vendored/**']`.
- `packages/cli/src/content/preview.test.ts:50` — `exclude: ['vendored/**']`.

### 9.E — Search MCP test
- `packages/cli/src/mcp/tools/search.ts:114` — at runtime appends `'node_modules', '.git', '.claude', '.changeset', OK_DIR` to the exclude set (this is the **exec/grep tool's hard-coded extra exclude list**, separate from `content.exclude` and outside the user's config).

---

## 10. `@parcel/watcher` ignore option usage

- `packages/server/src/file-watcher.ts:837` — `subscribeOpts = contentFilter ? { ignore: contentFilter.getWatcherIgnoreGlobs() } : undefined;` (then `parcel.subscribe(contentDir, cb, subscribeOpts)` at L840).
- `packages/server/src/content-filter.ts:235` — `getWatcherIgnoreGlobs()` returns `[...rootGitignorePatterns, ...excludePatterns]` filtered to drop `!`-prefixed (negation) and `#`-prefixed (comment) lines.
- **Compatibility caveat:** the comment at content-filter.ts L181-184 says this is a "best-effort optimization" — `@parcel/watcher`'s ignore option uses **micromatch glob syntax**, NOT full gitignore syntax. Negation patterns + nested-gitignore semantics are NOT honored at the watcher layer. The authoritative filter logic still runs in `isExcluded()` after each event (the watcher ignore is purely a performance prefilter so massive trees like `node_modules/` aren't paged into events).
- This means lifting rules to a `.okignore` (gitignore syntax) preserves the existing semantic split: full gitignore for filtering, glob subset for the `@parcel/watcher` prefilter.

---

## 11. MCP tools surface

`packages/cli/src/mcp/tools/set-config.ts` allowlist (5 paths, lines 5-9 + 53-57):
- `content.include` ✅
- `content.exclude` ✅
- `folders[]` ✅
- `mcp.tools.read_document.historyDepth` ✅
- `mcp.tools.search.maxResults` ✅
- `content.dir` ❌ (registered with `agentSettable: false`)

No other MCP tool writes `content.*`. `set-folder-rule.ts` only writes `folders[]`. `get-config.ts` reads. `search.ts` reads include/exclude. No MCP tool exposes `.open-knowledge/` paths to agents directly.

---

## 12. Settings pane UI in `packages/app/`

`packages/app/src/components/settings/SettingsPane.tsx:81-103` has an explicit "Content" section with three fields:
- L88: `path: ['content', 'dir']`, label "Content directory"
- L93: `path: ['content', 'include']`, label "Include patterns", description "Glob patterns selecting which files are content. One per line."
- L98: `path: ['content', 'exclude']`, label "Exclude patterns", description "Glob patterns to skip. One per line."

The pane writes via `useFieldBinding` → `writeConfigPatch`. Tests at `packages/app/src/components/settings/SettingsPane.test.ts`. URL routes: `/settings/project` + `/settings/user` (renamed from `workspace` in commit `3ecd260b0`).

**This is a real end-user surface that will need removal/redesign if `content.include` / `content.exclude` move out of the YAML schema.**

---

## 13. Path-related precedents in `PRECEDENTS.md`

| # | One-line summary |
| --- | --- |
| **#25** | "Classified writer IDs + subject-prefix action encoding in the shadow repo. Every commit to the shadow bare-git-repo (`<projectRoot>/.git/open-knowledge/`) has a writer ID and a subject-prefix that together make `git log refs/wip/<branch>/` legible per actor and per action without parsing commit bodies." Lists writer IDs: `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. **Hardcodes the literal `.git/open-knowledge/` path in the precedent text.** |

No other precedent explicitly mentions `.open-knowledge/`, `content.dir`, content filtering, gitignore, or scoping. Adjacent (mention paths or filesystem semantics):
- **#1** — typed transaction origins (no path content).
- **#11–#14** — bridge invariants (no path content).
- **#22** — shell-script conventions (the only path content is in `packages/app/scripts/`).

The `.open-knowledge` path convention is enforced primarily through:
- `OK_DIR` constant + STOP rules in CLAUDE.md ("No OK sidecars in user-content paths. OK state lives in `<contentDir>/.open-knowledge/`...")
- `fs-traced.ts:49,51` cardinality classifier (the only "file role" classifier the telemetry surface depends on).
- `content-filter.ts` BUILTIN_SKIP_DIRS (NOTE: `.open-knowledge` is NOT in this set — it's NOT a skip dir; it's matched via `.open-knowledge/.gitignore` self-ignoring its own contents).

Confirmed: `BUILTIN_SKIP_DIRS` (content-filter.ts:43-62) lists 23 dirs (`node_modules`, `.git`, build outputs, etc.) — `.open-knowledge` is NOT one of them. The repo relies on `.open-knowledge/.gitignore` self-ignoring everything inside (lock files, cache/, etc.) so the filter walks INTO `.open-knowledge/` but finds no content matches.
