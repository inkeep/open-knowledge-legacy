# Global-scope MCP client targets (Claude Desktop + Windsurf) in `open-knowledge init` — Spec

**Status:** Draft
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-19
**Baseline commit:** ee1fc3af
**Links:**
- Evidence: `./evidence/`
- Changelog: `./meta/_changelog.md`

---

## 1) Problem statement

**Situation.** Open Knowledge's `open-knowledge init` registers the MCP server in four editor configs today (Claude Code, Cursor, VS Code, Windsurf) — all via `{ command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] }` with no `--cwd`. Three of the four (Claude Code, Cursor, VS Code) are project-scoped: the editor opens a workspace folder and the config lives inside it, so spawning MCP from the project root is implicit and the single `open-knowledge` key is fine. **Windsurf is already `scope: 'global'`** (`editors.ts:71` — one file per user at `~/.codeium/windsurf/mcp_config.json`) but the current target treats it identically to the project-scoped three. **Claude Desktop** is a fifth surface: global config at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows). The same Claude Desktop config file is also consumed by the `claude-ai` web-app connector (confirmed 2026-04-17: live MCP log shows `clientInfo.name === 'claude-ai'` on a server registered through Claude Desktop's config).

**Complication.** Both Windsurf and Claude Desktop are global-scoped — one shared config across every project on the machine — yet the current Windsurf target writes a single `open-knowledge` key, so running `init` in project B silently overwrites the key project A wrote. The Claude Desktop registration does not exist at all, so users hand-edit the global file and hit one of two ENOENT failures when they forget the `--cwd` flag: `mkdir '/.open-knowledge'` (no `--cwd`, client spawns from `/`) or `chdir '/' -> '.../<nonexistent>'` (wrong `--cwd`). Both errors are observed in owner's MCP logs 2026-04-17. The underlying bug is the same for both editors: a global MCP config + a single unqualified server key + no explicit `--cwd` is incompatible with having more than one Open Knowledge project per machine. A fix for one without the other leaves a same-class bug with the fix shape already in the codebase — arbitrary asymmetry.

**Resolution.** Treat **any `scope: 'global'` editor target** uniformly:
- generate a project-qualified server key `open-knowledge-<slug(basename(cwd))>` with auto-disambiguation on collision;
- bake `--cwd <absolute-project-path>` into args;
- match existing entries by realpath-normalized `--cwd` (regardless of key) so re-running init is idempotent even against hand-crafted entries;
- detect + preselect via the same dirname-probe heuristic.

Concrete targets in v1: `claude-desktop` (new) and `windsurf` (updated to the global-scope write path). Project-scoped targets (`claude`, `cursor`, `vscode`) remain unchanged — single `open-knowledge` key, no `--cwd`. A one-time migration rewrites any existing plain `open-knowledge` Windsurf entry to the qualified form on first post-spec `init`.

## 2) Goals

