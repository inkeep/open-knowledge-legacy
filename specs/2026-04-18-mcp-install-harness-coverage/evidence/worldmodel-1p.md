---
title: "Worldmodel (1P) — MCP install harness coverage"
description: "Read-only topology of Open Knowledge's `ok init` + editor targeting + MCP config write machinery. Scope strictly 1P; the 3P harness landscape is mapped in reports/mcp-server-auto-install-harnesses/ and deliberately NOT redone here."
sources:
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/editors.ts
  - packages/cli/src/commands/init.test.ts
  - packages/cli/src/content/init.ts
  - packages/cli/src/constants.ts
  - packages/cli/src/config/paths.ts
  - packages/cli/src/utils/is-object.ts
  - packages/cli/src/cli.ts
  - packages/cli/package.json
  - packages/server/src/process-lock.ts
  - packages/server/src/server-lock.ts
  - specs/2026-04-07-init-spike/SPEC.md
  - specs/2026-04-08-cli-packaging/SPEC.md
  - specs/2026-04-11-zero-config-bunx-packaging/SPEC.md
  - specs/2026-04-13-cli-init-clarity/SPEC.md
  - specs/2026-04-16-zero-ceremony-resume/SPEC.md
  - specs/2026-04-16-post-ship-docs-polish/SPEC.md
  - reports/mcp-server-auto-install-harnesses/REPORT.md
created: 2026-04-18
type: worldmodel
tags:
  - worldmodel
  - mcp
  - init
  - cli
  - topology
---

# Worldmodel (1P) — MCP install harness coverage

**Scope.** 1P only — Open Knowledge's repo-internal init / MCP-config-write machinery. The 3P landscape (14 evidence files in `reports/mcp-server-auto-install-harnesses/`) is authoritative for harness externals and is deliberately not rewalked.

**Stance.** Non-prescriptive topology. Surfaces, connections, entities, prior specs. No recommendations.

## Meta

- **Channels run:** code (inline L1 scan of `packages/cli/src/commands/` + related), reports (scanned `reports/mcp-server-auto-install-harnesses/REPORT.md` header only, per scope), catalogs (none available in this repo — `product-surface-areas` etc. not present).
- **Channels unavailable:** web (skipped per scope), OSS (skipped per scope).
- **Depth:** light / focused — caller already holds the 3P map and the 1P foundation is tightly bounded.

## 1. Core surfaces — MCP install write paths

### Surface 1: `packages/cli/src/commands/editors.ts` (editor target registry)

- **What.** Declarative registry of 5 editor IDs and their MCP config shapes. Single source of truth for what `init` knows how to target. (`editors.ts:11-88`)
- **Key exports.**
  - `EditorId = 'claude' | 'cursor' | 'vscode' | 'codex' | 'windsurf'` (`editors.ts:11`)
  - `ALL_EDITOR_IDS` constant enumeration (`editors.ts:13`)
  - `EditorMcpTarget` interface with fields `{ id, label, configPath, format, topLevelKey, buildEntry, scope, instructionsPath? }` (`editors.ts:18-39`)
  - `EDITOR_TARGETS: Record<EditorId, EditorMcpTarget>` — the registry itself (`editors.ts:41-88`)
  - `resolveEditorTargets(ids)` — validates + resolves; throws on unknown (`editors.ts:91-99`)
- **Entity facts (verbatim from registry).**
  - Per-entry `scope: 'project' | 'global'` field.
  - `format: 'json' | 'toml'` — only two formats in the codebase.
  - `topLevelKey: 'mcpServers' | 'servers' | 'mcp_servers'` — three distinct top-level keys in the codebase (`editors.ts:27`).
  - Only Claude declares `instructionsPath` (→ `CLAUDE.md`). Comment at `editors.ts:32-38` explicitly notes "every other editor picks up the tool-agnostic root AGENTS.md which `open-knowledge init` always writes."
  - MCP server command is hardcoded: `command: 'npx'`, `args: ['@inkeep/open-knowledge', 'mcp']` (`editors.ts:15-16`). VS Code alone adds `type: 'stdio'` (`editors.ts:67`).
