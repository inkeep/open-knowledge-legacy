# Worldmodel: Enriched `exec` MCP surface

**Generated:** 2026-04-13
**Spec:** [../SPEC.md](../SPEC.md)
**Baseline commit:** 9c346cb

## Meta

- **Depth:** full (1 caller); web channel **INACCESSIBLE** (WebSearch permission denied). 3P landscape inferred from in-repo reports `just-bash-virtual-filesystem-analysis/`, `ai-coding-agent-tool-surfaces/`, `virtualized-mcp-filesystem-servers/`, `mcp-tool-interface-design-agent-performance/`.
- **Channels run:** code (inline), reports catalogue, user-provided SPEC, project docs, stories.
- **Channels skipped/unavailable:** web probes (permission denied), OSS repos directory (`~/.claude/oss-repos/` absent — Glob returned no files).

---

## 1) Surfaces

### 1a. Currently registered MCP tools

Source: `packages/cli/src/mcp/tools/index.ts:75-91` (TOOL_DESCRIPTIONS map) and `registerAllTools` (`index.ts:100-130`).

| # | Tool | File | Enrichment shape | Backend |
|---|---|---|---|---|
| 1 | `init-content` | `init-content.ts` | instructional text | none |
| 2 | `ingest` | `ingest.ts` | instructional text | none |
| 3 | `research` | `research.ts` | instructional text | none |
| 4 | `consolidate` | `consolidate.ts` | instructional text | none |
| 5 | `read_document` | `read-document.ts` | `## title` + Description + Tags + Path + Folder catalog context + `### Recent changes` (git log) + `### Backlinks (N)` + `### Content` (raw md) | filesystem + gitLog + CatalogStore + httpGet `/api/backlinks` |
| 6 | `search` | `search.ts` | Per-file: title, tags, description + per-match `- Line N: text`; truncation suffix when N>maxResults | grep (execFile) + CatalogStore |
| 7 | `write_document` | `write-document.ts` | HTTP result JSON | httpPost `/api/agent-write-md` (inferred) |
| 8 | `edit_document` | `edit-document.ts` | HTTP result JSON | httpPost `/api/agent-patch` (inferred) |
| 9 | `undo_agent_edit` | `undo-agent-edit.ts` | HTTP result JSON | httpPost `/api/agent-undo` |
| 10 | `redo_agent_edit` | `redo-agent-edit.ts` | HTTP result JSON | httpPost `/api/agent-redo` |
| 11 | `list_documents` | `list-documents.ts:26-35` | raw JSON dump — **NO enrichment today** (CC9 gap, V0-26 Now) | httpGet `/api/documents` |
| 12 | `get_backlinks` | `get-backlinks.ts:13-31` | raw JSON | httpGet `/api/backlinks` |
| 13 | `get_forward_links` | `get-forward-links.ts` | raw JSON | httpGet `/api/forward-links` (inferred) |
| 14 | `get_orphans` | `get-orphans.ts` | raw JSON | httpGet `/api/orphans` (inferred) |
| 15 | `get_hubs` | `get-hubs.ts` | raw JSON | httpGet `/api/hubs` (inferred) |

**Tool count: 15** (spec §1 cites "14+"; registry enumerates 15). The INSTRUCTIONS string in `server.ts:42-82` references "three groups" (workflow / enriched / document) and explicitly recommends `read_document` > native `Read`, `search` > native `Grep`.

### 1b. Surfaces `exec` will touch

- **Add:** `packages/cli/src/mcp/tools/exec.ts` (new file) + entry in `tools/index.ts:75` TOOL_DESCRIPTIONS map + call in `registerAllTools` (`index.ts:100`).
- **Rewrite:** INSTRUCTIONS block in `packages/cli/src/mcp/server.ts:42-82` (Navigation section; lead with `exec`, demote typed tools to "also available" — D2/FR10).
- **Possibly extend:** `packages/cli/src/bash/index.ts` to add a multi-stage pipelined `execFile` primitive (current primitives are single-command: `runShell`, `cat`, `gitLog`, `grep`). SPEC §16 permits edits to `bash/index.ts`.
- **Factor (DEP-1, separate PR):** shared `enrichPath()` helper extracted from current inlined enrichment in `read-document.ts:127-170` and `search.ts:55-117`.

---

## 2) Connections & dependencies

