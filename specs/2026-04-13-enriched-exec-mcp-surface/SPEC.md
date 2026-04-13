# Enriched `exec` MCP Surface — Spec

**Status:** Approved
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-13 (finalized)
**Baseline commit:** 9c346cb (unchanged since scaffold — no repo changes during spec authoring)
**Links:**
- Project: [projects/v0-launch](../../projects/v0-launch) — V0-24 (Tim, Reach)
- Root XQ1: "Does minimum tool count beat semantic tool richness for agent MCP surfaces?"
- Internal substrate: [packages/cli/src/bash/index.ts](../../packages/cli/src/bash/index.ts)
- Current MCP tools: [packages/cli/src/mcp/tools/](../../packages/cli/src/mcp/tools/)
- Evidence: [./evidence/](./evidence/)
- Changelog: [./meta/_changelog.md](./meta/_changelog.md)

---

## 1) Problem statement

**Situation.** Coding agents in Claude Code / Cursor / Codex reach for bash idioms (`grep`, `ls`, `cat`, `find`, pipes) instinctively — external research (Dust.tt) observed agents inventing file-path syntax before filesystem tools existed, and "minimum tool count" is cited as the #1 predictor of agent failure. The Open Knowledge MCP server today exposes 14+ semantic tools (`read_document`, `search`, `list_documents`, `get_backlinks`, `get_forward_links`, `get_hubs`, `get_orphans`, etc.) that agents must learn.

**Complication.** To get both bash ergonomics AND Open Knowledge's enrichment (frontmatter, backlinks, catalog, git history), agents must compose native `Bash` + `curl` + `jq` — three tool calls where one would do. Semantic tools don't chain combinatorially: agents can't pipe `list_documents` into `head -5`. The failure modes: (a) agents use native bash and miss OK's enrichment — degrading OK's "strictly better than native" value prop; or (b) they juggle semantic tools and lose the pipe/filter idioms they already know. Meanwhile a 14+ tool surface dilutes agent attention.

**Resolution.** One `exec(command)` MCP tool that accepts read-only bash-like commands scoped to the content directory and returns raw stdout verbatim *plus* an appended enriched-metadata block for every path reference in output. Prompting flips: the MCP `INSTRUCTIONS` lead with `exec` and demote semantic tools to "also available for typed call sites." Enrichment pipeline factors out of `read_document`/`search` into one shared helper so `exec`'s enrichment is bit-identical to the typed tools (CC9 quality bar). Post-v0 we use observed usage to resolve root XQ1: keep the dual surface, or deprecate semantic tools that `exec` subsumes.