- **Per-editor config-path shape (verbatim).**
  | id | configPath | format | topLevelKey | scope |
  | --- | --- | --- | --- | --- |
  | claude | `<cwd>/.mcp.json` (`editors.ts:45`) | json | mcpServers | project |
  | cursor | `<cwd>/.cursor/mcp.json` (`editors.ts:55`) | json | mcpServers | project |
  | vscode | `<cwd>/.vscode/mcp.json` (`editors.ts:64`) | json | servers | project |
  | codex | `<cwd>/.codex/config.toml` (`editors.ts:73`) | toml | mcp_servers | project |
  | windsurf | `<home>/.codeium/windsurf/mcp_config.json` (`editors.ts:82`) | json | mcpServers | **global** |

### Surface 2: `packages/cli/src/commands/init.ts` (the init command)

- **What.** Commander.js subcommand wiring + three internal stages: content scaffold, per-editor MCP config write, `.claude/launch.json` scaffold, root AGENTS.md/CLAUDE.md injection, optional content preview. `runInit(options)` is the pure entry point; `initCommand()` is the Commander wrapper.
- **Key functions.**
  - `readJsonConfig(path)` / `readTomlConfig(path)` — non-atomic reads, throw on malformed (`init.ts:46-86`).
  - `writeJsonConfig(path, config)` / `writeTomlConfig(path, config)` — **non-atomic** writes; `mkdirSync(dirname(path), { recursive: true })` + `writeFileSync(path, serialized, 'utf-8')` with trailing newline (`init.ts:92-106`). No tmp-file+rename pattern in this file.
  - `writeEditorMcpConfig(target, cwd, force, home)` — reads existing config → checks `MCP_SERVER_NAME` presence → merges + writes. Returns `EditorMcpResult` with action enum `'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed'` (`init.ts:287-350`).
  - `scaffoldLaunchJson(cwd, force)` — special Claude-only path at `<cwd>/.claude/launch.json`. Diffs existing entry via `diffLaunchEntry` and returns a richer action enum including `'skipped-stale'` with `staleFields: string[]` (`init.ts:153-281`). Runtime target is hardcoded to `open-knowledge-ui`: `runtimeExecutable: 'npx'`, `runtimeArgs: ['@inkeep/open-knowledge', 'ui']`, `port: 3000` (`init.ts:223-231`).
  - `runInit(options)` — orchestrates scaffold + per-editor write + launch.json + AGENTS.md. Returns `InitCommandResult` with backward-compat `mcpAction`/`mcpPath`/`mcpError` fields derived from the Claude result (`init.ts:356-428`).
  - `formatInitResult(result, cwd)` — renders a padded table for human-readable stdout (`init.ts:437-593`).
  - `detectInstalledEditors(cwd, home?)` — probes `dirname(configPath)` for each editor (`init.ts:619-629`). Referenced by both the interactive TTY branch (as pre-selection defaults) and the non-TTY branch (as fallback selection). Note: Claude is **always** detected because its `configPath` dirname is cwd itself (`init.test.ts:740-744`).
- **CLI flag surface (`init.ts:631-739`).**
  - `--mcp` / `--no-mcp` (boolean, default true)
  - `--force` (overwrite existing `open-knowledge` entries)
  - `--editor <editors>` — comma-separated `claude,cursor,vscode,codex,windsurf,all`
  - Three selection branches: explicit flag, interactive TTY (`@clack/prompts` `multiselect`), non-TTY fallback (`detectInstalledEditors`).

### Surface 3: `packages/cli/src/content/init.ts` (content scaffold + AGENTS.md)