```
agent (Claude Code / Cursor / Codex)
       │  stdio MCP
       ▼
McpServer (server.ts:237)   ── INSTRUCTIONS (L2 rewrite target)
       │
       ▼ registerAllTools(server, {serverUrl, projectDir, config, catalog})
       │
  ┌────┼───────────────────────────────┬─────────────────┐
  ▼    ▼                               ▼                 ▼
workflow   enriched (read/search)   HTTP-only        exec (NEW)
 tools     │                        document tools    │
  no       │                          │               ▼
 server    │                          │         parseCommand(allowlist)
           ▼                          ▼               │
    bash/index.ts               Hocuspocus HTTP API   ▼
    ├─ gitLog (execFile git)    (agent-write-md,      runPipeline (Stage[])
    ├─ grep   (execFile grep)    backlinks, etc.)     │
    ├─ cat    (fs.readFile)                           ▼
    └─ runShell (exec /bin/sh)                  extractReferencedPaths
           ▲                                          │
           │                                          ▼
    setProjectDir(projectDir)                   enrichPath(rel) ×N  ◄── DEP-1
           ▲                                          │
           │                                          ▼
   CatalogStore (IndexMdCatalogStore)          formatOutput(raw + meta block)
   (.open-knowledge/catalogs/<path>/INDEX.md)
           │
           └── parseFrontmatter(content, Zod schema)
```

### Enrichment data sources (where each field comes from today)

Source: `read-document.ts:127-170`, `search.ts:55-117`, `catalog-store.ts:22-61`.

| Field | Origin | Call path |
|---|---|---|
| `title` | frontmatter | `readFile(abs)` → `parseFrontmatter(content, ArticleFrontmatterSchema)` (`read-document.ts:146`) |
| `description` | frontmatter | same |
| `tags[]` | frontmatter | same |
| `backlinkCount` | Hocuspocus `/api/backlinks?docName=` | `fetchBacklinks()` (`read-document.ts:88-119`) — null when server unreachable |
| `modified` | **Not surfaced today** — git log `date` proxy exists (`bash/index.ts:140`) but no fs.stat mtime |
| `catalogCategory` / folder | INDEX.md per parent dir | `CatalogStore.getCatalog(parentDirOf(relPath))` |
| git history | `git log -N --format=%h|%ai|%s -- path` | `bash/index.ts:gitLog` (execFile, not shell) |

### Hocuspocus dependency

- `exec` inherits the **graceful-degrade** contract from `read_document`: backlinks omitted when Hocuspocus unreachable (SPEC FR9). Detection via `detectHocuspocus()` (`server.ts:84-95`) hitting `/api/agent-undo-status`.
- Hocuspocus base URL is passed to tools as `serverUrl` (converted ws→http in `server.ts:252`).

### Upstream: `setProjectDir` + `projectDir` coupling

- `server.ts:255` calls `setProjectDir(projectDir)` once at MCP startup.
- Every bash primitive resolves against module-level `projectDir` (`bash/index.ts:48`).
- `cat()` has a hard guard: `!abs.startsWith(projectDir + '/')` → throw (`bash/index.ts:127-129`). This is the existing path-traversal check `exec` will reuse per SPEC FR8 / Q10.

---

## 3) Entities & terminology

