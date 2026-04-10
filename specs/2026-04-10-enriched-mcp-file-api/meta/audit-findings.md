# Audit Findings

**Artifact:** specs/2026-04-10-enriched-mcp-file-api/SPEC.md
**Audit date:** 2026-04-10
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: STOP_IF contradicts D19 — config schema changes are both forbidden and required

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 13 (Agent constraints) vs. Section 8 (Decision log, D19)
**Issue:** The Agent Constraints section declares `STOP_IF: Changes needed to ... config.yml schema`. However, D19 explicitly introduces a new `mcp.tools` section to the config schema (`mcp.tools.read_file.history_depth`, `mcp.tools.search.max_results`). D17 and D18 also reference these config paths. The spec simultaneously requires and forbids config schema changes.
**Current text:** "**STOP_IF:** Changes needed to Hocuspocus HTTP API, changes to config.yml schema"
**Evidence:** D19: "Config schema: new `mcp.tools` section for per-tool settings" (SPEC.md line 510). D17 references `mcp.tools.read_file.history_depth`. D18 references `mcp.tools.search.max_results`. The current `ConfigSchema` in `packages/cli/src/config/schema.ts` has no `mcp` section at all — it only has `content`, `server`, `persistence`, and `wiki`.
**Status:** INCOHERENT
**Suggested resolution:** Remove "changes to config.yml schema" from STOP_IF, since adding the `mcp.tools` section is an explicit in-scope requirement (D19). Alternatively, if the intent is to flag only *unexpected* schema changes, reword to clarify: e.g., "STOP_IF: Changes to config.yml schema beyond the `mcp.tools` section defined in D19."

---

