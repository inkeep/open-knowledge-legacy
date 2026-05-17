---
scope: 1P codebase surfaces related to open-knowledge init + MCP config writing
sources:
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/editors.ts
  - packages/cli/src/commands/init.test.ts
  - packages/cli/src/utils/
  - packages/server/src/process-lock.ts
  - specs/2026-04-13-cli-init-clarity/
  - specs/2026-04-16-zero-ceremony-resume/
  - packages/plugin/.mcp.json
date: 2026-04-18
---

# Worldmodel — 1P Codebase Surfaces

## Surfaces

**Registry source of truth:** `packages/cli/src/commands/editors.ts` (99 lines).
- 5 editors: `claude`, `cursor`, `vscode`, `codex`, `windsurf`
- 2 formats: `'json' | 'toml'`
- 3 top-level keys: `mcpServers` | `servers` | `mcp_servers`
- Only `windsurf` has `scope: 'global'`; only `claude` has `instructionsPath` (CLAUDE.md)
- Hardcoded MCP command: `npx @inkeep/open-knowledge mcp` at line 15-16

**Orchestrator:** `packages/cli/src/commands/init.ts` (740 lines).
- Generic reader/writer utilities: `readJsonConfig`, `readTomlConfig`, `writeJsonConfig`, `writeTomlConfig` (lines 46-106)
- Per-editor write: `writeEditorMcpConfig` (lines 287-350) — idempotent merge, preserves existing `mcpServers`
- Detection: `detectInstalledEditors` (lines 619-629) — probes `dirname(configPath)` presence only
- Launch.json scaffolding: `scaffoldLaunchJson` (lines 221-281) — sophisticated `diffLaunchEntry` stale-field detection with `staleFields: string[]` in `LaunchJsonResult`
- Action enum: MCP config writes use `'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed'` (line 115)
- Launch.json uses richer enum: `'created' | 'merged' | 'skipped-existing' | 'skipped-stale' | 'failed'` (line 156-161)

**Tests:** `init.test.ts` (810 lines) — matrix coverage per editor + multi-editor + force/no-mcp + launch.json stale/merge + AGENTS.md/CLAUDE.md injection. **No dedicated `editors.test.ts`** — registry is exercised only indirectly.

**Atomic-write precedent in tree:** `packages/server/src/process-lock.ts:122` — uses `O_EXCL` flag for lockfile creation (single atomic-write pattern in the repo). Not reused by MCP config writes.

**Separate MCP config consumer:** `packages/plugin/.mcp.json` — plugin package has its own `.mcp.json`. Not touched by `init` command but shares the same shape.

## Connections & Dependencies

- `init` depends on: `content/init.ts` (scaffolds `.open-knowledge/`), `content/preview.ts` (renders preview block), `config/loader.ts`, `constants.ts` (MCP_SERVER_NAME), `ui/colors.ts` (warning output), `utils/is-object.ts`
- `editors.ts` has no internal imports beyond `node:os` and `node:path` — deliberately minimal
- Downstream of `init`:
  - `.mcp.json` etc. → read by the user's AI coding harness (external)
  - `.open-knowledge/` → read by `ok start`, `ok mcp`, `ok ui`
  - `.claude/launch.json` → read by Claude Code's preview-browser feature
  - `AGENTS.md` / `CLAUDE.md` → read by agents inside their harnesses

## Entities & Terminology

- `EditorId`: `'claude' | 'cursor' | 'vscode' | 'codex' | 'windsurf'`
- `EditorMcpTarget`: `{id, label, configPath, format, topLevelKey, buildEntry, scope, instructionsPath?}`
- `MCP_SERVER_NAME`: single constant — all entries share this name
- **Scope concept already exists** at `target.scope: 'project' | 'global'` — used for display hints only in `init.ts:674`; no behavioral branching on scope in current code. Our spec's `--global` flag would be the first behavioral use.
- No "sidecar" concept today — `launch.json` is tightly coupled to `claude` target, no generalized activation-file pattern.

## Patterns Observed