- **What.** `initContent(projectDir)` creates `.open-knowledge/{AGENTS.md, .gitignore, config.yml, cache/}`. `upsertRootInstructions(projectDir, force, extraFiles?)` appends / replaces the open-knowledge-marked section in AGENTS.md + extra per-editor instruction files (`content/init.ts:277-327`).
- **Marker convention.** `<!-- open-knowledge:begin --> ... <!-- open-knowledge:end -->` regex-matched at `content/init.ts:5-7`. Behavior per file: missing → create; no marker → append; has marker → skip unless `force`, else replace between markers.
- **Symlink handling.** `realpathSync` de-duplicates targets so a CLAUDE.md → AGENTS.md symlink writes once and returns `'skipped-symlink'` for the second (`content/init.ts:288-295`).
- **Writes.** All plain `writeFileSync` — same non-atomic pattern as `init.ts`.

### Surface 4: `packages/cli/src/constants.ts`

- `OK_DIR = '.open-knowledge'` (`constants.ts:4`)
- `AGENTS_FILENAME = 'AGENTS.md'` (`constants.ts:7`)
- `MCP_SERVER_NAME = 'open-knowledge'` (`constants.ts:17`) — the keyed entry name inside `mcpServers` / `servers` / `mcp_servers`.

### Surface 5: `packages/cli/src/cli.ts` (command wiring)

- Single `new Command()` program at `cli.ts:40`. `init` is wired at `cli.ts:94`.
- Global `--cwd` flag performs `process.chdir()` in the `preAction` hook (`cli.ts:55-61`), so every subcommand resolves paths against that cwd.
- Sibling commands registered: `start` (default), `mcp`, `preview`, `ui`, `stop`, `clean`, `status` + auth group.

## 2. File-write utilities — audit for atomic-write prior art

- **Search result.** `rg '(atomicWrite|writeAtomic|renameSync|\.tmp$)'` across `packages/cli/src` returned no matches for atomic-write helpers.
- **What exists instead.**
  - `packages/server/src/process-lock.ts:118-128` uses `openSync(path, 'wx', 0o600)` (O_CREAT|O_EXCL) for **lockfile** creation — the only atomic-create pattern in the CLI+server tree. Comment explicitly calls out: "Create uses `openSync(path, 'wx')` (O_CREAT|O_EXCL) rather than a check-then-write pattern so two concurrent `ok start` invocations cannot both succeed via last-writer-wins." (`process-lock.ts:86-94`)
  - Config writes in `init.ts` (`writeJsonConfig`, `writeTomlConfig`) are plain `writeFileSync`. No tmp+rename, no `wx` flag, no fsync.
- **Relevance.** The 3P report §Executive Summary flags Claude Code's `.claude.json` concurrent-write corruption bugs (#28842 / #28847 / #29036 / #29153 / #29217) and says "direct file-write with known atomic-rename can be SAFER than `claude mcp add`" (`reports/mcp-server-auto-install-harnesses/REPORT.md:59`). The 1P code does not currently implement the atomic-rename safety that the 3P report cites as desirable — this is an **ADJACENT** gap between the 3P research's framing and the 1P implementation.

## 3. Tests (1P)

- `packages/cli/src/commands/init.test.ts` — 810 lines. Coverage:
  - `runInit` backward-compat behavior (`init.test.ts:30-181`)
  - Per-editor write matrix — Cursor / VS Code / Windsurf / Codex with preservation of other entries (`init.test.ts:186-301`)
  - Multi-editor scenarios — combined writes, `all`, force, partial failure, idempotence, `--no-mcp` (`init.test.ts:303-409`)
  - `launch.json` scaffolding — fresh create, stale-entry diff, skip-up-to-date, `--force` migration, merge with other configs, absent-when-not-Claude (`init.test.ts:415-564`)
  - Per-editor instruction injection — CLAUDE.md vs AGENTS.md-only (`init.test.ts:570-636`)
  - Content preview block rendering (`init.test.ts:642-715`)
  - `detectInstalledEditors` — always-Claude, per-editor dir detection, empty-detection fallback (`init.test.ts:722-809`)
- **No dedicated `editors.test.ts`** — the registry is exercised indirectly through `init.test.ts` only.