## 2) Goals
- **G1:** Agent can read/list/grep any wiki content with one MCP call, getting raw-bash output plus enrichment, matching or exceeding what `read_document`/`search`/`list_documents` return today.
- **G2:** Combinatorial idioms work — pipes between allowlisted stages (`grep ... | head -5`) execute and enrichment applies to final output.
- **G3:** Prompting **demotes semantic tools** and leads unambiguously with `exec` (L2-aggressive posture, final per D2 batch #4). Strong framing: *"Prefer `exec` over `Read`/`Grep`/`read_document` for all wiki operations."* Semantic tools remain registered as "Typed call sites (advanced)" — callable but not recommended. Reversible in one INSTRUCTIONS edit if telemetry disputes the bet.
- **G4:** CC9 parity: `exec("cat X.md")` ≥ `read_document("X.md")` in enrichment content. Shared `enrichPath()` helper eliminates divergence by construction.
- **G5:** Security surface is a single allowlist parser with explicit tests — no shell-injection, no path traversal, no write ops.

## 3) Non-goals
- **[NEVER]** NG1: Write operations via `exec` (`rm`, `mv`, `cp`, `mkdir`, `chmod`, redirections `>`/`>>`, `tee`). Writes route exclusively through semantic MCP tools (CRDT-aware, provider-pool-aware, rescue-buffer-aware).
- **[NEVER]** NG2: Arbitrary shell execution (subshells `$(...)`, backticks, `eval`, backgrounding `&`). The pitch is "bash idioms agents already know," not "full shell."
- **[NOT NOW]** NG3: Custom commands (`okl backlinks X`, `okl orphans`, `okl dead-links`). Tier 3 in project doc. Revisit if: XQ1 resolves toward `exec`-primary and we need to subsume `get_backlinks`/`get_orphans`.
- **[NOT NOW]** NG4: Structured-JSON output mode (agents parse markdown for now). Revisit if: agent harnesses adopt a convention for machine-parsed MCP returns.
- **[NOT NOW]** NG5: Unregistering semantic tools entirely (L3 posture — tools don't appear in `ListTools`). We chose L2-aggressive (demoted-but-registered) as the current bet. Revisit if: 30-day post-ship telemetry shows >80% of agent reads via `exec` AND near-zero semantic-tool calls (makes L3 safe) — OR inverse: if `<25%` via `exec`, reconsider the strategic thesis entirely rather than escalating prompting.
- **[NOT UNLESS]** NG6: Custom `IFileSystem` backends for just-bash beyond `ReadWriteFs` (e.g., `YjsFileSystem` for CRDT-aware reads, `ChromaFs`/indexed backends for search). Per D14, just-bash is now the executor for local mode; `ReadWriteFs` is the v0 backend. Custom IFS lives in §15 Future Work. Only pull in if: Metric 1 adoption stalls AND users report stale-disk confusion, OR OK ships hosted mode (swap via `MountableFs`).
- **[NOT NOW]** NG7: Multi-turn streaming output (`tail -f`-style). Current MCP tool response shape is single-shot. Revisit if: MCP SDK gains streaming affordances agents can consume.

## 4) Personas / consumers
- **P1 — Coding agents in KB-adjacent work** (Claude Code, Cursor, Codex working in a repo that has `.open-knowledge/`). Primary consumer.
- **P2 — Doc-authoring agents** (ingest/research/consolidate workflows). Secondary — these flows already use typed workflow tools; `exec` is complementary for their reads.
- **Human developers** (Tim and team) — observe outcomes via editor + PR quality. Not direct users of the tool.

## 5) User journeys

`exec` is a single MCP tool with one call shape — traditional multi-step user journeys (discovery → setup → first use → ongoing) don't map cleanly. The interaction is: agent invokes `exec(command)`, synchronously gets back `{content, structuredContent}`. Below is the interaction-state matrix instead.

### Interaction state matrix

| Scenario | Outcome |
|---|---|
| Allowed command, successful execution | `content`: raw stdout + `### Referenced files` block; `structuredContent.enrichedPaths`: populated |
| Allowed command, zero output (e.g., `grep` with no match) | `content`: empty stdout + no enrichment block; `structuredContent.enrichedPaths`: `[]` |
| Denied command (first-token not in allowlist, or denylisted op like `>`, `$()`) | `isError: true`; message: `"Denied: <reason>. Allowed first-tokens: cat, ls, grep, find, head, tail, wc, sort, uniq, cut. Allowed pipe: \|. Forbidden: >, &, ;, $(), etc."` |
| Path-traversal attempt (arg resolves outside content dir) | `isError: true`; message: `"Path outside content directory: <arg>"` — no command executed |
| Shadow repo absent (project never initialized with OK) | Command runs; enrichment returns `history: []`, `historySource: "shadow-repo"` |
| Hocuspocus unreachable | Command runs; `backlinkCount: null` for any referenced path (degradation matches `read_document`'s FR9 behavior) |
| Output exceeds soft cap (500 lines / 50 KB rendered) | `content`: first N lines + `<truncated: M more lines — re-run with more-specific query>` marker; enrichment still applied to captured portion |
| Output exceeds hard cap (16 MB) | `isError: true`; message: `"Output exceeded 16 MB buffer; narrow the command"` |

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: `exec(command)` MCP tool registered | Tool appears in MCP server `registerAllTools`; passes allowlisted cmd end-to-end in integration test. | |
| Must | FR2: Allowlist enforced on every pipeline stage | Test harness rejects `rm`, `mv`, redirections, subshells, backticks, `&` with clear error. | |
| Must | FR3: Read-only first-tokens pass through | `grep`, `ls`, `cat`, `find`, `head`, `tail`, `wc`, `sort`, `uniq` (and any additions locked in D?) execute. | |
| Must | FR4: Pipes work between allowlisted stages | `grep 'x' | head -5` returns matching lines through head, enrichment applied to final output. | W3 wedge |
| Must | FR5: Raw stdout preserved verbatim | Output byte-equivalent to equivalent native bash invocation for supported commands. | Enrichment is *additive* |
| Must | FR6: Enrichment delivered via **two channels** | (a) `content` text: raw stdout verbatim + appended `### Referenced files` markdown block. (b) `structuredContent` JSON: `{ enrichedPaths: EnrichedMeta[] }` typed payload. Both populated on every `exec` call that identifies file references. Tool registration declares an `outputSchema` (zod) per MCP SDK 1.29 requirement — see `evidence/shadow-repo-identity-and-sdk.md` §2. | Matches report recommendation + supports future harness UI (V0-26) reading structured channel |
| Must | FR7: CC9 parity with `read_document` for single-path `exec("cat X.md")` | Enrichment fields present: title, description, tags, catalogCategory, backlinkCount (array length via `/api/backlinks`), **recent activity history from shadow repo** (writer id/name, timestamp, action, branch — see FR15). `read_document` gets upgraded in tandem (D13) to pull from the same source. | Requires shared `enrichPath` + CLI-side `readShadowLog` helper — DEP-1 per D4/D18. No server endpoint needed. |
| Must | FR15: Recent activity history sourced from shadow repo (not `git log`) | `enrichPath` reads the last N commits against `<path>` from the shadow bare repo (`.git/openknowledge/` integrated mode, `.openknowledge/` standalone). Per entry: `{hash, date, writer: {id, name, isAgent}, message, branch}`. `isAgent` derived from `writer.id` prefix (`agent-`/`human-`/`upstream`/`server`) per shadow-branch-gc.ts:38 — no schema change. `N` configurable (default 5) via existing `config.mcp.tools.read_document.historyDepth`. **Commits are single-author** (per `commitWip` at `shadow-repo.ts:128-204`); multi-writer attribution surfaces from commit chronology across the per-writer refs listed in FR17, not from Co-authored-by trailers (trailers only appear in `saveVersion` project-repo commits at `:436-448`, not in shadow-repo WIP commits). | Single source of truth for history: the shared `enrichPath` helper (DEP-1). |
| Must | FR17: Shadow-repo history reconstruction is cross-ref, CLI-side | Shadow repo stores per-writer refs `refs/wip/<branch>/<writer-id>` — no single HEAD orders all writers. New CLI helper `packages/cli/src/content/shadow-log.ts:readShadowLog(projectDir, relPath, limit)` (a) opens the bare repo via simple-git pointed at `.git/openknowledge/` (integrated) or `.openknowledge/` (standalone), (b) enumerates writer refs for the current project branch via `git for-each-ref refs/wip/<branch>/`, (c) runs `git log <ref> -- <path>` per ref in parallel, (d) merges by committer-date descending, takes last N. `isAgent` derived from `writerId.startsWith('agent-')`. Upstream-import commits included. | Design per D18 (CLI-side, no HTTP); ~60 LOC. simple-git reads are concurrent-safe against server writes (server's writer lock covers writes only). |
| Must | FR18: Executor is just-bash, not execFile | `packages/cli/src/bash/index.ts` replaced: `runShell`/`runPipeline` primitives removed in favor of a single `Bash` instance (from `@vercel/just-bash`) configured with `ReadWriteFs` backend scoped to `projectDir`. `parseCommand` (D7 / shell-quote) still runs as a structural pre-validator; only allowlisted command strings (D15) reach the just-bash interpreter. Pipes, quoting, glob expansion handled inside just-bash. No dependency on host's grep/ls/cat binaries. | Per D14. Bundle-weight risk monitored via FR19. |
| Must | FR19: CLI bundle-weight budget | After just-bash is integrated, the published `@inkeep/open-knowledge` CLI install size MUST not exceed 2× its pre-change baseline, AND cold-start time (`open-knowledge --help`) MUST stay under 300ms. If either budget is blown, prefer tree-shake tuning; if still over, revisit D14 (fall back to execFile with `simple-git` already-present for history). | Challenger-adjacent concern surfaced by report D1 (just-bash is ~125k LOC); measured in DEP-1 impl. |
| Must | FR16: *(deleted in batch #4)* — shadow-repo read via simple-git direct-read (D18) works in all modes; no `git log` fallback needed. `historySource` field retained in `EnrichedMeta` shape but set to `"shadow-repo"` always. If the shadow repo doesn't exist (project never initialized with OK), history field is an empty array. | Simplification from batch #4 direct-read architecture. |
| Must | FR14: Multi-path enrichment shape (shrunk for v0) | For `exec` output with N>1 referenced paths (e.g., `ls`, `grep`, `find`), per-path fields are: title, description, tags, catalogCategory, path. **Excluded:** `modified` (no current fs.stat plumbing), per-path `backlinkCount` (N-amplification risk — single full-array HTTP call per path). Richer shape tracked in §15 Future Work (Explored). | Keeps DEP-1 as pure refactor (D4); v0 scope bounded |
| Must | FR8: Path traversal rejected | Any arg that resolves outside content dir after realpath returns error, no command executed. | Reuse existing `safeSubdir` pattern |
| Must | FR9: Graceful degrade without Hocuspocus | `exec` works with backlinks omitted when Hocuspocus unreachable, same behavior as `read_document`. | |
| Must | FR10: INSTRUCTIONS L2-aggressive rewrite | `server.ts` INSTRUCTIONS lead unambiguously with `exec` as the primary surface for reading / listing / grepping / searching wiki content. Strong framing: *"Prefer `exec` over `Read`/`Grep`/`read_document` for all wiki operations."* Semantic tools relegated to a "Typed call sites (advanced)" footer — present but not recommended for common reads. | Revised twice; final per D2 batch #4. User direction: "agents should use openknowledge by default; we should never have to tell it to do so." |
| Should | FR11: Commands producing no file-scoped output (e.g., `echo`, `date`) return raw output, no enrichment, no error | If added to allowlist. May not be in initial allowlist. | |
| Should | FR12: Tool description includes allowlist + 2-3 concrete examples | Agents can infer the surface from description alone. | |
| Could | FR13: Output size cap with clear truncation message | Prevent blowing up agent context on `cat huge.md`. Hard 16 MB (just-bash configured buffer); soft cap 500 lines / 50 KB with truncation marker per D9. | Superseded by D9-lock; kept for traceability. |

### Non-functional requirements
- **Performance:** Command execution within 30s default timeout. Enrichment should add <100ms for typical cases (≤20 paths in output). `readShadowLog` budget <100ms per path — see §14 risk + FR19.
- **Reliability:** `parseCommand()` is deterministic — same input → same allow/deny. No flakiness in allowlist enforcement.
- **Security/privacy:** See §14 Risks. Core surface: `parseCommand` correctness (sole security boundary), path-traversal prevention via realpath guard, no shell injection (just-bash interprets internally; no host shell spawned), no write capability at any layer.
- **Operability:** Log denied commands to stderr with reason (for agent debugging); log successful commands at debug level. Metrics: `exec_calls_total`, `exec_denied_total` (by reason), `exec_enrichment_ms`, `read_shadow_log_ms`.
- **Cost:** Negligible per call; just-bash interpreter runs in-process, `simple-git` spawns `git` process per `readShadowLog` (amortize via caching per FR19 mitigation).

## 7) Success metrics & instrumentation
- **Metric 1 — Agent adoption of `exec` vs. semantic tools**
  - Baseline: 0 (tool doesn't exist)
  - Target: >50% of reads/lists/searches via `exec` within 30 days post-ship for agents that have both surfaces
  - Instrumentation notes: Count MCP tool invocations in server stderr logs; needs simple counter in `server.ts`
- **Metric 2 — Tool-call count for "find and read" patterns**
  - Baseline: measure pre-ship (informal — 3 calls typical: grep, curl, jq)
  - Target: 1 call via `exec`
  - Instrumentation notes: Sample agent transcripts in dogfooding
- **What we will log/trace:** Every `exec` call (command, decision: allowed/denied, exec time, enrichment time, output size). Denial reasons (denylist hit, path traversal, parse error).
- **How we'll know adoption/value:** Adoption metric above + qualitative: do agents chain `exec` with pipes in the wild, or only single commands?

## 8) Current state (how it works today)
*(to be enriched by /worldmodel output — see evidence/)*

Snapshot as of baseline commit 9c346cb (this section describes current state *before* V0-24 implementation):

- `packages/cli/src/bash/index.ts` provides `runShell`, `cat`, `gitLog`, `grep` primitives. All scope to `projectDir` (set once at init via `setProjectDir`). **This file is replaced in full per D14/FR18** — `runShell`/`gitLog`/`grep` deleted; `cat` may be retained as a direct-fs helper. Replacement: a just-bash `Bash` instance with `ReadWriteFs`.
- `packages/cli/src/mcp/server.ts` registers all tools and serves INSTRUCTIONS. Current INSTRUCTIONS (line 42+) say "prefer read_document over native Read" and "search over native Grep" — **the L2-aggressive rewrite (FR10) replaces this entire Navigation section** to lead with `exec` and demote semantic tools.
- `packages/cli/src/mcp/tools/read_document.ts` inlines frontmatter parse + `gitLog` + catalog lookup + backlinks HTTP call. `search.ts` has a parallel copy. **DEP-1 extracts these into a shared `enrichPath()` helper** (D4, D13) and swaps `gitLog` → `readShadowLog` per D12.
- `packages/server/src/shadow-repo.ts` maintains the bare git repo at `.git/openknowledge/` with per-writer WIP refs. **Read-only consumption by CLI via simple-git is net-new** (D18) but requires zero server changes.
- Known gaps (pre-impl): (a) no shared enrichment helper → CC9 drift risk; (b) `list_documents` enriches nothing (V0-26 Now — separate spec); (c) shadow-repo agent attribution is collected but never surfaced to agents today.

## 9) Proposed solution (vertical slice)
*(drafted; will refine during iterate phase)*

### User experience / surfaces
- **MCP tool:** `exec(command: string)` — one tool, zod input schema accepts a single string, `outputSchema` declares `{ enrichedPaths: EnrichedMeta[] }` (required for MCP SDK 1.29 `structuredContent` support per FR6).
- **Tool description:** Lists allowlisted first-tokens (Conservative-plus per D15), denylisted ops, dual-channel enrichment shape (markdown + structuredContent), 2-3 examples covering `cat`, `ls`, `grep | head`, `find`.
- **Response shape:** `{ content: [{type:'text', text: '<raw stdout>\n\n### Referenced files\n...'}], structuredContent: { enrichedPaths: EnrichedMeta[] } }` per FR6.
- **INSTRUCTIONS (server.ts):** L2-aggressive rewrite per FR10 — Navigation section leads with `exec`; semantic tools in "Typed call sites (advanced)" footer.
- **CLI:** n/a (`exec` is MCP-only; humans don't invoke it directly).
- **Docs:** Update `docs/` if/where the MCP tool list is documented.
- **Error messages:** On denial, include reason + the offending token + the allowlist + the allowed op (`|`), so agents can self-correct.

### System design
- **Architecture overview:**
  ```
  MCP client (agent) → exec(command)
    ↓
  shell-quote.parse()          ← structural AST (rejects $(), backticks, >, &, ;, etc.)
    ↓
  parseCommand(ast)            ← allowlist + denylist; splits at { op: '|' } into Stage[]
    ↓ (validated pipeline)
  @vercel/just-bash Bash       ← interpreter owns pipes/quoting/glob expansion
    instance + ReadWriteFs       executes stages against content dir (scoped)
    ↓ (stdout captured)
  extractReferencedPaths(
    stdout, stages)            ← per-command extractors + regex fallback (D8)
    ↓ (relPath[])
  enrichPath(relPath) × N      ← shared DEP-1 helper
    │   ├─ parseFrontmatter    (local fs)
    │   ├─ catalog.getCatalog  (local)
    │   ├─ readShadowLog       (simple-git direct → .git/openknowledge/)
    │   └─ fetchBacklinks      (HTTP to Hocuspocus, if available)
    ↓ (EnrichedMeta[])
  formatOutput()               ← raw stdout + appended markdown block + structuredContent
  ```
- **Data model:** No persistent state. `EnrichedMeta` v0 shape per FR14 (multi-path) and FR7 (single-path `cat`):
  - **Multi-path output:** `{ path, title?, description?, tags[], catalogCategory? }` — no `modified`, no per-path `backlinkCount`, no history (avoids N-amplification; richer multi-path shape tracked §15 Explored).
  - **Single-path `exec("cat X.md")`:** above + `{ backlinkCount: number | null, history: ShadowCommit[], historySource: "shadow-repo" }` — matches `read_document` output after DEP-1 upgrade. `historySource` is always `"shadow-repo"` per D18 (no `git log` fallback); `history: []` when shadow repo absent.
  - `ShadowCommit: { hash, date, writerId, writerName, isAgent: boolean | null, message, branch }` — `isAgent` derived from `writerId` prefix (`agent-` / `human-` / `upstream` / `server`).
  - `modified` (fs mtime) deferred per D11 — §15 Future Work Explored.
- **3P dependencies (all locked):** `shell-quote` v1.8.3+ (D7, parse only); `@vercel/just-bash` (D14, Bash + ReadWriteFs); `simple-git` (D18, CLI direct-read of shadow repo — already transitively present).
- **Auth/permissions:** Inherits MCP connection; no additional auth layer.
- **Enforcement point(s):** `parseCommand` is the *sole* security boundary. All allow/deny logic lives there; tested as a unit with a hostile-input manifest.
- **Observability:** stderr logs per call + metrics counters (see §7).

### Alternatives considered
- **Option A — Separate typed tools (`exec_cat`, `exec_ls`, `exec_grep`).** ✗ Rejected (W1). Gets MCP structured-arg validation; loses combinatorial pipes and the "one tool" pitch. Doesn't resolve XQ1.
- **Option B — Single `exec`, no pipes (Tier 1 / W2).** ✗ Rejected. Easier security, but shipping without pipes forces a breaking interface change later when pipes come in. Project doc explicitly frames pipes as Tier 2.
- **Option C — Single `exec`, pipes work (Tier 2 / W3), executed via just-bash.** ✅ **Chosen.** Matches project-doc pitch + user direction "we just call normal just bash tools with vercel"; `exec` combinatorial; host-independent semantics; swap seam for cloud mode taken now. Per D14.
- **Option D — Full shell with sandbox (just-bash) — original framing from `bash/index.ts` comment.** This is effectively what we chose with D14, just with the user articulating the strategic rationale (swap seam, host independence, cloud-ready) rather than the defensive one (sandbox isolation). Now Option C *is* Option D for our architecture.
- **Option E — Hatch-only `exec` (no enrichment, no DEP-1, no dual-channel).** ✗ Rejected per D16. Would shrink v0 ~60-70% and test XQ1 more cleanly, but enrichment IS the differentiator vs. native Bash ("use shadow-repo that is whole point"). Hatch-only collapses into native Bash — agents already have that. Kept as a fallback option if telemetry (Metric 1) shows enrichment adds no adoption value in 30 days post-ship.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Wedge shape: single `exec(command)` string with pipes (W3, Tier 2) | X | LOCKED | Soft — interface shape | Project-doc pitch; shipping without pipes forces breaking change | User 2026-04-13, §9 alternatives | One tool boundary for agents; allowlist parser is primary security surface |
| D2 | Prompting posture: **L2-aggressive** — demote semantic tools; `exec` is the default surface | P | LOCKED (revised twice; final 2026-04-13 batch #4) | No — reversible in one edit | Strategic thesis overrides internal-report caution: "we want our agent to use openknowledge by default; we should never have to tell it to do so." Internal report's hybrid recommendation acknowledged but consciously rejected on strategic grounds, not evidence grounds. | User 2026-04-13 (final): "demote semantic tools we need to favor the exec significantly" | INSTRUCTIONS lead unambiguously with `exec`; semantic tools relegated to "Typed call sites (advanced)" footer; strong framing: "Prefer `exec` over `Read`/`Grep`/`read_document` for all wiki operations." |
| D3 | Observation-hole posture: accept external prior art; flag as A1 | P | LOCKED | No | Reach-tier exploratory bet; in-repo observation not a prerequisite | User 2026-04-13 | A1 assumption with post-ship expiry trigger (now with internal counter-signal noted) |
| D4 | Enrichment refactor: shared `enrichPath()` lands as prerequisite PR — **CLI-only scope (no server endpoint)** | X | LOCKED (revised 2026-04-13 batch #4) | No | Direct-read via simple-git (D18) eliminates HTTP endpoint work; DEP-1 narrowed back toward pure-refactor + one new CLI-side helper (`readShadowLog`). `modified` fs.stat + batch-backlinks remain deferred (§15 Explored). | User 2026-04-13 (batch #4) | DEP-1 = (a) extract `enrichPath()` helper, (b) add `readShadowLog()` CLI helper, (c) migrate `read_document`+`search` to shared helper. Zero server edits. |
| D5 | Spec scope: V0-24 only (not V0-26 workstreams) | X | LOCKED | No | Keep spec focused; V0-26 gets its own spec/implementation | User 2026-04-13 | Shared-enrichment helper noted as cross-cutting dep, not in-scope deliverable |
| D10 | Enrichment delivery: **both** appended markdown in `content` AND `EnrichedMeta[]` in `structuredContent` | T | LOCKED | No | MCP spec 2025-11-25 supports dual-channel; markdown serves LLM readers, structured serves harness UIs (V0-26 viewer) | User 2026-04-13, `evidence/internal-prior-art-contradicts-direction.md` §3 | FR6 revised; `shared.ts:textResult` helper needs extension or a new `textPlusStructured` helper |
| D11 | Enrichment shape for v0: shrunk — no `modified`, no per-path `backlinkCount` on multi-path output | T | LOCKED | No | Avoids widening DEP-1 scope + N-amplification latency; preserves Reach-tier ship speed | User 2026-04-13 | Richer shape → §15 Future Work (Explored); `exec("cat X")` single-path enrichment unaffected |
| D12 | History data source: **shadow repo** (`.git/openknowledge/`), not `git log` | X | LOCKED | Soft — enrichment shape | Shadow repo has per-writer attribution (agent vs human via `WriterIdentity.id` prefix), per-edit-burst commits. `git log` is coarse and loses agent vs human distinction. User 2026-04-13: "that is the whole point" | User 2026-04-13; `packages/server/src/shadow-repo.ts:20-45, :128-233`; `shadow-branch-gc.ts:38` (writer-id prefix regex) | DEP-1 widens to include `readShadowLog` helper; `read_document` upgraded in tandem (D13). **Cross-ref merge semantics** (FR17) — no single HEAD orders writers. Correction per audit #1: shadow-repo WIP commits are single-author; trailers appear only in `saveVersion` project commits. |
| D13 | `read_document` upgraded in tandem (pulls from same shared helper) | X | LOCKED | No | Single `enrichPath()` source avoids CC9 drift; users get richer history in `read_document` as a side benefit | Implied by D4 + D12 | `packages/cli/src/mcp/tools/read-document.ts` edits land in DEP-1 PR |
| D14 | Executor: **just-bash** (`@vercel/just-bash`) with `ReadWriteFs` backend, replacing per-stage `execFile` | T | LOCKED | Soft — implementation choice | User direction: "we just call normal just bash tools with vercel." Aligns with `bash/index.ts:9-22` swap seam reserved for hosted mode — taken now for v0. ReadWriteFs as minimal-cost v0 backend; custom `YjsFileSystem` queued for §15 Explored. Host-independent behavior (same grep semantics regardless of GNU/BSD/busybox). | User 2026-04-13 batch #4; report D1 / D7 / D14 (just-bash architecture) | `bash/index.ts` runShell/runPipeline primitives replaced by just-bash `Bash` instance; pipes owned by just-bash internal interpreter; exec-time dependency on `/usr/bin/grep`, `/bin/cat`, etc. is removed |
| D15 | Allowlist **tightened to Conservative-plus** (removes `awk`, `sed`; keeps `find` with explicit `-exec`/`-delete`/`-fprint`/`-fprintf`/`-ok`/`-okdir` flag denylist) | T | LOCKED (revised 2026-04-13 batch #4, overrides D6 Liberal) | Yes — security surface | Challenger finding #2: `awk 'print > "file"'` and `sed -e 'w file'` write vectors live in program strings (not flags); flag-denylist cannot cover. `find -exec` likewise. Drop awk/sed entirely; keep find with flag-level restrictions. | User 2026-04-13 batch #4; `meta/design-challenge.md` finding #2 | Supersedes D6 for impl; final allowlist: `cat, ls, grep, find, head, tail, wc, sort, uniq, cut`. Flag denylist for `find` at parser layer. |
| D16 | Hatch-only exec (no enrichment, no DEP-1, no dual-channel) explicitly considered and rejected | X | LOCKED | No | Surfaced by challenger finding #1 as an uncosted alternative. User rejected: "use shadow-repo that is whole point" + "we want our agent to use openknowledge by default" — enrichment IS the differentiator vs. native Bash. | User 2026-04-13 (D12 rationale + batch #4); `meta/design-challenge.md` finding #1 | Added to §9 Alternatives as Option E (rejected). Preserves hatch-only as a fallback if telemetry shows enrichment adds no adoption value. |
| D17 | Metric 1 target `>50%` stands; aggressive prompting makes it reachable | P | LOCKED | No | Challenger finding #3: with L2-lite, `>50%` would miss for prompting reasons. Batch #4 resolution reversed D2 to L2-aggressive; metric now achievable. | User 2026-04-13 batch #4; `meta/design-challenge.md` finding #3 | No change to metric definition; L2-aggressive is the precondition |
| D18 | Shadow-repo history read: **CLI reads `.git/openknowledge/` directly via simple-git** — no HTTP endpoint | T | LOCKED | Soft — architectural boundary | Shadow repo is a stable on-disk contract; always accessible (Hocuspocus on or off); eliminates disk-only bifurcation; narrows DEP-1 to CLI-only. HTTP endpoint would follow the existing pattern but adds scope without functional gain for local mode. | User 2026-04-13 batch #4 | No `/api/shadow-log` endpoint; `packages/cli/src/content/shadow-log.ts` new file using simple-git; `simple-git` dep added to CLI package.json (already transitively present via workspace). FR16 deleted. |
| D6 | ~~Allowlist composition: Liberal — `cat, ls, grep, find, head, tail, wc, sort, uniq, cut, awk, sed`~~ | T | **SUPERSEDED by D15** (batch #4) | — | `awk`/`sed` write vectors live in program strings, not flags; flag-denylist insufficient | challenger finding #2 | Final allowlist defined in D15 |
| D7 | Shell-grammar parser: **`shell-quote`** (parse direction only), wrapped in `parseCommand()` validator | T | LOCKED | Soft — implementation choice | Actively maintained (v1.8.3 Jun 2025); produces AST we can walk for allow/deny; quote-direction CVE doesn't apply to parse-only usage | User 2026-04-13; web search; `evidence/internal-prior-art-contradicts-direction.md` | Hostile-input verification deferred to impl-phase test manifest |
| D8 | Path-extraction strategy: **per-command extractors + regex fallback** | T | LOCKED | No | Per-command is more accurate than regex-only; fallback handles unknown output shapes (echo/date/etc.) | User 2026-04-13 | ~12 small extractor functions; regex fallback: `\b[\w./-]+\.md\b` |
| D9 | Output cap: **hard 16 MB (inherit `runShell`), soft 500 lines / 50 KB** with truncation marker | T | LOCKED | No | Default inheritance; per-command caps rejected as inconsistent for agents | User 2026-04-13 | Soft cap implemented in formatter; marker: `<truncated: N more lines — re-run with more-specific query>` |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Which exact first-tokens go in Tier-2 allowlist | P | P0 | Yes | **Resolved 2026-04-13 batch #4 → D15:** Conservative-plus = `cat, ls, grep, find, head, tail, wc, sort, uniq, cut`. `awk`/`sed` excluded; `find` with strict flag denylist. | Resolved |
| Q2 | Shell-grammar parser choice | T | P0 | Yes | **Resolved 2026-04-13 batch #3 → D7:** `shell-quote` v1.8.3+, parse direction only, wrapped in `parseCommand()`. | Resolved |
| Q3 | Path extraction from stdout per command | T | P0 | Yes | **Resolved 2026-04-13 batch #3 → D8:** per-command extractors (ls/grep/find/cat/head/tail/wc/sort/uniq/cut) + regex fallback `\b[\w./-]+\.md\b`. | Resolved |
| Q4 | `exec("cat X.md")` enrichment — identical to `read_document("X.md")` or leaner tail? | P | P0 | Yes (CC9 parity bar) | **Resolved 2026-04-13:** single-path `cat` enrichment matches `read_document` minus `modified` and minus richer multi-path fields (see FR7 / FR14 / D11). Close after SPEC update. | Resolved |
| Q5 | Should `exec` return different shape (structured vs. all-markdown) based on some flag? | P | P2 | No | Deferred per NG4 | Open (deferred) |
| Q6 | Timeout policy | T | P0 | No | **Resolved 2026-04-13 batch #3 → A3:** 30s global timeout, bench during impl; per-command caps rejected as inconsistent. | Resolved |
| Q7 | Concurrent `exec` calls — MCP serialize or handler-lock? | T | P2 | No | MCP SDK serializes per-transport; handler is stateless. No lock needed. | Resolved (DELEGATED) |
| Q8 | Tool-description allowlist citation shape | P | P0 | No | **DIRECTED:** FR12 requires inline allowlist + 2-3 examples in the tool description string. Impl details owner chooses phrasing. | Resolved (DIRECTED) |
| Q9 | Telemetry location for `exec_*` counters | T | P0 | No | **DIRECTED:** CLI-side counter in `exec.ts` handler (MCP is CLI-owned); mirror shape of existing `exec_*_ms` patterns. | Resolved (DIRECTED) |
| Q10 | Path-traversal rejection shape — hard error vs. silent skip | T | P0 | No | **Resolved → FR8:** hard error, consistent with existing `bash/index.ts:cat` guard. | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Strategic thesis ("OK as default surface for agents") is correct; internal counter-signal (hybrid recommendation) consciously overridden | MEDIUM-HIGH | Post-ship telemetry (Metric 1): `>50%` `exec` share in 30 days validates the bet; `<25%` invalidates it. Between the two — L2-aggressive wasn't aggressive enough; consider L3 (unregister semantic tools). Thesis is reversible in one INSTRUCTIONS edit if data disputes it. | 30 days post-ship | Active |
| A2 | Shared `enrichPath()` + CLI-side `readShadowLog()` helper factored as DEP-1 PR before V0-24 impl. Per D18, scope is CLI-only — no server edits | HIGH | Before V0-24 impl: confirm PR exists, extracts `enrichPath`, adds `readShadowLog`, migrates `read_document`+`search` to shared helper. No `/api/shadow-log` endpoint. `modified` fs.stat + batch-backlinks remain §15 Future Work. | Before V0-24 impl | Active |
| A3 | just-bash's default interpreter timeout and our 16 MB soft/hard caps (FR19, D9) are adequate for the Conservative-plus command set over expected content-dir sizes | MEDIUM | Benchmark `grep -r` / `find` via just-bash over a 1000-file content dir during DEP-1 impl; confirm sub-5s typical and bundle-budget FR19 holds | Before V0-24 impl close | Active |
| A4 | No agent harness today *requires* streaming MCP responses for tools in `exec`'s expected usage pattern (read, list, grep) | HIGH | Spot-check MCP SDK version + Claude Code / Cursor / Codex MCP client behavior | Confirmed — `@modelcontextprotocol/sdk@1.29.0` supports `structuredContent` with `outputSchema`; streaming not required | Resolved |
| A5 | Demoting semantic tools (L2-aggressive) in INSTRUCTIONS does not break agents that have already learned those tools — they remain callable via `ListTools` regardless of INSTRUCTIONS text | HIGH | Verified from MCP SDK behavior: tool registration determines `ListTools` output; INSTRUCTIONS string is separate | Resolved | Resolved |

## 13) In Scope (implement now)

**Goal:** Ship `exec` MCP tool — single-string bash-like command, pipes work, allowlist-enforced, dual-channel enriched output, L2-aggressive prompting, shadow-repo history via CLI direct-read.

**Non-goals:** (see §3)

**Requirements with acceptance criteria:** §6 FR1–FR12 (Must + Should + Could); key additions FR14 (shrunk multi-path shape), FR15 (shadow-repo history), FR17 (cross-ref reconstruction), FR18 (just-bash executor), FR19 (bundle-weight budget). FR13 subsumed by D9; FR16 deleted (no disk-only fallback needed).

**Proposed solution:** §9.

**Owner(s)/DRI:** Tim Cardona.

**Next actions:**
1. **DEP-1 prerequisite PR** (CLI-only): extract `enrichPath()` from `read_document.ts` + `search.ts` into `packages/cli/src/content/enrichment.ts`; add `readShadowLog()` in `packages/cli/src/content/shadow-log.ts` via `simple-git`; migrate `read_document` + `search` to shared helper. Benchmark `readShadowLog` latency; confirm no server edits.
2. **V0-24 impl PR:** rewrite `packages/cli/src/bash/index.ts` to use `@vercel/just-bash` + `ReadWriteFs`; implement `parseCommand()` with `shell-quote`; implement `extractReferencedPaths()` per-command extractors; implement `exec.ts` MCP tool with `outputSchema` for dual-channel return; rewrite INSTRUCTIONS in `server.ts` to L2-aggressive; add bundle-weight assertion to CI per FR19.
3. **Tests:** allowlist-enforcement suite (hostile-input manifest — `$IFS`, heredocs, unicode, tilde, braces, process substitution); pipe tests; path-traversal tests; CC9 parity test (`exec("cat X")` vs `read_document("X")`); bundle-size + cold-start assertion.
4. **Dogfood + telemetry:** measure Metric 1 (`exec` adoption share) and Metric 2 (tool-call count for "find + read" patterns) over 30 days post-ship.

**Risks + mitigations:** see §14.

**What gets instrumented/measured:** see §7.

### Deployment / rollout considerations
| Concern | Approach | Verify |
|---|---|---|
| Existing agents calling semantic tools continue to work | L2-aggressive demotes in INSTRUCTIONS but keeps tools registered; MCP `ListTools` unchanged | Integration test: call `read_document` via MCP after `exec` lands; confirm same response shape |
| Agents discovering `exec` | Tool description + INSTRUCTIONS rewrite | Dogfood pass with Claude Code in OK repo |
| Telemetry captures usage split | `exec_*` counters + log tool-name on every MCP call | Spot-check metrics after 1 day of dogfood |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Shell-injection via `exec` string (if parser misses a case) | MED | HIGH | just-bash runs in-process (no host shell spawned); `parseCommand` rejects anything not in structural allowlist pre-execution; dedicated hostile-input test manifest (`$IFS`, heredocs, process substitution, unicode, braces) | Tim |
| Path traversal via crafted args (e.g., `cat ../../etc/passwd`) | MED | HIGH | realpath-check every arg classified as a path before execution; reuse existing `projectDir` guards | Tim |
| CC9 enrichment drift — `exec("cat X")` returns less than `read_document("X")` | HIGH (without DEP-1) / LOW (with) | HIGH | DEP-1: single `enrichPath()` helper used by both surfaces; parity test in CI | Tim |
| Agents keep using native `Bash` instead of `exec` despite INSTRUCTIONS | MED | MED | L2-aggressive INSTRUCTIONS (FR10) + tool description examples; metric 1 captures adoption; escalate to L3 (unregister) if `>80%` already on `exec` but residual native-Bash use confuses experiments | Tim |
| Shrunk enrichment (no `modified`, no multi-path `backlinkCount`) insufficient to drive adoption over native `ls`/`grep` | MED (reduced — shadow-repo history now in v0 per D12) | MED | Shadow-repo agent-attribution history is the primary differentiator (D12); metric 1 still captures adoption; richer enrichment sketch in §15 Explored if needed | Tim |
| `readShadowLog` latency exceeds budget (simple-git spawns `git` per call) | MED | MED | Benchmark during DEP-1 impl; if >100ms per path on typical repos, cache parsed commit lists by (branch, path, head-sha) — shadow repo head moves on agent writes so invalidation is natural. Parallel-dispatch across paths in a single `exec` call keeps aggregate latency bounded. | Tim |
| CLI coupling to shadow-repo on-disk layout (`refs/wip/<branch>/<writer-id>`) | LOW-MED | MED | Extract ref-layout parsing into `packages/server/src/shadow-repo.ts` exports consumed by both server writer and CLI reader. Layout is already a documented invariant (CLAUDE.md §Shadow repo & branch runtime). | Tim |
| just-bash adds significant bundle weight to published CLI | MED | MED | FR19 budget (≤2× baseline install size; <300ms cold-start); measure in DEP-1; tree-shake tuning if over; fall back to execFile if tuning insufficient (reopen D14) | Tim |
| just-bash interpreter diverges from host grep/ls semantics in ways that break agent expectations | LOW | LOW | just-bash aims for bash-compat; spot-check the Conservative-plus command set against GNU reference behavior in tests; document any divergences in tool description | Tim |
| Large stdout (e.g., `cat big.md`) blows up agent context | LOW-MED | MED | Soft cap (500 lines / 50 KB) with truncation marker per D9; just-bash configured for 16 MB hard cap; documented in tool description | Tim |
| Allowlist too permissive — includes something that writes side effects (e.g., `sort -o`, `find -exec`) | LOW (D15 tightened) | HIGH | Per-command flag denylist at parser layer (`-o`, `--output-file`, `find -exec/-delete/-fprint/-fprintf/-ok/-okdir`); explicit tests for each | Tim |
| Allowlist too restrictive — agents ask for `awk`/`sed`/`xargs` and get denied, fall back to native bash | MED | MED | Monitor denial telemetry; if `awk`/`sed` usage pattern is read-only-dominated, consider Tier-3 with program-arg scanner (§15 reference) | Tim |
| Branch / realpath edge cases (symlinks, broken symlinks) mis-route enrichment | LOW | LOW | Reuse the same realpath semantics already in persistence layer (NG11/symlink policy) | Tim |
| Hybrid recommendation from internal report (`reports/just-bash-virtual-filesystem-analysis/`) was right — L2-aggressive over-rotates on coding-agent case and penalizes doc-authoring P2 persona | LOW-MED | MED | L2-aggressive is reversible in one INSTRUCTIONS edit to hybrid or L2-lite; telemetry (metric 1 absolute level + qualitative P2 feedback) surfaces this within 30 days post-ship; A1 captures the revert plan | Tim |
| `structuredContent` channel unsupported by some MCP client versions in use (older Claude Desktop, VS Code MCP, etc.) | LOW | LOW | Both channels emitted (FR6); markdown in `content` is the canonical path; `structuredContent` is additive. No client-side break if unread. | Tim |

## 15) Future Work

### Explored
- **Custom `IFileSystem` backend for just-bash (`YjsFileSystem`).**
  - What we learned: just-bash's `ReadWriteFs` (v0 choice per D14) is equivalent to execFile — zero differentiation. The real win from just-bash's abstraction is a custom `IFileSystem` that reads live Y.Doc state via Hocuspocus, so `exec("cat X.md")` returns the **current CRDT state including unsaved agent writes**, not stale disk state. Report D13 estimates 8 real `IFileSystem` method implementations (~500 LOC) with a materialized markdown cache refreshed via Y.Doc observers.
  - Recommended approach: Implement `YjsFileSystem` in `packages/cli/src/bash/yjs-fs.ts`, backed by an HTTP call to `/api/document?docName=X` (already exists per `server.ts` API table). Use `MountableFs` from just-bash to mount YjsFs at the content dir and fall back to `ReadWriteFs` for non-wiki files.
  - Why not in scope now: D14 lands the architectural seam with `ReadWriteFs`; the custom IFS is net-new functionality, not a refactor.
  - Triggers to revisit: Metric 1 crosses `>50%` adoption; users report stale-file confusion when agents read during active editing; or cloud mode ships (NG6) — both would push this in.
  - Implementation sketch: ~500 LOC in `yjs-fs.ts`, wire via `MountableFs`, extend tests. Estimate: 2 days.

- **Custom OK commands (`okl backlinks X`, `okl orphans`, `okl dead-links`) — Tier 3.**
  - What we learned: Maps to existing semantic tools (`get_backlinks`, `get_orphans`, `find_dead_links`). Value: `exec("okl orphans")` collapses into the same surface agents already know, reducing tool count further.
  - Recommended approach: Dispatcher pattern — `okl <subcommand>` routes to internal handler, not a real shell command. Shares `enrichPath`.
  - Why not in scope now: Tier 3 per project doc; adds surface; XQ1 not yet resolved.
  - Triggers to revisit: XQ1 resolves toward `exec`-primary; usage data shows agents want single-tool for graph queries too.
  - Implementation sketch: Add `okl` to first-token allowlist, route to internal dispatcher rather than shelling out.
- **Richer `EnrichedMeta` shape: filesystem `modified` + efficient multi-path `backlinkCount`.** (Shadow-repo history was previously listed here; now promoted in scope per D12.)
  - What we learned: For multi-path `exec` output (`ls`, `grep`, `find`), adding `modified` (fs mtime) and per-path `backlinkCount` would sharpen agent discovery, but requires: (a) `fs.stat` plumbing in the shared helper (+0.1ms/path) and (b) a new `/api/backlinks/count?docName=X` or `/api/backlinks/batch?docNames=[...]` endpoint to avoid the 20×100ms N-amplification on a 20-entry `ls`. `backlink-index.ts:30-33` already maintains `backward: Map<string, Map<string, ...>>` — a count endpoint is a one-liner (`.get(docName)?.size ?? 0`).
  - Recommended approach: (1) Add `modified: fs.stat(abs).mtime.toISOString()` to `enrichPath` when promoted. (2) Add `/api/backlinks/count` (trivial) and/or `/api/backlinks/batch` in V0-4 server-API work; consume from `enrichPath`. (3) Update DEP-1 descendants (`read_document`, `search`, `list_documents`, `exec`) to surface the new fields.
  - Why not in scope now: preserves V0-24 Reach-tier ship speed; multi-path enrichment shrink (D11) already accepted.
  - Triggers to revisit: metric 1 shows `exec` adoption stalling because output isn't differentiated enough vs. native; Dima's V0-4 backend API ships a count/batch endpoint.
  - Implementation sketch: ~40-line edit to `enrichPath`, 1 new server endpoint, 1 client helper. Estimate: half-day including tests.

### Identified
- **Deprecating `list_documents`, `search`, `read_document` in favor of `exec("ls ...")`, `exec("grep ...")`, `exec("cat ...")` (L3).**
  - What we know: Telemetry-driven decision; resolves root XQ1.
  - Why it matters: Reduces tool surface from 14 → ~5; increases min-tool-count alignment.
  - What investigation is needed: 30-day post-ship usage data + qualitative transcript review.

### Noted
- **Cloud / sandboxed deployment** — revisit `just-bash` or similar if OK hosts a cloud mode (NG6).
- **Streaming output support** — wait for MCP SDK streaming affordance (NG7).
- **Structured JSON output mode** — revisit when agent harnesses converge on a machine-parse convention (NG4).

## 16) Agent constraints
*(to be derived during verify phase)*

**For `exec` impl PR (this spec):**
- **SCOPE:** `packages/cli/src/mcp/tools/exec.ts` (new), `packages/cli/src/mcp/tools/index.ts` (registration + TOOL_DESCRIPTIONS entry), `packages/cli/src/mcp/tools/shared.ts` (extend `textResult` or add `textPlusStructured` helper for D10), `packages/cli/src/mcp/server.ts` (INSTRUCTIONS rewrite to L2-aggressive per D2/FR10), `packages/cli/src/bash/index.ts` (full rewrite per D14/FR18: replace `runShell`/`runPipeline`/`gitLog`/`grep` primitives with a just-bash `Bash` instance backed by `ReadWriteFs` scoped to projectDir; `cat` direct-fs helper may be retained or subsumed), `packages/cli/package.json` (add `@vercel/just-bash` + `shell-quote` deps)
- **EXCLUDE:** `packages/server/` (entirely — DEP-1 PR owns the `/api/shadow-log` endpoint; the `exec` PR consumes it via HTTP, doesn't edit server code); `packages/app/`, `packages/core/`, any CRDT / persistence core code, semantic tools' enrichment logic (refactor is DEP-1, lands first)
- **STOP_IF:** DEP-1 PR is not merged (no shared `enrichPath`, no `/api/shadow-log`); allowlist parser needs extensions beyond structural shell-grammar (context-aware argument parsing); any change would touch a write-capable surface or bypass the parser
- **ASK_FIRST:** adding a new 3P dependency beyond `shell-quote`; expanding the first-token allowlist beyond D6 Liberal set; any change to `INSTRUCTIONS` structure beyond the L2-lite rewrite

**For DEP-1 prerequisite PR (separate, lands first):**
- **SCOPE:** new `packages/cli/src/content/enrichment.ts` (shared `enrichPath()` helper); new `packages/cli/src/content/shadow-log.ts` (simple-git direct-read per D18); `packages/cli/src/mcp/tools/read-document.ts` and `search.ts` (migrate to shared helper — D13); optional: `packages/server/src/shadow-repo.ts` export additions if a ref-layout-parsing helper needs sharing between server-writer and CLI-reader (hedge for the coupling risk in §14).
- **EXCLUDE:** `packages/server/` write paths entirely; `packages/app/`, `packages/core/`, CRDT bridge code; any `fs.stat` mtime plumbing (§15 Future Work); any new backlinks endpoint (§15 Future Work); any new HTTP endpoint for shadow-repo (D18 rejected this)
- **STOP_IF:** `readShadowLog` latency >100ms per path on typical content dirs — escalate per §14 risk; adding fields beyond FR15 shape; shadow-repo layout changes between writing this spec and impl (would break FR17)
- **ASK_FIRST:** any change to the `EnrichedMeta` shape; any dependency additions beyond `simple-git` (already transitively present)
