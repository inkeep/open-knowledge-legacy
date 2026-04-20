# Audit findings

Auditor read the spec cold, then verified claims against the codebase (baseline `ee1fc3af`), the user's live `claude_desktop_config.json`, Claude Desktop MCP logs, and Anthropic's MCP user-quickstart documentation.

## HIGH severity

_None._ The spec's factual claims about the codebase, Claude Desktop config paths, clientInfo name, and Linux availability all check out. Implementation guidance is internally consistent enough to build from.

## MEDIUM severity

- **M1 — Internal contradiction: §9 hard-codes N=1000, D10 says DELEGATED.** §9's failure-modes table row (`resolveServerKey (Claude Desktop) | All candidate keys taken (-2..-1000) | Bounded loop with max N=1000 | ...`) encodes 1000 as the canonical upper bound. D10 in §10 classifies the same decision as `DELEGATED` with rationale "implementer can pick reasonable constant." Either §9 should drop the specific `-1000` / `max N=1000` numbers and refer to "an implementer-chosen upper bound," or D10 should be flipped to `LOCKED` at 1000. As written, an agent implementing the spec will treat §9 as a hard requirement and D10 as permission to vary, and the first reviewer who spots the divergence will have to pick. Evidence: SPEC.md:172 vs SPEC.md:198. Recommendation: keep D10 as `LOCKED: 1000` — it's a defensive cap, no reason to leave it open.

- **M2 — §11 Q2 is already answered by the evidence file.** Q2 asks "Does the `claude-ai` web connector share `claude_desktop_config.json` on macOS?" and is marked `Open, investigation deferred`. The evidence file at `evidence/claude-desktop-shape.md:66-72` cites the live MCP log (`clientInfo: { name: 'claude-ai', version: '0.1.0' }`) connecting to the Open Knowledge MCP server that was registered via the Claude Desktop config file — which is exactly the confirmation. Auditor re-verified: `grep "clientInfo" ~/Library/Logs/Claude/mcp-server-open-knowledge-bim-tools.log` yields the `claude-ai` initialize frame. Evidence: `/Users/timothycardona/Library/Logs/Claude/mcp-server-open-knowledge-bim-tools.log:28`. Recommendation: mark Q2 `Resolved: yes — same config file serves both clients, confirmed via live MCP log`.

- **M3 — FR4 "Linux + other: same as macOS (de-facto fallback)" contradicts NG4.** §3 NG4 classifies Linux as `[NOT UNLESS]` ("Only if: Anthropic ships a Linux build (none today)"), but FR4 specifies a working Linux path (`<home>/Library/Application Support/Claude/...` as a documented-not-officially-supported fallback). The two together imply Linux IS supported via a fallback path, but §3 says it isn't. Readers reconciling these will land on either (a) Linux gets a working fallback that nobody will ever exercise because no Linux build exists, or (b) the fallback exists so that when Anthropic ships Linux, no code change is needed. Either interpretation is defensible, but the spec doesn't say which. Evidence: SPEC.md:39 vs SPEC.md:90. Recommendation: pick one — either remove the Linux fallback from FR4 (throw/warn on non-darwin/win32) and stay consistent with NG4, or add a sentence to NG4 clarifying "the fallback path exists to make FR4 exhaustive, not because we support Linux today."

- **M4 — §8 line reference "init.ts:274-278" is slightly off.** The spec's §8 says `init.ts:writeEditorMcpConfig` reads `servers[MCP_SERVER_NAME]` at lines 274-278. The actual read is at `init.ts:274-275`; the write (`{ ...servers, [MCP_SERVER_NAME]: target.buildEntry() }`) is at 286-292. The evidence file at `evidence/current-state.md:32-36` gives the more precise range `(init.ts:274-278)` covering just the servers/existing read. Minor, but implementers chasing line numbers will hit a mismatch. Evidence: `packages/cli/src/commands/init.ts:274-275` vs SPEC.md:119. Recommendation: update to `init.ts:274-292` (covers both read and write) or drop the line number.

## LOW severity

- **L1 — §9 data-model default example is correct but reads ambiguous.** The default `resolveServerKey` returns `{ key: 'open-knowledge', existingEntry: existingServers['open-knowledge'] }` — preserving current behavior for the four project-scoped editors. This is correct, but the surrounding prose says Claude Desktop's key is `open-knowledge-<basename>`; readers may briefly think the default should be the basename form. A one-line clarifier ("non-Claude-Desktop targets keep the literal `'open-knowledge'` key; Claude Desktop's `resolveServerKey` computes the basename variant") would read cleaner. Evidence: SPEC.md:153. Recommendation: add the clarifier.

- **L2 — "Non-breaking widening" wording in FR2 is imprecise.** A widening from `() => T` to `(cwd: string) => T` is a breaking change for any external caller — TypeScript will error at call sites that rely on the nullary signature. The spec's rationale is correct in substance (internal callers all ignore the parameter, and a grep confirms no external consumers — §16 STOP_IF), but "non-breaking" is a slight overstatement. Evidence: SPEC.md:88. Recommendation: soften to "non-breaking for internal consumers (no external callers — grep-verified at §16 STOP_IF)."