### [H] Finding 2: SCOPE section omits config schema file despite D19 requiring schema changes

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** Section 13 (Agent constraints, SCOPE) vs. Section 8 (D19)
**Issue:** The SCOPE lists `packages/cli/src/mcp/tools/` (new tool files), `packages/cli/src/mcp/server.ts` (registration, instructions), and `packages/cli/src/wiki/` (catalog system refactor). D19 requires adding an `mcp.tools` section to the config schema, but `packages/cli/src/config/schema.ts` (the Zod config schema) is not listed in SCOPE. Similarly, `packages/cli/src/config/loader.ts` (the YAML hierarchy loader) may need updates to handle the new section. The implementer would need to touch these files to fulfill D19 but they are not in scope.
**Current text:** "**SCOPE:** `packages/cli/src/mcp/tools/` (new tool files), `packages/cli/src/mcp/server.ts` (registration, instructions), `packages/cli/src/wiki/` (catalog system refactor: `.yml` metadata, `_catalog.yml`, watcher updates)"
**Evidence:** Current `ConfigSchema` in `packages/cli/src/config/schema.ts` has four top-level keys: `content`, `server`, `persistence`, `wiki`. No `mcp` key exists. D19 requires `mcp.tools.read_file.history_depth` and `mcp.tools.search.max_results`.
**Status:** INCOHERENT
**Suggested resolution:** Add `packages/cli/src/config/schema.ts` and `packages/cli/src/config/loader.ts` to the SCOPE list. Alternatively, move the per-tool config to hardcoded defaults (removing D19's config requirement) to keep scope narrower.

---

## Medium Severity

### [M] Finding 3: Wiki roots resolve relative to `.open-knowledge/`, but spec examples use project-root-relative paths

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** Section 7 (Proposed solution — tool inputs and examples throughout)
**Issue:** The current codebase resolves `wiki.roots[].path` relative to the `.open-knowledge/` directory (see `paths.ts` line 24: `resolve(okDir, root.path)`). The spec's tool input schemas say paths are "relative to project root or absolute" (line 219). The spec examples use paths like `articles/auth/sso.md` and `../docs/api-guide.md` which appear project-root-relative. The evidence file correctly notes roots resolve relative to `.open-knowledge/` (line 58-68). There is an unstated path resolution model that needs to be explicit: tool input paths need clear resolution semantics — are they relative to project root, to a wiki root, or to `.open-knowledge/`?
**Current text:** `path: string; // relative to project root or absolute` (line 219)
**Evidence:** `paths.ts:24` — `resolve(okDir, root.path)` resolves relative to `.open-knowledge/`. Config defaults show `./articles` which resolves to `.open-knowledge/articles/`. Evidence file line 59-67 confirms this. But tool API examples use `articles/auth/sso.md` (no `.open-knowledge/` prefix), suggesting the tool layer abstracts this away.
**Status:** INCOHERENT
**Suggested resolution:** Explicitly document the path resolution model for tool inputs. The most likely intent: tool input paths are relative to the project root (or a wiki root label), and the tool implementation resolves them against `wiki.roots` entries. This should be stated clearly since the underlying config resolution differs.

---

### [M] Finding 4: Evidence file claim about deferred tool count is slightly inaccurate

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Evidence file `current-architecture.md` line 27-28
**Issue:** The evidence file says "D2-rejected reads (read_document, list_documents, search_documents)" — listing 3 read tools. It also says "D1-deferred writes (write_document, edit_document, update_frontmatter, undo_agent_edit, redo_agent_edit)" — listing 5 write tools, for a total of 8. However, examining `tools.ts`, the commented code contains 8 registered tools, but `read_document` is listed under "D2-rejected" and is actually a read-via-HTTP tool (it calls `httpGet` to `/api/document`). The evidence's characterization is correct. However, the spec references these as "~300 lines" (SPEC.md line 9) and the file is 303 lines total with 32 lines of header — the commented block is ~271 lines. This is a minor accuracy issue.
**Current text:** "Deferred tools reference: `packages/cli/src/mcp/tools.ts` (commented, ~300 lines)" (SPEC.md line 9)
**Evidence:** `tools.ts` is 303 lines total; the commented block (lines 34-302) is 269 lines. "~300 lines" is the total file length including the uncommented header, not the commented code block alone.
**Status:** INCOHERENT
**Suggested resolution:** Minor — either say "~270 lines of commented code" or "303-line file with commented reference implementations." Not load-bearing.

---

### [M] Finding 5: `edit_file` references `/api/agent-patch` but EXCLUDE says Hocuspocus API is out of scope

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 7 (Tool 5: edit_file) vs. Section 13 (Agent constraints)
**Issue:** The `edit_file` tool routes through `POST /api/agent-patch` when Hocuspocus is available (line 378). The EXCLUDE says `packages/server/` is excluded with the parenthetical "(Hocuspocus API stable)." This is internally consistent as long as the existing `/api/agent-patch` endpoint already has the right interface. However, the STOP_IF says "Changes needed to Hocuspocus HTTP API" — the implementer should verify the existing `agent-patch` endpoint accepts `{ docName, find, replace }` as-is. Examining `api-extension.ts`, the endpoint does accept exactly `{ find, replace, docName }` (lines 252-253). This finding is **confirmed safe** — no API changes needed.
**Current text:** N/A
**Evidence:** `api-extension.ts` lines 227-301 — `handleAgentPatch` accepts `{ find, replace, docName }` matching the spec's proposed call signature.
**Status:** CONFIRMED (no action needed)
**Suggested resolution:** None — this checks out. The existing API matches the spec's requirements.

---

## Low Severity

### [L] Finding 6: MCP instructions currently tell agents to use frontmatter — D12 update scope underspecified

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** Section 6 (Requirements — "Update workflow tools to new metadata model") and Section 8 (D12)
**Issue:** The current MCP instructions in `server.ts` (line 65) say "Add YAML frontmatter: `title` (required), `description` (required), `tags` (recommended)." The three workflow tools (`ingest.ts`, `init-wiki.ts`, `research.ts`) all instruct agents to write inline frontmatter. D12 says these should be updated but the requirement row and decision say only "instructions updated to use `write_file` with metadata parameter instead of inline frontmatter." The scope of this update is significant — all three tool files contain detailed frontmatter-writing instructions (ingest.ts lines 28-55, research.ts lines 134-142, init-wiki.ts lines 53-102). The spec doesn't detail how the workflow tool instructions should change, only that they should.
**Current text:** "Update workflow tools to new metadata model... instructions updated to use `write_file` with metadata parameter instead of inline frontmatter" (D12)
**Evidence:** `ingest.ts` line 30: "Prepend this frontmatter:". `init-wiki.ts` line 53: "Add proper frontmatter". `research.ts` line 134: "Set `status: provisional` in frontmatter". All three tools contain multi-line blocks of frontmatter instructions that will need rewriting.
**Status:** INCOHERENT
**Suggested resolution:** Either add a requirement sub-item detailing the instruction changes for each workflow tool, or note that D12 implementation should audit all three tool files and the INSTRUCTIONS constant in `server.ts` for frontmatter references.

---

### [L] Finding 7: Catalog system currently generates INDEX.md (Markdown), not `_catalog.yml` (YAML)

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 7 (Proposed solution — `_catalog.yml` throughout)
**Issue:** The spec proposes `_catalog.yml` files as the catalog format. The current system generates `INDEX.md` files via `catalog.ts` (`generateCatalog()` returns a markdown string, `CATALOG_FILENAME` is `INDEX.md`). The spec correctly frames this as a new design (the metadata tree replaces INDEX.md catalogs), but does not explicitly state that this is a migration from INDEX.md to `_catalog.yml`. The watcher (`watcher.ts`) currently only watches for `.md` changes. The new watcher will need to also watch `.yml` files. This is implicit in the spec's watcher behavior section but the migration from the current INDEX.md system is not called out as a risk or migration step.
**Current text:** The spec's watcher behavior (lines 407-434) describes the target state. No mention of the current INDEX.md → `_catalog.yml` transition.
**Evidence:** `catalog.ts` generates `INDEX.md`. `watcher.ts` line 138: `events.some((e) => e.path.endsWith('.md'))` — only watches `.md` files. The `CATALOG_FILENAME` constant is `INDEX.md`.
**Status:** INCOHERENT
**Suggested resolution:** Add a note to the migration/risks section about the INDEX.md → `_catalog.yml` transition. The current INDEX.md catalog system will be replaced, and the watcher needs to be updated to handle `.yml` files. Consider whether INDEX.md files should be preserved during transition (backward compatibility) or removed.

---

## Confirmed Claims (summary)

**T1 (Own codebase):**
- Hocuspocus detection at startup via `/api/agent-undo-status` — confirmed in `server.ts:82-93`
- Three existing workflow tools (init-wiki, ingest, research) — confirmed in `tools/index.ts`
- Eight commented-out tools in `tools.ts` — confirmed (8 `tool()` registrations in commented block)
- `/api/agent-patch` exists and accepts `{ docName, find, replace }` — confirmed in `api-extension.ts:227-301`
- `/api/agent-write-md` exists and accepts `{ markdown, position, docName }` — confirmed in `api-extension.ts:128-206`
- `wiki.roots` config array with `path` and `label` fields — confirmed in `config/schema.ts`
- Roots resolve relative to `.open-knowledge/` — confirmed in `paths.ts:24`
- Watcher uses `@parcel/watcher` with debounced rebuild — confirmed in `watcher.ts`
- Content-hash dedup prevents infinite loops — confirmed in `watcher.ts:11-24` via `writeIfChanged()`
- Catalog data types (ArticleMeta, SubfolderMeta, IndexMeta) — confirmed in `catalog.ts`
- Tool registration pattern (separate files with `register(server)` export) — confirmed in `tools/index.ts`

**L1-L7 (Coherence):**
- Decision log entries are internally consistent and well-cross-referenced to open questions
- All open questions are resolved with decision references
- The five tool designs are consistent with each other (shared path validation, metadata model, Hocuspocus routing)
- Goals map to requirements and tools (G1→read_file, G2→list_files, G3→search, G4→write_file, G5→instructions, G6→metadata separation, G7→external annotation)
- Risks have mitigations that reference decisions

## Unverifiable Claims

- A3: "`git log` per-file fast enough for read_file" — labeled MEDIUM confidence with "needs measurement at scale." Cannot verify without benchmarking.
- D20: "Optimistic Hocuspocus writes — <5ms localhost" — latency claim cannot be verified without runtime measurement.
- A1: "Wiki scale under ~500 files" — usage claim about current deployments, cannot verify from code.