| Term | Definition | Source |
|---|---|---|
| **`exec`** | Single proposed MCP tool, signature `exec(command: string)`. Accepts bash-like command strings scoped to content directory, read-only. One tool, combinatorial via pipes. | SPEC §9, PROJECT V0-24 |
| **Semantic tool** | A typed, single-purpose MCP tool (e.g., `read_document`, `search`, `get_backlinks`). Structured zod schema, domain vocabulary. 15 currently registered. | `tools/index.ts` |
| **EnrichedMeta** | Shape appended per path reference: `{ title, description, tags[], backlinkCount, modified, catalogCategory, path }`. | SPEC §9 |
| **Allowlist** | Set of permitted first-tokens + allowed flag patterns; `parseCommand` is the *sole* security boundary (SPEC §9). Denies `rm`/`mv`/`cp`/redirections/subshells/backticks/`&`. | SPEC §3, §9 |
| **Pipeline stage** | One command in a pipe chain (`grep foo | head -5` → `[{cmd:'grep',args:['foo']},{cmd:'head',args:['-5']}]`). Each stage executes via `execFile` (no shell), connected by node-level streams. | SPEC §9 |
| **Path reference** | A project-relative path emitted in stdout that the enrichment pass resolves. Extraction is per-command (grep: parse `path:line:text`; ls: filename; cat: arg). | SPEC Q3 |
| **Content dir** | `projectDir` for v0 — set once at MCP startup via `setProjectDir`. Note: CLAUDE.md symlink policy (§packages/server symlinks) applies: realpath-based identity; escape check refuses writes outside contentDir. `exec` reuses `bash/index.ts:cat`'s `abs.startsWith(projectDir + '/')` check. | `bash/index.ts:127`, CLAUDE.md |
| **L2 prompting** | "Demote semantic tools, keep registered." D2 LOCKED. Reversible by single INSTRUCTIONS edit. L3 = unregister. | SPEC D2 |
| **CC9** | Cross-cutting concern #9 — MCP enrichment quality bar. "Enriched responses beyond what native tools provide." | PROJECT §CC9 (line 1017, 1025) |
| **DEP-1** | Shared `enrichPath()` factored as prerequisite PR before V0-24 impl. Addresses CC9 drift risk. | SPEC D4, A2 |
| **`runShell`** | `bash/index.ts:109` — uses `child_process.exec` (shell-interpreted). Not usable for `exec` tool directly per spec §8 note — would re-introduce injection risk. | `bash/index.ts:32`,`109` |
| **AgentIdentity** | From V0-14 / collab audit — `{connectionId, clientInfo, label, displayName, colorSeed}` per MCP initialize. Not in `exec` scope. | PROJECT V0-14 |

---

## 4) Patterns

### MCP tool registration convention

Source: `packages/cli/src/mcp/tools/shared.ts`, plus every existing `register(...)` function.

1. **One file per tool** in `packages/cli/src/mcp/tools/<name>.ts`.
2. **Exports:** `DESCRIPTION` constant (markdown string) + `register(server, deps?)` function.
3. **Register signature:** `server.tool(name, DESCRIPTION, zodSchemaObj, handler)` — schema is a zod **object shape** (not `z.object(...)`), handler receives typed args.
4. **Error convention:** return `textResult(msg, true)` with `isError: true`. Never throw out.
5. **HTTP errors:** `HOCUSPOCUS_NOT_RUNNING_ERROR` constant (`shared.ts:25`) when `serverUrl` missing.
6. **Aggregation:** `tools/index.ts` imports each tool's `DESCRIPTION` (alias on import) + `register`; adds to `TOOL_DESCRIPTIONS` map (used by `INSTRUCTIONS` interpolation in `server.ts:79-81`); calls `register(...)` in `registerAllTools`.

### Test conventions

- Co-located `*.test.ts` (Bun runner). Examples: `shared.test.ts`, `server.test.ts`, `bash/index.test.ts`.
- `bash/index.test.ts` (60+ lines inspected) uses tmpdir, `setProjectDir(root)`, `beforeAll`/`afterAll` for fs scaffolding. Covers `shellEscape` edge cases, `cat` path escape, `grep` parse, `gitLog` no-repo tolerance.
- Precedent for hostile-input tests: SPEC §14 risk row 1 calls for "dedicated hostile-input test file."

### Bash substrate discipline

`bash/index.ts` top comment (lines 1-31):
- D1 rationale: "just-bash doesn't ship a `git` command" → rejected for local.
- Interface is stable; "if cloud deployment later wants sandboxed execution, we swap the implementation here without touching any tool code."
- Only `runShell` uses shell; `grep` and `gitLog` use `execFile` explicitly "to bypass shell parsing entirely" (`bash/index.ts:141`, `186`).

### Parallelism pattern

`read-document.ts:139-144` — `Promise.all([readFile, gitLog, catalog.getCatalog, fetchBacklinks])` with per-call `.catch(() => defaults)` for graceful degrade. Expected reuse pattern for `enrichPath()`.

---

## 5) Personas & audiences

From SPEC §4 + PROJECT §CC9 + `ai-coding-agent-tool-surfaces/REPORT.md`:

| Persona | Idioms / constraints | Evidence |
|---|---|---|
| **Claude Code** | 30+ native tools in 8 categories, JSON function-calling, strict exact-match str_replace, has native `Bash(command, timeout?)` | `ai-coding-agent-tool-surfaces/REPORT.md:74-76`, `:320` |
| **Cursor** | ~15 tools, two-stage edit (semantic diff + apply model), embeddings stored locally. JSON function-calling. | report:111-143 |
| **Codex CLI** | "Architecturally minimal — a single `shell` tool through which all operations flow." `apply_patch` intercepted internally. Strongest single-exec precedent among major coding agents. | report:147-182 |
| **Doc-authoring agents (P2)** | Existing workflow tools (init-content/ingest/research/consolidate) return instructional text the agent follows. Secondary to `exec`. | SPEC §4, `tools/index.ts:101-105` |
| **Human developers (Tim & team)** | Observe outcomes via editor + PR quality; not direct users. | SPEC §4 |

