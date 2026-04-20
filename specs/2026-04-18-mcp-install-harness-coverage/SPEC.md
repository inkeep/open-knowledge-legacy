# MCP Install Harness Coverage — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-20
**Baseline commit:** aced0253 (spec initiated); spec now builds on `origin/main` at `31888dcc` (post-#221)
**Links:**
- Research report: [reports/mcp-server-auto-install-harnesses/](../../reports/mcp-server-auto-install-harnesses/) (REPORT.md + 18 evidence files including source audits)
- Evidence: [./evidence/](evidence/) (spec-local findings)
- Changelog: [./meta/_changelog.md](meta/_changelog.md)
- **Prior-art (MERGED 2026-04-20):** [PR #221 — feat(init): register Claude Desktop + upgrade Windsurf to global-scope writes](https://github.com/inkeep/open-knowledge/pull/221) — Tim's spec at [`specs/2026-04-17-claude-desktop-init-cwd/SPEC.md`](../2026-04-17-claude-desktop-init-cwd/SPEC.md). Shipped: `claude-desktop` editor target, `--cwd <abs>` baking in args, Windsurf upgraded to project-qualified keys with legacy migration, shared `globalScopeResolveServerKey` helper. Our spec layers on top (user-scope + sidecars + atomic writes + `--yes` + Codex `--cwd`).
- **Dependency (OPEN):** [PR #207 — enforce strict MCP routing](https://github.com/inkeep/open-knowledge/pull/207) at HEAD `c7bb5132` (last updated 2026-04-18 03:48 UTC). Adds `createProjectRoutingResolver` runtime. Our spec's `--cwd` arg (D-7) needs to also set `bypassProjectSelection: true` when #207 merges, or Codex + Claude Desktop Chat hit `ROOTS_UNAVAILABLE_ERROR` on every tool call despite `--cwd` being baked (by #221) into their configs.

---

## 1) Problem statement

**Situation.** Open Knowledge ships `open-knowledge mcp` (a stdio MCP server) and installs it into AI coding harnesses via `open-knowledge init`. **As of main post-PR #221 (merged 2026-04-20), init covers 6 harnesses** at project- or global-scope: Claude Code (`.mcp.json`), Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`), Codex (`.codex/config.toml`), Windsurf (global-scope with project-qualified keys + `--cwd` baked), and **Claude Desktop** (NEW via #221 — macOS + Windows, project-qualified keys + `--cwd` baked, Linux refused). The shared `globalScopeResolveServerKey` helper is the template for every global-scope target.

**Complication.** The 7-harness research (`reports/mcp-server-auto-install-harnesses/REPORT.md`) surfaced coverage gaps that #221 partially closed. Remaining gaps:

1. **Project-scope only for 3 of 6 shipped targets.** Users who expect "install once, use in any project" have to re-run `init` in every directory. No user-scope path exists for Claude Code (`~/.claude.json`), Cursor (`~/.cursor/mcp.json`), or Codex (`~/.codex/config.toml` — user-scope).
2. **Codex `--cwd` not baked.** PR #221 baked `--cwd` into Claude Desktop + Windsurf configs (global-scope targets); Codex's project-scope and user-scope configs still use plain `npx @inkeep/open-knowledge mcp`. Codex doesn't advertise MCP `roots` ([A8 confirmed](../../reports/mcp-server-auto-install-harnesses/evidence/codex-roots-source-audit.md)); when PR #207 merges and strict routing takes effect, every Codex tool call will throw `ROOTS_UNAVAILABLE_ERROR` because `--cwd` isn't baked.
3. **Codex Desktop broken by project-scope** ([openai/codex#13025](https://github.com/openai/codex/issues/13025)): Codex Desktop ignores `.codex/config.toml` project-scope. User-scope `~/.codex/config.toml` is the only path that works there.
4. **Codex user-scope collides across projects** — a new finding from adopting #221's lens. Codex at user-scope has the same latent multi-project collision bug Windsurf had pre-#221: single `open-knowledge` key + no `--cwd` + global config file = last-init-wins silent overwrite. Needs the `globalScopeResolveServerKey` pattern (D-12).
5. **Missing activation files.** Cursor Desktop requires `~/.cursor/permissions.json` for zero-click tool approval; Cursor CLI requires a post-write `cursor-agent mcp enable` step; Claude Code project scope triggers a TTY trust prompt that's bypassable via `.claude/settings.local.json` pre-stage. Today none of these are written.
6. **Windows concurrent-write corruption.** Claude Code has 5 documented `.claude.json` corruption bugs ([#28842](https://github.com/anthropics/claude-code/issues/28842), [#28847](https://github.com/anthropics/claude-code/issues/28847), [#29036](https://github.com/anthropics/claude-code/issues/29036), [#29153](https://github.com/anthropics/claude-code/issues/29153), [#29217](https://github.com/anthropics/claude-code/issues/29217)). Main's `writeFileSync` (and #221's shipped writes) inherits the same class; an atomic tmp+rename primitive fixes it.
7. **No `--yes` flag.** Headless/CI/`npm postinstall` use cases can't skip the Clack prompt cleanly.
8. **Cowork mode unusable.** Claude Desktop Chat (standalone) works after #221. Cowork does NOT — in-VM `claude` binds its MCP root to `/sessions/<name>/` ephemeral VM scaffolding (see D-11 / D-Intake-2). Architectural limit; not our bug to fix.

**Resolution.** Extend `editors.ts` with user-scope targets (Claude Code, Cursor, Codex user-scope) behind a `--global` flag; adopt #221's `globalScopeResolveServerKey` pattern for `codex-user` (and bake `--cwd` into both Codex project-scope and user-scope configs); pre-stage activation sidecar files; implement atomic writes via `write-file-atomic`; support `--yes` for headless install. Wire `--cwd` to set `bypassProjectSelection: true` when #207 merges so the baked `--cwd` actually closes #207's regression for Codex + Claude Desktop Chat. Document Cowork's reliability caveats (#24433 closed-"not-planned"; #26259 stdio bridge race open; D-11 architectural limit) as known product-level limits.

## 2) Goals

- **G1:** `open-knowledge init` covers all 7 target harnesses with zero-click install on the happy path.
- **G2:** Writes are atomic (tmp+rename) and safe to run while harnesses are live.
- **G3:** `init --yes` is non-interactive and scriptable — works in Docker entrypoints, npm `postinstall`, CI pipelines.
- **G4:** Claude Desktop **standalone** is "supported" — install writes `claude_desktop_config.json` (**shipped in #221**) + wires `--cwd` to `bypassProjectSelection` in #207 (D-7). Cowork **mode** is explicitly documented as NOT SUPPORTED (D-11) — caveat block in `init` output + docs cite the architectural root cause so users aren't surprised.
- **G5:** `init --global` opts into user-scope writes for Claude Code, Cursor, and Codex (in addition to project-scope).
- **G6:** Existing behavior preserved — default `init` matches today's project-scope-first semantics.

## 3) Non-goals

- **[NEVER]** NG1: Fix Cowork's per-tool approval bug (#24433). Anthropic closed as not-planned; not our bug to fix.
- **[NEVER]** NG2: Fix Cowork's stdio bridge race (#26259). Same — Anthropic upstream.
- **[NEVER]** NG12: Work around Cowork's in-VM cwd binding (`/sessions/<name>/` instead of mounted workspace). Requires Anthropic to ship #26287 (`--cwd` flag) OR change Cowork launcher spawn cwd. No user-land path exists that doesn't compromise PR #207's strict routing. See D-11 + [cowork-launcher-cwd-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-launcher-cwd-audit.md).
- **[NEVER]** NG13: Re-ship work already merged in PR #221. Our spec no longer proposes `claude-desktop` target creation, `--cwd` arg baking for global-scope editors, Windsurf legacy migration, or the `globalScopeResolveServerKey` helper — those are all live on main at `31888dcc`. Our delta is layered on top: user-scope targets, sidecars, atomic writes, `--yes`, Codex `--cwd` baking, and the #207 `--cwd` → `bypassProjectSelection` wiring.
- **[NEVER]** NG3: Ship localhost HTTP transport for the MCP. Research concluded (`evidence/localhost-http-per-harness.md`) localhost HTTP worsens 2 of 7 harnesses (Claude Code Desktop rejects `http://`; Cowork VM can't reach host-localhost per #28018). Stdio remains correct primary.
- **[NEVER]** NG4: Ship a custom deep-link URI scheme. No harness consumes one.
- **[NOT NOW]** NG5: Runtime MCP self-registration via `/mcp add` or skill-driven install. Only Cursor Desktop has a runtime API (`vscode.cursor.mcp.registerServer()`); every other harness requires session/app restart. — Revisit if: Claude Code #46426 (hot-reload MCP) ships OR Codex #7767 is reopened OR ≥2 vendors add runtime register.
- **[NOT NOW]** NG6: Ship a signed Cursor extension wrapper for runtime install. — Revisit if: Cowork/Cursor CLI CI become P0 user-blockers that other paths can't serve.
- **[NOT NOW]** NG7: Windsurf / Zed / Cline / VS Code Copilot / additional harnesses. Windsurf is already shipped (user-global); others not in research scope. — Revisit if: users request or harness growth signals it.
- **[NOT UNLESS]** NG8: Replace direct file-write with `claude mcp add` / `codex mcp add` CLI delegation. — Only if: atomic tmp+rename proves unreliable across OSes in the wild OR vendors ship significant schema migration that's impractical to track.
- **[NOT UNLESS]** NG9: Ship a cross-harness installer manifest format (Open Knowledge-specific "mcp.install.json" describing per-harness shapes). — Only if: we ship >1 MCP server AND want shared install logic. Single-product today.
- **[NOT UNLESS]** NG10: Implement the Cowork supergateway/tunnel fallback in our installer. — Only if: Cowork becomes a P0 user-blocker AND Anthropic's #26259/#24433 show no fix trajectory.

## 4) Personas / consumers

- **P1 — Solo developer (primary):** runs `open-knowledge init` in a project, expects it to work across whatever AI coding harnesses they have installed. Likely wants `--global` for reuse across projects.
- **P2 — Team lead setting up a repo:** runs init for a team; expects project-scope files to commit to git so the team shares config. Matches current primary persona.
- **P3 — Downstream agent running inside a harness:** agent wants to invoke `init` for itself (user says "set up open-knowledge"). Needs to work headless / non-interactively via `--yes`.

## 5) User journeys

### P1 — Solo developer

**Happy path:**
1. `npx @inkeep/open-knowledge init` OR `open-knowledge init --global --yes` (if already installed)
2. init detects installed harnesses (Claude Code, Claude Desktop, Cursor, Codex — whatever user has)
3. init writes per-harness MCP config + activation sidecars atomically
4. User opens their preferred harness → MCP is live with zero clicks on most surfaces, 1 click on Cursor Desktop (per-tool approval pre-staged), Cowork shows caveat notice from docs

**Failure / recovery:**
- Write conflict on existing Open Knowledge entry → `init --force` documented in output
- Harness not detected → `init --editor claude-desktop,cursor` explicit override
- Atomic write fails mid-rename → we log + leave prior file untouched (atomic = all-or-nothing)

**Aha moment:** User opens Claude Code AND Claude Desktop AND Cursor, all three immediately see the same Open Knowledge MCP with the same tools.

**Debug experience:** `init --verbose` (future) shows per-harness write status; `open-knowledge doctor` (exists? check in worldmodel) diagnoses missing pieces.

### P2 — Team lead

**Happy path:**
1. `open-knowledge init` (no `--global`)
2. init writes project-scope files only: `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`, `.claude/settings.local.json` (trust-bypass sidecar)
3. Commit these to git → team clones repo, Open Knowledge works for everyone in the project
4. `.claude_desktop_config.json` is NOT written (it's host-user-global, not shareable via git — skipped when `--global` not passed)

### P3 — Downstream agent / CI

**Happy path:**
1. Agent or CI runs `open-knowledge init --yes`
2. init detects harnesses non-interactively, writes all, prints machine-readable summary
3. Exit code 0 on success; nonzero on failed writes; one line per harness with action taken

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `init` (TTY interactive) | clack multiselect prompt | "no editors detected" message | error line per failed write | per-editor write summary | mix of success + skipped-existing + failed |
| `init --yes` | no prompts | exit 1 with hint | nonzero exit code | stdout summary | same as TTY but no prompts |
| `init --global` | same as above | same | same | user-scope + project-scope written | subset OK |
| Claude Desktop write | — | (target file absent → create) | write race with Desktop | entry in `mcpServers` | — |
| Cursor permissions.json write | — | (file absent) | schema error | `mcpAllowlist` entry | merge with existing allowlist |
| settings.local.json write | — | (file absent) | JSON parse error | `enabledMcpjsonServers` entry | merge with existing |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| ~~Must~~ | ~~FR-1: `init` writes `claude_desktop_config.json` on macOS + Windows~~ | **SHIPPED in PR #221** at `31888dcc`. macOS + Windows covered; Linux throws friendly error. Project-qualified keys (`open-knowledge-<slug>`); `--cwd` baked into args. | Our spec inherits #221's target; adds the sidecar sweep (FR-3) + atomic writes (FR-5) |
| Must | FR-2: `init --global` writes user-scope variants for Claude Code (`~/.claude.json`), Cursor (`~/.cursor/mcp.json`), Codex (`~/.codex/config.toml`) | All three files exist with entry; existing user-scope `mcpServers` preserved; **Codex user-scope uses project-qualified keys + `--cwd` per D-12** (same pattern as Windsurf global-scope) | Claude Code + Cursor user-scope can use single `open-knowledge` key because those clients route via `roots/list`; Codex cannot |
| Must | FR-3: `init` writes `.claude/settings.local.json` with `enabledMcpjsonServers: ["open-knowledge"]` whenever it writes `.mcp.json` project-scope | File exists; user-scope Claude Code session doesn't prompt for trust on first open | [anthropics/claude-code#9189](https://github.com/anthropics/claude-code/issues/9189) |
| Must | FR-4: `init` writes `~/.cursor/permissions.json` with `mcpAllowlist: ["open-knowledge:*"]` whenever it writes Cursor config | File exists; tool approvals skipped on first Cursor launch | [cursor.com/docs/reference/permissions](https://cursor.com/docs/reference/permissions) |
| Must | FR-5: All file writes use atomic tmp+rename | Concurrent `init` runs don't corrupt target files; verified by a unit test that runs two concurrent writes and checks file integrity | Fixes Claude Code Windows bug class |
| Must | FR-6: `init --yes` runs non-interactively | No prompts emitted; exits 0 on success; exits nonzero with hint on "no detected editors" | Matches existing non-TTY fallback at line 700-707; add explicit flag |
| Must | FR-7: Post-write `cursor-agent mcp enable open-knowledge` when Cursor CLI is installed | If `cursor-agent` binary on PATH, invoke `mcp enable` after file-write; log success/failure; don't fail init on failed enable | Graceful degradation — enable is nice-to-have |
| Must | FR-8: Claude Desktop caveat block in `init` output when `claude-desktop` target written | Output distinguishes: (a) Claude Desktop **standalone** (chat MCP) — works; (b) Claude Desktop **Cowork mode** — NOT SUPPORTED, cites in-VM cwd issue + #26259 + #24433 + #26287; (c) Linux — Desktop not available at all | Truth-in-advertising per D-Intake-2 + D-11; Cowork architectural limit not our bug to fix |
| Should | FR-9: `--editor` flag accepts new IDs: `claude-desktop`, `claude-user`, `cursor-user`, `codex-user` | Comma-separated list + `all` expands to all 9 IDs | Preserve existing IDs; additive |
| Should | FR-10: `init --verbose` prints per-file write path + action | Useful for debugging; silent by default | Nice-to-have |
| Could | FR-11: `open-knowledge uninstall` command | Reverses init — removes `open-knowledge` entries from all config files; idempotent | Out of scope for this spec; tracked in Future Work |

### Non-functional requirements

- **Performance:** `init` completes in <2s on the happy path (5-9 file writes, mostly local disk).
- **Reliability:** Atomic writes — partial state never observed. Re-runnable — idempotent. Failed write on one harness doesn't abort others.
- **Security/privacy:** No secrets in any written config. No network calls from `init` itself. All writes to user-owned paths.
- **Operability:** `init` output is machine-parseable (one line per harness). Nonzero exit on any failure. Debug via `--verbose`. Logs go to stdout not stderr (unless error).
- **Cost:** No new dependencies. Reuse existing `smol-toml`, `@clack/prompts`, `commander`, node `fs`.

## 7) Success metrics & instrumentation

- **Metric 1:** User-reported install success across 7 harnesses (qualitative; bug reports as negative signal).
  - Baseline: 5 harnesses covered, project-scope only, no activation files, no atomic writes.
  - Target: All 7 harnesses write successfully in E2E test on macOS + Linux + Windows.
  - Instrumentation: new `packages/cli/src/commands/init.test.ts` cases per harness.
- **Metric 2:** Zero `~/.claude.json` corruption reports when users run `init` concurrently with a live Claude Code session.
  - Baseline: unknown (no reports today, but we also don't ship atomic writes — latent risk).
  - Target: atomic tmp+rename verified by concurrent-write unit test.
  - Instrumentation: unit test — fork two write processes, diff final file state against expected.
- **What we log:** `init` output already lists per-editor action; extend to cover new targets. Flag warning-level output for Cowork caveats.
- **How we'll know adoption/value:** E2E test on CI (Linux, macOS) validates all 7 recipes. Windows manual verification initially (no Windows CI today).

## 8) Current state (how it works today)

### State of `origin/main` at commit `31888dcc` (post-#221, 2026-04-20 16:50 UTC)

PR #221 **shipped independently of our spec** and covers a meaningful slice of what our draft proposed. Summary of the shipped world:

- **Covered today:** 6 editor targets. Editor IDs: `claude`, `cursor`, `vscode`, `codex`, `windsurf`, `claude-desktop`.
  - Project-scope: `claude`, `cursor`, `vscode`, `codex` — plain `open-knowledge` key, no `--cwd`.
  - Global-scope: `windsurf`, `claude-desktop` — project-qualified keys (`open-knowledge-<slug>`), `--cwd <abs>` baked into args, realpath-matched idempotence, `-2`/`-3`/… auto-disambiguation.
- **`globalScopeResolveServerKey` helper** (`packages/cli/src/commands/global-scope-entry.ts`) — shared by both global-scope targets; the template our `codex-user` must adopt (D-12).
- **`--cwd <abs-path>` CLI flag EXISTS** (since before our spec): `cli.ts:33` preAction hook calls `process.chdir(opts.cwd)`. When MCP's `editors.ts buildEntry(cwd)` emits `['@inkeep/open-knowledge', 'mcp', '--cwd', cwd]`, the subprocess starts in the right directory and `process.cwd()` is set accordingly. This is what makes #221 work pre-#207.
- **File-write pattern exists but non-atomic:** `writeMcpConfig` uses plain `writeFileSync`. Our D-Intake-3 adds `write-file-atomic` as a drop-in replacement.
- **Idempotence:** `#221`'s `resolveServerKey` does identical-vs-conflicting-vs-missing via realpath match on `--cwd` arg; survives hand-crafted keys. Different shape than #207's `init.ts` trichotomy but semantically equivalent — both land together cleanly.
- **Detection:** `detectInstalledEditors` probes `dirname(configPath)`. Linux skip for `claude-desktop` is a throw from `configPath`, not a silent pass.
- **Restart hint:** `formatInitResult` emits "quit and relaunch Claude Desktop to activate" on written/overwritten.
- **Flags today:** `--cwd`, `--mcp/--no-mcp`, `--force`, `--editor`.

### State of `PR #207` (OPEN at HEAD `c7bb5132`, 2026-04-18 03:48 UTC — pre-dates #221 merge)

- **`mcp.ts:299`** (on main) uses `projectDir = process.cwd()` — hard-bound at subprocess spawn (works with `--cwd` because `cli.ts` chdir's first).
- **#207 replaces that** with `createProjectRoutingResolver({ startupCwd, listRoots, bypassProjectSelection, log })`:
  - `resolveCwd(explicit?)` precedence: explicit tool-call `cwd` → `bypassProjectSelection` path (returns `startupCwd`) → cached `roots/list` (1 root) → throw
  - Three typed errors: `NO_CLIENT_ROOTS_ERROR`, `MULTIPLE_ROOTS_ERROR`, `ROOTS_UNAVAILABLE_ERROR`
  - `roots/list_changed` notification handler wired (dormant for Claude Code; Claude Code advertises `roots: {}` without `listChanged` per A7)
  - `bypassProjectSelection: true` currently surfaced ONLY via `--port` CLI flag. **`--cwd` does NOT currently trigger bypass in #207.** Our D-7 adds that wiring (~10 LoC).
  - `normalize-cwd.ts` via `realpath` for stable cache keys across symlinked paths
  - #207 also shipped its own Claude Desktop target (plain entry, no `--cwd`) — **overlapping with #221's superior shape**. On rebase mike must drop #207's claude-desktop in favor of main's #221 version.
- **Latent regression in #207 as written:** When #207 merges, Codex + Claude Desktop Chat hit `ROOTS_UNAVAILABLE_ERROR` / `NO_CLIENT_ROOTS_ERROR` on EVERY tool call — because the `--cwd` that #221 bakes into Codex configs doesn't propagate to `bypassProjectSelection`. The resolver goes straight to `roots/list` and fails. Our D-7 is the wiring fix.

### MCP routing landscape per harness (from source audits — unchanged)

- Claude Code CLI / Desktop / Cowork in-VM: advertises `roots` capability (`{}`, no `listChanged`); returns 1 root = startup cwd (`@anthropic-ai/claude-code@2.1.114` binary offset ~9320, `T8()` = `m_.originalCwd`). Works with PR #207 ✅
- Codex CLI / Desktop / IDE ext: **does NOT advertise `roots`** (`codex-rs/codex-mcp/src/mcp_connection_manager.rs:1400-1419`, `roots: None`). **Breaks under PR #207** without `--cwd`→bypass wiring ❌
- Cursor CLI / Desktop: advertises `roots` with `listChanged: false`; multi-root spawns N MCP instances. Works with PR #207 ✅
- Claude Desktop Chat: no workspace concept; advertises no meaningful root. **Breaks under PR #207** without `--cwd`→bypass wiring ❌ (despite `--cwd` being baked by #221)

### Known gaps (post-#221, pre-this-spec)

- **Non-atomic writes** — inherits Claude Code concurrent-write corruption class; applies to #221's writes too
- **No user-scope targets for Claude Code / Cursor / Codex** — `--global` flag entire unshipped
- **Codex user-scope pattern missing** — single `open-knowledge` key would collide across projects at user-scope; needs `globalScopeResolveServerKey` + `--cwd` baking (D-12)
- **Codex project-scope also lacks `--cwd`** — #221 only baked `--cwd` for global-scope targets; Codex project-scope still uses plain entry. Breaks under #207 until fixed.
- **No activation-sidecar writes** (`permissions.json`, `settings.local.json`)
- **No post-write activation for Cursor CLI** (`cursor-agent mcp enable`)
- **No `--yes` flag** — non-TTY fallback works but isn't discoverable; `init` still emits Clack prompt in piped contexts
- **No `--cwd`→`bypassProjectSelection` wiring in #207** — the baked `--cwd` from #221 doesn't rescue Codex/Desktop-Chat once #207 merges

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:** Same `open-knowledge init` command, extended:
  - New flag: `--global` — opts into user-scope writes for Claude Code, Cursor, Codex (alongside project-scope).
  - New flag: `--yes` — non-interactive; skips all prompts; installs to all detected harnesses.
  - Extended `--editor` flag: accepts `claude-desktop`, `claude-user`, `cursor-user`, `codex-user` in addition to existing IDs.
  - New: Cowork caveat block printed when Claude Desktop target is written.
- **Docs/onboarding:** Update repo README to describe the 7-harness coverage + `--global` / `--yes` flags. Add a "Known Cowork caveats" section that documents #24433 + #26259 verbatim.
- **Error messages:** On write failure, include the specific harness + file + error; point to the existing "manual setup" link.

### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `npx @inkeep/open-knowledge init` (CLI only) | Terminal output | Per-harness write status matches expected |
| `npx @inkeep/open-knowledge init --yes` | Terminal output | No prompts; completes; exit code correct |
| `npx @inkeep/open-knowledge init --global` | Terminal output | Both project + user-scope files written |
| `npx @inkeep/open-knowledge init --editor claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` | Entry added; existing entries preserved |

### System design

**Data model — `EditorId` post-#221 + our delta:**

```typescript
export type EditorId =
  // Project-scope (existing on main)
  | 'claude'               // <project>/.mcp.json                  (single key, no --cwd)
  | 'cursor'               // <project>/.cursor/mcp.json           (single key, no --cwd)
  | 'vscode'               // <project>/.vscode/mcp.json           (single key, no --cwd)
  | 'codex'                // <project>/.codex/config.toml         WITH --cwd baked (D-7 delta to main)
  // Global-scope (existing on main — #221 shape)
  | 'windsurf'             // ~/.codeium/windsurf/mcp_config.json  (global-scope helper, --cwd baked)
  | 'claude-desktop'       // claude_desktop_config.json           (global-scope helper, --cwd baked)
  // User-scope (new, via --global — our spec adds)
  | 'claude-user'          // ~/.claude.json                       (single key, no --cwd — routes via roots) (D-5)
  | 'cursor-user'          // ~/.cursor/mcp.json                   (single key, no --cwd — routes via roots)
  | 'codex-user';          // ~/.codex/config.toml                 WITH --cwd baked + globalScopeResolveServerKey (D-12)
```

That's **9 IDs total** — 6 existing on main at `31888dcc` + 3 new user-scope variants.

**Key design split (new, via D-12):**
- **Clients that route via MCP `roots/list`** (Claude Code, Cursor) use **single `open-knowledge` key + no `--cwd`** at user-scope. The client advertises different roots per session; our MCP routes correctly without install-time baking.
- **Clients that do NOT route via roots** (Codex, Claude Desktop — any client whose `roots/list` fails/returns wrong) use **project-qualified keys + `--cwd` baking** via the `globalScopeResolveServerKey` helper. Applies at both project-scope (Codex project needs `--cwd` baked) AND user-scope (`codex-user` needs the full globalScope pattern + `--cwd`).

**Sidecar files (D-3)** are NOT separate IDs — written automatically inside the main target's write path:
- `claude` target → writes `<project>/.mcp.json` + `<project>/.claude/settings.local.json` + appends `.claude/settings.local.json` to `<project>/.gitignore` (D-10)
- `cursor` + `cursor-user` targets → writes `.cursor/mcp.json` + `~/.cursor/permissions.json` (always user-scope — Cursor `permissions.json` is global-only)

**Post-write activation (D-4):**
- `cursor` + `cursor-user` targets → shell out to `cursor-agent mcp enable open-knowledge` if `cursor-agent` binary on PATH; graceful no-op otherwise; 10s timeout

**`--cwd <abs-path>` arg baking (D-7, aligned with #221's naming):**
- **Already baked in main** (via #221): `claude-desktop`, `windsurf`
- **This spec bakes**: `codex` (project-scope), `codex-user` (user-scope via `globalScopeResolveServerKey`)
- Other targets — no `--cwd` arg; clients advertise roots via `roots/list`, #207 routes correctly
- **Runtime delta to PR #207 (D-7):** `mcp.ts` must set `bypassProjectSelection: true` when `--cwd` is present (currently only `--port` sets it). ~10 LoC.

### Alternatives considered

(see existing §9 alternatives section — unchanged; D-5/D-6/D-7/D-8/D-9/D-10 now LOCKED with full evidence)

**Architecture overview (layered on main @ `31888dcc`):**

```
init command
  │
  ├─ detectInstalledEditors(cwd, home)  ← existing (#221); extended with 3 user-scope IDs
  │
  ├─ for each selected target:
  │    ├─ readConfig (JSON or TOML)                   ← existing
  │    ├─ target.resolveServerKey?.(existing, cwd)    ← existing for global-scope (#221);
  │    │                                                  our `codex-user` adopts helper
  │    ├─ merge open-knowledge entry                  ← existing (#221's resolveServerKey semantics)
  │    └─ writeConfigAtomic (NEW)                     ← D-Intake-3 wraps existing writeMcpConfig
  │
  ├─ for Cursor CLI (NEW): shell out `cursor-agent mcp enable open-knowledge`
  │      - only if binary on PATH; graceful no-op otherwise
  │
  ├─ write activation sidecars (NEW): settings.local.json + permissions.json
  │      - orchestrated inside each main target's write path (D-3)
  │      - .gitignore append for settings.local.json (D-10)
  │
  ├─ print per-harness summary (existing #221 format — reuse disambiguation + matched-key hints)
  │
  └─ if claude-desktop written: existing "quit and relaunch" hint (#221) + (NEW) Cowork caveat block (D-11)
```

**Enforcement points:**

- Atomic write primitive: `packages/cli/src/utils/write-file-atomic.ts` (new).
  - Writes to `<path>.<pid>.<random>.tmp` → `fsync` → `rename`.
  - On rename failure: unlink tmp, throw. Prior file unchanged.
- Activation sidecars: orchestrated inside `runInit` — when `claude` target written, also write `claude-settings` sidecar (unless `--no-mcp`). Similar for `cursor` → `cursor-permissions`.
- Cowork caveat: printed once per init run if `claude-desktop` in written set.

**Observability:**

- Per-harness action line already in `formatInitResult`. Extend to cover sidecars with sub-bullet nesting.
- Atomic-write failures are first-class errors (logged with file + cause).
- No telemetry sent to any server. Local-first ethos.

#### Data flow diagram

- **Primary flow:**
  ```
  User runs init → detectInstalledEditors → [TTY: multiselect | non-TTY: auto] →
  resolveEditorTargets → for each target: readConfig → merge → writeFileAtomic →
  (optional) shellOut cursor-agent → print summary
  ```
- **Shadow paths to test:**
  - **nil / missing:** Target directory absent → file creation + parent mkdir (existing pattern)
  - **empty:** Existing config file empty string → treated as `{}` (existing)
  - **wrong type:** Existing config's root is array not object → throw (existing)
  - **timeout:** Shell-out to `cursor-agent mcp enable` — hangs; add 10s timeout (new)
  - **conflict:** Two `init` processes racing → atomic rename wins last-write; neither observes partial state (NEW primitive prevents corruption)
  - **partial failure:** One harness write fails → other harnesses continue; exit nonzero with per-harness status (existing)

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Atomic write | Rename fails mid-op | `fs.rename` throws | Unlink tmp; throw; init continues with other targets | Per-target failure message; other harnesses unaffected |
| `cursor-agent` shell-out | Binary not on PATH | `ENOENT` | Silent no-op, note in summary | Cursor CLI still usable after manual `agent mcp enable`; docs explain |
| `cursor-agent` shell-out | Hangs | 10s timeout | Kill child; log warning | Cursor CLI partially configured; user can run `agent mcp enable` manually |
| Claude Desktop path resolution | Linux detected | `process.platform === 'linux'` | Skip `claude-desktop` target with silent no-op | Linux users don't get Claude Desktop (which doesn't exist on Linux) |
| JSON/TOML parse | Existing config malformed | `JSON.parse` / `parseToml` throws | Per-target failure; other targets continue | User sees error with file path; fixes manually |
| Concurrent init runs | Two processes writing same file | Each does own atomic rename | Last write wins; no corruption | UX implication: rare but possible; no data loss |

### Alternatives considered

- **Option A — call `claude mcp add` / `codex mcp add` CLIs instead of file-write.** Rejected (D-Intake-3 LOCKED): atomic tmp+rename in our own code is 15 lines; CLI delegation inherits Claude Code's concurrent-write corruption bugs + requires binaries on PATH + differs per harness (Codex overwrites, Claude errors).
- **Option B — ship the localhost HTTP transport alongside stdio.** Rejected (NG3): research confirmed it worsens 2 of 7 harnesses. Future work if ecosystem shifts.
- **Option C — implement Cowork supergateway/tunnel fallback in our installer.** Rejected (NG10): not a transport problem; won't fix per-tool approval bug.
- **Option D — use `EditorScope` enum instead of flat ID proliferation** (alternative data model, flagged above). In consideration for iteration loop.
- **Option E — split this into two PRs (Claude Desktop + atomic writes first, Cursor polish second).** Rejected (D-Intake-1 LOCKED): single-spec coverage is cleaner.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D-Intake-1 | All 7 harnesses in one spec (not phased) | Cross | LOCKED | No | Research is done; spec cost similar for 1 vs 7. Cohesive implementation. | Intake turn | Single PR covers all gaps |
| D-Intake-2 | Cowork split: Claude Desktop **standalone** = "supported" (chat MCP works); Claude Desktop **Cowork mode** = "NOT SUPPORTED — architectural limit" | Product | **LOCKED (revised 2026-04-18 post-audit)** | No | `claude_desktop_config.json` is shared between Desktop standalone and Cowork — one file, two consumption modes. Standalone Desktop chat MCP works; Cowork's in-VM `claude` advertises `/sessions/<sessionName>/` (ephemeral VM scaffolding, NOT user content) as its MCP root, and our `--cwd` arg cannot reach the in-VM process's routing because MCP loads in-VM. Four reinforcing blockers: (1) MCP root ≠ user content, (2) no in-VM cwd lever (#26287 CLOSED by Anthropic), (3) stdio bridge race #26259 (open, zero staff engagement 6 weeks), (4) per-tool approval #24433 (closed "not planned"). | [cowork-launcher-cwd-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-launcher-cwd-audit.md) + [cowork-deep-dive.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-deep-dive.md) | Docs state Desktop standalone works; Cowork does not. `init` caveat block makes the distinction explicit. Cowork re-evaluation blocked on Anthropic resolving #26287 OR changing spawn cwd to mount path. |
| D-Intake-3 | Atomic writes across all targets; **adopt `write-file-atomic` npm package** (not DIY) | Technical | LOCKED | No | ~5kB dep; battle-tested (npm itself uses it); 100M+ weekly DLs; zero-dep (no transitive). Windows EPERM semantics + fsync + retry handled correctly. DIY estimate revised 15→30-40 lines with tests. | [evidence/cli-vs-file-write.md](../../reports/mcp-server-auto-install-harnesses/evidence/cli-vs-file-write.md) | New `write-file-atomic.ts` thin facade; replaces `writeFileSync` calls at `init.ts:95,105` |
| D-Intake-4 | `--yes` flag for non-interactive install | Cross | LOCKED | No | Enables Docker / postinstall / CI use cases. Matches `add-mcp -y` pattern. | [evidence/extended-tooling-survey.md](../../reports/mcp-server-auto-install-harnesses/evidence/extended-tooling-survey.md) | New flag in commander; threads through to non-TTY path |
| D-1 | `--global` flag for user-scope writes; default stays project-scope | Cross | LOCKED | No | Via /analyze — preserves team-lead persona's current workflow; solo developers opt in. `--yes` implies `--global` for headless "install everything" UX. | Intake + /analyze | New flag; expands selected IDs to include user-scope variants |
| D-2 | Flat `EditorId` list (11+ IDs) over `EditorScope` enum | Technical | DIRECTED | No | Matches prior spec's flat-ID precedent (`specs/2026-04-13-cli-init-clarity`); simpler test surface; one-to-one mapping per target. | Worldmodel + /analyze | Expand `EditorId` from 5 to ~11 IDs covering sidecars + user-scope variants |
| D-3 | Sidecar files (`settings.local.json`, `permissions.json`) written automatically when main target is selected — NOT separate `--editor` IDs | Technical | DIRECTED | No | User-facing simplicity: one `--editor claude` install is one mental action. Sidecars are implementation detail. | /analyze | `runInit` orchestrates sidecar writes inside each main target's write path |
| D-4 | `cursor-agent mcp enable` shell-out when binary on PATH; graceful no-op otherwise | Technical | LOCKED | No | Closes zero-click gap for Cursor CLI users without making install fail for Cursor-Desktop-only users. 10s timeout on shell-out. | /analyze | Post-write step in `writeEditorMcpConfig` for `cursor` target when binary detected |
| **D-5** | **Uphold prior spec NG4 narrowly — allow `~/.claude.json` under `--global`; keep NG4's `~/.claude/.mcp.json` path rejection intact** | Cross | **LOCKED** | **YES** (precedent) | NG4 rejected `~/.claude/.mcp.json` specifically (nonstandard path); `~/.claude.json` is Anthropic's canonical user-scope file (documented; `claude mcp add --scope user` writes here). Different files, different semantics. | /analyze + [specs/2026-04-16-zero-ceremony-resume/SPEC.md](../2026-04-16-zero-ceremony-resume/SPEC.md) NG4 | Adds `claude-user` target writing `~/.claude.json` under `--global`; spec NG11 restates prior NG4's path-specific rejection |
| ~~**D-6**~~ | ~~Claude Desktop (`claude_desktop_config.json`) written only under `--global`~~ | Cross | **SUPERSEDED by #221** (merged 2026-04-20 `31888dcc`) | No | #221 shipped `claude-desktop` target via detect-and-preselect (NOT `--global`-gated) + `--cwd` baked + project-qualified keys + Linux refusal. Tim's spec argued for detect-and-preselect; merged. Our original `--global` gate rationale ("default stays project-scope") loses here because `claude-desktop` is global-scope by nature (host-user file, not project file) — the `--global` gate conflated two different axes. | #221 spec [`specs/2026-04-17-claude-desktop-init-cwd/SPEC.md`](../2026-04-17-claude-desktop-init-cwd/SPEC.md) D4 | No action needed. Our spec inherits #221's Claude Desktop target verbatim. |
| **D-7** | **Wire `--cwd <abs-path>` on the `mcp` command to set `bypassProjectSelection: true` in #207's resolver + bake `--cwd` into Codex targets** (project-scope + user-scope). #221 already bakes `--cwd` into Claude Desktop + Windsurf; this extends the pattern and closes #207's latent regression. | Technical | **LOCKED** (renamed `--project` → `--cwd` to align with #221) | No | `--cwd` arg already exists on main (since before #221) — `cli.ts:33` preAction chdir. #221 bakes it into global-scope editors. **Missing piece**: (1) #207's `startMcpServer` currently only sets `bypassProjectSelection` via `--port`; our ~10 LoC delta adds a `--cwd` branch too. (2) Codex project-scope + user-scope still use plain entries (no `--cwd`); our spec bakes `--cwd` for both via `editors.ts`. Rationale: Codex never advertises `roots` ([codex-roots-source-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/codex-roots-source-audit.md)) — post-#207 it hits `ROOTS_UNAVAILABLE_ERROR` on every tool call without this. | Source audits + #207 live diff + #221 shipped pattern | `editors.ts`: add `--cwd` to `codex.buildEntry` and create `codex-user` with full globalScope pattern; `mcp.ts`: `--cwd` also sets `bypassProjectSelection: true` when #207 merges |
| **D-8** | **Spec builds on `origin/main` at `31888dcc` (post-#221) AND takes PR #207 at HEAD `c7bb5132` as a soft dependency.** Our spec layers user-scope targets + sidecars + atomic writes + `--yes` on top of #221's shipped patterns. | Cross | **DIRECTED** | No | Recommended sequencing: **#207 merges → we rebase → implement.** #221 is done; #207 is the runtime dependency for D-7's bypass wiring. If #207 stalls, D-7 can be split: atomic writes + `--yes` + user-scope ship independently; `--cwd`→bypass wiring ships in #207's PR or a follow-up after #207 merges. | #221 `31888dcc` + [PR #207 at `c7bb5132`](https://github.com/inkeep/open-knowledge/pull/207) | Baseline moves from `aced0253` to #207's merge commit post-merge |
| ~~**D-9**~~ | ~~Idempotent-merge trichotomy~~ | Technical | **SUPERSEDED by #221** | No | #221 shipped `resolveServerKey` — matches existing entries by realpath-normalized `--cwd` (regardless of key), handles hand-crafted keys, auto-disambiguates on collision. Semantically richer than #207's planned identical-vs-conflicting trichotomy. When #207 rebases onto `31888dcc`, #221's shape wins (it's more correct for global-scope editors + backwards-compatible with project-scope). | #221 `resolveServerKey` in `global-scope-entry.ts` | No action needed. |
| **D-10** | **`.claude/settings.local.json` added to project `.gitignore` automatically by init** | Product | **LOCKED** | No | Matches dev-tooling `.local.*` convention (VS Code, JetBrains). Trust-bypass is user-machine-local; shouldn't propagate via git. Each team member approves their own. | /analyze | New idempotent `.gitignore` append primitive — single line `.claude/settings.local.json` |
| **D-11** | **Cowork is NOT a supported consumer of `open-knowledge mcp` under the current Anthropic Cowork architecture. Claude Desktop standalone (chat MCP) IS supported via `claude-desktop` target (shipped in #221) + D-7 `--cwd`→bypass wiring.** | Cross | **LOCKED** | No (conditional — unlocks if Anthropic ships cwd-controlling flag) | Opus source audit proves Cowork's in-VM `claude` spawns with `cwd=/sessions/<sessionName>/` (not the mounted workspace), advertises that ephemeral path as its MCP root, and has no user-facing lever to change it. PR #207's `ProjectRoutingResolver` would hand that path to our MCP, which cannot resolve a valid Open Knowledge project there. `--cwd` baking (via #221) cannot remediate because the MCP runs in-VM with the VM-side absolute path, not a host path. | [cowork-launcher-cwd-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-launcher-cwd-audit.md) (281 lines, 4 primary sources) | `claude-desktop` target still ships (serves standalone Desktop); init caveat block explicitly warns Cowork-mode users; docs source-of-truth cite this audit. Re-evaluate when Anthropic ships #26287 (`--cwd` flag) OR changes Cowork spawn cwd to mount path. |
| **D-12** | **Codex user-scope target (`codex-user`) uses project-qualified keys + `--cwd` baking via the shared `globalScopeResolveServerKey` helper — same pattern #221 applied to Windsurf.** | Technical | **LOCKED** | No | Codex does not advertise MCP `roots` (A8 CONFIRMED via Rust source audit). Single `open-knowledge` key at user-scope (`~/.codex/config.toml`) has the same latent multi-project collision bug Windsurf had pre-#221 — last-init-wins silent overwrite. The `globalScopeResolveServerKey` helper is now the canonical pattern for any global-scope editor that lacks roots-based routing. Applies `detectLegacy: false` (Codex user-scope doesn't have a legacy form pre-dating this spec — our spec creates the target). | #221 `global-scope-entry.ts` + codex-roots-source-audit.md | Adopt helper verbatim; `codex-user.buildEntry(cwd)` returns `['@inkeep/open-knowledge', 'mcp', '--cwd', cwd]`; `codex-user.resolveServerKey` calls `globalScopeResolveServerKey(existing, cwd, {detectLegacy: false})` |
| **D-13** | **Codex project-scope target gets `--cwd` baked into `buildEntry(cwd)` — same one-line change as Claude Desktop project-scope (#221 didn't touch project-scope targets, but Codex is the one project-scope harness that needs it).** | Technical | **LOCKED** | No | Codex at project-scope still works today via `process.cwd()` binding (main's `mcp.ts:299`). Post-#207, the resolver tries `roots/list` first and throws because Codex doesn't advertise. Without `--cwd` baked, project-scope Codex breaks when #207 merges — same class of regression as `codex-user`. Single-key is fine (config is project-local, no collision risk). | Source audits + #207 diff | `codex.buildEntry(cwd)` widened from `(_cwd) => {...}` to `(cwd) => {...--cwd, cwd}`; matches #221's `buildEntry` widening convention |

## 11) Open questions

Most P0 items were resolved via /analyze + two source audits (2026-04-18). Remaining open items are listed first; resolved items are kept as historical record with status `RESOLVED → D-N` pointing at the Decision Log entry.

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| Q3 | `cursor-agent mcp enable` shell-out reliability: does the binary accept `mcp enable <name>` non-interactively and exit 0 on success? | T | P0 | Open — verify empirically with `cursor-agent --version >= TBD`; A3 assumption carries risk |
| Q4 | Windows path resolution for `%APPDATA%\Claude\claude_desktop_config.json` — what's the cleanest branch pattern (new helper vs inline `process.platform` switch)? | T | P0 | Open — will decide during implementation; no existing OS-branching in `editors.ts` |
| Q7 | Does `cursor-agent mcp enable` persist across sessions, or require re-run on next Cursor launch? | T | P2 | Deferred — matters for uninstall/upgrade, not install |
| Q19 | Which docs need updates: `README.md`, `CLAUDE.md`, `AGENTS.md`, `packages/cli/README.md`? | X | P0 | Open — all four likely; resolve during implementation |
| ~~Q-Cowork-cwd~~ | ~~What cwd does the Cowork launcher (`@ant/claude-swift`) set when spawning in-VM `claude`?~~ | T | P0 | **RESOLVED → D-11** (cwd = `/sessions/<sessionName>/`; workspace passed via `--add-dir`, permission-only not cwd — [cowork-launcher-cwd-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-launcher-cwd-audit.md)) |
| Q-PR207 | Coordination sequencing with PR #207 — ship our spec first, after, or merged? | X | P0 | **Directed:** after #207 merges. Our spec builds on main post-#221; #207 is the runtime dependency for D-7's bypass wiring. If #207 stalls, split: atomic writes + `--yes` + user-scope can ship independently on main; D-7 wiring ships with or after #207. |
| Q-PR207-cowork-err | Should #207 detect the `/sessions/<sessionName>/?$` pattern in its routing resolver and throw a Cowork-specific error (pointing at Anthropic #26287 + #26259) distinct from `NO_CLIENT_ROOTS_ERROR`? | T | P1 | Recommend to mike in coordination note; if accepted, reduces our support-triage burden but is his PR's call to make. |
| Q-PR207-cwd-wiring | Will mike accept our `--cwd → bypassProjectSelection` wiring into #207 directly, or land it as a follow-up? | X | P0 | Open — proposal goes in coordination note. Landing in #207 closes the Codex + Claude Desktop Chat regression before #207 merges. Landing as follow-up means #207 ships broken for those 3 harnesses (even though #221 already bakes `--cwd` into their configs) until our follow-up merges. |
| Q-221-rebase | When #207 rebases onto main `31888dcc`, whose Claude Desktop target wins? | X | P0 | **Recommend: #221's version wins** (superior shape — project-qualified keys + `--cwd` baked + globalScopeResolveServerKey). #207's claude-desktop target (plain entry, no `--cwd`, no qualification) should be dropped during rebase. Mention in coordination note. |

### Resolved (historical)

| ID | Question | Resolved by |
|---|---|---|
| Q1 | Flat `EditorId` list vs `EditorScope` enum | D-2 (flat) |
| Q2 | Sidecars — automatic or separate `--editor` IDs | D-3 (automatic) |
| Q5 | `--yes` defaults to all detected | Follows D-Intake-4; confirmed by /analyze |
| Q6 | Linux Claude Desktop — silent skip (no-op) | Follows precedent |
| Q8 | Atomic write Windows EPERM retry strategy | D-Intake-3 (adopt `write-file-atomic` package which handles EPERM) |
| Q9 | Write `claude-desktop` when undetected | NO — consistent with other targets' detection pattern |
| Q10 | `~/.claude.json` top-level vs `projects.*` | Top-level only (Anthropic docs) |
| Q11 | `.claude/settings.local.json` in `.gitignore`? | D-10 (add to `.gitignore`) |
| Q12 | `--yes` + `--editor` precedence | Explicit list wins; `--yes` just skips prompts |
| Q13 | Cowork caveat block location | stdout, normal verbosity |
| Q15 | `write-file-atomic` npm package vs DIY | D-Intake-3 (adopt package) |
| Q16 | `--global` on no-user-scope harness | Silent no-op |
| Q17 | Claude Desktop gate on `--global`? | D-6 (gate on `--global`) |
| Q18 | Codex project-scope still worth writing given #13025? | YES — CLI still respects it; also add user-scope via `--global` |
| Q20 | Windows path display | Native backslashes |
| Q-NG4 | NG4 precedent blocks `~/.claude.json`? | D-5 (uphold NG4 narrowly) |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Status |
|---|---|---|---|---|
| A1 | Claude Desktop Chat / Cowork's `claude_desktop_config.json` path is OS-dependent and stable: macOS = `~/Library/Application Support/Claude/`, Windows = `%APPDATA%\Claude\` | **CONFIRMED** (multiple primary sources) | Verified | Resolved |
| A2 | Existing `smol-toml` library handles the Codex TOML round-trip without losing comments/formatting on idempotent merge | MEDIUM | Check during implementation; test with existing Codex user-scope TOML | Active |
| A3 | `cursor-agent` binary, when present on PATH, accepts `mcp enable <name>` non-interactively and exits 0 on success | MEDIUM | Verify empirically with current Cursor CLI version during implementation (Q3) | Active |
| A4 | Atomic writes handled correctly by `write-file-atomic` npm package (POSIX `rename(2)` + Windows EPERM retry) | **CONFIRMED** (D-Intake-3 locks adoption) | Package audit done during /analyze | Resolved |
| A5 | Users running `init --global` trust the installer to write to `~/` — consistent with existing Windsurf behavior | HIGH | Existing precedent | Active |
| A6 | `open-knowledge` MCP server name is stable and doesn't need `open-knowledge@<version>` pinning in args | HIGH | `constants.ts:MCP_SERVER_NAME` is the source of truth | Active |
| **A7** | **Claude Code family (CLI + Desktop Code tab + Cowork in-VM) advertises MCP `roots` capability returning exactly one root = startup cwd; `/add-dir` does NOT trigger `roots/list_changed`** | **CONFIRMED** via binary audit of `@anthropic-ai/claude-code@2.1.114` ([claude-code-roots-source-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/claude-code-roots-source-audit.md)) | Verified | Resolved |
| **A8** | **Codex (CLI + Desktop + IDE ext) does NOT advertise MCP `roots` capability at all** | **CONFIRMED** via Rust source audit at `codex-rs/codex-mcp/src/mcp_connection_manager.rs:1400-1419` ([codex-roots-source-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/codex-roots-source-audit.md)) | Verified | Resolved |
| **A9** | **Cursor (CLI + Desktop) advertises MCP `roots` capability with `listChanged: false`; multi-root workspaces spawn N MCP instances** | SUPPORTED via Cursor forum threads + existing Cursor research | Verified | Resolved |
| **A10** | **Cowork launcher cwd → user's mounted workspace folder** (makes Cowork's in-VM Claude Code advertise the right path as its root) | **FALSIFIED** | Verified via Opus source audit ([cowork-launcher-cwd-audit.md](../../reports/mcp-server-auto-install-harnesses/evidence/cowork-launcher-cwd-audit.md)) — cwd is hard-wired to `/sessions/<sessionName>/` by `@ant/claude-swift`'s spawn; workspace folder comes in via `--add-dir` (permission-only, not cwd). In-VM Claude advertises `file:///sessions/<sessionName>/` — ephemeral VM scaffolding, not user content. | Resolved → D-11 |
| **A11** | **PR #207 exposes `bypassProjectSelection` as a CLI-reachable hook for our `--cwd` wiring** | **CONFIRMED with nuance** — verified via live diff of PR #207 at `c7bb5132` (2026-04-20): `bypassProjectSelection: true` exists as `McpServerOptions` field and routes through `createProjectRoutingResolver` correctly. Currently surfaced ONLY via `--port` flag (single-target debug pin); our spec adds `--cwd` as a parallel trigger (~10 LoC delta). Naming aligns with main's existing `--cwd` arg (already baked by #221 into Claude Desktop + Windsurf configs). | Verified | Resolved → D-7 |
| **A12** | **`globalScopeResolveServerKey` helper (shipped by #221) is the correct template for `codex-user`** — project-qualified keys + realpath-matched idempotence + auto-disambiguation + `--cwd` baking all compose correctly for a Codex-at-user-scope target | **SUPPORTED** via reading `packages/cli/src/commands/global-scope-entry.ts` on `origin/main` at `31888dcc`. The helper is parameterized by `{detectLegacy}` — Codex user-scope uses `detectLegacy: false` (no pre-spec legacy entries exist for `codex-user` since the target is new). | Implementation-time verification | Active (verifies during impl) |

## 13) In Scope (implement now)

- **Goal:** All 7 target harnesses get zero-click headless install via `open-knowledge init [--yes] [--global] [--editor ...]`.
- **Non-goals:** See §3.
- **Requirements with acceptance criteria:** See §6 (FR-1 through FR-10; FR-11 is Future Work).
- **Proposed solution:** See §9.
- **Owner(s)/DRI:** Nick Gomez
- **Next actions:** Iteration loop will produce detailed task list; implementation follows in a separate PR.
- **Risks + mitigations:** See §14.
- **What gets instrumented/measured:** E2E tests per harness on CI; concurrent-write unit test for atomic primitive.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Breaking change for existing `--editor` users | Additive — existing IDs unchanged; new IDs are opt-in | `init --editor claude,cursor` behaves identically to before |
| Backward-compat for `init.ts` JSON output schema | `InitCommandResult` gets new fields but existing fields unchanged | Test fixtures preserved |
| Windows file-write atomicity | Use `write-file-atomic` pattern with retry on EPERM | Unit test with concurrent writes |
| macOS path resolution | Use `node:os.homedir()` | Existing precedent (Windsurf) |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Anthropic changes `claude_desktop_config.json` schema or path | Low | High | Monitor Anthropic release notes; schema migration follows Claude Code launch.json precedent | Nick |
| `cursor-agent mcp enable` shell-out hangs / fails | Medium | Low | 10s timeout; graceful degrade with user-facing message | Nick |
| Atomic write on Windows flakes (EPERM) | Medium | Medium | Adopt `write-file-atomic` pattern with retry; test in CI once Windows runner is available | Nick |
| Users confused by `--global` flag semantics | Medium | Low | Clear docs; `init --help` shows examples | Nick |
| Cowork caveat block becomes stale as Anthropic ships fixes | Medium | Low | Changelog entry on each research update; docs source of truth | Nick |

## 15) Future Work

### Explored (investigated during this spec)

- **Runtime MCP self-install via skill/tool-call**
  - What we learned: Only Cursor Desktop has a genuine runtime API (`vscode.cursor.mcp.registerServer()`); all other 6 harnesses require session/app restart to see new MCPs. `anaisbetts/mcp-installer` writes config but can't hot-reload.
  - Recommended approach: Wait for Anthropic #46426 (Claude Code hot-reload) or Cursor CIMD ship.
  - Why not in scope now: "Not today, not single-conversation flow" — premise fails for 6 of 7 harnesses.
  - Triggers to revisit: Any of Claude Code #46426, Codex #7767 (currently "not planned"), Cursor adds `mcp add` verb.
  - Implementation sketch: Ship a `SKILL.md` that invokes `init` as a bash command, then asks user to restart harness. Two-conversation flow.

- **Cowork supergateway/tunnel fallback**
  - What we learned: dev.to/murat-a-a pattern works (supergateway + cloudflared tunnel, Cowork reads public URL from Custom Connector UI) but requires host-side daemon supervision and doesn't solve per-tool approval.
  - Recommended approach: Scriptable helper command `open-knowledge cowork-bridge` that starts supergateway + cloudflared and prints URL for user to paste.
  - Why not in scope now: Adds significant surface area; niche demand until someone's genuinely blocked.
  - Triggers to revisit: User explicitly requests; Anthropic #26259/#24433 show no fix movement for >6 months.

- **Localhost HTTP transport for our MCP**
  - What we learned: worsens 2 of 7 harnesses (Claude Code Desktop rejects `http://`; Cowork VM blocks #28018).
  - Recommended approach: Keep stdio primary. Localhost HTTP only if ecosystem tooling shifts or a specific consumer needs shared-state-across-harnesses.
  - Why not in scope now: Research-decisive no-go.
  - Triggers to revisit: Major ecosystem shift.

### Identified (needs its own spec pass)

- **`open-knowledge uninstall` command** — reverse init; idempotent; removes open-knowledge entries from all written config files. Needs own spec pass covering: which files to touch, whether to leave activation sidecars alone, user-facing confirmation, atomic multi-file delete semantics.

### Noted

- **User-scope precedence conflicts** — what if user has `open-knowledge` in both project-scope `.mcp.json` and user-scope `~/.claude.json`? Claude Code precedence is `local > project > user > plugin`. Worth surfacing clearly in docs.
- **Project migration** — users who init'd pre-this-spec and want to upgrade to new coverage. Probably handled by `--force` on re-init, but worth a dedicated note.
- **Managed MCP / enterprise lockdown** — Claude Code supports `managed-mcp.json` for enterprise policy. Our init doesn't touch this. Probably not our concern.

## 16) Agent constraints

- **SCOPE:**
  - `packages/cli/src/commands/init.ts`
  - `packages/cli/src/commands/editors.ts`
  - `packages/cli/src/commands/init.test.ts`
  - `packages/cli/src/commands/editors.test.ts`
  - `packages/cli/src/utils/write-file-atomic.ts` (NEW)
  - `packages/cli/src/utils/write-file-atomic.test.ts` (NEW)
  - `CLAUDE.md` / `AGENTS.md` / README — documentation updates
- **EXCLUDE:**
  - `packages/cli/src/mcp/**` — MCP server itself, not its install
  - `packages/server/**` — no server changes
  - `packages/core/**`, `packages/app/**` — no core/app changes
- **STOP_IF:**
  - Requires changes to the MCP protocol or transport
  - Requires bundling new npm dependencies outside `smol-toml` / `@clack/prompts` / `commander`
  - Requires changes to `constants.ts:MCP_SERVER_NAME` or the server command/args shape
- **ASK_FIRST:**
  - Changing existing `EditorId` values (breaking for `--editor` flag users)
  - Changing `InitCommandResult` schema in backward-incompatible way
  - Claude Desktop path resolution for any platform (verify against vendor docs)