**Convergence:**
- Every target reads → merges → writes its config file — same shape
- Every target's config probe uses `existsSync(dirname(configPath))` — no binary-presence check, no richer fingerprinting
- `instructionsPath` is declarative (returns file path) — no imperative logic per-editor

**Divergence:**
- VS Code uses `type: 'stdio'` discriminator in entry shape; others don't (line 67 vs line 48/58/76/85)
- VS Code uses `servers` key; Codex uses `mcp_servers`; others use `mcpServers`
- Windsurf is the only `scope: 'global'` target — its `configPath` takes `home` as second arg

## Personas & Audiences

(From existing code's comment + `init.test.ts` + prior specs)
- Non-TTY callers: CI, agents, Docker entrypoints, npm postinstall — expect `detectInstalledEditors` fallback
- TTY callers: interactive developers — see `@clack/prompts` multiselect with detection pre-checked
- Agents invoking the MCP: consume tool responses; `previewUrl` field is the post-2026-04-16 standard

## Prior Research (existing specs)

- `specs/2026-04-13-cli-init-clarity/` — ORIGINAL multi-target init spec (expanded beyond Claude-only). Establishes the `EditorMcpTarget` pattern. Introduced `detectInstalledEditors`.
- `specs/2026-04-16-zero-ceremony-resume/` — US-003 flipped default from `['claude']` to all-detected (line 377-393 per init.ts inspection — current TTY + non-TTY branches). Introduced `ok ui` split; drove current `launch.json` shape with `stale-fields` detection.
- `specs/2026-04-16-zero-ceremony-resume` **NG4** — explicitly NEVERs `~/.claude/.mcp.json` as user-global fallback. Text: *"`.mcp.json` at `~/.claude/` as user-global fallback. User-locked; project root only for Claude."* Specifies a nonstandard path `~/.claude/.mcp.json`, NOT the standard Anthropic user-scope file `~/.claude.json`. Stance wording ("project root only for Claude") is ambiguous — could be interpreted narrowly (the specific `~/.claude/` path is rejected) or broadly (all user-scope Claude Code rejected). **NEEDS USER CLARIFICATION.**
- `specs/2026-04-16-zero-ceremony-resume` NG11 — never change `server.lock` JSON schema additive-only.

## 3P Landscape

**Out of scope for worldmodel pass** — fully covered in `reports/mcp-server-auto-install-harnesses/` (14 evidence files + REPORT.md, committed at aced0253).

Key prior-research pointers relevant to this spec's data model:
- `reports/mcp-server-auto-install-harnesses/evidence/anthropic-harnesses.md` — confirms `~/.claude.json` (top-level + `projects.*` sub-scope) vs `claude_desktop_config.json` as two distinct install surfaces
- `reports/mcp-server-auto-install-harnesses/evidence/cli-vs-file-write.md` — concurrent-write corruption bug class
- `reports/mcp-server-auto-install-harnesses/evidence/cursor-first-run-reliability.md` — `permissions.json` + `state.vscdb` details
- `reports/mcp-server-auto-install-harnesses/evidence/enable-by-default.md` — `settings.local.json` trust-prompt bypass

## Unresolved / Adjacent

- **`packages/plugin/.mcp.json` relationship to main `init`** — not touched by our installer; its lifecycle is separate. Is this a parallel MCP consumer within the repo? Needs brief investigation.
- **Cross-platform path resolution** — current `Windsurf` target uses `home ?? homedir()`; new `claude-desktop` target needs OS-branching path resolution (macOS Application Support / Windows APPDATA / Linux n/a). No existing OS-branching pattern in `editors.ts`.
- **Atomic write on Windows** — `packages/server/src/process-lock.ts:122` uses `O_EXCL` for creation, but no existing pattern for atomic *replacement* (tmp+rename). Some npm packages (`write-file-atomic`) handle Windows EPERM retry; worth considering as dependency or reference.
- **Test surface for 11-ID registry** — currently `editors.ts` has no direct test. Expansion to 11 IDs (our spec) would benefit from a dedicated `editors.test.ts`.