- **L3 — §13 "Next actions" doesn't explicitly list creating the changeset.** §16 SCOPE includes "changeset file" and §13 deployment/rollout mentions `bun run release` + `changeset add entry`, but the numbered Next actions 1-8 in §13 omit the changeset step. Implementer working from §13 will likely remember (it's in rollout), but a checklist-driven agent could miss it. Evidence: SPEC.md:223-231 vs SPEC.md:240-241. Recommendation: add step 9 "`bun run changeset` — add release note."

- **L4 — FR8 "On Windows, `%APPDATA%` not set during test → use `home` override convention" is under-specified.** Windsurf's pattern uses `home` to mean `homedir()`, and APPDATA is conventionally `<home>\AppData\Roaming`, so injecting `home: fakeHome` works if the implementer follows `process.platform === 'win32' ? join(process.env.APPDATA ?? join(home ?? homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json') : ...`. The spec hand-waves this as "pass Windows-style via env." Not wrong, but an implementer unfamiliar with the Windows convention will need to re-derive the fallback. Evidence: SPEC.md:94. Recommendation: add a concrete FR4 pseudocode block showing both the macOS/default and Windows branches with the `home` override threaded through.

## Checks passed

**Factual checks against the codebase:**

- `packages/cli/src/commands/editors.ts:11-13` — `EditorId = 'claude' | 'cursor' | 'vscode' | 'windsurf'` and `ALL_EDITOR_IDS: EditorId[] = ['claude', 'cursor', 'vscode', 'windsurf']` match the spec's §8 claim.
- `packages/cli/src/commands/editors.ts:27` — `buildEntry: () => Record<string, unknown>` matches the spec's §8 claim (nullary today).
- `packages/cli/src/commands/init.ts:274-275` — `const servers = (config[target.topLevelKey] ...) ?? {}; const existing = servers[MCP_SERVER_NAME];` matches the spec's §8 claim (`MCP_SERVER_NAME` is the hard-coded `'open-knowledge'` at `constants.ts:17`).
- `packages/cli/src/commands/init.ts:580-590` — `detectInstalledEditors` iterates `ALL_EDITOR_IDS` and pushes any whose `dirname(configPath)` exists, exactly as described.
- `packages/cli/dist/cli.mjs:33` — `if (cwd !== void 0) process.chdir(cwd);` confirmed inside the `preAction` hook. The `process.chdir` call matches the spec and evidence claim.
- `packages/cli/src/commands/init.test.ts:244-262` — Windsurf's home-override test pattern is exactly as the spec's §8 and FR8 describe.

**External / documentation checks:**

- macOS Claude Desktop config path `~/Library/Application Support/Claude/claude_desktop_config.json` — confirmed via Anthropic's MCP quickstart (`modelcontextprotocol.io/quickstart/user`).
- Windows Claude Desktop config path `%APPDATA%\Claude\claude_desktop_config.json` — confirmed via same source.
- No Linux Claude Desktop build — confirmed; Anthropic's quickstart explicitly says "Claude Desktop is available for macOS and Windows."
- Owner's live `claude_desktop_config.json` at `/Users/timothycardona/Library/Application Support/Claude/claude_desktop_config.json` — exact shape shown in evidence verified on disk (hand-crafted `open-knowledge-bim-tools` entry with `npx`, `@inkeep/open-knowledge`, `mcp`, `--cwd /Users/timothycardona/inkeep/bim-tools`).
- `clientInfo.name === 'claude-ai'` — confirmed via live MCP log `mcp-server-open-knowledge-bim-tools.log:28` showing `{"method":"initialize","params":{..."clientInfo":{"name":"claude-ai","version":"0.1.0"}}}`. (This also confirms Q2 — see M2.)

**Coherence checks:**

- All FR1-FR13 have acceptance criteria in §6.
- D1-D10 resolution statuses are internally consistent within each row (status + rationale + evidence).
- `resolveServerKey` design in §9 correctly composes FR6 (match-by-cwd → existing entry) with FR7 (basename default → auto-disambiguate on collision). The ordering is right: match-first then write-with-suffix.
- §3 non-goals and §13 in-scope do not overlap (no item is simultaneously listed in both).
- §16 Agent Constraints (SCOPE / EXCLUDE) are derivable from §13 In Scope — SCOPE mirrors the "affected files" table in §9 plus the changeset, EXCLUDE extends §3 non-goals coherently.
- FR9's "all five editors" claim is self-consistent once FR1 adds `'claude-desktop'` to `ALL_EDITOR_IDS` (the interactive multiselect iterates that array, per `init.ts:632`).
- Interaction state matrix in §5 covers the same failure modes enumerated in §9 (invalid JSON, write-perm failure, config-dir absent, collision).
- FR10's "≥ 5 new tests" matches the five-scenario list in its AC column (fresh write, collision disambiguation, match-by-cwd idempotence, `--force` overwrite, home-override detection).
