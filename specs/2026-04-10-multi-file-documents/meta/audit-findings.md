# Audit Findings

**Artifact:** specs/2026-04-10-multi-file-documents/SPEC.md
**Audit date:** 2026-04-10
**Total findings:** 5 (1 high, 3 medium, 1 low)

---

## High Severity

### [H1] Finding 1: Observer cleanup vs provider disconnect ordering is contradicted within the spec

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 7 (Sequence Diagram), Section 8.2 (Observer lifecycle), Section 9 (Risks)
**Issue:** The spec gives contradictory ordering for eviction cleanup. The sequence diagram (lines 208-210) shows `provider.disconnect()` BEFORE `observerCleanup()`. Section 8.2 (line 263) states "observerCleanup() is called before provider.disconnect()." The Risks table (line 411) sides with the sequence diagram: "Disconnect provider first (stops Y.Doc updates), then run cleanup."

**Current text (sequence diagram):**
> "Pool->>HP: provider.disconnect() [evicted doc]
>  Pool->>Pool: Call observerCleanup() [evicted doc]"

**Current text (section 8.2):**
> "On eviction or explicit close, observerCleanup() is called before provider.disconnect()"

**Current text (Risks):**
> "Disconnect provider first (stops Y.Doc updates), then run cleanup"

**Evidence:** Three sections within the same spec give two different orderings. The sequence diagram and Risks table say disconnect-then-cleanup; section 8.2 says cleanup-then-disconnect. An implementer will get conflicting instructions depending on which section they read.
**Status:** INCOHERENT
**Suggested resolution:** Pick one ordering and make all three locations consistent. The Risks table's rationale (disconnect first stops Y.Doc updates, preventing observer callbacks from firing on a disconnecting doc) is the stronger argument. Update section 8.2 to match the sequence diagram and Risks table.

---

## Medium Severity

### [M1] Finding 2: AgentUndoButton is described as "already decoupled" but code shows no docName parameter

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 8.4.1 (AgentUndoButton refactor), evidence/provider-lifecycle.md
**Issue:** The evidence file (provider-lifecycle.md) states "AgentUndoButton polls HTTP API with docName param -- already decoupled." This is misleading. The actual code (`packages/app/src/presence/AgentUndoButton.tsx` lines 35, 65, 82) polls `/api/agent-undo-status` and sends undo/redo requests WITHOUT any `docName` parameter. Section 8.4.1 of the spec correctly identifies this as needing a refactor. The evidence file's "already decoupled" characterization contradicts the spec's own section 8.4.1 which lists changes needed.

**Current text (evidence):**
> "AgentUndoButton polls HTTP API with docName param -- already decoupled"

**Evidence (code):**
- `AgentUndoButton.tsx:35`: `const res = await fetch('/api/agent-undo-status');` (no docName)
- `AgentUndoButton.tsx:65`: `const res = await fetch('/api/agent-undo', { method: 'POST' });` (no docName)
- `AgentUndoButton.tsx:82`: `const res = await fetch('/api/agent-redo', { method: 'POST' });` (no docName)

**Status:** CONTRADICTED
**Suggested resolution:** Fix the evidence file to say "AgentUndoButton polls HTTP API WITHOUT docName param -- must be updated to pass docName for multi-file support." The spec's section 8.4.1 already has the correct analysis; only the evidence file needs correction.

---

### [M2] Finding 3: Assumption A4 references incorrect file location

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 12 (Assumptions), row A4
**Issue:** A4 states the health check is "Already verified at startup (server.ts:82-110 optional health check)." The file reference is ambiguous -- it refers to `server.ts` without a package qualifier. The actual health check lives in `packages/cli/src/mcp/server.ts` (the `detectHocuspocus` function, lines 82-93), not in the server package's standalone.ts. Additionally, this health check runs at MCP server startup, not at Hocuspocus server startup. The assumption is about "The MCP server can reach the Hocuspocus HTTP API when both are running" -- the detection runs once on MCP server init but does not continuously verify reachability.

**Current text:**
> "Already verified at startup (server.ts:82-110 optional health check)"

**Evidence:** `packages/cli/src/mcp/server.ts:82-93` contains `detectHocuspocus()` which does a one-shot fetch to `/api/agent-undo-status` with a 2-second timeout. It runs once at MCP startup and does not retry or re-check. The actual function spans lines 82-93 (not 82-110).

**Status:** INCOHERENT
**Suggested resolution:** Update A4's verification to: "One-shot detection at MCP startup (`packages/cli/src/mcp/server.ts:82-93`, `detectHocuspocus()`). Does not continuously verify -- MCP tools will fail if Hocuspocus stops after initial detection." This also reinforces D11's error behavior design (tools check reachability per-request).

---

### [M3] Finding 4: MCP tool revival section omits `update_frontmatter` from the deferred-tools list without explicit decision

**Category:** COHERENCE
**Source:** L4 (Evidence-synthesis fidelity)
**Location:** Section 6.4 (MCP Write Tools), evidence/mcp-api-surface.md
**Issue:** The evidence file lists 5 write tools that were D1-deferred: `write_document`, `edit_document`, `update_frontmatter`, `undo_agent_edit`, `redo_agent_edit`. Section 6.4 revives 4 of these but defers `update_frontmatter` with a brief note: "update_frontmatter deferred -- can be composed from edit_document." However, the Decision Log has no entry for this deferral, and the Future Work section does not mention it. The commented code (tools.ts lines 254-301) shows `update_frontmatter` is a non-trivial tool that parses YAML frontmatter, merges fields, and writes back -- it is not trivially composable from `edit_document` without the agent reimplementing the same YAML parsing logic.

