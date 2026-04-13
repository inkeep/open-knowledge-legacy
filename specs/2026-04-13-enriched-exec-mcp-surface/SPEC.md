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

**Situation.** Coding agents in Claude Code / Cursor / Codex reach for bash idioms (`grep`, `ls`, `cat`, `find`, pipes) instinctively — external research (Dust.tt) observed agents inventing file-path syntax before filesystem tools existed, and "minimum tool count" is cited as the #1 predictor of agent failure. The Open Knowledge MCP server today exposes 15 semantic tools (`read_document`, `search`, `list_documents`, `get_backlinks`, `get_forward_links`, `get_hubs`, `get_orphans`, etc.; count verified in `evidence/worldmodel.md:39`) that agents must learn.

**Complication.** To get both bash ergonomics AND Open Knowledge's enrichment (per-file frontmatter, backlinks, shadow-repo activity), agents must compose native `Bash` + `curl` + `jq` — three tool calls where one would do. Semantic tools don't chain combinatorially: agents can't pipe `list_documents` into `head -5`. The failure modes: (a) agents use native bash and miss OK's enrichment — degrading OK's "strictly better than native" value prop; or (b) they juggle semantic tools and lose the pipe/filter idioms they already know. Meanwhile a 15-tool surface dilutes agent attention.

**Resolution.** One `exec(command)` MCP tool that accepts read-only bash-like commands scoped to the content directory and returns raw stdout verbatim *plus* an appended enriched-metadata block for every path reference in output. Prompting flips: the MCP `INSTRUCTIONS` lead with `exec` and demote semantic tools to "also available for typed call sites." Enrichment pipeline factors out of `read_document`/`search` into one shared helper so `exec`'s enrichment is bit-identical to the typed tools (CC9 quality bar). Post-v0 we use observed usage to resolve root XQ1: keep the dual surface, or deprecate semantic tools that `exec` subsumes.