- **G1.** `open-knowledge init` run inside a project registers Open Knowledge correctly in Claude Desktop (macOS + Windows) and Windsurf (global config) with zero hand-editing.
- **G2.** Users with two+ projects on the same machine see both in Claude Desktop's and Windsurf's server lists simultaneously (no silent overwrite of a prior project's entry).
- **G3.** Repeat runs of `init` against the same project remain idempotent (`skipped-existing`) regardless of server-key disambiguation suffix.
- **G4.** A user who has hand-crafted a `claude_desktop_config.json` entry (like owner's current `open-knowledge-bim-tools`) does not have it silently overwritten or duplicated.
- **G5.** Windsurf users with a pre-spec single `open-knowledge` entry migrate to the project-qualified form automatically on first post-spec `init`, without losing their registration.

## 3) Non-goals

- **[NOT NOW]** NG1: Remote-MCP URL / OAuth surfaces for `claude-ai` web app. The claude.ai web connector is covered incidentally via the shared `claude_desktop_config.json` file (D15); a distinct remote-MCP registration surface is deferred until Anthropic ships one and Open Knowledge gains an HTTP-streamable transport.
- **[NOT NOW]** NG2: Renaming existing `open-knowledge` entries in the three project-scoped editor configs (Claude Code `.mcp.json`, Cursor `.cursor/mcp.json`, VS Code `.vscode/mcp.json`) to project-qualified keys. These configs live inside the project, so collision doesn't arise. Revisit only if users report needing multiple Open Knowledge "views" per project.
- **[NEVER]** NG3: Per-basename-collision UX prompt (e.g. "notes is taken, choose a name"). Auto-disambiguation is non-interactive; init must work in non-TTY mode.
- **[NOT UNLESS]** NG4: Linux Claude Desktop support. Only if: Anthropic ships a Linux build (none today). Windsurf on Linux continues to work as it does today — its config path is homedir-derived and Linux-compatible.
- **[NEVER]** NG5: A `--desktop-key` / `--windsurf-key` override flag in v1. The project-qualified default is the right abstraction; flag adds surface area without a concrete ask.
- **[NOT NOW]** NG6: Stale-entry auto-removal. Warn-on-stale (`open-knowledge-*` entry whose `--cwd` no longer exists) is Could-tier (FR15); `--prune`-style auto-removal is Future Work.

## 4) Personas / consumers

- **P1.** Open Knowledge user setting up a new project. Runs `npx @inkeep/open-knowledge init` in the project dir. Uses Claude Desktop (and/or claude.ai web) or Windsurf as their primary AI surface.
- **P2.** Owner (Tim) on personal laptop — has multiple Open Knowledge projects (`bim-tools`, `karpathy-test`, …) and wants them all accessible in both Claude Desktop and Windsurf simultaneously.
- **P3.** Legacy Windsurf user — already ran `init` before this spec landed and has a single plain `open-knowledge` entry in `mcp_config.json`. Runs `init` again (either deliberately or from following onboarding docs) and expects their registration to survive.

## 5) User journeys

**P1 happy path.**
1. `cd /path/to/my-project`
2. `npx @inkeep/open-knowledge init`
3. Clack multiselect: Claude Desktop + Windsurf are preselected (checked) alongside any other detected editors.
4. Confirm. Init writes entries to all selected editors. For the two global-scope targets, the key is `open-knowledge-my-project` and args include `--cwd /path/to/my-project`.
5. Windsurf picks up the new config on next restart (if running) or immediately on launch; Claude Desktop requires full quit + relaunch (FR14 prints the hint).

**P1 failure / recovery path.**
- Claude Desktop not installed → `~/Library/Application Support/Claude/` does not exist → not detected, not preselected; still manually selectable via `--editor claude-desktop`. If manually selected, init creates the parent directory and writes the config file — Claude Desktop will pick it up on first launch.
- Windsurf not installed → `~/.codeium/windsurf/` does not exist → not detected, not preselected. Same flag-override escape hatch.

**P2 multi-project happy path (both global editors).**
- Project A: `~/inkeep/bim-tools` → entry key `open-knowledge-bim-tools` in both `claude_desktop_config.json` and `mcp_config.json`.
- Project B: `~/inkeep/karpathy-test` → entry key `open-knowledge-karpathy-test` in both. All four entries coexist across the two files.

**P2 collision path.**
- Project A: `~/work/notes` → `open-knowledge-notes`.
- Project B: `~/personal/notes` — desired key `open-knowledge-notes` already taken and points to a different `--cwd`. Init writes `open-knowledge-notes-2` and prints (per FR14): `(open-knowledge-notes is already bound to --cwd /Users/x/work/notes)`.

**Re-init (idempotence) path.**
- Second `init` in `~/personal/notes`. Init scans the global config for any `open-knowledge-*` entry whose `args` includes `--cwd` with a realpath-normalized value equal to `realpath(~/personal/notes)`. Finds `open-knowledge-notes-2`. Reports `skipped-existing (open-knowledge-notes-2)`. Does NOT create `open-knowledge-notes-3`.

**Hand-crafted config path.**
- Owner's existing `open-knowledge-bim-tools` entry in `claude_desktop_config.json` points at `--cwd /Users/timothycardona/inkeep/bim-tools`. Running `init` again inside `bim-tools/` matches this entry by its `--cwd` arg (regardless of key) → `skipped-existing`. No duplication.

**P3 Windsurf legacy-migration path.**
- Pre-spec, `~/.codeium/windsurf/mcp_config.json` has `{ "mcpServers": { "open-knowledge": { "command": "npx", "args": ["@inkeep/open-knowledge", "mcp"] } } }`.
- User runs post-spec `init` inside `~/work/notes`. Detection: entry with exact key `'open-knowledge'` (no suffix) AND `args` contains no `--cwd`. Classified as legacy. Init replaces it with `open-knowledge-notes` (including `--cwd /Users/x/work/notes`). `EditorMcpResult.action === 'overwritten'` with a one-line summary hint: `migrated legacy open-knowledge → open-knowledge-notes`. No `--force` required — migration is deterministic (plain legacy entry has no ambiguity about what it meant).

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Global-scope detection (Claude Desktop, Windsurf) | n/a (sync stat) | Config dir absent → not detected | stat throws (permission) → not detected, log warn | Config dir present → detected, preselected | n/a |
| Entry match by realpath(cwd) | n/a | No existing `open-knowledge-*` keys → use default slug | Invalid JSON in config → `failed` action | Match → `skipped-existing` / `overwritten` | Realpath ENOENT on existing entry → fall back to string-equality match |
| Legacy migration (Windsurf only) | n/a | No legacy entry → N/A | — | Plain `open-knowledge` with no `--cwd` detected → rewrite to qualified form | n/a |
| Entry write | n/a | New config file | Write fails (perms) → `failed` | `written` / `overwritten` / `skipped-existing` | n/a |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: New editor target `claude-desktop` registered in `EDITOR_TARGETS`; existing Windsurf target upgraded to the global-scope write path. | `ALL_EDITOR_IDS` contains `'claude-desktop'`; `EDITOR_TARGETS['claude-desktop']` resolves to a valid `EditorMcpTarget`; `EDITOR_TARGETS['windsurf']` implements the same `resolveServerKey` + `buildEntry(cwd)` contract. | |
| Must | FR2: `buildEntry` signature accepts `cwd: string`. | Signature is `(cwd: string) => Record<string, unknown>`. Existing targets ignore the parameter; Claude Desktop uses it for `--cwd`. | Non-breaking for internal consumers (grep confirms no external callers of `target.buildEntry` outside `init.ts`; §16 STOP_IF watches for external consumers in future). |
| Must | FR3: `scope: 'global'` targets' `buildEntry(cwd)` returns `{ command: 'npx', args: ['@inkeep/open-knowledge', 'mcp', '--cwd', cwd] }` where `cwd` is an absolute path. Applies to both `claude-desktop` and `windsurf`. | Test per target: `buildEntry('/a/b').args` includes `'--cwd', '/a/b'`. | No `type: 'stdio'` needed (Claude Desktop + Windsurf both infer from `command`). Project-scoped targets (`claude`, `cursor`, `vscode`) retain their current `buildEntry()` output — no `--cwd`. |
| Must | FR4: Platform-aware `configPath`. | macOS (`process.platform === 'darwin'`): `<home>/Library/Application Support/Claude/claude_desktop_config.json`. Windows (`=== 'win32'`): `<APPDATA>/Claude/claude_desktop_config.json` where `APPDATA` resolves to `process.env.APPDATA ?? join(home ?? homedir(), 'AppData', 'Roaming')`. **Any other platform** (linux, freebsd, …): `resolveEditorTargets(['claude-desktop'])` on that platform throws a user-friendly error (`'Claude Desktop is not available on <platform>. Supported: macOS, Windows.'`) rather than producing a ghost macOS path. | Consistent with NG4 — refusing on unsupported platforms, not silently writing a never-read file. |
| Must | FR5: Project-qualified server key `open-knowledge-<slug(cwd)>`. | Slug derived via `slugify(path.basename(cwd))` where `slugify(s) = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`. Empty slug (e.g. root dir) falls back to `'project'`. | Guards against whitespace, unicode, and worktree-style basenames landing unchanged in the key. Owner's existing `bim-tools` slug is idempotent under this rule. |
| Must | FR6: Match existing entry by realpath-normalized `--cwd` arg, regardless of key. | For each existing key starting with `open-knowledge-` in `mcpServers`, if its `args` contains `'--cwd'` immediately followed by a value whose `realpathSync` equals `realpathSync(currentCwd)`, treat as the existing entry. Honor `skipped-existing` / `overwritten` semantics against it. If either realpath throws ENOENT, fall back to string equality. | Protects hand-crafted keys from duplication; normalizes symlinks / worktree paths so re-running init from a symlink vs. the canonical path is a match, not a duplicate. |
| Must | FR7: Auto-disambiguate on collision. | If no entry matches by cwd (FR6) AND `open-knowledge-<slug>` is taken by a different cwd, write under `open-knowledge-<slug>-2`, `-3`, … — first integer ≥ 2 that's free. | `EditorMcpResult.action === 'written'` in this case, not `overwritten`. Output hint required — see FR14. |
| Must | FR8: Detection heuristic — `detectInstalledEditors`. | Return `'claude-desktop'` iff `dirname(configPath)` exists. Windsurf detection unchanged (existing). Respect `home` override for tests. | On Windows, `%APPDATA%` not set during test → tests mock `process.env.APPDATA` + `process.platform` via `Object.defineProperty` restored in `afterEach`. |
| Must | FR9: Interactive prompt includes Claude Desktop. | Clack `multiselect` shows all five editors (`claude`, `cursor`, `vscode`, `windsurf`, `claude-desktop`). Preselected iff detected. Hint shows `~/Library/Application Support/Claude/claude_desktop_config.json` path (or `%APPDATA%\Claude\…` on Windows). | Same code path as existing Windsurf hint; no new branching. |
| Must | FR16: Windsurf legacy entry migration. | Detect: exact key `'open-knowledge'` (no suffix) AND `args` contains no `--cwd`. Action: rewrite as `open-knowledge-<slug(cwd)>` with `--cwd` baked in. Result: `action: 'overwritten'` with a `migrated legacy open-knowledge → <new-key>` summary hint. Does NOT require `--force`. | One-time migration; subsequent runs match by `--cwd` per FR6. Safe because legacy has no ambiguity about what it meant (one project, no cwd, no qualifier). |
| Must | FR10: Unit test coverage mirroring Windsurf pattern. | Tests in `init.test.ts` describe block `'Claude Desktop'` with: fresh write, collision auto-disambiguation, match-by-cwd idempotence, --force overwrite, home-override detection, realpath-normalize idempotence, slug normalization (whitespace basename), restart hint present in summary output, non-supported-platform refusal. | ≥ 8 new tests. Windows-path tests mock `process.platform` + `process.env.APPDATA` via `Object.defineProperty` (one-shot per test; restore in `afterEach`) rather than adding test-only indirection to `configPath`. |
| Must | FR11: AGENTS.md / README mention Claude Desktop. | `content/init.ts` root-instructions template and published README list `claude-desktop` as a supported editor. | Documentation only; no behavior change. |
| Must | FR12: Error message when `claude_desktop_config.json` is invalid JSON. | Same shape as existing `readMcpConfig` error — `EditorMcpResult.action === 'failed'` with error message. | Existing code path; no new logic. |
| Must | FR13: `--editor claude-desktop` accepts `desktop`, `claude_desktop` as aliases. | Aliases parsed in `parseEditorFlag`. | UX polish. |
| Must | FR14: Output hint for the three non-silent outcomes. | When the Claude Desktop action is `written` or `overwritten`, append a `— quit and relaunch Claude Desktop to activate` hint to the summary line (Claude Desktop needs a full restart to load new MCP config — it does not hot-reload). When auto-disambiguation fires (key `-2`+), add a second line: `  (<default-key> is already bound to --cwd <other-path>)`. When `skipped-existing` matched by cwd under a hand-crafted key, print the matched key: `skipped-existing (open-knowledge-<key>)`. | Addresses the #1 user failure mode ("I registered but Claude Desktop doesn't see it — did you restart?") and makes collision semantics visible. |
| Could | FR15: Stale-entry GC. | On `init`, scan `open-knowledge-*` entries whose `--cwd` path does not exist on disk; emit a warning line per stale entry pointing at manual removal. Not removed automatically (user's config, user's call). | Deferred unless demand; see §15 Future Work. |

### Non-functional requirements

- **Performance:** Detection probe adds one `existsSync` call; negligible.
- **Reliability:** Never silently destroy a user-crafted entry (FR6). Never create duplicate entries for the same cwd.
- **Security/privacy:** No new network I/O; no new files outside the documented path.
- **Operability:** `init` already logs per-editor action + displayPath; extend to Claude Desktop with `~`-abbreviated path (same as Windsurf).
- **Cost:** None.

## 7) Success metrics & instrumentation

- **Metric 1:** Zero-friction Claude Desktop setup — observable by absence of the two ENOENT errors (`chdir '/'`, `mkdir '/.open-knowledge'`) in MCP logs after running `init`.
- **Metric 2:** Idempotence — running `init` twice in a project produces identical `claude_desktop_config.json`.
- **Logging:** `init` stdout already lists each editor's action (`written`, `overwritten`, `skipped-existing`, `failed`). Extend the same line format to Claude Desktop. No new telemetry.

## 8) Current state (how it works today)

- `packages/cli/src/commands/editors.ts` exports `ALL_EDITOR_IDS: EditorId[] = ['claude', 'cursor', 'vscode', 'windsurf']` and `EDITOR_TARGETS` keyed by those IDs. Windsurf is already `scope: 'global'` (per-user, not per-project) and writes the same single `open-knowledge` key every other target writes — latent multi-project collision; owner's live `~/.codeium/windsurf/mcp_config.json` has one entry with no `--cwd`.
- `EditorMcpTarget.buildEntry: () => Record<string, unknown>` takes no arguments.
- `init.ts:writeEditorMcpConfig` (`init.ts:274-292`) reads the config at 274-275, finds `servers[MCP_SERVER_NAME]` (fixed `'open-knowledge'` key), writes `{ ...servers, [MCP_SERVER_NAME]: target.buildEntry() }` at 286-292.
- `detectInstalledEditors` iterates `ALL_EDITOR_IDS` and returns every ID whose `dirname(configPath)` exists.
- CLI preAction hook (`cli.ts:33`) calls `process.chdir(opts.cwd)` when `--cwd` is passed; `--cwd` is already a first-class flag end-to-end.
- Owner's `claude_desktop_config.json` already contains a working hand-crafted entry `open-knowledge-bim-tools` with exactly the target shape (`command: 'npx'`, `args: [..., '--cwd', <abs>]`). Evidence: `evidence/claude-desktop-shape.md`.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:** `open-knowledge init` — interactive multiselect now includes "Claude Desktop" (preselected if detected). Non-TTY runs default to all detected editors, which may now include Claude Desktop. `--editor claude-desktop` / `--editor all` explicitly include it.
- **Output:** init summary adds a `  Claude Desktop  ~/Library/Application Support/Claude/claude_desktop_config.json  registered` line (format mirrors other editors).
- **Docs/onboarding:** AGENTS.md template + repo README list Claude Desktop.
- **Error messages:** unchanged taxonomy — `written` / `overwritten` / `skipped-existing` / `failed`, plus one new classification-internal outcome captured as `written` but with disambiguated key (no separate action code in v1).

#### Affected files

| File | Surface | What to verify |
|---|---|---|
| `packages/cli/src/commands/editors.ts` | target registry | new `claude-desktop` entry; Windsurf entry updated to implement `resolveServerKey` + `buildEntry(cwd)`; `buildEntry` signature widened |
| `packages/cli/src/commands/init.ts` | write logic | `writeEditorMcpConfig` calls `buildEntry(cwd)`; global-scope branch for key resolution; FR16 legacy-migration branch for Windsurf |
| `packages/cli/src/commands/init.test.ts` | unit tests | FR10 coverage (Claude Desktop + Windsurf + legacy migration) |
| `packages/cli/src/content/init.ts` | AGENTS.md template | FR11 doc update |
| `README.md` (root + cli package) | docs | FR11 |
| `.changeset/<name>.md` | release note | FR11 deployment |

### System design

- **Architecture:** Same as today for four editors; Claude Desktop adds one new target record + one new branch in `writeEditorMcpConfig` for key resolution.
- **Data model:** `EditorMcpTarget` gains an optional method:
  ```ts
  resolveServerKey?: (
    existingServers: Record<string, unknown>,
    cwd: string
  ) => { key: string; existingEntry: unknown | undefined; disambiguatedFrom?: string };
  ```
  When absent (the four existing targets), `writeEditorMcpConfig` falls back to the literal `'open-knowledge'` key — unchanged behavior. Claude Desktop implements `resolveServerKey` with: (1) realpath-normalized match-by-cwd across all `open-knowledge-*` keys; (2) basename-slug default; (3) suffix disambiguation. When a suffix fires, `disambiguatedFrom` carries the conflicting key so FR14 can surface it.
- **API/transport:** None — local file I/O only.
- **Enforcement point(s):** `writeEditorMcpConfig` in `init.ts`. Every other caller of `buildEntry` continues to pass `cwd` unconditionally.
- **Observability:** Existing `EditorMcpResult` per-editor summary line.

#### Data flow

- **Primary flow:** `runInit(options)` → for each target → `writeEditorMcpConfig(target, cwd, force, home)` → `readMcpConfig` → `target.resolveServerKey?.(servers, cwd) ?? defaultKeyResolve(servers)` → branch on `existingEntry && !force` (skip) vs. write with `[key]: buildEntry(cwd)`.
- **Shadow paths:**
  - **nil / missing:** `existingServers` is `undefined` (fresh config) → default key `open-knowledge-<basename>`, write.
  - **empty:** `existingServers` is `{}` → same as nil.
  - **wrong type:** `mcpServers` is not an object → error path in `readMcpConfig`.
  - **conflict:** FR7 collision handling.
  - **partial failure:** if platform-specific path cannot be created (e.g. Windows config dir absent), `mkdirSync({recursive:true})` creates it — Claude Desktop picks up the new config file on next launch.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `resolveServerKey` (Claude Desktop) | All candidate keys taken (pathological) | Bounded loop (upper bound per D10) | Fail with "too many open-knowledge entries" error | Extremely unlikely; user notified |
| `realpathSync` (FR6) | ENOENT on a stale entry's `--cwd` path | try/catch | Fall back to string equality; stale entry remains | User can manually remove stale entry (FR15 `Could`-tier GC) |
| `readMcpConfig` | Invalid JSON | `JSON.parse` throw | `action: 'failed'`, `error: 'contains invalid JSON'` | User sees per-editor failure line |
| `writeMcpConfig` | Write permission denied | fs throw | `action: 'failed'` | User sees per-editor failure line |
| Detection | Home dir cannot be read | `existsSync` returns false | Claude Desktop not detected | No preselect; user can still --editor-flag |
| Platform probe | `process.platform` is neither `darwin` nor `win32` | Early throw in `configPath` | Per FR4 — targeted error message | User on unsupported platform hears no silent writes |

### Alternatives considered

- **Option A** — Single `open-knowledge` key in global-scope configs (matches project-scoped editors). Rejected: last-init-wins silently breaks multi-project workflows on Windsurf today and would do the same on Claude Desktop.
- **Option B** — Fail on collision with user-facing error + `--force` to overwrite. Rejected: footgun for P2 multi-project case; user answered "auto-disambiguate" explicitly.
- **Option C** — Flag-driven key `--desktop-key <name>` / `--windsurf-key <name>`. Rejected: no concrete demand; can add later without breaking callers (NG5).
- **Option D** — Defer Windows to Future Work. Rejected: ~5 LOC branch; no reason to create a parallel ticket.
- **Option E** — Keep `buildEntry` nullary and encode `--cwd` replacement in init.ts instead of threading cwd through targets. Rejected: leaks target-specific logic into init, bloats the switch-on-id surface, fails the "targets are declarative" design principle.
- **Option F** — Ship for Claude Desktop only; leave Windsurf's latent multi-project collision for a follow-up. Rejected 2026-04-19 by owner: the fix shape generalizes trivially via `resolveServerKey`; shipping the same code for one of two global-scope editors creates an asymmetry with no rationale. Accepts the one-time Windsurf legacy-migration (FR16) as the migration cost.
- **Option G** — Ship `resolveServerKey` only for Claude Desktop; keep Windsurf unchanged under the default-key path; document the Windsurf bug in NG2. Rejected: same fix shape, one arbitrary omission, with no payoff.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links |
|---|---|---|---|---|---|---|
| D1 | Server key shape = `open-knowledge-<basename(cwd)>` | Product | LOCKED | Yes (user-visible in Claude Desktop UI) | Matches owner's hand-crafted config; global config demands project qualification | `evidence/claude-desktop-shape.md` |
| D2 | Collision behavior = auto-disambiguate via `-2`, `-3`, …; idempotence via match-by-`--cwd` arg | Technical | LOCKED | No (implementation can evolve) | Non-interactive; protects hand-crafted entries; user chose this over fail-with-message | User answer 2026-04-17 |
| D3 | Both macOS + Windows paths day-one | Technical | LOCKED | No | ~5 LOC; Windows users hit the same bug | FR4 |
| D4 | Auto-detect (dirname probe) + preselect in multiselect | Product | LOCKED | No | Mirrors Windsurf; discoverability | User answer 2026-04-17 |
| D5 | `buildEntry` signature widened to `(cwd: string) => ...` for all targets; existing targets ignore the param | Technical | LOCKED | No (internal API) | Cleaner than branching in init.ts | §9 Alt E |
| D6 | `resolveServerKey` is an optional method; absence preserves current `'open-knowledge'` key behavior | Technical | LOCKED | No | Minimizes diff to non-Claude-Desktop targets | §9 data model |
| D7 | `--desktop-key` override flag deferred | Product | DEFERRED | No | No concrete demand | NG5 |
| D8 | `claude-ai` web connector out of scope | Cross-cutting | LOCKED | No | Different integration surface (OAuth/HTTP MCP, not stdio) | NG1 |
| D9 | No Linux support | Product | LOCKED | No | Anthropic ships macOS + Windows only | NG4 |
| D10 | Disambiguation upper bound = 1000 | Technical | LOCKED | No | Defensive cap; no reason to leave it open. If ever hit, something is very wrong with the user's config. | FR7 / failure modes |
| D11 | Kebab-slug normalization of `basename(cwd)` for the server-key suffix | Technical | LOCKED | No (internal key format) | Guards against whitespace / unicode / worktree-style basenames producing hostile-looking keys. Owner's `bim-tools` is idempotent under the rule. | FR5 / C7 (design-challenge.md) |
| D12 | Realpath-normalize both sides of the `--cwd` match (FR6) | Technical | LOCKED | No | Symlinks and worktrees would otherwise create duplicates. Fallback to string equality on ENOENT. | FR6 / C3 (design-challenge.md) |
| D13 | Emit restart + collision + match-key hints (FR14) | Product | LOCKED | No | Claude Desktop requires full quit/restart — no hot-reload. Silent writes would look like init lied. | C2 (design-challenge.md) |
| D14 | Refuse Claude Desktop target on non-darwin/non-win32 rather than silently writing a macOS-shaped path | Technical | LOCKED | No | Consistent with NG4; avoids ghost files. | M3 (audit-findings.md) / FR4 |
| D15 | `claude-ai` web connector coverage is in-scope by virtue of the shared config file (not a separate target) | Cross-cutting | LOCKED | No | Verified 2026-04-17: `clientInfo.name === 'claude-ai'` on a server registered through Claude Desktop's config. Both clients read the same file. | M2 (audit-findings.md), §1 Complication |
| D16 | Apply the project-qualified-key + `--cwd` + `resolveServerKey` pattern to **every** `scope: 'global'` target (Claude Desktop new, Windsurf updated) — not Claude Desktop alone | Cross-cutting | LOCKED | Yes (1-way door on the Windsurf registration UX and the legacy migration) | C1 evidence — Windsurf has the exact same latent multi-project collision bug. The `resolveServerKey` abstraction generalizes for zero extra cost. Owner chose `B` 2026-04-19 over keeping Claude Desktop only. | C1 (design-challenge.md §C1); owner decision 2026-04-19 |
| D17 | Windsurf legacy migration is non-interactive and does not require `--force` | Technical | LOCKED | No | Plain `open-knowledge` key with no `--cwd` is an unambiguous legacy signal — one project, no cwd, no qualifier. Gated detection (exact key `'open-knowledge'` + no `--cwd` in args) prevents false-positive rewrites of user-modified entries. | FR16 |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | On Windows, should we resolve `%APPDATA%` via `process.env.APPDATA` or via Node's `os.homedir()` + `AppData\Roaming`? | Technical | P2 | No | Use `process.env.APPDATA` with `homedir()/AppData/Roaming` fallback. Pseudocode in FR4. | Resolved (FR4) |
| Q2 | Does the `claude-ai` web connector share `claude_desktop_config.json` on macOS? | Technical | P0 | No | Verified 2026-04-17: live MCP log at `~/Library/Logs/Claude/mcp-server-open-knowledge-bim-tools.log:28` shows `clientInfo.name === 'claude-ai'` connecting to a server registered via `claude_desktop_config.json`. D15 records the resolution. | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Status |
|---|---|---|---|---|
| A1 | `slugify(path.basename(cwd))` produces a legal `mcpServers` key component (ASCII, no JSON-unsafe chars, no whitespace). | HIGH | D11 slugify rule normalizes; verified against owner's `bim-tools` (idempotent). | Resolved via FR5 rule |
| A2 | Claude Desktop tolerates unknown keys in top-level `preferences` alongside `mcpServers`. | HIGH | Owner's existing config has both; observed working. | Resolved |
| A3 | `process.platform === 'win32'` is the correct Windows probe inside Node/Bun. | HIGH | Node + Bun docs. | Resolved |
| A4 | `process.env.APPDATA` is set on standard Windows install; `homedir()/AppData/Roaming` is the correct fallback. | HIGH | Microsoft docs + FR4 fallback pseudocode. | Resolved |
| A5 | Windsurf reloads its MCP server list on config-file change without a restart (unlike Claude Desktop). | MEDIUM | Codeium docs indicate hot-reload; confirm at implementation with a spot test. FR14 does NOT emit a restart hint for Windsurf. If spot test shows restart is needed, extend FR14. | At implementation |
| A6 | A Windsurf `open-knowledge` entry with no `--cwd` in args is always a legacy-spec artifact, never a deliberate user choice. | HIGH | The old `init` produced exactly this shape; no docs or examples suggest users would hand-write this themselves. If a user did, FR16's migration just rewrites to the current project — same outcome as running `init --force` in the old spec. | Resolved |

## 13) In Scope (implement now)

- **Goal:** Every `scope: 'global'` editor target in `init` writes project-qualified, `--cwd`-baked entries — concretely: `claude-desktop` (new) and `windsurf` (upgraded, with one-time legacy migration).
- **Non-goals:** See §3.
- **Requirements:** §6 FR1-FR16 (all Must + FR11 Should).
- **Proposed solution:** §9.
- **Owner/DRI:** Tim Cardona.
- **Next actions:**
  1. Extend `editors.ts` — add `'claude-desktop'` to `EditorId` and `ALL_EDITOR_IDS`; add `EDITOR_TARGETS['claude-desktop']` record (macOS + Windows `configPath` with unsupported-platform throw per FR4); update `EDITOR_TARGETS['windsurf']` to the same shape (global-scope `resolveServerKey` + `buildEntry(cwd)` with `--cwd` + legacy-migration detection); widen `buildEntry` signature; add optional `resolveServerKey` to target type.
  2. Extract a shared `globalScopeResolveServerKey(existingServers, cwd, {detectLegacy})` helper so Claude Desktop and Windsurf don't duplicate the realpath+slug+disambiguate+migrate logic. Only Windsurf enables `detectLegacy: true` — Claude Desktop has no legacy state to migrate.
  3. Extend `init.ts` — thread `cwd` through `writeEditorMcpConfig` → `buildEntry`; branch on `target.resolveServerKey` for key resolution; carry `disambiguatedFrom` + new `migratedFromKey?: string` into `EditorMcpResult` for FR14 + FR16 output lines.
  4. Add `EditorMcpResult` formatting (displayPath `~`-abbreviation; FR14 restart hint for Claude Desktop only; disambiguation hint; matched-key line on `skipped-existing`; FR16 migration line).
  5. Update `parseEditorFlag` to accept `claude-desktop` + aliases `desktop`, `claude_desktop` (FR13).
  6. Tests per FR10 — Claude Desktop suite + Windsurf upgrade suite + legacy-migration suite. Windows-path test via `Object.defineProperty(process, 'platform', ...)` + env var mock, restored in `afterEach`.
  7. Update AGENTS.md template in `content/init.ts` + repo README (FR11) — list both Claude Desktop and the Windsurf upgrade.
  8. Run `bun run check` + `cd packages/cli && bun test` — all green.
  9. `bun run changeset` — add release note: "feat(init): project-qualified MCP server keys + `--cwd` for global-scope clients (Claude Desktop new, Windsurf upgraded with one-time legacy migration). Also covers the claude.ai web connector via the shared Claude Desktop config."
- **Risks + mitigations:** see §14.
- **Instrumentation:** existing per-editor summary line.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| Existing users' hand-crafted Claude Desktop entries | Match-by-cwd (FR6) honors them as `skipped-existing` regardless of the key they picked | Test: pre-seed `open-knowledge-custom` with `--cwd <projectDir>`; run init; assert `skipped-existing (open-knowledge-custom)` |
| Windsurf legacy entry (`open-knowledge` with no `--cwd`) | FR16 deterministic migration to `open-knowledge-<slug>` with `--cwd` | Test: pre-seed legacy entry; run init in a project; assert `overwritten` + summary contains `migrated legacy open-knowledge → open-knowledge-<slug>` |
| Windsurf entry that's `open-knowledge` but HAS a `--cwd` (user-modified partial) | Legacy detection fails safety-gate → treat as hand-crafted → match-by-cwd path | Test: pre-seed `open-knowledge` with `--cwd` matching current → `skipped-existing`; with `--cwd` NOT matching → treat as collision per FR7 |
| Claude Desktop not installed | Not detected; `--editor claude-desktop` still allowed (creates config) | Test: no home dir → not in detected list |
| npm publish | Standard changeset + `bun run release` | `changeset add` entry present in PR |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Basename collision between unrelated projects | Low | Low | Auto-disambiguation (FR7); user sees distinct entries with conflict hint (FR14) | Implementer |
| User has hand-crafted entry with different `open-knowledge-*` key | Medium | High (silent duplicate) | Match-by-`--cwd` (FR6) finds it regardless of key; slug-normalize isolates encoding drift | Implementer |
| Windsurf legacy migration fires on a non-legacy entry (false positive) | Low | Medium | Migration gate requires BOTH exact key `'open-knowledge'` AND absence of `--cwd` in args. An entry with `--cwd` is routed through the normal match-by-cwd path (FR6). | Implementer — test coverage in FR10 |
| Windsurf user has multiple pre-spec projects sharing one legacy entry | Very low | Low | Legacy entry has no `--cwd` → it can only have been last-init'd from one project; migration rewrites to whatever cwd init is currently running from. Other projects can re-register via subsequent `init` runs. Summary line (FR16) makes the rewrite visible. | Accepted |
| Claude Desktop / Windsurf changes config schema (future) | Low | Medium | Shape is owned by Anthropic / Codeium; monitor their docs at upgrade time | Future maintenance |
| Windows `%APPDATA%` unset (non-standard env) | Low | Medium | Fall back to `os.homedir()/AppData/Roaming`; log warning | Implementer |
| User runs `init` from outside their actual project root | Low | Medium | `--cwd` is absolute; if they `cd /tmp && init`, they get `open-knowledge-tmp` pointing at `/tmp`. Same risk as other editors today. | Accepted |

## 15) Future Work

### Explored
- **Stale-entry GC (FR15, Could-tier).**
  - What we learned: On every `init`, scan `open-knowledge-*` entries whose `--cwd` path does not exist. Emit one warning line per stale entry.
  - Recommended approach: Warn-only (never auto-remove). Add `--prune` flag for opt-in removal.
  - Why not in scope: no concrete demand; the FR14 summary makes stale entries visible enough in practice.
  - Triggers to revisit: users report polluted `claude_desktop_config.json` after repeated project moves.

### Identified
- **Remote-MCP `claude-ai` web connector.** If Anthropic ships a remote-MCP URL surface distinct from stdio, it will need its own editor target. For now, the web connector piggybacks on the Claude Desktop config (D15), so this spec covers it.
- **`--desktop-key` / `--windsurf-key` override.** For users who want a human-readable alias. Defer until a request surfaces.
- **Future `scope: 'global'` targets (Zed / Cline / Continue / other).** If the set grows beyond two, consider refactoring `resolveServerKey` into a shared base class or single helper to avoid per-target duplication. Today's shared helper `globalScopeResolveServerKey` already moves in that direction.

### Noted
- **Entry migration tool.** Rename legacy `open-knowledge` (single-key) to `open-knowledge-<slug>` for users with pre-spec configs.
- **`--verify` smoke test flag.** After registration, spawn the MCP server with the final args and assert the initialize handshake succeeds. Would make Metric 1 directly observable by init rather than post-hoc by log inspection.
- **Per-basename collision UX beyond `-2`/`-3`.** Parent-dir prefix (`work-notes`, `personal-notes`) could make auto-disambiguated keys more human-meaningful. Adds a naming-rule negotiation; defer until the simple suffix is shown inadequate.

## 16) Agent constraints

- **SCOPE:** `packages/cli/src/commands/editors.ts`, `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/init.test.ts`, `packages/cli/src/content/init.ts` (root-instructions template), root + cli `README.md`, a new changeset file under `.changeset/`. A shared helper `globalScopeResolveServerKey` may be extracted inside `editors.ts` or co-located in a new `packages/cli/src/commands/global-scope-entry.ts` — implementer's choice.
- **EXCLUDE:** Any server-side code (`packages/server/`, `packages/core/`, `packages/app/`). MCP tool implementations (`packages/cli/src/mcp/`). CLI commands other than `init`. Project-scoped editors' `buildEntry` output (`claude`, `cursor`, `vscode` entries retain their current shape — verify via test snapshot unchanged).
- **STOP_IF:**
  - The signature change to `buildEntry` is observed to break an external consumer (grep confirms none outside `init.ts` at baseline).
  - Windows path resolution requires a third-party dependency (should not — use `process.env.APPDATA` + `node:path`).
  - Tests fail in ways that imply schema evolution in Claude Desktop's or Windsurf's config format (escalate to owner).
  - FR16 legacy-migration detection becomes ambiguous (an entry matches both "legacy" and "current-project" classifications simultaneously) — escalate; do not silently pick a branch.
- **ASK_FIRST:**
  - Any change to the three project-scoped editors' `buildEntry` output shape (`claude`, `cursor`, `vscode`).
  - Adding a new npm dependency.
  - Changing `ALL_EDITOR_IDS` ordering (existing test at `init.test.ts:743-749` asserts the preserved order — extending the array end-wise is safe).
  - Changing the Windsurf `configPath` function (breaking existing users).
