# MCP Guidance Delivery Without Project-Dir Pollution — Spec

**Status:** Approved
**Owner(s):** Tim Cardona (@timothycardona), Claude Opus 4.7
**Last updated:** 2026-04-22
**Baseline commit:** `57b50335`
**Links:**
- Research report: [reports/mcp-guidance-delivery-no-project-pollution/REPORT.md](../../reports/mcp-guidance-delivery-no-project-pollution/REPORT.md)
- Evidence: [./evidence/](./evidence/)
- Tracking: _TBD_

---

## 1) Problem statement

**Situation.** Open Knowledge ships as an MCP server installable across six AI coding hosts (Claude Code, Claude Desktop, Cursor, Codex, VS Code Copilot, Windsurf). Its value depends on agents routing markdown reads/writes through OK's tools (`exec`/`read_document`/`search`/`write_document`/`edit_document`) instead of the host's native tools (`Read`/`Grep`/`Glob`/`Edit`), plus following a preview-before-edit sequence and wiki-link authoring conventions. Today, `ok init` enforces this guidance by auto-scaffolding a `<!-- open-knowledge:begin -->…<!-- open-knowledge:end -->` section (~3.5 KB) into the user's **root `AGENTS.md`** and **root `CLAUDE.md`**, plus an unused internal `.open-knowledge/AGENTS.md` README.

**Complication.** Users treat their root `AGENTS.md` / `CLAUDE.md` as personally-curated files — OSS repo maintainers in particular have strong opinions about tone, content, and provenance. Auto-injecting tool-authored prose is invasive enough that users disable the feature via `--no-root-instructions`, and several have flagged it unprompted. The research pass ([`reports/mcp-guidance-delivery-no-project-pollution/REPORT.md`](../../reports/mcp-guidance-delivery-no-project-pollution/REPORT.md)) confirmed that zero comparable MCP servers (Linear, GitHub, Notion, Figma, Playwright, Stripe, Vercel, Sentry XcodeBuildMCP, Render) write to user project files. OK is an ecosystem outlier, and the pattern ages badly as Agent Skills consolidates as the cross-host behavioral-guidance channel. Simply deleting the writes regresses the anti-default-tool steering the injection was enforcing — Playwright MCP's documented "agents still default to Bash" failure is the same class of failure OK has been preventing.

**Resolution.** Migrate guidance to a layered hybrid that owns no project-dir files:
- **Slim MCP `instructions` handshake** (≤ 1,500 bytes) carries critical STOP rules + a pointer to the skill; always present when OK MCP is connected.
- **Per-tool `description` fields** carry tool-call-local prerequisites (e.g. `write_document` names the `get_preview_url`-first contract); always in context when the tool is relevant.
- **User-global Agent Skill** installed via `npx skills add --agent '*' -g -y --copy` — carries full behavioral content (detailed wiki-link conventions, frontmatter, cadence, anti-pattern table, escape-hatch rules); each agent host receives its own SKILL.md copy. Description-matching drives cross-host auto-activation; Claude Code additionally honors `paths: '**/*.md, **/*.mdx'` for deterministic gating on markdown turns.
- **Skill install triggers on every adoption path** — not just `ok init`. Three call sites: (a) `ok init` (explicit per-project adoption), (b) CLI `postinstall` hook (fires on `npm install` / `bun install` / `npx` cache population), (c) Electron desktop main-process first-launch boot. All three call a single `installUserSkill()` in `@inkeep/open-knowledge-server`; idempotent via D5 sidecar so multiple calls are no-ops after the first succeeds.
- **`ok init`** stops writing any root-level files, drops `.open-knowledge/AGENTS.md`, and remains one of three triggers for skill install.

## 2) Goals

- **G1. Zero project-root writes** from `ok init` (`AGENTS.md`, `CLAUDE.md`, root-anything). Invariant: a user who runs `ok init` in a repo with no pre-existing OK config sees `.open-knowledge/` created and nothing else at the project root touched.
- **G2. Seamless agent tool preference.** Agents on every supported host default to OK's `exec` / `read_document` / `search` / `write_document` / `edit_document` for in-scope markdown — never fall through to native `Read` / `Grep` / `Glob` / `Edit`. The guidance delivery must be **saturated** across surfaces so that the rule is reinforced at session start (MCP `instructions`), at every tool-call site (tool descriptions), and in a durable, cross-session channel (Agent Skill). Measured via spot-test scenarios (§7 M2).
- **G3. One-time per-machine skill install**, idempotent and version-aware. Second + subsequent `ok init` invocations on the same machine skip skill install when the installed version matches the package version.
- **G4. Graceful handling of legacy injections.** Users with existing `<!-- open-knowledge:begin -->…<!-- open-knowledge:end -->` sections in their CLAUDE.md / AGENTS.md are not touched by the new code path.
- **G5. Cross-host coverage.** Skill is installed to all five first-class hosts (Claude Code, Cursor, Codex, VS Code Copilot, Windsurf) via `npx skills add --agent '*'` — which writes a per-host copy to each detected agent's global skills directory. Claude Desktop is best-effort (not in `vercel-labs/skills` supported-agents list as of `skills@1.5.1`; users install the skill via Claude Desktop's in-app UI per our docs).
- **G6. Auto-install on adoption — no extra step required.** The skill install fires automatically via (a) CLI `postinstall` hook on `npm/bun/pnpm install` or `npx` cache population, (b) Electron desktop app main-process boot on every launch (idempotent no-op when current), and (c) `ok init` as the explicit per-project setup path. User should never need to run a separate "install the skill" command.

## 3) Non-goals

- **[NEVER]** NG1: Automatically removing existing injected sections from users' CLAUDE.md / AGENTS.md. User-decision #2 LOCKED — users remove these on their own schedule.
- **[NEVER]** NG2: Shipping a `ok migrate-off-file-guidance` subcommand that removes injected sections. User explicitly declined option B on decision #2.
- **[NEVER]** NG3: Writing guidance into the user's `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.codeium/windsurf/memories/global_rules.md`, or Cursor's User Rules settings. Skills are the single user-global delivery channel.
- **[NOT NOW]** NG4: Publishing OK as a Claude Code plugin on the Anthropic marketplace. Additive distribution channel — valuable but independent of this migration. Revisit if: we want zero-terminal install UX post-M1 landing.
- **[NOT NOW]** NG5: Empirical adherence benchmarking (measuring how often agents follow MCP `instructions` vs ignore it) across hosts. Research flagged this as the biggest data gap. Revisit if: we observe post-migration regression users report.
- **[NOT NOW]** NG6: `ok uninstall` / full teardown UX (remove skill via `npx skills remove`, unregister MCP, optionally remove `.open-knowledge/`). Revisit if: users request install reversibility.
- **[NOT NOW]** NG7: `ok doctor` install-state inspection command. Revisit if: skill-install edge cases become a support burden (Future Work tier: Identified).
- **[NEVER]** NG8: User-edit preservation on the bundled SKILL.md. The bundled skill is a tool-managed contract file; `ok init` upgrades always overwrite on version bump. Users who fork the skill can use `npx skills remove` + manual install; we don't build checksum-skip machinery for a scenario with no cited demand.

## 4) Personas / consumers

- **P1. OSS repo maintainer** — curates AGENTS.md meticulously for their project's agents. Uses OK across multiple repos. Today: resents the auto-injected OK section in `CLAUDE.md` / `AGENTS.md` and has to manually revert / remove it after each `ok init`. After: zero project-file changes; consistent agent behavior via per-user skill install.
- **P2. Solo developer / knowledge-base personal user** — runs OK in a private notes repo or homelab-style project. Less picky about AGENTS.md pollution but benefits from agent behavior steering. After: no regression in agent behavior; lighter install footprint.
- **P3. Team with shared repo + multi-host adoption** — some devs use Claude Code, others Cursor / VS Code. Today: CLAUDE.md injection covers only Claude Code devs; others rely on MCP handshake. After: skill works across all hosts uniformly; zero per-repo drift.
- **P4. Agent (runtime consumer)** — every invocation of an OK MCP tool. Consumes instructions string + tool descriptions + skill body (progressive disclosure). Must be able to infer tool-call prerequisites without a CLAUDE.md anchor.

## 5) User journeys

### P1 (OSS maintainer) happy path

1. Discovers OK via docs / social / word of mouth.
2. Runs `npx @inkeep/open-knowledge init` in their repo.
3. **Current:** init patches `AGENTS.md` and `CLAUDE.md` (visible in `git status`). **After:** init scaffolds `.open-knowledge/{config.yml,.gitignore}` and shells out to `npx skills add` to install the bundled skill across all detected agent hosts (each host gets its own copy of SKILL.md). No git-tracked file at project root changes.
4. Opens Claude Code / Cursor / etc. Agent auto-activates the skill on first markdown-related turn.
5. Edits markdown; agent routes through OK's tools.

### P1 failure / recovery path