## 4. Connections — what depends on / feeds init

- **Depends on (feeds init):**
  - `content/init.ts::initContent` — scaffolding (`init.ts:362`)
  - `content/init.ts::upsertRootInstructions` — AGENTS.md / CLAUDE.md (`init.ts:406-409`)
  - `content/preview.ts::previewContent` + `formatPreviewBlock` — post-init content scope block (`init.ts:718-729`)
  - `config/loader.ts::loadConfig` + `config/paths.ts::resolveContentDir` — content scope resolution for preview (`init.ts:719-722`)
  - `constants.ts::{OK_DIR, MCP_SERVER_NAME}` (`init.ts:20`)
  - `ui/colors.ts::warning` — stale-entry highlighting (`init.ts:27`)
  - `utils/is-object.ts::isObject` — JSON/TOML root shape guard (`init.ts:28`)
  - `smol-toml` — TOML parse/stringify (codex path only, `init.ts:19`)
  - `@clack/prompts` (dynamic import) — interactive multiselect (`init.ts:662`)
- **Feeds into (downstream consumers):**
  - `init.ts` is the only caller of `editors.ts`'s registry API.
  - MCP server registration is **consumed** by editors at runtime reading their own config files; no 1P code reads back the written MCP config for verification. `packages/plugin/.mcp.json` is a project-local consumer (root `.mcp.json` equivalent; `server.ts` calls `exec("pnpm run claude-setup")`-style references in a README but not code).
  - Server-lock discovery (`server-lock.ts` / `process-lock.ts`) is read by `mcp.ts` at runtime but the init path does not write into the lock file — these are independent mechanisms. The `preview_start("open-knowledge-ui")` flow references the `launch.json` entry that `init.ts` scaffolds, so there is an indirect init → Claude Code runtime chain via launch.json.
- **Explicit non-dependency.** There is no 1P atomic-write helper, no lock-while-writing-MCP-config pattern, no concurrency guard for the init write path itself.

## 5. Entities & terminology — the repo's vocabulary

- **Editor terminology.** `EditorId` (enum type), `EditorMcpTarget` (interface), `EDITOR_TARGETS` (registry), `ALL_EDITOR_IDS` (enumeration), `detectInstalledEditors` (probe).
- **Action enum — MCP write.** `'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed'` (`init.ts:115`).
- **Action enum — launch.json (richer).** `'created' | 'merged' | 'skipped-existing' | 'skipped-stale' | 'failed'` with `staleFields` payload (`init.ts:156-173`). No equivalent stale-diff concept for MCP config writes.
- **Action enum — root instructions.** `'created' | 'appended' | 'replaced' | 'skipped-existing' | 'skipped-symlink'` (`content/init.ts:254-259`).
- **Scope.** `scope: 'project' | 'global'` — only Windsurf is `'global'` (`editors.ts:86`). The 3P report repeatedly distinguishes project-scope vs user-global scope; 1P's vocabulary mirrors this but the implementation surface is one field per registry entry.
- **Server-process identity.** `MCP_SERVER_NAME = 'open-knowledge'` (`constants.ts:17`) is the name used as the key inside `mcpServers` / `servers` / `mcp_servers`. Distinct from the binary name (`open-knowledge`, `package.json:13`) and from the launch.json config name (`open-knowledge-ui`, `init.ts:154`).

## 6. Prior specs & reports touching init / MCP-config / editor targeting