**Current text:**
> "update_frontmatter deferred -- can be composed from edit_document"

**Evidence:** The commented code at `packages/cli/src/mcp/tools.ts:254-301` shows `update_frontmatter` extracts existing frontmatter via regex, parses key-value pairs, merges with new fields, and writes back. An agent using `edit_document` would need to replicate this logic (read current frontmatter, parse YAML, merge, construct new frontmatter block, call edit with find/replace). The claim "can be composed from edit_document" is technically true but understates the complexity.

**Status:** INCOHERENT
**Suggested resolution:** Either (a) add `update_frontmatter` to the revival list since the implementation already exists and frontmatter editing is a common agent operation, or (b) add a Decision Log entry (D12) explicitly recording the deferral with rationale, and add it to Future Work as "Explored." The current one-line mention is insufficient for a tool that existed, was deferred, and has a working reference implementation.

---

## Low Severity

### [L1] Finding 5: Spec's CLAUDE.md says "D1-deferred write tools commented in packages/cli/src/mcp/tools.ts" but the code is actually live (not just commented)

**Category:** FACTUAL
**Source:** T1 (Own codebase)
**Location:** Section 5 (Current State, MCP subsection)
**Issue:** The spec says the MCP write tools are "D1-deferred, tools commented out" and "D1-deferred write tools commented in `packages/cli/src/mcp/tools.ts`." Looking at the actual file, the tools are inside a `/* ... */` block comment AND the file has `export {};` making it a no-op module. This is accurate -- the tools are commented out. However, the tools are technically still registered via `registerTools()` function inside the comment block. More importantly, the current tool registration happens through a completely different file: `packages/cli/src/mcp/tools/index.ts` which registers the three workflow tools (init-wiki, ingest, research). The spec's section 8.6 ("uncomment and update") may mislead implementers -- the revived tools would need to be registered through the `tools/index.ts` registry pattern, not by uncommenting the old `tools.ts` block.

**Current text:**
> "packages/cli/src/mcp/tools.ts -- uncomment and update"

**Evidence:** `packages/cli/src/mcp/tools/index.ts` is the active tool registry, calling `registerAllTools()` which registers init-wiki, ingest, and research. The old `tools.ts` file exports nothing (`export {};`) and its commented code uses the old `McpServer.tool()` pattern directly. Reviving would require adapting to the current registry pattern, not just uncommenting.

**Status:** INCOHERENT
**Suggested resolution:** Update section 8.6 to clarify that new tools should follow the `packages/cli/src/mcp/tools/` directory pattern (one file per tool, registered via `tools/index.ts`) rather than uncommenting the old monolithic block. The commented code is a reference implementation, not a drop-in revival target.

---

## Confirmed Claims (summary)

**T1 (Own Codebase) -- confirmed:**
- `DOC_NAME = 'test-doc'` hardcoded at TiptapEditor.tsx:23
- Module-level singleton provider at TiptapEditor.tsx:59-100
- `observerCleanup` at module level (line 62)
- `FileSidebar` shows "No files yet." (FileSidebar.tsx:21)
- `safeContentPath` supports nested docNames (persistence.ts:41-47)
- `pathToDocName` correctly strips `.md` and produces relative paths
- `seedLastKnownHashes` recursively walks subdirs (file-watcher.ts:289-308)
- `@parcel/watcher` watches recursively by default
- Missing `mkdir` before `writeFile` at persistence.ts:363 (bug confirmed)
- All HTTP API endpoints default to `test-doc` when no docName provided
- `AgentSessionManager.sessions` is `Map<string, AgentDirectConnection>` (agent-sessions.ts:78)
- EditorHeader shows hardcoded `untitled.md` (EditorHeader.tsx:22)
- SourceEditor receives `ytext` and `provider` as props (SourceEditor.tsx:11-14)
- `usePresence()` takes `provider` parameter and watches `provider.awareness` (use-presence.ts:15-50)
- EditorPane manually tracks provider via useState (EditorPane.tsx:8)
- Activity and metadata maps accessed from `provider.document` (TiptapEditor.tsx:205, 350)
- MCP server currently has 3 workflow tools only (init-wiki, ingest, research)
- 8 tools commented out in tools.ts (3 read, 5 write/edit/undo)
- MCP server does NOT require Hocuspocus (confirmed in server.ts comment and code)
- Undo/redo tools in commented code lack docName parameter

**L1-L7 (Coherence) -- confirmed clean areas:**
- Problem statement (SCR) is internally consistent
- Goals and acceptance criteria align
- Consumer matrix is consistent across sections
- Non-goals temporal tags (NOT NOW, NEVER, NOT UNLESS) are appropriate
- Decision Log entries are well-formed with consistent type/status/confidence
- All 5 Open Questions are marked RESOLVED with clear outcomes
- Scope (section 16) aligns with the sections modified in the design
- Future Work maturity tiers (Explored/Identified/Noted) are applied correctly

## Unverifiable Claims

- **A1 (Y.Doc memory overhead ~3-5x):** The napkin math assumes "avg wiki article ~5KB markdown, Y.Doc overhead ~3-5x -> ~25KB per doc." The 3-5x multiplier for Y.Doc overhead is plausible based on general CRDT knowledge but was not verified against Yjs documentation or benchmarks. The conclusion (250KB for 10 docs) is well within budget regardless of the exact multiplier, so this is low-risk.

- **A3 (HocuspocusProvider disconnect cleanup):** The spec marks this MEDIUM confidence and notes "need to verify no event listener leaks." This was not verified against Hocuspocus source. The concern is valid and should be tested during implementation.