- **Skill-install fails** (`npx skills add` exits non-zero — network/registry fetch failure, no compatible agent hosts detected, filesystem permission). Init reports the failure, MCP config still gets written, user gets a warning to manually run `npx skills add <bundled-path> --agent '*' -g -y --copy` later. OK still works — falls back to MCP handshake string + tool descriptions.
- **Skill present but stale** (user upgraded `@inkeep/open-knowledge` CLI, bundled version changed). Pre-check reads `~/.open-knowledge/skill-installed-version` sidecar, compares to current `@inkeep/open-knowledge` package version; version differs → re-run `npx skills add` → write new sidecar.
- **Agent ignores skill** (host doesn't honor description-matching strongly). MCP `instructions` STOP rules still deliver at session start; tool descriptions still fire at every tool-call site. The three surfaces are saturated precisely to survive this failure mode.

### P1 "aha moment"

Running `ok init` in a second project on the same machine: init completes in ~100 ms. Skill-install pre-check reads the sidecar, sees version matches, skips `npx skills add` entirely. No file changes beyond `.open-knowledge/`. User feels zero-friction.

### P1 debug experience

- `ok doctor` (future command — NG7) would report install state and version mismatches. Not in this spec.
- Manual debug: `npx skills list -g` shows installed skills per host; `cat ~/.claude/skills/open-knowledge/SKILL.md` (or any other host path) shows the installed content; `cat ~/.open-knowledge/skill-installed-version` shows the recorded version string.

### P4 (agent) happy path

1. MCP client initializes connection to OK server. Receives `instructions` string (~1.5 KB): STOP rules + skill pointer.
2. Agent's host loads user-global skill metadata at session start. Skill `description` matches "markdown editing" / "write_document" intent.
3. User asks agent to edit a `.md` file. Agent matches skill activation via description + `paths:` glob (Claude Code); loads full skill body into context.
4. Agent calls `get_preview_url` (prompted by skill + tool description). Opens browser. Calls `write_document`. Edit streams live.
5. No native `Edit` / `Read` on `.md` fallthrough.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| `ok init` skill-install step | "Installing skill…" CLI output | N/A | "Skill install failed: `<reason>`; MCP still configured — run `npx skills add <path> --agent '*' -g -y --copy` manually" warning | "Skill installed to detected agents: claude-code, cursor, codex (3 hosts)" | "Skill installed to claude-code, cursor; codex install failed (run manually)" |
| Sidecar at `~/.open-knowledge/skill-installed-version` | N/A | Missing = fresh install trigger | Empty / wrong format → treat as fresh install | Matches package version → skip install | N/A |
| MCP `instructions` handshake | N/A | N/A (always present) | Host truncates past 2 KB → degraded but non-fatal | Full string delivered | Host ignores (Cursor silent) |
| Tool description surface | N/A | N/A | Host caps at 2 KB/tool → truncated | Full per-tool description delivered | Host ignores (rare) |
| Agent skill auto-activation | N/A | No markdown in session → description doesn't match → skill dormant (expected) | Description too generic → skill activates on non-markdown turns (spec tuning target) | Markdown turn → description match → body loads | Host-specific scoping differs; Claude Code honors `paths:` for deterministic gating, others rely on description-matching |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1. Delete `upsertRootInstructions` from `ok init` flow | `runInit` does not call `upsertRootInstructions`; `rootInstructions?: boolean` field removed from `InitCommandOptions`; `rootInstructions: RootInstructionResult[]` field removed from `InitCommandResult`; "Root instructions:" block deleted from `formatInitResult`; `upsertRootInstructions` export removed from `content/init.ts` | (`rootInstructions` is a programmatic-API field today, not a CLI flag — see F17 assessment.) Covers: root `AGENTS.md`, root `CLAUDE.md`, and any per-editor instructions files (currently only Claude's CLAUDE.md) |
| Must | FR2. Drop `.open-knowledge/AGENTS.md` from `initContent` scaffold + stale AGENTS.md references | (a) `SCAFFOLD_FILES` no longer includes the `AGENTS_FILENAME` entry; existing `.open-knowledge/AGENTS.md` files in users' repos untouched. (b) After migration, **no MCP tool description claims `.open-knowledge/AGENTS.md` exists or is scaffolded**: update `init-content.ts:43` scaffold claim (drop `AGENTS.md` from listed files), delete the `"Full convention: read \`${OK_DIR}/AGENTS.md\`."` line from `init-content.ts:118`, `research.ts:172`, `consolidate.ts:169`, `ingest.ts:75`. | `AGENTS_FILENAME` constant removed from `constants.ts` after dependency sweep confirms no remaining references (D9) |
| Must | FR3. Compress MCP `instructions` string to ≤ 1,500 bytes | `buildInstructions()` output `.length <= 1500` via unit test; content front-loads STOP rules + names skill activation; **remove** the per-tool inlining block at server.ts:283-285 (tool descs already reach clients via `tools/list`) | Preserves: STOP rules on native Read/Grep, preview-before-edit callout, skill-pointer breadcrumb. Current: 24,019 bytes → target: ≤ 1,500 bytes (94% reduction, mostly via dedup + prose trim) |
| Must | FR4. Embed tool-call-local guidance in per-tool MCP `description` fields | Each of `write_document`, `edit_document`, `exec`, `search`, `get_preview_url`, `read_document` has a `description` that: (a) front-loads the critical call-site prerequisite in the first 500 bytes (survives early truncation); (b) total length ≤ 2,048 bytes (Claude Code's per-tool cap). Audit found 5 of 6 already carry the prerequisite; `exec` needs a STOP pointer added re native `Read`/`Grep`/`Glob` on in-scope markdown | Unit test: each description in `TOOL_DESCRIPTIONS` asserts `.length <= 2048` AND the first 500 bytes contain a prerequisite keyword (per-tool keyword list) |
| Must | FR5. Bundle canonical SKILL.md in server package + publish it | (a) SKILL.md shipped at `packages/server/assets/skills/open-knowledge/SKILL.md`; frontmatter = `{name, description}` (spec-standard fields) plus `paths: '**/*.md, **/*.mdx'` as a Claude Code-specific extension (other hosts ignore unknown fields harmlessly). Approved `description` in D11. (b) `packages/server/package.json` — server currently has no `files` array so assets/ auto-publishes; verify in impl. (c) At runtime, bundled path resolved via `new URL('../assets/skills/open-knowledge', import.meta.url)` from compiled server dist. | Server package owns both logic + asset so CLI + Desktop import from one place (D18). Content structure: STOP rules + preview-before-edit + wiki-link conventions + frontmatter conventions (ported from deleted `.open-knowledge/AGENTS.md` per Q9=A+C) |
| Must | FR6. `installUserSkill` in `@inkeep/open-knowledge-server` | `installUserSkill(opts?: { home?: string; logger?: Logger })` exported from `packages/server/src/skill-install.ts` (re-exported by `packages/server/src/index.ts`). Behavior: read sidecar `${opts.home ?? homedir()}/.open-knowledge/skill-installed-version`; if matches current server package version → return `'skip-current'`; else shell out `npx skills@~1.5.0 add <bundled-asset-path> --agent '*' -g -y --copy` with 60 s timeout + `HOME` env override; on success write sidecar + return `'installed'`; on failure log warning + return `'failed'` (never throws). CLI, postinstall script, and Electron main all import + call this one function | One impl, three call sites (D18). Stdin/stdout inherited from parent except logging; no interactive prompts |
| Must | FR7. Idempotency via version-string sidecar | Post-successful-install, write plain `@inkeep/open-knowledge-server` package version (e.g. `0.5.3\n`) to `~/.open-knowledge/skill-installed-version`. On any call: read sidecar; if equals current package version → skip `npx skills add`; else run + rewrite. Missing / empty / corrupt-format sidecar = treat as fresh install | NG8 LOCKS no user-edit preservation; upgrades always overwrite. Bundled SKILL.md is tool-managed contract file |
| Must | FR8. Legacy-injection non-interference | Running new `ok init` against a repo with pre-existing `<!-- open-knowledge:begin -->…` sections in CLAUDE.md / AGENTS.md leaves those files byte-identical | Add test fixture with pre-injected marker block; assert unchanged after init |
| Must | FR9. Tests for `installUserSkill` | Unit tests (subprocess mocked): (a) fresh install → sidecar missing → `npx skills add` invoked → sidecar written; (b) current install → sidecar matches version → subprocess NOT invoked; (c) stale install → sidecar older than package version → subprocess invoked → sidecar rewritten; (d) subprocess non-zero exit → warning logged → returns `'failed'` → sidecar NOT written; (e) subprocess timeout → same; (f) missing `npx` → same; (g) missing / empty / wrong-format sidecar → treated as fresh install | Use `mkdtemp` + `HOME` env override (D15) per test; no writes to real `~/`. Subprocess invocations mocked via dependency injection. Tests live in `packages/server/src/skill-install.test.ts` |
| Must | FR10. Remove `.open-knowledge/AGENTS.md` from output of `open-knowledge init` in tests | Existing tests in `cli/src/content/init.test.ts` and `commands/init.test.ts` updated for the dropped file + new skill-install step | May require rewriting assertions rather than patching |
| Must | FR12. CLI `postinstall` hook fires `installUserSkill` | Add `"postinstall": "node scripts/postinstall.mjs"` to `packages/cli/package.json` scripts; create `packages/cli/scripts/postinstall.mjs` that imports `installUserSkill` from the built `@inkeep/open-knowledge-server` and invokes it. Always exits 0 — never blocks install. Silent on skip-current; one-line summary on install/failure | Fires on `npm install -g @inkeep/open-knowledge`, `bun install`, `pnpm install`, `npx @inkeep/open-knowledge` (cache population). Users with `--ignore-scripts` fall through to `ok init` for recovery (D6 non-fatal) |
| Must | FR13. Electron desktop first-launch hook fires `installUserSkill` | In `packages/desktop/src/main/index.ts`, after `app.whenReady()`, fire-and-forget: `void installUserSkill({ logger: ... })`. Runs on every launch; idempotent via FR7 sidecar so it's a ~50 ms no-op when current. Does NOT block any UI; failures logged but don't surface to user | Main-process-only (not utility-process) since install is a one-time-per-launch action decoupled from per-project utility lifecycle. Reuses logger infrastructure if present |
| Could | FR11. Warn on MCP server startup if user-global skill sidecar is absent | Boot-phase check reads `~/.open-knowledge/skill-installed-version`; if missing, include a one-line suggestion to re-run `ok init` in MCP `instructions` or log at info level | Defense-in-depth for manual installs; Could-tier. Supersedes earlier `--dry-run` FR11 (demoted to Future Work per audit Finding 10) |

### Non-functional requirements

- **Performance:** `ok init` skill-install step ≤ 500 ms on macOS/Linux cold-path, ≤ 50 ms when skill already present at current version. No network calls.
- **Reliability:** Skill install failure never blocks MCP config write. Init exits `0` even on skill install failure (with warning).
- **Security/privacy:** No secrets read or written. Skill content is static markdown — no dynamic user data. Subprocess invocation of `npx skills` uses fixed argv (no user-controlled interpolation). HOME env override for tests is opt-in only.
- **Operability:** Skill-install actions logged at `info` with structured fields `{event: 'skill-install', action: 'fresh' | 'skip-current' | 'upgrade' | 'failed', version, stderr?}`. `ok init` exit summary includes skill-install state + detected hosts (as reported by `npx skills`).
- **Cost:** Negligible. One small markdown file (~5 KB) per installed agent host on user's machine (copies, not symlinks); one sidecar file with a version string.

## 7) Success metrics & instrumentation

- **M1. Zero project-root file changes post-init.**
  - Baseline: today, every `ok init` creates/modifies root `AGENTS.md` + `CLAUDE.md`.
  - Target: 0 root-level file changes (invariant, not metric).
  - Instrumentation: integration test asserts `git status` (or equivalent) shows no root-level file changes after `ok init` in a pristine repo.
- **M2. Agent tool-routing fidelity preserved.** (G2)
  - Baseline: not empirically measured today. Playwright-class regression is the concern.
  - Target: qualitative spot-check in 3 scenarios per host (edit a `.md`, list markdown files, search markdown) — agent routes through OK tools ≥ 95% of the time across all 6 hosts.
  - Instrumentation: manual QA checklist captured in `specs/…/evidence/qa-spot-checks.md` (post-implementation, not this spec). May promote to automated harness if regressions emerge.
- **M3. Install idempotency.**
  - Baseline: not currently measured.
  - Target: `ok init` in a second fresh project on the same machine completes in ≤ 500 ms; skill-install step is skip-current.
  - Instrumentation: unit test + stopwatch in integration test.
- **M4. Legacy-injection non-regression.**
  - Baseline: running new init against repo with legacy section would re-match and overwrite.
  - Target: byte-identical legacy file after `ok init`.
  - Instrumentation: fixture-based test in `commands/init.test.ts`.
- **M5. `instructions`-weight disambiguation (R-INST-WEIGHT).**
  - Baseline: OK operator observation 2026-04-22 — pre-change MCP `instructions` edits did not shift Claude Code agent behavior; CLAUDE.md edits did.
  - Target: determine whether compression alone (FR3: 24 KB → 1.5 KB) is sufficient (H1) or whether the model weights `instructions` weakly regardless of size (H2).
  - Instrumentation: post-ship controlled session. Fresh Claude Code on a test repo with OK MCP registered + sidecar removed (no skill). Prompt agent: "read the file `<path>.md` and tell me its title." Observe: does agent use `exec("cat <path>.md")` / `read_document`, or `Read` tool? Repeat with `~/.claude/skills/open-knowledge/SKILL.md` installed to A/B test whether skill body explains any behavior change independently. Document result in `specs/…/meta/post-ship-measurement-<date>.md`.

## 8) Current state (how it works today)

Code surfaces affected:

| File | Current behavior |
|---|---|
| [`packages/cli/src/commands/init.ts`](../../packages/cli/src/commands/init.ts) | `runInit` orchestrates 5 steps: `ensureProjectGit` → `initContent` → `writeEditorMcpConfig` (per editor) → `scaffoldLaunchJson` (Claude-only) → `upsertRootInstructions` (root AGENTS.md + CLAUDE.md) |
| [`packages/cli/src/content/init.ts`](../../packages/cli/src/content/init.ts) | `initContent` scaffolds `.open-knowledge/` with `AGENTS.md` + `.gitignore` + `config.yml`. `upsertRootInstructions(cwd, force, extraFiles)` writes the `CLAUDE_MD_SECTION` into root `AGENTS.md` + each `extraFiles[]` path. `CLAUDE_MD_SECTION` is ~3,500 bytes |
| [`packages/cli/src/commands/editors.ts:270`](../../packages/cli/src/commands/editors.ts) | `EDITOR_TARGETS.claude.instructionsPath = (cwd) => join(cwd, 'CLAUDE.md')` — extra file path fed into `upsertRootInstructions` |
| [`packages/cli/src/mcp/server.ts`](../../packages/cli/src/mcp/server.ts) | `buildInstructions` emits the live MCP `instructions` string. **Measured 24,019 bytes today** (12× Claude Code's 2 KB cap): 11 KB of prose + 13 KB of per-tool descriptions inlined via `${Object.entries(TOOL_DESCRIPTIONS).map(...)}` at server.ts:283-285. The per-tool inlining is fully redundant — MCP hosts already receive tool descriptions via `tools/list`. Today's Claude Code session truncates ~22 KB of the string silently. See [evidence/current-state-audit.md](evidence/current-state-audit.md). |
| [`packages/cli/src/mcp/tools/*.ts`](../../packages/cli/src/mcp/tools/) | Tool descriptions live here. Need audit for current length + call-site-local-prerequisite content |
| [`packages/cli/src/constants.ts:7`](../../packages/cli/src/constants.ts) | `AGENTS_FILENAME = 'AGENTS.md'` constant. Referenced from `content/init.ts` for both scaffold + upsert |
| Tests affected | `commands/init.test.ts`, `content/init.test.ts`, `content/preview.test.ts` (references AGENTS_FILENAME), `mcp/tools/init-content.ts` / `research.ts` / `consolidate.ts` / `ingest.ts` (reference AGENTS.md in content strings — FR2 cleans up); `mcp/server.test.ts` (asserts `buildInstructions embeds PREVIEW_GUIDANCE` — superseded by FR3 size-cap test) |
| `packages/cli/package.json` | `files` array currently publishes only `["dist", "!dist/**/*.map"]`. The bundled SKILL.md at `packages/cli/assets/skills/open-knowledge/SKILL.md` (FR5) would NOT ship with the published npm package. FR5 requires adding `"assets"` to the `files` array |
| `packages/cli/src/mcp/tools/` | 21 tool DESCRIPTION constants (not 20 as evidence initially counted) exported from `tools/index.ts:TOOL_DESCRIPTIONS`. Filenames use **hyphens** (`write-document.ts`, `edit-document.ts`, `get-preview-url.ts`, `read-document.ts`); MCP tool names use underscores (`write_document`, etc.) |

### Key constraints (from current state)

- `upsertRootInstructions` is called from `runInit` *and* returns per-file results surfaced to the user via `formatInitResult` (console output). Deletion must remove both the call site AND the formatting output AND the `rootInstructions` field on `InitCommandResult`.
- `AGENTS_FILENAME` constant is imported by `content/init.ts` for BOTH the `SCAFFOLD_FILES` array (internal `.open-knowledge/AGENTS.md`) and the `upsertRootInstructions` default file list. Both usages removed.
- `CLAUDE_MD_SECTION` shares `PREVIEW_GUIDANCE` with `buildInstructions`. Compressing `buildInstructions` to ≤ 1,500 bytes means `PREVIEW_GUIDANCE` itself needs trim (it's cited by both, so full replacement of both surfaces in one pass).
- `writeEditorMcpConfig` per-editor logic is orthogonal — keeps working as-is.
- `.open-knowledge/AGENTS.md` is referenced in MCP tool descriptions (`mcp/tools/init-content.ts:16`, `preview.test.ts:81`, etc.) — those mentions also need cleanup.

### Known gaps discovered during research

- `.open-knowledge/AGENTS.md` is not programmatically read by anything in the codebase (verified via `grep`). Pure documentation artifact.
- `buildInstructions` currently emits 24,019 bytes — **12× Claude Code's 2 KB per-server cap**. Today's Claude Code session silently truncates ~22 KB of guidance content. This is pre-existing, not a regression introduced by this spec.
- **Per-tool descriptions are duplicated** — inlined in `instructions` (13 KB of server.ts:283-285) AND delivered via `tools/list` (already the native MCP channel). Removing the inlined block saves 13 KB with zero information loss.
- MCP tool descriptions in `mcp/tools/{research,consolidate,ingest,init-content}.ts` contain literal `"Full convention: read \`.open-knowledge/AGENTS.md\`."` pointers — these become dead references when we stop scaffolding the internal `AGENTS.md` (addressed by FR2 cleanup / OQ Q8).

## 9) Proposed solution (vertical slice)

### User experience / surfaces

- **CLI:** `ok init` output changes:
  - Removes "Root instructions" section from stdout.
  - Adds a "User-global skill" section: `Open Knowledge skill  installed to N detected agents (claude-code, cursor, codex)` (or `skipped (already current at v0.5.3)` on idempotent path, or `failed: <reason>` with warn style).
- **Docs:** Update `packages/cli/README.md`, `docs/` site init section, main project README if they describe CLAUDE.md/AGENTS.md injection. Replace with "installs an Agent Skill to your user-global agents directory; see [skill-spec docs] for contents."
- **Error messages:**
  - Skill-install failure: `Warning: user-global skill install failed (<reason>). MCP registration succeeded. OK will still work — MCP instructions + per-tool descriptions carry the STOP rules. To install the skill manually later: npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy`
  - Missing `npx`: `Warning: npx not found. Skipping user-global skill install. Install Node.js + npm to enable the skill surface.`

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `ok init` stdout | CLI | New "User-global skill" block; "Root instructions" block removed |
| `~/.claude/skills/open-knowledge/SKILL.md` | Filesystem | Per-host copy written by `npx skills add` (Claude Code) |
| `~/.cursor/skills/open-knowledge/SKILL.md` | Filesystem | Per-host copy (Cursor) |
| `~/.codex/skills/open-knowledge/SKILL.md` | Filesystem | Per-host copy (Codex) |
| `~/.copilot/skills/open-knowledge/SKILL.md` | Filesystem | Per-host copy (VS Code Copilot) |
| `~/.codeium/windsurf/skills/open-knowledge/SKILL.md` | Filesystem | Per-host copy (Windsurf) |
| `~/.open-knowledge/skill-installed-version` | Filesystem | Sidecar written post-successful-install, contains package version string |
| `.open-knowledge/config.yml` | Filesystem | Unchanged (lifecycle guidance appended to comments per D12) |
| `.open-knowledge/AGENTS.md` | Filesystem | NOT created in fresh installs; existing files in legacy installs untouched |
| Root `AGENTS.md` | Filesystem | NOT created / NOT patched in fresh installs |
| Root `CLAUDE.md` | Filesystem | NOT created / NOT patched in fresh installs |
| MCP `initialize` response `instructions` field | Protocol | ≤ 1,500 bytes; STOP rules front-loaded |
| MCP `tools/list` → per-tool `description` | Protocol | Each ≤ 2,048 bytes; call-site prerequisite front-loaded in first 500 bytes |

### System design

**Architecture overview.** Three delivery surfaces working in concert:

```
┌──────────────────────────────────────────────────────────────────────┐
│                      OK Behavioral Guidance                          │
│                        (saturation by design)                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [1] MCP handshake  ──► server sends `instructions` ≤ 1,500 bytes   │
│       (every session)    • STOP rules on native Read/Grep on .md     │
│                          • Preview-before-edit anchor                 │
│                          • "See open-knowledge skill" pointer         │
│                                                                      │
│  [2] Tool descriptions ─► per-tool `description` ≤ 2,048 bytes each │
│       (every tool-call)    (first 500 B front-loaded STOP rule)      │
│                          • write_document: "call get_preview_url…"   │
│                          • edit_document: same                        │
│                          • exec: "prefer over native Grep on .md"    │
│                          • search/read_document: markdown-aware      │
│                                                                      │
│  [3] Agent Skill ────► installed via                                 │
│       (activates on     `npx skills@~1.5.0 add <path>                │
│        markdown work)    --agent '*' -g -y --copy`                   │
│                          writes per-host copy to each detected       │
│                          agent's global skills dir:                  │
│                            ~/.claude/skills/open-knowledge/          │
│                            ~/.cursor/skills/open-knowledge/          │
│                            ~/.codex/skills/open-knowledge/           │
│                            ~/.copilot/skills/open-knowledge/         │
│                            ~/.codeium/windsurf/skills/open-knowledge/│
│                          (plus ~35 other agents in vercel-labs/skills│
│                           supported-agents list; Claude Desktop is   │
│                           NOT in the list as of skills@1.5.1)        │
│                          • Full behavioral content (~5 KB):          │
│                            STOP rules, preview-before-edit full seq, │
│                            wiki-link conventions, frontmatter,       │
│                            cadence, anti-pattern table, escape-hatch │
│                          • `paths: '**/*.md, **/*.mdx'` as a Claude  │
│                            Code-specific extension; other hosts      │
│                            ignore unknown frontmatter fields and     │
│                            rely on description-matching alone.       │
│                                                                      │
│  Install gate: version-string sidecar at                             │
│       ~/.open-knowledge/skill-installed-version                       │
│       - sidecar absent / empty / wrong format → fresh install        │
│       - sidecar version == package version → skip subprocess         │
│       - sidecar version != package version → re-install + rewrite    │
│       (NG8: no user-edit preservation. Bundled SKILL.md is           │
│        tool-managed. `npx skills remove` is the escape hatch.)       │
└──────────────────────────────────────────────────────────────────────┘
```

**Data model.** No persistent state beyond (a) per-host copies of SKILL.md written by `npx skills add`, (b) version-string sidecar at `~/.open-knowledge/skill-installed-version` (plain package version string + newline; written after successful install), (c) existing `.open-knowledge/config.yml` in the project (unchanged).

**API/transport.** MCP stdio + HTTP (existing). Changes are content only (`instructions` string, tool descriptions); no protocol changes.

**Auth/permissions.** Filesystem writes respect user's umask. No privilege escalation. No symlink logic; `--copy` is the uniform mode.

**Enforcement points.**
- `ok init` enforces FR1-FR10 at install.
- Boot-time MCP server enforces FR3 (compressed instructions) + FR4 (tool descriptions); FR11 optional missing-sidecar nudge at Could-tier.

**Observability.** Structured logging at each init substep per §6 NFR (event names: `skill-install.fresh`, `skill-install.skip-current`, `skill-install.upgrade`, `skill-install.failed`). No telemetry beyond what CLI already emits.

#### Data flow diagram

- **Primary flow (fresh install):** User runs `ok init` → `ensureProjectGit` → `initContent` (writes `.open-knowledge/config.yml` + `.gitignore`, NO AGENTS.md) → `writeEditorMcpConfig` per editor → `scaffoldLaunchJson` (Claude-only) → `installUserSkill` (read sidecar; absent → call `npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy`; on success, write sidecar with current package version) → print summary.
- **Primary flow (re-run, same machine, skill current):** User runs `ok init` → `installUserSkill` → read sidecar; equals current package version → skip `npx skills add` entirely (fast path, ~50 ms).
- **Primary flow (upgrade after `@inkeep/open-knowledge` version bump):** User runs `ok init` → sidecar version != package version → re-run `npx skills add` → write new sidecar.
- **Shadow paths to test:**
  - **nil / missing sidecar:** Doesn't exist → treat as fresh install → run `npx skills add`.
  - **empty sidecar:** 0 bytes → treat as fresh install.
  - **wrong format sidecar:** Not a valid semver-style version string → treat as fresh install.
  - **subprocess timeout:** `npx skills add` hangs > 60 s → kill + log warning + init continues (sidecar NOT written).
  - **subprocess exit non-zero:** Network / no hosts / permissions → log stderr + warning + init continues (sidecar NOT written, so next `ok init` retries).
  - **`npx` not available:** ENOENT → log warning with manual install hint + init continues.
  - **partial host failure:** `npx skills add` reports some hosts succeeded and others failed → we surface the stderr but still write sidecar (re-running won't help if the failing host's dir genuinely doesn't exist; user runs `npx skills add` manually if they install that host later).

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `installUserSkill` pre-check (read sidecar) | File missing (first install) or format invalid | `fs.readFile` throws `ENOENT` or content doesn't match `/^\d+\.\d+\.\d+.*\n?$/` | Treat as "no current install" → run `npx skills add` | None — normal flow |
| `npx skills add` subprocess | Exit non-zero (network, no hosts detected, permissions) | subprocess status check | Log stderr with warning; init continues; sidecar NOT written | User-global skill not installed; MCP handshake STOP rules still deliver via `instructions`; manual install hint in warning |
| `npx skills add` subprocess | Hangs / timeout | 60 s subprocess timeout | Kill + log warning | Same as above |
| `npx skills` not available (offline, no npm) | `npx` ENOENT | subprocess spawn error | Log warning with offline install hint | Same as above |
| MCP `buildInstructions` at boot | String exceeds 1,500 bytes due to edits | CI test fails at build | Developer fixes before merge | No runtime impact |
| Per-tool description at boot | Exceeds 2,048 bytes or missing prerequisite keyword in first 500 B | CI test fails at build | Developer fixes before merge | No runtime impact |
| `ok init` on read-only filesystem | `EACCES` on `.open-knowledge/` itself | `mkdirSync` throws | Init exits 1 with existing error semantics | No change from today |

### Alternatives considered

Summarized here; full research analysis in [reports/mcp-guidance-delivery-no-project-pollution/REPORT.md](../../reports/mcp-guidance-delivery-no-project-pollution/REPORT.md).

- **Alt A: Pure deletion + rely on MCP `instructions` alone.** Lowest-risk to ship but regresses agent behavior-steering (Playwright-class failure documented). **Rejected — fails G2.**
- **Alt B: One-liner breadcrumb in user's AGENTS.md.** E.g. "This repo uses Open Knowledge; see MCP instructions." Still writes to user's project file (just a smaller amount). **Rejected — fails G1.**
- **Alt C: Companion skill via Claude Code plugin marketplace only.** Cleanest Claude Code UX, zero code changes to OK init flow. **Rejected as sole path — only covers Claude Code; Future Work as additive channel (NG4).**
- **Alt D: Write to per-host user-global files** (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.codeium/windsurf/memories/global_rules.md`). Possible but 4 writes to 4 different paths; Cursor has no filesystem surface (settings-only); fragile. Skill path converges cleanly. **Rejected — skills are the strictly better user-global channel.**
- **Alt E: Custom `installUserSkill` with `~/.agents/skills/open-knowledge/` canonical + symlinks to `~/.claude/skills/` + `~/.codeium/windsurf/skills/`.** First planned path for this spec. Gave us canonical-write-once UX but required ~150 lines of path logic, symlink fallback, Windows handling, per-host knowledge we'd maintain as the ecosystem evolves. **Rejected in favor of Alt F — `npx skills` offloads the maintenance.**
- **Chosen (Alt F): Layered hybrid with `npx skills add` for user-global install.** Saturated delivery across three surfaces (D17) + ecosystem-aligned install mechanism. Modest runtime dependency on `npx skills@~1.5.0` (MIT, Vercel Labs, active). Copies (not symlinks) per host — upgrades overwrite on version bump. Version-string sidecar (D5) gates re-install; no user-edit preservation (NG8). Justified by G1/G2/G5 + material complexity offload vs custom install.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Adopt layered hybrid (MCP instructions ≤1,500B + per-tool descriptions + user-global SKILL.md) | X | LOCKED | Yes (API surface of install behavior) | Saturation by design — the three surfaces reinforce rather than duplicate. Detailed behavioral guidance (~5 KB manual in skill body) is load-bearing for the G2 seamlessness goal; can't fit in the other two surfaces at their caps | [Research report](../../reports/mcp-guidance-delivery-no-project-pollution/REPORT.md) + user framing 2026-04-22 ("detailed instructions for seamless tool preference") | Requires all three delivery surfaces implemented; each has own acceptance criteria |
| D2 | Zero project-root file writes from `ok init` | X | LOCKED | Yes (product promise) | User-stated intent; ecosystem norm; AGENTS.md is user-curated territory | User conversation 2026-04-22 | Removes `upsertRootInstructions` entirely + `.open-knowledge/AGENTS.md` scaffold |
| D3 | Leave existing legacy injections in users' CLAUDE.md/AGENTS.md untouched; do NOT ship a migration subcommand | P | LOCKED | No (can ship later if demand) | User explicitly chose option A on Intake-decision-2, declined option B | User conversation 2026-04-22 | Users remove marker blocks manually; existing sections continue to exist benignly |
| D4 | Skill install delegated to `npx skills add --agent '*' -g -y --copy` | T | LOCKED | Yes (external-dep commitment) | Vercel Labs' `skills@1.5.1` CLI covers 40+ agent hosts (including all 5 first-class OK hosts; Claude Desktop is NOT in the list); maintained; MIT; removes ~150 lines of custom path logic | [evidence/npx-skills-investigation.md](./evidence/npx-skills-investigation.md) | Pin `skills@~1.5.0` (tilde, D16); per-host copies; install is shell-out, not library call |
| D5 | Skill install idempotency via version-string sidecar | T | LOCKED | No | On successful install, write plain package version (e.g. `0.5.3\n`) to `~/.open-knowledge/skill-installed-version`. Next `ok init`: skip if sidecar version matches package. Simpler than SHA-256 (saves ~70 lines + 5 tests); no false-positives from cosmetic changes in bundled file | Q9 resolution; user Decision 2 (2-B); Challenger finding C5 | No user-edit preservation (NG8); upgrades always overwrite. `npx skills remove` is the escape hatch for power users |
| D6 | Skill-install failure is non-fatal | T | LOCKED | No | Init should never fail just because `npx skills` subprocess errored; MCP handshake STOP rules still deliver | G2 saturation stance | Exit 0 with warning; skill manual-install hint in error message |
| D7 | ~~Symlink failure falls back to file copy~~ **DROPPED** — `npx skills --copy` always copies | T | — | No | We pass `--copy` explicitly; no symlink code path in `installUserSkill` | D4 supersedes | — |
| D8 | `rootInstructions` field removed (not deprecated) from `InitCommandOptions` + `InitCommandResult` | T | DIRECTED | No | Programmatic-only field today (no CLI flag); cleaner to delete than deprecate-with-noop | Field had one consumer (`runInit`'s branch at init.ts:541) that we're deleting; no backward-compat issue | Delete field from types; delete call site; delete output block in `formatInitResult`. Changelog copy may still say "removed root-instructions feature" colloquially |
| D9 | `AGENTS_FILENAME` constant removed from `constants.ts` IF no remaining references | T | DELEGATED | No | Follow-dep-cleanup after removing `upsertRootInstructions` + `SCAFFOLD_FILES` entry | grep during implementation | Implementer's call |
| D10 | ~~`--force` flag on `ok init` to override user-edit preservation~~ **DROPPED** — no user-edit preservation under D5 | T | — | No | D5 revised (version-string, not SHA-256); NG8 locks no user-edit preservation; `--force` has no function to perform | User Decision 2 (2-B) | — |
| D11 | Skill `description` content (activation lever) | P | LOCKED | No (reversible — can retune if activation misses) | User-approved wording: "Guidance for working with Open Knowledge — a markdown collaboration server exposed via MCP. STOP rules for native file tools on `.md` / `.mdx` (use `exec` / `read_document` / `search` / `write_document` / `edit_document` instead), preview-before-edit sequence (`get_preview_url` → open browser → edit), `[[wiki-link]]` authoring conventions, folder-first organization. Use whenever reading, editing, or creating markdown in a project with Open Knowledge MCP connected." | Q2 | ~500 chars; within all host caps (Agent Skills standard: 1,024; Claude Code: 1,536) |
| D12 | Skill content structure | P | DELEGATED (implementer drafts; user signs off) | No | Port `CLAUDE_MD_SECTION` body into SKILL.md + port Frontmatter Conventions section from deleted `.open-knowledge/AGENTS.md` (per Q9=A). Port lifecycle suggestion to `config.yml` comments (per Q9=C). Voice: "how Open Knowledge works" not "how this project works" | Q2 / Q9 | Implementer drafts; review required before merge |
| D13 | Delete `PREVIEW_GUIDANCE` shared constant; each surface owns its wording | T | LOCKED | No | Different audiences and budgets (slim instructions vs full skill body); shared constant created fake reuse | Q8=A | Scrap the export; both `buildInstructions` and SKILL.md write their own (different) preview guidance |
| D14 | Delete "Full convention: read `.open-knowledge/AGENTS.md`" pointers from MCP tool descriptions | T | LOCKED | No | Pointer references the soon-to-be-deleted internal README; redundant with MCP handshake + skill | Q7=A | Update `mcp/tools/{init-content,research,consolidate,ingest}.ts` |
| D15 | Test isolation via `options.home` env override to subprocess | T | LOCKED | No | When `options.home` is set (test mode), pass it as `HOME` env var to `npx skills add` subprocess so it installs to tmpdir not user's real `~/` | Q6=A | Consistent with existing `options.home` pattern in `writeEditorMcpConfig` |
| D16 | Pin `npx skills` to `~1.5.0` (tilde, patch-only) | T | LOCKED | Yes (runtime-dep choice) | Patch-only pin matches D16's stated "break explicitly not silently" rationale. `skills@1.5.1` published 5 days before this spec + `1.4.5-snapshot.2` still active → tool is actively evolving. Tilde surfaces minor-version changes as explicit breakage at bump time, caret would allow silent behavior shifts through 1.x | Challenger C4; Vercel Labs' semver contract on patch releases | Use `npx skills@~1.5.0 add ...` explicitly in subprocess invocation. Bump policy: validate flag-surface stability before promoting minor-range pin |
| D17 | Saturated three-surface delivery is a first-class product promise (G2) | X | LOCKED | Yes (design philosophy) | User framing 2026-04-22: detailed guidance necessary for seamless tool preference; each surface carries content the others can't (instructions: session-bootstrap STOP rules; tool descriptions: call-site prerequisites; skill: full ~5 KB behavioral manual with cross-session persistence) | User conversation 2026-04-22 | Defense-in-depth IS the design; all three must ship in M1 or we re-open G2 measurement; follow-up NOT NOW reconsideration of skill-skip requires new spec pass |
| D18 | `installUserSkill` lives in `@inkeep/open-knowledge-server` | T | LOCKED | Yes (cross-package integration) | Server package is already a dependency of both CLI (via `@inkeep/open-knowledge-server` workspace:*) and Desktop (main + utility import `bootServer`, `isProcessAlive`, etc.). Core can't host it (would violate "browser + Node compatible"); CLI can't be imported by Desktop without a new dep arrow. Server is the shortest path to "one impl, three call sites." | User Decision 3-A (Electron scope in this spec) + workspace dependency graph | CLI does `import { installUserSkill } from '@inkeep/open-knowledge-server'`. Desktop main does the same. Postinstall script imports from the built server dist |
| D19 | Bundled SKILL.md lives in `packages/server/assets/skills/open-knowledge/SKILL.md` | T | LOCKED | No | Co-located with `installUserSkill` so path resolution via `new URL('../assets/...', import.meta.url)` resolves from compiled server dist uniformly | D18 + FR5 | Server package has no `files` array today (auto-publishes everything) — no package.json edit needed there. Verify during impl |
| D20 | CLI `postinstall` hook is non-fatal + idempotent | T | LOCKED | Yes (npm install contract) | Always `process.exit(0)` regardless of install outcome. Any failure path that throws → caught → logged → exit 0. Never block `npm/bun/pnpm install`. Sidecar check means ≥ 2nd invocation in the same session is a fast no-op | FR12 + D6 | Script must be pure ESM, Node-only (no TS compile-at-install); compiled into `packages/cli/scripts/postinstall.mjs` or similar |
| D21 | Desktop first-launch install fires fire-and-forget in main process | T | LOCKED | No | `void installUserSkill({ logger })` called after `app.whenReady()` resolves; NOT awaited; failures logged to main-process log but not surfaced to user. Runs on every launch (FR7 sidecar makes it a no-op when current) | FR13; user Decision 2 (every-launch, idempotent) | Main process (not utility) because install is a one-time-per-launch action decoupled from per-project lifecycle. Uses `child_process` — already Electron-available |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | User-edit preservation policy | X | P0 | Yes | **Resolved: NG8 — no user-edit preservation.** Bundled SKILL.md is tool-managed; upgrades always overwrite on version bump; `npx skills remove` is power-user escape hatch. (Revised from initial Q1=B checksum-skip; user Decision 2 selected simpler version-string sidecar.) | **Resolved** |
| Q2 | Skill `description` field wording | P | P0 | Yes | **Resolved:** user-approved draft in D11 | **Resolved** |
| Q3 | Static vs dynamic SKILL.md content | T | P2 | No | Defer — ship static first; Future Work to explore dynamic augmentation | Deferred |
| Q4 | Claude Desktop skill path | T | P0 | Yes for G5 | **Resolved: not covered by `npx skills` supported-agents list** (verified against `vercel-labs/skills@1.5.1` README). G5 narrowed to 5 first-class hosts + Claude Desktop best-effort via in-app UI (docs only) | **Resolved (narrowed)** |
| Q5 | VS Code Copilot skill path | T | P0 | Yes for G5 | **Resolved: covered via `github-copilot` agent target in `npx skills`** (writes to `~/.copilot/skills/`) | **Resolved** |
| Q6 | Test isolation for skill-install | T | P0 | Yes for FR9 | **Resolved: A — reuse `options.home`.** Pass as `HOME` env var to `npx skills` subprocess; existing `writeEditorMcpConfig` pattern. See D15 | **Resolved** |
| Q7 | Tool description audit | T | P0 | Yes for FR4 | **Resolved (audit complete):** 5 of 6 priority tools already front-load their call-site prerequisite; only `exec` needs a STOP pointer added re native Read/Grep/Glob on in-scope markdown. Per-tool edits still require user review (ASK_FIRST §16) at impl time | **Resolved (audit done)** |
| Q8 | Internal `.open-knowledge/AGENTS.md` references in MCP tools | P | P0 | Yes for FR2 | **Resolved: A — delete the pointers.** FR2 acceptance updated: drop `"Full convention: read..."` line from `init-content.ts:118`, `research.ts:172`, `consolidate.ts:169`, `ingest.ts:75`; update `init-content.ts:43` scaffold claim. See D14 | **Resolved** |
| Q9 | Version-compare policy | T | P0 | Yes for FR6 | **Resolved: version-string sidecar** (plain `@inkeep/open-knowledge` package version). Simpler than SHA-256; deterministic upgrade on version bump. See D5, FR7 | **Resolved** |
| Q10 | Does `npx skills --agent '*'` detect installed hosts or install to all 40+? | T | P0 | Yes for FR6 UX | Investigate during impl — read `npx skills` source or run empirical test. Either outcome is acceptable (both satisfy goals); affects cosmetics of success message | Open — investigation during impl |
| Q11 | What's the UX for a user with NO supported agent host installed — does `npx skills add` exit non-zero or succeed with "nothing to do"? | T | P0 | No (non-fatal already per D6) but UX-relevant | Investigate during impl — test run with empty agent set | Open — investigation during impl |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `npx skills` CLI is reachable at install time (comes with any npm setup) | HIGH | Any user running `npx @inkeep/open-knowledge init` already has `npx` working | N/A | Active |
| A2 | Claude Code's `paths: '**/*.md, **/*.mdx'` frontmatter is a Claude Code-specific extension that auto-activates the skill on markdown turns; other hosts ignore it harmlessly and rely on description-matching alone | MEDIUM | Per code.claude.com Claude Code skills docs (field is listed in frontmatter reference). NOT in agentskills.io spec — confirmed Claude Code-only. Will manual-test post-impl | Before finalization | Active |
| A3 | Users running `ok init` typically have write permissions on their home directory and the per-agent skill paths within it | HIGH | Standard assumption; any UNIX-like env with home dir ownership | N/A | Active |
| A4 | `npx skills add --agent '*'` covers Claude Code, Cursor, Codex, VS Code Copilot (via `github-copilot` target), Windsurf — 5 of 6 OK-supported hosts. **Claude Desktop is NOT in the `vercel-labs/skills@1.5.1` supported-agents list.** | HIGH (verified against `vercel-labs/skills` README) | README fetch + challenger audit verified | N/A | Active — G5 narrowed |
| A4b | **Claude Desktop skill install is fundamentally manual-only.** Deep-dive research 2026-04-22 ([evidence/claude-desktop-skill-install-2026-04-22.md](../../reports/mcp-guidance-delivery-no-project-pollution/evidence/claude-desktop-skill-install-2026-04-22.md)) confirmed via 10 dimensions of investigation: no URL scheme, no CLI, no filesystem path, no public API, no IPC surface. Anthropic explicitly closed the feature request for `~/.claude/skills/` support in Desktop (Issue #40558, "invalid"). Skills are server-side storage keyed to Anthropic account. The ONLY install path is Settings > Features > Upload zip, requiring a paid plan (Pro/Max/Team/Enterprise) with code execution enabled. | **HIGH** (confirmed by primary sources across 10 dimensions) | Re-verify if Anthropic ships automated install (monitor #20697, #40558) | Per-release | Active |
| A5 | `npx skills --copy` produces file copies in non-interactive mode; symlink mode is interactive-only | MEDIUM | README documents `--copy` flag; `--symlink` flag NOT documented. We pass `--copy` explicitly to be safe cross-platform | Per-release | Active |
| A6 | `buildInstructions` can be compressed to ≤ 1,500 bytes without losing the STOP-rule content that prevents the Playwright-class failure | MEDIUM | Draft the compressed string during impl; review content-for-content against current. Dedup alone (remove the 13 KB per-tool inlining) gets us 55% of the way; real prose (11 KB) compresses well with redirects-to-skill | Before FR3 is considered complete | Active |
| A6b | **The MCP `instructions` field actually influences Claude Code agent behavior when delivered under the 2 KB cap.** This assumption is load-bearing for whether FR3's compression (24 KB → 1.5 KB) materially changes Claude Code behavior. Two competing hypotheses explain OK operator observation (2026-04-22) that pre-change MCP instructions edits did not shift Claude Code behavior: **(H1) compression-artifact** — edits lived past the 2 KB truncation line, never reached the model; **(H2) weak-weighting** — content was delivered but model doesn't treat `# MCP Server Instructions` block as directive. The two are empirically distinguishable only post-ship. | LOW until post-ship measurement disambiguates H1 vs H2 | See R-INST-WEIGHT in §14 for the measurement + branch-point plan | First post-ship measurement session | Active |
| A6c | **MCP `instructions` is Claude-Code-only for reliable model-context delivery.** Research 2026-04-22 ([evidence/d1-mcp-instructions-followup-2026-04-22.md](../../reports/mcp-guidance-delivery-no-project-pollution/evidence/d1-mcp-instructions-followup-2026-04-22.md)) confirmed: Cursor (not documented; user FR filed), Windsurf (not documented), VS Code Copilot (uses its own `copilot-instructions.md` instead), and Claude Desktop ([anthropics/claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131) — explicit host confirmation it drops the field) do NOT inject `instructions` into the model. Codex is split: older `codex-mcp` reads it, newer `rmcp-client` ignores it. Open-source verification: sst/opencode + OpenHands MCP clients don't read it either. | **HIGH** (primary source: Rust/TS source inspection + vendor docs + acknowledged GitHub issue) | Re-check on ecosystem evolution (specifically if Cursor accepts the filed feature request) | Per-release audit | Active |
| A7 | Agent skills' description-matching reliably activates the skill on markdown work across all 5 first-class hosts | MEDIUM | Spot-test post-implementation; research gap per NG5 | Per-release | Active |
| A8 | No other code paths in the repo read `.open-knowledge/AGENTS.md` or the root injected sections | HIGH | Grep audit during implementation (FR2 + FR8) | Before merge | Active |
| A9 | `npx skills@~1.5.0` flag surface (`-y`, `--agent '*'`, `-g`, `--copy`, local-path source) remains stable through the tilde range (patches only) | HIGH | Tilde pin restricts to patch releases; Vercel Labs' semver patch-contract | Per-minor-release | Active |
| A10 | `~/.open-knowledge/` user-global dir doesn't conflict with anything existing on users' machines (we create it for the sidecar) | HIGH | Project-level `.open-knowledge/` is a known pattern; user-level is separate and uncontested. Existing CLAUDE.md convention mentions `~/.open-knowledge/config.yml` as supported | N/A | Active |

## 13) In Scope (implement now)

- **Goal:** Execute G1-G5: zero project-root writes from `ok init`, preserve agent behavior-steering via layered hybrid, one-time per-machine skill install with idempotency, legacy non-interference, cross-host portability.
- **Non-goals:** NG1-NG7 (see §3).
- **Requirements with acceptance criteria:** see §6 FR1-FR10 (Must-tier); FR11 (Should); FR12 (Could).
- **Proposed solution:** see §9.
- **Owner(s)/DRI:** Tim Cardona + Claude Opus 4.7.
- **Next actions (tickets/tasks):**
  1. Draft compressed `buildInstructions` string + SKILL.md content → user review (FR3 + FR5 + D10).
  2. Draft per-tool description updates → user review (FR4 + Q7).
  3. Answer Q1 (upgrade overwrite policy), Q2 (skill description wording), Q4 (Claude Desktop path), Q5 (Copilot path), Q6 (test home-override), Q7 (tool desc audit), Q8 (internal tool desc cleanup), Q9 (version compare policy) during Iterate phase.
  4. Implement: delete `upsertRootInstructions` + refs; drop AGENTS.md from SCAFFOLD_FILES; add `installUserSkill` module; wire into `runInit`; update `formatInitResult` output; update tests; compress `buildInstructions`; per-tool descriptions.
  5. Manual QA spot-check across 6 hosts (M2).
- **Risks + mitigations:** see §14.
- **What gets instrumented/measured:** §6 NFR operability + §7 M1-M4.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Existing users with injected sections | Legacy non-interference (FR8) | Fixture test |
| Users on a different host than Claude Code | MCP instructions still deliver; skill in global path | Manual QA on Cursor/Codex/VSCode/Windsurf |
| Skill install failure on CI machines (test envs without `~/` writability) | Non-fatal; init completes | Integration test with mocked failing `fs` |
| Package version bump → stale skill upgrades | `installUserSkill` detects version mismatch, re-writes | Unit test with fixture of older-version SKILL.md |
| Post-merge: users re-run `ok init` to pick up the new behavior | Docs + changelog entry; no automated nag | `bun run changeset` entry |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Skill `description` fails to auto-activate reliably on non-Claude hosts → guidance gap | Medium | Medium (agent defaults to native tools) | Tool descriptions embed call-site prerequisites (FR4) as second line of defense; MCP handshake STOP rules (FR3) as third | Impl phase |
| `npx skills add` subprocess fails in offline / airgapped environments | Medium | Low (non-fatal per D6) | Install skips; MCP handshake still delivers; manual install hint in warning | Impl phase |
| `npx skills` package ships a breaking change outside our `^1.5.0` pin | Low | Medium (skill install would fail until we pin-bump) | `^1.5.0` caret pin; surface failures as explicit warnings not silent degradation; add a smoke test in CI that `npx skills@^1.5.0 add --help` works | Post-release |
| `npx skills` gets deprecated / taken down | Low | Medium (need to rebuild custom install) | Low likelihood given Vercel Labs maintenance + 40+ host coverage; Future Work: fall back to custom install if this materializes | Post-release |
| Users in multi-worktree setups: user-global `~/.open-knowledge/skill-installed-version` shared across all worktrees → version conflicts | Low | Low | Install logic is idempotent (D5); different CLI versions in different worktrees reconcile on next `ok init` per-worktree | Impl phase |
| User has manually edited installed SKILL.md; `ok init` upgrade overwrites | Low (expected behavior per NG8) | Low | Users can run `npx skills remove` before bumping OK if they fork the skill; bundled file is tool-managed contract | Post-release |
| MCP `instructions` truncation on hosts with smaller cap than 2 KB | Low | Low | FR3 enforces ≤ 1,500 bytes (well under any documented cap) | Impl phase |
| `npx skills` installs to hosts OK doesn't actively support, cluttering users' home dirs (Q10) | Low | Low | `npx skills` likely auto-detects installed hosts; if not, users can `npx skills remove` unwanted hosts | Impl phase |
| Playwright-class regression: agents still fall through to native Read on `.md` more often than today | Medium | High (degrades OK's core value prop) | M2 spot-check as release gate; all three surfaces saturate the behavioral rule | QA |
| **R-INST-WEIGHT** — MCP `instructions` field is delivered but NOT load-bearing for Claude Code agent behavior. OK operator reported (2026-04-22) that past pre-change edits to `buildInstructions` did not shift behavior; CLAUDE.md edits did. Two hypotheses, indistinguishable until we ship the compressed version: **(H1) compression artifact** — edits lived past the 2 KB cap and were silently truncated, so the content never reached the model; or **(H2) weak weighting** — content was delivered but the model treats the MCP instructions block as a "hint" (per spec RFC 2119 `MAY`) rather than as directive guidance like CLAUDE.md content. **Scope limited to Claude Code** per A6c — other target hosts do not inject `instructions` into the model at all, so FR3's compression is Claude-Code-scoped. | **Medium** (either H1 or H2 plausible on Claude Code; scope refuted elsewhere) | **High if H2 holds on Claude Code** — means compression alone doesn't fix the Playwright-class failure even on the one host that delivers instructions; we need plan amendments. **Low impact if H1 holds** — our current plan IS the fix for Claude Code. Non-Claude-Code hosts rely on skill + tool descriptions regardless. | **Disambiguation protocol post-ship.** (1) Ship the compressed `buildInstructions` per FR3. (2) Run a controlled test on Claude Code: fresh session on a repo with OK MCP, single markdown-read intent ("read `docs/foo.md`"). Measure: does agent use `exec` / `read_document` or fall through to native Read? (3) If agent uses OK tools → H1 was correct; Claude Code piece of the plan complete. (4) If agent falls through → H2 is more likely; apply amendment plan below. **Amendment plan for H2:** expand D11 skill description from ~500 → ~1,200 chars front-loading STOP rule + preview sequence; extend FR4 from `exec`-only audit to front-loading STOP rule on `write_document`, `edit_document`, `read_document`, `search`, `get_preview_url` per-tool descriptions; investigate `paths:` frontmatter effectiveness on Claude Code (deterministic vs probabilistic activation) as a tertiary-but-reliable delivery path. | QA + post-ship |
| **R-INST-HOSTS** — 4 of 6 target hosts (Cursor, Windsurf, VS Code Copilot, Claude Desktop) do NOT inject MCP `instructions` into the model context. Codex is split (depends on client version). **Only Claude Code reliably honors the surface.** Research 2026-04-22 confirmed via vendor docs + OSS source + acknowledged GitHub issues. | **HIGH** (confirmed via primary sources) | **Medium** — we lose the MCP `instructions` surface as a cross-host vehicle; skill + tool descriptions become the primary delivery mechanism on 5 of 6 hosts. Claude Desktop is worst-off: no skill install via `npx skills` (not in supported-agents list) + no `instructions` delivery → only tool descriptions reach the model. | **Accepted as scope constraint, not blocker.** Skill + tool descriptions were always cross-host reliable (FR4 + FR5 deliver on 5 of 6 hosts). Amendment: document Claude Desktop as the weakest-coverage host; consider post-M1 custom install path for Claude Desktop if users report degradation. NG5 (empirical adherence benchmarking) becomes more important — it's the only way to verify whether skill + tool descriptions alone are sufficient on non-Claude-Code hosts. | Acknowledged; monitor |
| Claude Desktop users don't get the skill automatically (not in `vercel-labs/skills` supported-agents list) | Medium | Medium | Document the in-app UI install path in README; Claude Desktop still receives MCP `instructions` + tool descriptions (surfaces 1+2) | Impl phase + docs |
| Internal MCP tool descriptions that reference AGENTS.md produce confusing agent behavior post-migration | Low | Low | FR2 acceptance expanded to cover all 4 tool files + init-content:43 scaffold claim | Impl phase |

## 15) Future Work

### Explored

- **Publish OK as Claude Code plugin on Anthropic marketplace**
  - What we learned: `.claude-plugin/plugin.json` bundles MCP + skill + agents + hooks; `/plugin install open-knowledge` is zero-terminal UX for Claude Code users. Cleanest Claude Code onboarding path.
  - Recommended approach: separate spec pass post-M1 landing; manifest + marketplace submission.
  - Why not in scope now: additive channel; CLI `ok init` path must land first to work for non-Claude hosts.
  - Triggers to revisit: (a) Claude Code becomes the dominant OK host (>70% of users), (b) user feedback requests zero-terminal install.
  - Implementation sketch: `.claude-plugin/plugin.json` at repo root (or separate plugin-publish repo) + submit to claude.ai/settings/plugins/submit.

- **Empirical adherence benchmarking harness**
  - What we learned: No public dataset measures MCP `instructions` adherence rates per host. Biggest evidence gap in the research.
  - Recommended approach: automated harness with scripted scenarios per host (Claude Code, Cursor, Codex, Windsurf, VS Code Copilot, Claude Desktop); measure tool-choice fidelity; run post-release.
  - Why not in scope now: infrastructure investment outsized relative to M1 migration; M2 manual spot-check is adequate release gate.
  - Triggers to revisit: observed post-release regressions; customer escalations; NG5 becomes P0.
  - Implementation sketch: Playwright + MCP-replay fixtures; N scenarios × 6 hosts × 3 retries per scenario; report tool-choice distribution.

- **Claude Desktop skill manual-install path** (M1.5 — small follow-up before heavy user comms)
  - What we learned: Deep-dive research 2026-04-22 confirmed Claude Desktop skill install is fundamentally manual-only — Anthropic declined automated paths (#40558 closed invalid). Skills live server-side in the user's Anthropic account; only install path is Settings > Features > Upload zip, requires paid plan. DXT / `.mcpb` bundles are MCP-server-only, no skill slot.
  - Recommended approach:
    1. Build `open-knowledge-skill-v<version>.zip` as a release artifact (same bundled SKILL.md content, zipped)
    2. Publish via GitHub Releases
    3. Add docs section: "Claude Desktop users: download + upload via Settings > Features"
    4. In `ok init` output, detect Claude Desktop entry in `claude_desktop_config.json` → print zip URL + upload instructions
    5. **Empirical test:** Claude Desktop's MCP `instructions` honoring — two research passes conflict (pass 1: drops per #131; pass 2: recommends as pragmatic path). One controlled session answers the question.
  - Why not in scope now: M1's goal is zero project-root writes + skill install for hosts `npx skills` covers. Claude Desktop needs a separate release artifact pipeline + docs, not code in `packages/cli`.
  - Triggers to revisit: **Before heavy user comms about the M1 migration** — Claude Desktop is a primary user host, users will ask "where's my skill?" and we need the zip + docs ready.
  - Implementation sketch: `packages/server/scripts/build-skill-zip.mjs` that zips `packages/server/assets/skills/open-knowledge/` with version-stamped name → consumed by a new GitHub Actions release workflow.

- **Claude Desktop DXT / `.mcpb` bundle for MCP server install**
  - What we learned: DXT format is Anthropic's "one-click install" surface for MCP servers on Claude Desktop. Covers MCP server registration (not skills). Current OK flow requires users to manually edit `claude_desktop_config.json`; DXT would make that a double-click.
  - Recommended approach: publish `open-knowledge.mcpb` on GitHub Releases alongside the skill zip (M1.5). Users double-click → Claude Desktop auto-registers OK's MCP server. Skills still require separate manual zip upload.
  - Why not in scope now: orthogonal to the M1 guidance-delivery migration; addresses MCP server install friction, not skill install.
  - Triggers to revisit: Claude Desktop usage proves material; user friction on the MCP config step shows up in onboarding.
  - Implementation sketch: `.mcpb` manifest packaging `packages/cli/dist/` + config scaffold; see modelcontextprotocol/mcpb for format.

### Identified

- **`ok doctor` command for install-state debugging**
  - What we know: Users will hit skill-install edge cases (stale versions, permission issues, failing hosts). A `doctor` command that inspects and reports all OK install state (MCP configs per editor, skill per-host copies via `npx skills list -g`, sidecar version, `.open-knowledge/` integrity) would reduce support cost.
  - Why it matters: Cross-host install surface is now larger (skill + MCP config per editor).
  - What investigation is needed: Scope of info surfaced; output format (CLI table vs structured JSON for agent consumption).

- **`ok uninstall` / teardown flow**
  - What we know: Complete reversibility requires: unregister MCP per editor, remove skill via `npx skills remove open-knowledge -g`, optionally remove `.open-knowledge/` project dir, remove sidecar at `~/.open-knowledge/skill-installed-version`. Not currently implemented.
  - Why it matters: Users evaluating OK want clean uninstall if they walk away.
  - What investigation is needed: Semantics — keep user's project data? Remove MCP config but preserve skill for future use? Full flag-driven control.

- **`ok init --dry-run` preview of all filesystem writes**
  - What we learned: No `--dry-run` flag exists today in `runInit` (verified via grep of `packages/cli/src/commands/`). Implementing it is a larger scope than originally tagged (previously FR11 "Should"; demoted during audit).
  - Why it matters: Before running `ok init` in a repo with sensitive state, users may want to see what will be written.
  - What investigation is needed: Which OK init steps should respect dry-run (all of them? Only the filesystem ones?); output format.

### Noted

- **Dynamic skill content via Claude Code `!\`command\`` injection** — could surface resolved `content.dir` / `include` / `exclude` at activation; Claude Code-specific; static SKILL.md acceptable M1.
- **Per-project skill overrides** — project-local `.claude/skills/open-knowledge-project/SKILL.md` could carry project-specific OK conventions. Not in M1; depends on OSS-adoption signals.
- **Localization** of skill content — today everything is English. Non-goal now; revisit if OK goes global.

## 16) Agent constraints

- **SCOPE:**
  - **Server package (new home for skill install):**
    - `packages/server/src/skill-install.ts` *(new)* — `installUserSkill(opts?)` implementation per FR6, FR7. Reads bundled path via `new URL('../assets/skills/open-knowledge', import.meta.url)`; reads + writes sidecar at `${opts.home ?? homedir()}/.open-knowledge/skill-installed-version`; spawns `npx skills@~1.5.0 add ... --agent '*' -g -y --copy` with 60 s timeout; returns `'installed' | 'skip-current' | 'failed'`; never throws.
    - `packages/server/src/skill-install.test.ts` *(new)* — unit tests per FR9 (mocked subprocess, mkdtemp HOME override).
    - `packages/server/src/index.ts` — add `export { installUserSkill } from './skill-install.ts';` (and types).
    - `packages/server/assets/skills/open-knowledge/SKILL.md` *(new)* — bundled canonical skill per D11 + D12 + D19. Content sources to port: `CLAUDE_MD_SECTION` body (pre-change `packages/cli/src/content/init.ts:201-252`), Frontmatter Conventions (pre-change `packages/cli/src/content/init.ts:56-74` AGENTS_MD_CONTENT section).
    - `packages/server/package.json` — verify `files` field (currently absent → auto-publishes everything) OR if added later, ensure `assets/` ships.
  - **CLI package:**
    - `packages/cli/src/commands/init.ts` — remove `upsertRootInstructions` call site; remove `rootInstructions?: boolean` field from `InitCommandOptions` + `rootInstructions: RootInstructionResult[]` field from `InitCommandResult`; delete "Root instructions:" output block in `formatInitResult`; `import { installUserSkill } from '@inkeep/open-knowledge-server'`; call it + surface result in summary block.
    - `packages/cli/src/content/init.ts` — remove exports `upsertRootInstructions`, `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE`, `AGENTS_MD_CONTENT`, `OK_MARKER_BEGIN`, `OK_MARKER_END`, `RootInstructionAction`, `RootInstructionResult`; drop `AGENTS_FILENAME` entry from `SCAFFOLD_FILES`; port lifecycle guidance (source: pre-change `content/init.ts:34-41` "Suggested lifecycle (optional pattern)" section of `AGENTS_MD_CONTENT`) into `CONFIG_YML_CONTENT` comments per D12 / Q9=C.
    - `packages/cli/src/commands/editors.ts` — drop `instructionsPath?:` field from `EditorMcpTarget` type; drop `instructionsPath: (cwd) => join(cwd, 'CLAUDE.md')` from Claude's entry.
    - `packages/cli/src/constants.ts` — remove `AGENTS_FILENAME` if no remaining references (D9).
    - `packages/cli/package.json` — add `"postinstall": "node scripts/postinstall.mjs"` to scripts per FR12 + D20.
    - `packages/cli/scripts/postinstall.mjs` *(new)* — pure ESM script: `try { const { installUserSkill } = await import('@inkeep/open-knowledge-server'); await installUserSkill(); } catch { /* non-fatal */ } process.exit(0);`. Never blocks install.
    - `packages/cli/src/mcp/server.ts` — rewrite `buildInstructions` to ≤ 1,500 bytes; delete the per-tool description inlining block at lines 283-285; delete `PREVIEW_GUIDANCE` import (D13).
    - `packages/cli/src/mcp/server.test.ts` — drop `buildInstructions embeds PREVIEW_GUIDANCE` test; add size-cap test (`instructions.length <= 1500`).
    - `packages/cli/src/mcp/tools/{init-content,research,consolidate,ingest}.ts` — remove `"Full convention: read \`${OK_DIR}/AGENTS.md\`."` pointer (D14); update `init-content.ts:43` AGENTS.md scaffold claim to list only `config.yml` + `.gitignore` as scaffolded files.
    - `packages/cli/src/mcp/tools/{write-document,edit-document,exec,search,get-preview-url,read-document}.ts` — audit + edit descriptions per FR4 (each ≤ 2,048 bytes AND front-loaded prerequisite in first 500 bytes). User review required (ASK_FIRST).
    - `packages/cli/src/content/init.test.ts` — remove all `upsertRootInstructions`, `CLAUDE_MD_SECTION`, `PREVIEW_GUIDANCE` tests; add assertions for skill-install call from runInit.
    - `packages/cli/src/commands/init.test.ts` — update result shape assertions (drop `rootInstructions` field); add skill-install flow tests (mocked).
  - **Desktop package (FR13 first-launch wiring per D21):**
    - `packages/desktop/src/main/index.ts` — after `app.whenReady()` resolves and main-window setup completes, add `void installUserSkill({ logger: <main-process-logger> }).catch(() => {});` fire-and-forget. Import from `@inkeep/open-knowledge-server`. Does NOT block any UI rendering or user interaction.
  - **EXCLUDE:** `packages/core/`, `packages/app/`, `docs/`. MCP tool *logic* (only descriptions). Existing MCP transport + config-file-write logic in `editors.ts` per-editor MCP entries. Existing `scaffoldLaunchJson` logic. Existing `packages/desktop/src/utility/` (first-launch goes in main-process, not utility). Do NOT write any migration subcommand (NG2). Do NOT touch users' project-level `AGENTS.md` / `CLAUDE.md` even to remove marker blocks (D3). Do NOT write anywhere other than `~/.open-knowledge/` and what `npx skills` writes to per-host directories. Do NOT ship a `--force` flag (D10 dropped per NG8). Do NOT block `npm install` on any failure path (D20).
- **STOP_IF:**
  - Any change that would introduce a project-root file write (violates G1).
  - Any change to MCP protocol shape (not just content).
  - Any new 3P runtime dependency in `packages/cli/package.json` beyond the transient `npx skills` shell-out (which is NOT a package.json dep).
  - Any change to `editors.ts` per-editor MCP config contents or `buildManagedServerEntry` (orthogonal).
  - Any change that requires modifying users' existing project files (violates D3).
  - Any change requiring ESM/CJS interop with `npx skills` library (it's CLI-only; never `import from 'skills'`).
  - Any attempt to detect or preserve user edits on the bundled SKILL.md (violates NG8).
- **ASK_FIRST:**
  - Per-tool description new content (FR4, Q7 resolved for audit but content edits still require review) — line-by-line review required before committing; each description is a customer-facing contract.
  - Compressed `buildInstructions` content (FR3) — review required before committing; content shapes every agent session.
  - Ported SKILL.md body (D12) — review required before committing.
  - Any decision to ship as Claude Code plugin (NG4) — defer to separate spec.
  - Any change to the pinned `skills@~1.5.0` version range (D16).
  - Any decision to skip any of the 21 MCP tool descriptions in the FR4 audit.