**Note on folder catalog removal (2026-04-13 session).** Between the initial spec and implementation, the team (Amy + Tim) decided to retire maintained folder-level catalogs (`INDEX.md` with frontmatter inside each folder). Per-file frontmatter becomes the source of truth; a "catalog" view is computed on demand from per-file frontmatter, not persisted as a folder-level artifact. Impact on V0-24: the `catalogCategory` field is removed from `EnrichedMeta` (D19). Parent-folder context is what agents can derive from `ls ../` when they need it. This simplifies enrichment; it does not change the exec vs. semantic-tools thesis.

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
- **[NOT NOW]** NG8: Binary/image resources via `exec`. `exec` is text/markdown focused — output and enrichment assume UTF-8 content. Agents reading `ls assets/` see the filenames but `exec("cat diagram.png")` returns binary garbage or errors. For binary retrieval, agents use native `Read` (which handles PNG/JPG/etc.) or a dedicated resource tool. The MCP protocol supports `ImageContent` and `BlobResourceContents`; a future `resource_read` or similar tool could be added if mixed-media content directories become common. Revisit if: usage telemetry shows agents hitting this gap with images/PDFs/diagrams often. (Surfaced by Amy in PR #103 review; scoped out of v0.)

## 4) Personas / consumers
- **P1 — Coding agents in KB-adjacent work** (Claude Code, Cursor, Codex working in a repo that has `.open-knowledge/`). Primary consumer.
- **P2 — Doc-authoring agents** (ingest/research/consolidate workflows). Secondary — these flows already use typed workflow tools; `exec` is complementary for their reads.
- **Human developers** (Tim and team) — observe outcomes via editor + PR quality. Not direct users of the tool.

## 5) User journeys

`exec` is a single MCP tool with one call shape — traditional multi-step user journeys (discovery → setup → first use → ongoing) don't map cleanly. The interaction is: agent invokes `exec(command)`, synchronously gets back `{content, structuredContent}`. Below is the interaction-state matrix instead.

### Interaction state matrix

Error messages are **category-specific** so agents get an actionable next-step rather than a wall of allowlist text. Each denial carries `errorCategory` (in `structuredContent.error.category`) plus a targeted human-readable `message` (in `content` and `structuredContent.error.message`).

| Scenario | `errorCategory` | `message` (actionable) |
|---|---|---|
| Allowed command, successful execution | (none) | `content`: raw stdout + `### Referenced files` block; `structuredContent.enrichedPaths`: populated |
| Allowed command, zero output (e.g., `grep` with no match) | (none) | `content`: empty stdout + no enrichment block; `structuredContent.enrichedPaths`: `[]` |
| First-token not in allowlist (e.g., `awk`, `sed`, `xargs`) | `unknown_command` | `"Command '<first-token>' is not in the allowlist. For pattern matching try 'grep'; for file listing try 'ls' or 'find'. Allowlist: cat, ls, grep, find, head, tail, wc, sort, uniq, cut."` |
| Write-capable operator blocked (`>`, `>>`, `tee`, `sort -o`, `find -exec/-delete`) | `write_blocked` | `"Write operation blocked: '<op-or-flag>'. exec is read-only. For document changes, use write_document or edit_document."` |
| Shell construct blocked (`$(...)`, backticks, `&&`, `;`, `&`, heredocs) | `shell_construct_blocked` | `"Shell construct '<construct>' is not supported. Only pipes (\|) are allowed between allowlisted stages."` |
| Path-traversal attempt (arg resolves outside content dir) | `path_traversal` | `"Path '<arg>' resolves outside the content directory and was rejected."` — no command executed |
| Shadow repo absent (project never initialized with OK) | (none) | Command runs; enrichment returns `history: null`, `historySource: "shadow-repo-absent"` so the agent can distinguish "no repo" from "no edits" |
| Shadow repo present, no edits on path | (none) | Command runs; enrichment returns `history: []`, `historySource: "shadow-repo"` |
| Hocuspocus unreachable | (none) | Command runs; `backlinkCount: null` for any referenced path (degradation matches `read_document`'s FR9 behavior) |
| Output exceeds soft cap (500 lines / 50 KB rendered) | (none, warning) | `content`: first N lines + `<truncated: M more lines — re-run with more-specific query>` marker; enrichment still applied to captured portion |
| Output exceeds hard cap (16 MB) | `output_overflow` | `"Output exceeded 16 MB buffer. Narrow the command (e.g., add more specific grep pattern, use head, restrict the path)."` |
| Defense-in-depth violation (FR21 mtime-scan detected filesystem change) | `security_invariant_violation` | `"Security invariant violated: file(s) in the content directory were modified during a read-only exec call. This indicates a parser bug. The offending paths have been logged; please report this."` |
| Binary/non-text file in output (e.g., `cat diagram.png`) | (none, warning) | `content`: a warning banner `"File '<path>' appears to be binary (image/PDF/etc.) — exec returns text only (NG8). For binary retrieval, use native Read."` followed by the raw (likely garbled) UTF-8-decoded stdout. `structuredContent.enrichedPaths`: present for `.md`/`.mdx` references; binary paths themselves are not enriched. |

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1: `exec(command)` MCP tool registered | Tool appears in MCP server `registerAllTools`; passes allowlisted cmd end-to-end in integration test. | |
| Must | FR2: Allowlist enforced on every pipeline stage | Test harness rejects `rm`, `mv`, redirections, subshells, backticks, `&` with clear error. | |
| Must | FR3: Read-only first-tokens pass through | Conservative-plus allowlist per D15: `cat`, `ls`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut` execute. `awk`/`sed`/`xargs` explicitly excluded (D15). `find` accepted with flag denylist (`-exec`/`-execdir`/`-delete`/`-fprint`/`-fprintf`/`-ok`/`-okdir`). | Per D15 (Conservative-plus) |
| Must | FR4: Pipes work between allowlisted stages | `grep 'x' | head -5` returns matching lines through head, enrichment applied to final output. | W3 wedge |
| Must | FR5: Raw stdout preserved verbatim | Output byte-equivalent to equivalent native bash invocation for supported commands. | Enrichment is *additive* |
| Must | FR6: Enrichment delivered via **two channels** | (a) `content` text: raw stdout verbatim + appended `### Referenced files` markdown block. (b) `structuredContent` JSON: `{ enrichedPaths: EnrichedMeta[], error?: { category: ErrorCategory, message: string } }` typed payload. Both populated on every `exec` call that identifies file references. Tool registration declares an `outputSchema` (zod) per MCP SDK 1.29 requirement — see `evidence/shadow-repo-identity-and-sdk.md` §2. `ErrorCategory` enum: `unknown_command` \| `write_blocked` \| `shell_construct_blocked` \| `path_traversal` \| `output_overflow` \| `security_invariant_violation`. | Matches report recommendation + supports future harness UI reading structured channel; category-specific errors per D21 / bot review 🟠 #1 |
| Must | FR7: CC9 parity with `read_document` for single-path `exec("cat X.md")` | Enrichment fields present: title, description, tags, backlinkCount (array length via `/api/backlinks`), **recent activity history from shadow repo** (writer id/name, timestamp, action, branch — see FR15). `read_document` gets upgraded in tandem (D13) to pull from the same source. **`catalogCategory` removed** per D19 (folder INDEX.md deprecated across OK). | Requires shared `enrichPath` + CLI-side `readShadowLog` helper — DEP-1 per D4/D18. No server endpoint needed. |
| Must | FR15: Recent activity history sourced from shadow repo (not `git log`) | `enrichPath` reads the last N commits against `<path>` from the shadow bare repo (`.git/openknowledge/` integrated mode, `.openknowledge/` standalone). Per entry: `{hash, date, writerId, writerName, isAgent, message, branch}`. `isAgent` derived via the `parseWriterId()` helper exported from `packages/server/src/shadow-repo.ts` (see FR20/D22) — CLI does not hand-roll the regex. `N` configurable (default 5) via existing `config.mcp.tools.read_document.historyDepth`. **Commits are single-author** (per `commitWip` at `shadow-repo.ts:128-204`); multi-writer attribution surfaces from commit chronology across the per-writer refs listed in FR17, not from Co-authored-by trailers (trailers only appear in `saveVersion` project-repo commits at `:436-448`, not in shadow-repo WIP commits). Three distinct `historySource` states: `"shadow-repo"` with populated `history`, `"shadow-repo"` with `history: []` (repo present, no edits), `"shadow-repo-absent"` (no shadow repo). | Shared helper source of truth (DEP-1); layout sharing via FR20 eliminates coupling risk. |
| Must | FR20: Shadow-repo layout shared via **core** exports (neutral package, not server) | New file `packages/core/src/shadow-repo-layout.ts` exports three pure utilities consumed by both the CLI reader and the server writer: `getShadowRepoPath(projectRoot): string \| null` (returns canonical shadow dir or null when absent, covering both integrated and standalone modes — uses `node:fs` only), `getWipRefPattern(branch): string` (returns `refs/wip/<branch>/`), `parseWriterId(id): { type: 'agent' \| 'human' \| 'upstream' \| 'server' \| 'unknown', isAgent: boolean \| null }`. Server's `packages/server/src/shadow-repo.ts` migrates to import from core (internal refactor, no behavior change). CLI's `readShadowLog` imports from core — no regex or path reimplementation. Placing in core (not server) resolves the CLI→server runtime-dep-direction concern raised in PR #103 second review round: both CLI and server already depend on core at the workspace level, core has no node-server-specific deps, so this is the neutral shared-utility location. | Bot review rounds 1+2 2026-04-14 🟠 — D22 + second-round fix; DEP-1 scope includes a new core file + a one-line import swap in server |
| Must | FR21: Post-exec security-invariant check (defense-in-depth backstop) | After every successful `exec` call, the handler computes a bounded mtime-summary of files in `projectDir` (max 1000 entries, scanning only files whose parent dir was touched during the exec window) and compares it to the pre-exec snapshot. On mismatch: log `security_invariant_violation` with the offending path(s), abort the response (`isError: true`, `errorCategory: 'security_invariant_violation'`), and surface via `exec_security_violation_total` metric. Typical cost <10ms for dirs ≤500 files. This closes the "what if `parseCommand` has a bug and a writer slipped through" gap without the subprocess-isolation cost D14 paid to avoid. | Bot review 2026-04-13 🟠 "parseCommand as 'sole security boundary' lacks defense in depth" — D23 accepted; much cheaper than subprocess sandboxing |
| Must | FR17: Shadow-repo history reconstruction is cross-ref, CLI-side | Shadow repo stores per-writer refs `refs/wip/<branch>/<writer-id>` — no single HEAD orders all writers. New CLI helper `packages/cli/src/content/shadow-log.ts:readShadowLog(projectDir, relPath, limit)` (a) opens the bare repo via simple-git pointed at `.git/openknowledge/` (integrated) or `.openknowledge/` (standalone), (b) enumerates writer refs for the current project branch via `git for-each-ref refs/wip/<branch>/`, (c) runs `git log <ref> -- <path>` per ref in parallel, (d) merges by committer-date descending, takes last N. `isAgent` derived from `writerId.startsWith('agent-')`. Upstream-import commits included. | Design per D18 (CLI-side, no HTTP); ~60 LOC. simple-git reads are concurrent-safe against server writes (server's writer lock covers writes only). |
| Must | FR18: Executor is just-bash, not execFile | `packages/cli/src/bash/index.ts` replaced: `runShell`/`runPipeline` primitives removed in favor of a single `Bash` instance (from `@vercel/just-bash`) configured with `ReadWriteFs` backend scoped to `projectDir`. `parseCommand` (D7 / shell-quote) still runs as a structural pre-validator; only allowlisted command strings (D15) reach the just-bash interpreter. Pipes, quoting, glob expansion handled inside just-bash. No dependency on host's grep/ls/cat binaries. | Per D14. Bundle-weight risk monitored via FR19. |
| Must | FR19: CLI bundle-weight budget | After just-bash is integrated, the published `@inkeep/open-knowledge` CLI install size MUST not exceed 2× its pre-change baseline, AND cold-start time (`open-knowledge --help`) MUST stay under 300ms. If either budget is blown, prefer tree-shake tuning; if still over, revisit D14 (fall back to execFile with `simple-git` already-present for history). | Challenger-adjacent concern surfaced by report D1 (just-bash is ~125k LOC); measured in DEP-1 impl. |
| Must | FR16: *(deleted in batch #4)* — shadow-repo read via simple-git direct-read (D18) works in all modes; no `git log` fallback needed. `historySource` field retained in `EnrichedMeta` shape but set to `"shadow-repo"` always. If the shadow repo doesn't exist (project never initialized with OK), history field is an empty array. | Simplification from batch #4 direct-read architecture. |
| Must | FR14: **Single unified `EnrichedMeta` shape** (no silent schema divergence) | One interface, fields are **explicitly nullable** so agents have a stable contract regardless of cardinality: `{ path, title?, description?, tags[], backlinkCount: number \| null, history: ShadowCommit[] \| null, historySource: 'shadow-repo' \| 'shadow-repo-absent' \| null }`. For multi-path output (`ls`, `grep`, `find`, N>1), `backlinkCount`/`history`/`historySource` are `null` by convention (N-amplification avoidance). For single-path `cat` output, populated (or `null` when data is unavailable per FR9/FR16). Tool description documents this contract explicitly. `catalogCategory` field **removed** per D19. `modified` deferred to §15. | Bot review 2026-04-13 🟠 "Multi-path vs single-path shapes diverge silently" — fix is unified nullable shape (D20) |
| Must | FR8: Path traversal rejected | Any arg that resolves outside content dir after realpath returns error, no command executed. | Reuse existing `safeSubdir` pattern |
| Must | FR9: Graceful degrade without Hocuspocus | `exec` works with backlinks omitted when Hocuspocus unreachable, same behavior as `read_document`. | |
| Must | FR10: INSTRUCTIONS L2-aggressive rewrite with rationale | `server.ts` INSTRUCTIONS lead unambiguously with `exec` as the primary surface for reading / listing / grepping / searching wiki content. Strong framing **with reason** (bot review 💭 #3): *"Prefer `exec` over native `Read`/`Grep`/`Glob` and over `read_document`/`search` for all wiki operations. `exec` provides the same enrichment as `read_document`/`search` (frontmatter, backlinks, shadow-repo attribution) plus bash composability (pipes, `head`, `find`). Semantic tools remain registered for typed callers (e.g., harness UIs consuming `structuredContent`) but are not recommended for common agent reads."* | Revised 3x; final per D2 batch #4. User direction: "agents should use openknowledge by default; we should never have to tell it to do so." |
| Should | FR11: Commands producing no file-scoped output (e.g., `echo`, `date`) return raw output, no enrichment, no error | If added to allowlist. May not be in initial allowlist. | |
| Should | FR12: Tool description is **tiered and token-budgeted** (≤120 tokens) | Structure: (1) one-line summary + first concrete example (~50 tokens total); (2) Conservative-plus allowlist as a comma-separated list (~25 tokens); (3) one-line dual-channel note. Detailed flag denylists, hostile-input specifics, and the full enrichment schema live in `INSTRUCTIONS` (FR10) and the MCP `outputSchema`, not the tool description. | Bot review 2026-04-13 💭 #2 — prevents tool-description bloat from eroding token-efficiency win (target ~50-80 tokens per mcp-tool-interface-design report) |
| Could | FR13: Output size cap with clear truncation message | Prevent blowing up agent context on `cat huge.md`. Hard 16 MB (just-bash configured buffer); soft cap 500 lines / 50 KB with truncation marker per D9. | Superseded by D9-lock; kept for traceability. |

### Non-functional requirements
- **Performance:** Command execution within 30s default timeout. Enrichment should add <100ms for typical cases (≤20 paths in output). `readShadowLog` budget <100ms per path — see §14 risk + FR19.
- **Reliability:** `parseCommand()` is deterministic — same input → same allow/deny. No flakiness in allowlist enforcement.
- **Security/privacy:** See §14 Risks. **Defense in depth — two enforcement layers, not one:**
  1. **Primary:** `parseCommand` (the allowlist parser) rejects disallowed first-tokens, flags, ops, and hostile constructs before any interpreter work happens.
  2. **Backstop (FR21):** post-exec mtime-scan of `projectDir` detects any file mutation during a read-only call and aborts with `security_invariant_violation`. Closes the "parser bug lets a writer through" gap cheaply (<10ms typical overhead).
  3. **Path traversal:** realpath guard on every path-shaped arg; `ReadWriteFs`'s own `resolveAndValidate` provides a second check at the IFileSystem layer.
  4. **No host-shell invocation:** just-bash is an in-process interpreter; no `/bin/sh` spawn, no shell injection surface.
- **Operability:** Log denied commands to stderr with reason (for agent debugging); log successful commands at debug level. Metrics: `exec_calls_total`, `exec_denied_total` (by reason), `exec_enrichment_ms`, `read_shadow_log_ms`.
- **Cost:** Negligible per call; just-bash interpreter runs in-process, `simple-git` spawns `git` process per `readShadowLog` (amortize via caching per FR19 mitigation).

## 7) Success metrics & instrumentation
- **Metric 1 — Agent adoption of `exec` vs. semantic tools (overall)**
  - Baseline: 0 (tool doesn't exist)
  - Target: >50% of reads/lists/searches via `exec` within 30 days post-ship for agents that have both surfaces
  - Instrumentation notes: Count MCP tool invocations in server stderr logs; needs simple counter in `server.ts`
- **Metric 1b — Single-file-read composition** (bot review R3 💭 #2)
  - Rationale: Metric 1 conflates the pipe-composition win (`exec("grep X | head -5")` replaces 2+ semantic calls) with the XQ1 question (`exec("cat X.md")` vs `read_document("X.md")` for simple single-file reads). 1b isolates the XQ1 signal.
  - Target: >30% of single-file read patterns via `exec("cat ...")` (vs `read_document`) in 30 days
  - Instrumentation notes: Classify each exec call by command pattern; single-cat calls count toward 1b
- **Metric 2 — Tool-call count for "find and read" patterns**
  - Baseline: measure pre-ship (informal — 3 calls typical: grep, curl, jq)
  - Target: 1 call via `exec`
  - Instrumentation notes: Sample agent transcripts in dogfooding
- **What we will log/trace:** Every `exec` call (command, decision: allowed/denied, exec time, enrichment time, output size). Denial reasons (denylist hit, path traversal, parse error).
- **How we'll know adoption/value:** Adoption metric above + qualitative: do agents chain `exec` with pipes in the wild, or only single commands?

## 8) Current state (how it works today)
*(to be enriched by /worldmodel output — see evidence/)*

Snapshot as of baseline commit 9c346cb (this section describes current state *before* V0-24 implementation):

- `packages/cli/src/bash/index.ts` provides `runShell`, `cat`, `gitLog`, `grep` primitives (today). **Two distinct changes target this file in different PRs, not conflated:** (i) FR18 replaces `runShell` + `grep` with a just-bash `Bash` instance + `ReadWriteFs` (the interpreter swap, lands in V0-24 exec impl PR); (ii) D12/DEP-1 replaces `gitLog` with CLI-side `readShadowLog` via simple-git (the enrichment data-source swap, lands in DEP-1 PR first). `cat` retained as a direct-fs helper in both.
- `packages/cli/src/mcp/server.ts` registers all tools and serves INSTRUCTIONS. Current INSTRUCTIONS say "prefer read_document over native Read" and "search over native Grep" — **the L2-aggressive rewrite (FR10) replaces this entire Navigation section** to lead with `exec`, demote semantic tools, and explain WHY.
- `packages/cli/src/mcp/tools/read_document.ts` inlines frontmatter parse + `gitLog` + catalog lookup + backlinks HTTP call. `search.ts` has a parallel copy. **DEP-1 extracts these into a shared `enrichPath()` helper** (D4, D13) and swaps `gitLog` → `readShadowLog` (D12). Catalog lookup is **removed, not migrated** (D19 — folder INDEX.md frontmatter deprecated).
- `packages/server/src/shadow-repo.ts` maintains the bare git repo at `.git/openknowledge/` with per-writer WIP refs. **Read-only consumption by CLI is net-new** (D18) and requires three pure-utility exports to land in a new `packages/core/src/shadow-repo-layout.ts` (D22/FR20; core is the neutral shared location). Server's existing `shadow-repo.ts` migrates to import these from core in a no-behavior-change refactor.
- Known gaps (pre-impl): (a) no shared enrichment helper → CC9 drift risk; (b) `list_documents` enriches nothing (V0-26 Now — separate spec); (c) shadow-repo agent attribution is collected but never surfaced to agents today; (d) folder-level INDEX.md catalogs exist in-repo today but are being phased out — V0-24 impl does not read them even when they exist.

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
  just-bash Bash instance      ← interpreter owns pipes/quoting/glob expansion
    + ReadWriteFs                executes stages against content dir (scoped)
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
- **Data model:** No persistent state. **Single unified `EnrichedMeta` shape with nullable fields** per FR14/D20 — agents get a stable contract regardless of cardinality:
  ```ts
  interface EnrichedMeta {
    path: string;
    title?: string;
    description?: string;
    tags: string[];
    backlinkCount: number | null;              // null on multi-path or Hocuspocus-unreachable
    history: ShadowCommit[] | null;            // null on multi-path; [] when repo present with no edits
    historySource: 'shadow-repo' | 'shadow-repo-absent' | null;
  }
  interface ShadowCommit {
    hash: string; date: string;                // ISO-8601
    writerId: string; writerName: string;
    isAgent: boolean | null;                   // convenience boolean; null means indeterminate, see writerClassification for the disambiguated value
    writerClassification: 'agent' | 'human' | 'upstream' | 'server' | 'unknown';  // unambiguous discriminator from parseWriterId() (FR20). 'unknown' = writerId doesn't match any known prefix (legacy commits, external git operations outside OK). Agents reasoning about attribution should prefer this field over isAgent. isAgent is kept as a convenience: true iff classification === 'agent'; false iff 'human'; null iff 'upstream' | 'server' | 'unknown' (indeterminate for "who edited this?" question).
    message: string; branch: string;
  }
  ```
  - **Multi-path output** (`ls`, `grep`, `find`, N>1): `backlinkCount`, `history`, `historySource` all `null` (N-amplification avoidance).
  - **Single-path `exec("cat X.md")`:** all fields populated via shared `enrichPath` helper.
  - **No `catalogCategory`** per D19 (folder INDEX.md frontmatter deprecated across OK).
  - `modified` (fs mtime) deferred per D11 — §15.
- **3P dependencies (all locked):** `shell-quote` v1.8.3+ (D7, parse only); `just-bash` (D14 — **actual npm name, standardized throughout this spec**; maintained by cramforce at Vercel); `simple-git` (D18, CLI direct-read of shadow repo — already transitively present).
- **Auth/permissions:** Inherits MCP connection; no additional auth layer.
- **Enforcement point(s):** Two layers per §6 Security (D23/FR21): (1) `parseCommand` is the primary allowlist + structural validator — tested as a unit with a hostile-input manifest; (2) post-exec mtime-scan backstop (FR21) detects any write that slipped past the parser and aborts with `security_invariant_violation`.
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
| D19 | **`catalogCategory` removed from `EnrichedMeta`**; folder-level INDEX.md catalogs deprecated across OK | X | LOCKED | No | Team decision 2026-04-13 (Amy + Tim session after PR #103 review): folder frontmatter maintenance is ongoing cost with diminishing value; per-file frontmatter is source of truth; "catalog" becomes an on-demand view derived from per-file frontmatter, not a persisted artifact. Impact on V0-24: drop one field, skip one data fetch. | User + Amy 2026-04-13; PR #103 review | One fewer data source in `enrichPath`; no "Folder:" line in `read_document` output; broader architectural shift is out of this spec's scope but noted as context |
| D20 | **`EnrichedMeta` unified into a single nullable-field interface** (not a discriminated union on cardinality) | T | LOCKED | Yes — public contract for agent consumers | Bot review 2026-04-13 🟠 "Multi-path vs single-path enrichment shapes diverge silently." Single interface with `null` fields restores contract predictability. | Bot review + maintainer accept 2026-04-13 | FR14 rewritten; §9 data model shows the single interface; `structuredContent.enrichedPaths: EnrichedMeta[]` elements share one shape |
| D21 | **Error messages differentiate by denial category** + `structuredContent.error = {category, message}` | T | LOCKED | Yes — public contract for agent error-handling | Bot review 2026-04-13 🟠 "Error messages should differentiate denial categories for agent self-correction." Each category carries an actionable next-step, not a wall of allowlist text. | Bot review + maintainer accept 2026-04-13 | Interaction-state matrix updated with six categories; FR6 `outputSchema` includes optional `error` |
| D22 | **Shadow-repo layout shared via core exports** (neutral utility package, not server) | X | LOCKED (revised 2026-04-14 R2) | Soft — workspace boundary | Bot review R1 🟠 "Shadow-repo CLI reader couples to internal server layout." Bot review R2 🟠 flagged that placing the exports in server would create a CLI→server runtime dep direction concern (CLI has server as devDep). Revised to place helpers in `packages/core/src/shadow-repo-layout.ts` — core is a shared dep of both server and CLI, has no node-server-specific deps, neutral shared-utility location. | Bot reviews R1+R2 + maintainer accept 2026-04-14; FR20 | DEP-1 touches: new `packages/core/src/shadow-repo-layout.ts` (~40 LOC pure utilities), one-line import swap in `packages/server/src/shadow-repo.ts`, and CLI consumer. Preserves D22 intent without the dep-direction issue. |
| D23 | **Defense-in-depth backstop via FR21 mtime-scan** (not subprocess isolation) | T | LOCKED | No | Bot review 2026-04-13 🟠 "parseCommand as 'sole security boundary' lacks defense in depth." Subprocess isolation reintroduces the just-bash-swap cost D14 paid to avoid. Lean alternative: post-exec mtime snapshot + diff against pre-exec baseline; any change aborts with `security_invariant_violation`. | Bot review + maintainer accept 2026-04-13; FR21 | <10ms overhead for typical content dirs; bounded at 1000 files; logged on violation for operator investigation |
| D6 | ~~Allowlist composition: Liberal — `cat, ls, grep, find, head, tail, wc, sort, uniq, cut, awk, sed`~~ | T | **SUPERSEDED by D15** (batch #4) | — | `awk`/`sed` write vectors live in program strings, not flags; flag-denylist insufficient | challenger finding #2 | Final allowlist defined in D15 |
| D7 | Shell-grammar parser: **`shell-quote`** (parse direction only), wrapped in `parseCommand()` validator | T | LOCKED | Soft — implementation choice | Actively maintained (v1.8.3 Jun 2025); produces AST we can walk for allow/deny; quote-direction CVE doesn't apply to parse-only usage | User 2026-04-13; web search; `evidence/internal-prior-art-contradicts-direction.md` | Hostile-input verification deferred to impl-phase test manifest |
| D8 | Path-extraction strategy: **per-command extractors + regex fallback** | T | LOCKED (revised 2026-04-14 R2) | No | Per-command is more accurate than regex-only; fallback handles unknown output shapes (echo/date/etc.) | User 2026-04-13 | ~12 small extractor functions; regex fallback: `\b[\w./-]+\.(md\|mdx)\b` (broadened from `.md` only per bot review R2 🟡 to cover `.mdx` content). Other extensions (`.txt`, `.json`) intentionally excluded — those aren't wiki content. |
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
| A1 | Strategic thesis ("OK as default surface for agents") is correct; internal counter-signal (hybrid recommendation) consciously overridden | MEDIUM-HIGH | Post-ship telemetry (Metric 1 + Metric 1b): `>50%` overall `exec` share AND `>30%` on single-file reads in 30 days validates the bet; `<25%` overall invalidates it. Between the two — L2-aggressive wasn't aggressive enough; consider L3 (unregister semantic tools). **Rollback communication:** the INSTRUCTIONS text itself carries an inline version tag as its first line (e.g., `# MCP Instructions v2 — exec-primary (2026-04-13)`). Agents consume the INSTRUCTIONS on every session, so they naturally see the version bump on rollback. The rewritten INSTRUCTIONS explicitly states: "Prior guidance preferred `exec`; current guidance is that `exec` and semantic tools are both first-class — use whichever matches your call site." Tool registrations themselves never change; no client breakage. | 30 days post-ship | Active |
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
| CLI coupling to shadow-repo on-disk layout (`refs/wip/<branch>/<writer-id>`) | LOW (mitigated in FR20/D22) | MED | FR20 mandates sharing via `packages/core/src/shadow-repo-layout.ts` (`getShadowRepoPath`, `getWipRefPattern`, `parseWriterId`); both CLI reader and server writer import from core. Any layout change is picked up via workspace-dep bump, not spec rework. | Tim |
| Post-exec mtime-scan (FR21) adds per-call latency | LOW-MED | LOW | Bounded to 1000 entries, scanning only files touched during the exec window. For typical content dirs (<500 files) adds <10ms. If a user repo exceeds the bound, warn and ship partial coverage + telemetry. | Tim |
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
- **Richer `EnrichedMeta` shape: filesystem `modified` + efficient multi-path `backlinkCount` + populating `history` on multi-path output.** (Shadow-repo history on single-path was promoted in scope per D12. Folder-level `catalogCategory` was removed entirely per D19 and is NOT planned to return.)
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
- **EXCLUDE:** `packages/server/` (entirely — DEP-1 PR adds the three shadow-repo helper exports per FR20; the `exec` PR consumes them as workspace imports and does not edit server code); `packages/app/`, `packages/core/`, any CRDT / persistence core code, semantic tools' enrichment logic (refactor is DEP-1, lands first); **no HTTP endpoint for shadow-repo history** — D18 locked direct-read via simple-git; any endpoint addition would require reopening D18
- **STOP_IF:** DEP-1 PR is not merged (no shared `enrichPath`, no `readShadowLog` helper, no core `shadow-repo-layout` exports); allowlist parser needs extensions beyond structural shell-grammar (context-aware argument parsing); any change would touch a write-capable surface or bypass the parser
- **ASK_FIRST:** adding a new 3P dependency beyond `shell-quote` and `just-bash`; expanding the first-token allowlist beyond the D15 Conservative-plus set; any change to `INSTRUCTIONS` structure beyond the L2-aggressive rewrite (D2)

**For DEP-1 prerequisite PR (separate, lands first):**
- **SCOPE:** new `packages/cli/src/content/enrichment.ts` (shared `enrichPath()` helper returning the unified nullable `EnrichedMeta` per D20/FR14); new `packages/cli/src/content/shadow-log.ts` (simple-git direct-read per D18, using core-exported layout helpers); `packages/cli/src/mcp/tools/read-document.ts` and `search.ts` (migrate to shared helper — D13; drop folder catalog lookup per D19); **new `packages/core/src/shadow-repo-layout.ts`** (three pure-utility exports per D22/FR20: `getShadowRepoPath`, `getWipRefPattern`, `parseWriterId`); **one-line import swap in `packages/server/src/shadow-repo.ts`** (consume from core instead of inline regex/paths).
- **EXCLUDE:** all other `packages/server/` paths (persistence, file-watcher, reconciliation, etc.); `packages/app/`, other `packages/core/` surfaces; CRDT bridge code; any `fs.stat` mtime plumbing (§15 Future Work); any new backlinks endpoint (§15 Future Work); any new HTTP endpoint for shadow-repo (D18 rejected)
- **STOP_IF:** `readShadowLog` latency >100ms per path on typical content dirs — escalate per §14 risk; adding fields beyond the unified `EnrichedMeta` shape; shadow-repo layout changes between writing this spec and impl (would break FR17)
- **ASK_FIRST:** any change to the `EnrichedMeta` shape (public contract — 1-way door per D20); any server-package edits beyond the one-line import swap; any `packages/core/` edits beyond the new `shadow-repo-layout.ts` file; any dependency additions beyond `simple-git` (already transitively present)