- `specs/2026-04-07-init-spike/SPEC.md` — Foundation validation spec; references `init` as a deliberate first-surface (V1-V7 validations). Originated the `.open-knowledge/` convention. Doesn't cover multi-editor MCP registration.
- `specs/2026-04-08-cli-packaging/SPEC.md` — Introduced `@inkeep/open-knowledge` as the published CLI package; `init` scaffolds `.open-knowledge/`, `start` runs Hocuspocus, `mcp` provides MCP stdio. No multi-editor surface yet; Claude-only was implicit.
- `specs/2026-04-11-zero-config-bunx-packaging/SPEC.md` — Track T4 "Claude Code plugin" packaging + auto-scaffold on first `start` (start-side init path; different from `open-knowledge init` but the same scaffolder).
- `specs/2026-04-13-cli-init-clarity/SPEC.md` — The spec that expanded init to the current five-editor multi-target shape: post-init content preview (R1), standalone `open-knowledge preview` (R2), cross-platform `start --open` (R3). Evidence at `evidence/current-init-cli-shape.md` documents the pre-expansion shape.
- `specs/2026-04-16-zero-ceremony-resume/SPEC.md` — Introduced `ok ui` sibling-process split, `ui.lock`, and US-003 "flip init default from `['claude']` to all detected editors." The `detectInstalledEditors` probe + TTY-preselect / non-TTY-fallback dichotomy at `init.ts:619-708` is this spec's US-003/FR-3.1/D-013. Evidence at `evidence/launch-json-and-port.md` documents why `launch.json`'s `runtimeArgs` changed from `['open-knowledge', 'start']` to `['@inkeep/open-knowledge', 'ui']`.
- `specs/2026-04-16-post-ship-docs-polish/SPEC.md` — Docs-only follow-up for an unrelated pipeline-health ship; confirmed the post-ship corrigendum protocol used repo-wide. Not init-related.
- **3P reference.** `reports/mcp-server-auto-install-harnesses/REPORT.md` — 14 evidence files; authoritative 3P map. Worldmodel scope explicitly excludes its re-walk.

## 7. UNRESOLVED / ADJACENT / INACCESSIBLE

- **ADJACENT — atomic-write pattern gap.** The 1P config writes (`writeJsonConfig`, `writeTomlConfig`) are non-atomic `writeFileSync`. The 3P report identifies `~/.claude.json` concurrent-write corruption bugs as a reason direct file-write can be safer than `claude mcp add` **when** the writer is atomic. 1P has a well-formed atomic-create pattern in `packages/server/src/process-lock.ts:122` (O_EXCL) but nothing equivalent for MCP config writes. Trail: searched `packages/cli/src` for `atomicWrite|writeAtomic|renameSync|\.tmp$` — zero hits for config-write utilities; only lock-file creation uses atomic semantics.
- **ADJACENT — no 1P harness-detection fingerprint beyond config-directory presence.** `detectInstalledEditors` probes `dirname(configPath)` only (`init.ts:619-629`). It does not check whether the editor binary is installed, nor does it read any state.vscdb / existing config content. The 3P report describes richer detection surfaces (e.g., Cursor's `state.vscdb` SQLite MCP state; `.claude/settings.local.json` for trust bypass). 1P does not currently consume any of these.
- **ADJACENT — user-scope (global) Claude Code config.** The 3P report surfaces `~/.claude.json` as Claude Code's user-scope config. The 1P `EDITOR_TARGETS.claude` entry is project-scope only (`<cwd>/.mcp.json`). `specs/2026-04-16-zero-ceremony-resume` NG4 explicitly NEVERs `~/.claude/.mcp.json` as user-global fallback ("User-locked; project root only for Claude"). Documented as a non-goal, not an oversight.
- **ADJACENT — `claude mcp add` / `codex mcp add` vendor CLIs.** The 3P report identifies per-harness vendor CLIs as cleaner-than-config-write in some cases (idempotency, env-var flags). 1P exclusively writes configs directly — no shell-out to `claude mcp add` etc. anywhere in `packages/cli/src/commands/`.
- **UNRESOLVED (narrow).** `packages/plugin/.mcp.json` exists (surfaced by grep at `packages/plugin/.mcp.json`) as a project-local MCP config distinct from what `init` writes. Brief check did not include reading it because scope is init's output, not the packaged plugin's self-config. Trail: `rg '(mcpServers|claude\.json|claude_desktop_config|\.cursor/mcp|config\.toml|\.mcp\.json)' packages/` returned 5 files; 4 are init-related; the fifth is this plugin.