**Repo docs mentioning agent MCP idioms:** MCP `instructions` field (`server.ts:42-82`), docs site (`docs/` directory), PROJECT V0-26 workstream 2 ("harness integration" — Cursor browser panel, Claude Code macOS app web view, Claude Desktop preview panel).

**Agent harness AGENTS.md / MCP integration:** `ai-coding-agent-tool-surfaces/REPORT.md:47` — "AGENTS.md is the most portable instruction mechanism. Read by Codex (primary), Cursor, Windsurf, Copilot, Claude Code (fallback)."

---

## 6) 3P landscape

**Web channel INACCESSIBLE** (WebSearch denied). All findings below are from in-repo reports.

### Shell-grammar parsers (SPEC Q2 / D7)

- **`shell-quote`** — cited in SPEC §9 ("Dependencies to select (DECISIONS): Shell-grammar parser (candidate: `shell-quote`)"). Already named in SPEC D7. **No in-repo use today** — grep across `/Users/timothycardona/inkeep/open-knowledge` returns zero hits (only SPEC references).
- **No prior-art report on shell parsing** in `reports/CATALOGUE.md`. UNRESOLVED: comparative analysis of `shell-quote` vs `mvdan/sh` vs hand-rolled vs wasm-based candidates — blocked on web channel.

### Virtualized / exec-style MCP servers

Source: `just-bash-virtual-filesystem-analysis/REPORT.md`.

- **`just-bash-mcp`** (Guillaume Maka) — **single `execute_bash(command, timeout?)` MCP tool** over just-bash's InMemoryFs. Works with Claude Desktop + VS Code. Confirms pattern is viable.
- **`bash-tool`** (Vercel Labs) — wraps just-bash as Vercel AI SDK tools (`bash`, `readFile`, `writeFile`). Not MCP.
- **7+ MCP servers** expose shell/exec interfaces; six of seven use a single-tool pattern. "None wraps a virtual filesystem shell (just-bash over a custom IFileSystem)." (`just-bash-virtual-filesystem-analysis/REPORT.md:521`).
- **Official MCP filesystem server** exposes 14 tools; lacks grep/glob/bash (`virtualized-mcp-filesystem-servers/REPORT.md:84`).
- **E2B**: 15 tools, `e2b_execute_code`; container sandbox pattern, not transparent FS proxy.
- **Mintlify ChromaFs**: production scale (30K+ daily conversations); `IFileSystem` interface with 21 methods; used *internally*, exposes 2-tool structured MCP externally.

### Single-exec vs semantic-tools evidence

From `just-bash-virtual-filesystem-analysis/REPORT.md:441-517` and `mcp-tool-interface-design-agent-performance/REPORT.md`:

- **Tool count is the #1 failure predictor.** Microsoft Research: "up to 85% degradation for some models" as tool count increases. GitHub Copilot improved by cutting 40→13 tools. Block rebuilt Linear MCP from 30+→2.
- **Token economics:** single `exec` schema ~50-80 tokens; 6 specialized tools ~600-900 tokens. CLI-vs-MCP analysis found 35× token efficiency for CLI patterns (4,150 vs 145,000 tokens in one real-world task).
- **Composability vs enrichment tension:** "exec() is composable but not enrichable; semantic tools are enrichable but not composable." (`:461, :517`). **Hybrid recommended: 5-6 semantic + 1 exec = 6-7 total.**
- **Mini-SWE-agent achieves 74% on SWE-bench with only bash.** Augment found grep beats embeddings on SWE-bench.
- **Semantic search still wins at scale:** Cursor A/B: +12.5% accuracy, +2.6% retention on 1000+ file codebases. SocratiCode: 61% fewer tokens, 84% fewer tool calls vs grep-only at 2.45M lines.

### "Prior art for enriched-bash MCP" specifically

The hybrid pattern proposed in SPEC (raw stdout + appended enrichment block) is **not directly documented in the in-repo reports** as shipped prior art. The reports frame exec vs semantic as a tradeoff; Open Knowledge's move is to *combine* both in one tool — UNRESOLVED whether any 3P server does the same (blocked on web channel). Closest adjacent: `just-bash-virtual-filesystem-analysis/REPORT.md:513` notes "MCP-level enrichment (recommended) wraps exec() results and adds metadata in the MCP response layer" — an architectural sketch, not a shipped reference.

---

## 7) Prior research (reports)

Scanned `reports/CATALOGUE.md` — **4 reports directly relevant**:

| Report | Why relevant | Priority read |
|---|---|---|
| `just-bash-virtual-filesystem-analysis/REPORT.md` | Direct prior-art analysis of single-exec MCP pattern. Resolves the composability-vs-enrichment tradeoff; documents `just-bash-mcp`, `bash-tool`, and 6 of 7 single-tool MCP shell servers. D1 rationale in `bash/index.ts` explicitly references this report's findings. | **HIGHEST** |
| `mcp-tool-interface-design-agent-performance/REPORT.md` | Tool count is #1 failure predictor. 6-7 tool sweet spot. "Tool description IS the interface." Context7/Mintlify/Mem0 all ship 2 tools. | **HIGH** |
| `virtualized-mcp-filesystem-servers/REPORT.md` | Official MCP filesystem server gaps (grep/glob/bash missing). E2B, SSH, Docker pattern comparison. ChromaFs coarse+fine search pattern. | HIGH |
| `ai-coding-agent-tool-surfaces/REPORT.md` | Claude Code/Cursor/Codex/Cline/Windsurf/OpenHands tool inventories + idioms. Confirms Codex routes everything through a single `shell` tool — strongest direct analog for `exec`-primary posture. AGENTS.md portability note. | HIGH |

**Secondary-relevant:**
- `crdt-mcp-filesystem-bridge/REPORT.md` — Translating FS ops to CRDT. Relevant for the spec's NG1 "writes exclusively through semantic tools (CRDT-aware)."
- `kb-index-navigation-patterns-for-agents/REPORT.md` — Enriched catalogs, frontmatter metadata, index-first navigation. Relevant for enrichment field selection.
- `frontmatter-schema-conventions-for-agent-readable-docs/REPORT.md` — Fumadocs/Mintlify/Fern frontmatter conventions. Relevant for `EnrichedMeta` title/description/tags field shape.
- `onboarding-multiproject-ux/REPORT.md` — MCP `instructions` field patterns.

---

## 8) Current state — read/list/grep request flow today

Trace of what happens when an agent reads a wiki file right now (before `exec` exists):

```
agent calls read_document({ path: "articles/auth/sso.md" })
  │
  ▼  server.tool handler (read-document.ts:183-191)
  ▼
buildReadResult(args, deps)       [read-document.ts:127]
  │
  ├─ toProjectRelative(projectDir, args.path)   [catalog-store]
  ├─ pathToDocName(relPath)  → strips .md
  ├─ resolve(deps.projectDir, relPath)
  │
  ▼ Promise.all (parallel):
  │    ├─ readFile(abs, 'utf-8')                [fs, critical]
  │    ├─ gitLog(relPath, historyDepth, since)  [bash/index.ts: execFile git]
  │    ├─ catalog.getCatalog(parentDir)         [catalog-store → INDEX.md]
  │    └─ fetchBacklinks(serverUrl, docName)    [httpGet /api/backlinks]
  │
  ▼ parseFrontmatter(content, ArticleFrontmatterSchema)
  ▼ compose markdown: ## title / Description / Tags / Path / folder line /
  │                   ### Recent changes (git) / ### Backlinks (N) / ### Content
  ▼
textResult(body)  →  MCP client
```

**Search** (`search.ts:55-117`): `grep(query, {caseInsensitive, include, exclude, maxResults:N+1})` via `execFile grep -rn -F` (`bash/index.ts:185-248`) → `groupByFile` → `Promise.all(catalog.getArticleMeta per path)` → compose groups with title/tags/description + line numbers.

**List** (`list-documents.ts:26-35`): Pure HTTP passthrough → `GET /api/documents[?dir=]` → `JSON.stringify(data, null, 2)`. **No enrichment** (V0-26 Now gap).

**Native Bash today:** agents compose `Bash("grep 'x' **/*.md | head -5")` + `Bash("curl $PORT/api/backlinks?docName=...")` + `jq '...'` — three tool calls, no unified enrichment.

---

## 9) Unresolved / adjacent

### From SPEC itself (open questions, restated for worldmodel)

All 10 questions (Q1-Q10) in SPEC §11 are open. P0 blockers: Q1 (allowlist membership), Q2 (parser choice), Q3 (path extraction strategy), Q4 (CC9 parity shape).

### Cross-cutting architectural precedents from `stories/collaboration-capabilities-audit/STORY.md §13`

CLAUDE.md surfaces eight greenfield precedents; three apply directly to this spec:

1. **Precedent 5 — Contract-first MCP tools:** "We define the MCP protocol; clients conform. Required parameters are required, not optional-with-fallback. Document the contract." → Direct implication for `exec(command)` zod schema: `command` is required string, no optional fallback, and the tool description is the contract (SPEC FR12).
2. **Precedent 1 — Typed transaction origins:** `LocalTransactionOrigin` objects, never raw strings. Not in `exec` scope (no CRDT mutations) but shapes how future `exec`-triggered writes would be tagged if NG1 ever relaxed.
3. **Precedent 7 — Remove broken capabilities rather than shipping them:** Relevant to L3 (NG5) decision — if `exec` subsumes a semantic tool, don't leave a broken-overlap scaffold.

Source: `stories/collaboration-capabilities-audit/STORY.md:154, :459`, CLAUDE.md lines 89-101.

### Parallel in-flight work

- **V0-26 (Now, Tim):** `list_documents` enrichment — adds title / description / tags / backlinkCount / modified / catalogCategory. This is **the same shape** `exec` will need per-path. SPEC D4/A2 locks DEP-1 (shared `enrichPath()`) as prerequisite. If V0-26 ships `list_documents` enrichment *without* factoring `enrichPath()` out first, `exec` risks CC9 drift (SPEC risk row 3).
- **V0-4 (Dima primary, Tim MCP):** file-ops MCP tools (`delete_document`, `move_document`, `duplicate_document`, `create_folder`). Writes — **out of `exec` scope per NG1**. Cross-reference only.
- **V0-21 (Mike primary, Tim MCP):** `find_dead_links` MCP tool. Potential future `okl dead-links` under NG3 future-work Tier 3.
- **PR #39 / V0-16:** `rollback_to_version` MCP tool (TQ15) ships pre-merge. Adds to tool count — `exec` will share the registered surface when it lands.

### Known/listed gaps

- **No shared `enrichPath` helper today.** Enrichment is duplicated between `read-document.ts:127-170` and `search.ts:55-117`. `list_documents` has none. SPEC §8 flags this as CC9 failure mode.
- **`runShell`'s shell-interpretation makes it unusable for `exec` directly.** SPEC §8 bullet (b). `exec`'s runPipeline needs `execFile` per stage.
- **`modified` field not surfaced anywhere today.** Enrichment spec wants it (SPEC §9 data model); closest existing data is `gitLog` date (`bash/index.ts:140`) — distinct from fs mtime.
- **No allowlist infrastructure exists.** Greenfield for this spec.

### Adjacent threads

- **ADJACENT:** Symlink handling (CLAUDE.md §packages/server). `exec`'s path-traversal check should align with the realpath-based identity model in `file-watcher.ts`. SPEC risk row 8 flags this.
- **ADJACENT:** Provider pool coordination (PROJECT CC4). Not relevant to read-only `exec`; would become relevant if NG1 ever relaxed.
- **ADJACENT:** Streaming MCP output (NG7). MCP SDK affordances; not in scope.

### INACCESSIBLE

- **Web probes:** WebSearch permission denied. Could not independently verify `shell-quote` API surface for subshell/redirection detection (SPEC Q2), npm ecosystem for alternative parsers, or current Claude Code / Cursor MCP client behavior (SPEC A4).
- **OSS repos cache:** `~/.claude/oss-repos/` not present — could not inspect just-bash or bash-tool source directly. In-repo reports are the sole 3P evidence source.

---

## Quality check

- [x] **Contradictions:** None silently resolved. Reports converge on 6-7 tool sweet spot + exec-as-escape-hatch; SPEC adopts the inverse (exec-primary, semantic demoted) — reported in §6 as explicit divergence between in-repo prior-art synthesis and this spec's D1/D2 decisions.
- [x] **Confidence-prose match:** SPEC decisions tagged as LOCKED where locked; shell-parser choice flagged UNRESOLVED.
- [x] **Completeness:** All accessible channels contributed. Web + OSS INACCESSIBLE, flagged.
- [x] **Non-prescription:** No evaluations or recommendations; only topology.
