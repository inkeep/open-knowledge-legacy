# Audit Findings

**Artifact:** specs/2026-04-14-mcp-agent-attribution/SPEC.md
**Audit date:** 2026-04-14
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Finding 1: ActivityEntry shape mismatch between spec's target pipeline and existing type

**Category:** COHERENCE
**Source:** L1, L4
**Location:** Section 7.3 (HTTP API Identity Acceptance), Section 16 (Agent Constraints SCOPE)
**Issue:** Section 7.3 shows the target activity map entry shape as `{ agentId, timestamp, action: { kind: 'write', metadata: { position, docName } }, visibility: 'flash' }`. The current `ActivityEntry` type in `packages/core/src/types/awareness.ts` is `{ agentId: string; timestamp: number; type: 'insert' | 'replace' | 'delete'; description?: string }`. These shapes are structurally incompatible. The spec's SCOPE section lists `awareness.ts` only as "if type changes needed" -- but the target pipeline code requires a type change. STORY.md S13 decision D11/TQ11 mandates refactoring the activity-map schema to `{ actor, timestamp, action: {kind, metadata}, visibility }`, which is what Section 7.3 uses, but this spec never declares TQ11 as a prerequisite or in-scope dependency. An implementer following the spec will either (a) hit a type error when writing the Section 7.3 code, or (b) unknowingly execute TQ11 as part of this work without it being scoped, tested, or accepted.
**Current text:** Section 7.3: `activityMap.set(agentId, { agentId, timestamp: Date.now(), action: { kind: 'write', metadata: { position, docName } }, visibility: 'flash' });`
**Evidence:** `packages/core/src/types/awareness.ts` lines 19-25 define `ActivityEntry` as `{ agentId: string; timestamp: number; type: 'insert' | 'replace' | 'delete'; description?: string }`. STORY.md S13 TQ11 (activity-map schema refactor) is listed as a separate open tech question.
**Status:** INCOHERENT
**Suggested resolution:** Either (1) add TQ11 (activity-map schema refactor) as a prerequisite in Section 9 Phase 1, add `awareness.ts` to the definite SCOPE list, and add acceptance criteria for the type migration, or (2) rewrite the Section 7.3 code snippets to use the current `ActivityEntry` shape (`type: 'insert'`, `description`) and defer the schema migration. Option 2 is simpler and keeps scope tight.

---

### [H2] Finding 2: DEFAULT_AGENT_ID removal contradicts its own backward compatibility requirement

**Category:** COHERENCE
**Source:** L1
**Location:** Section 7.8 (DEFAULT_AGENT_ID Removal), AC-2, AC-8
**Issue:** Section 7.8 first says "remove `DEFAULT_AGENT_ID` constant" and "Remove `DEFAULT_AGENT_ID` export from `server/src/index.ts`" and "All imports of `DEFAULT_AGENT_ID` in `api-extension.ts`". AC-8 formalizes this: "DEFAULT_AGENT_ID constant is removed from agent-sessions.ts" and "DEFAULT_AGENT_ID export removed from server/src/index.ts". But then Section 7.8 immediately says "The constant remains as a fallback for backward compatibility." AC-2 also says "Callers without agentId fall back to DEFAULT_AGENT_ID (backward compat)." These directly contradict -- you cannot remove a constant and also keep it as a fallback. The likely intent is to replace the named constant with an inline fallback string, but the spec text and acceptance criteria are logically inconsistent as written.
**Current text:** Section 7.8: "After all consumers are updated to accept dynamic identity, remove: `DEFAULT_AGENT_ID` constant [...] The constant remains as a **fallback** for backward compatibility"
**Evidence:** AC-8 says "removed" four times. AC-2 says "fall back to DEFAULT_AGENT_ID." These cannot both be true simultaneously.
**Status:** INCOHERENT
**Suggested resolution:** Clarify that the *named constant* is removed (no more `export const DEFAULT_AGENT_ID`) but the *fallback value* `'claude-1'` is inlined at the usage site in `api-extension.ts` as a backward-compat default. Rewrite AC-8 item 4 to say "Fallback behavior preserved via inline default value (not named constant)" and AC-2 item 5 to reference the inline value.

---

## Medium Severity

### [M1] Finding 3: ok-contributors format is ambiguous for display names containing spaces

**Category:** COHERENCE
**Source:** L1, Phase 2 reader pass
**Location:** Section 7.5 (Contributor Accumulator), evidence/l2-attribution-design.md
**Issue:** The `ok-contributors:` commit message format uses space-delimited fields: `agentId displayName docName`. The evidence file shows `agent-abc123 claude-code intro.md,setup.md`. If a display name contains spaces (e.g., user sets `AGENT_LABEL="My Research Agent"` per Section 7.7), the parser cannot distinguish where the display name ends and the docName begins. The format is also comma-delimited for multiple docs per agent (`intro.md,setup.md`) but this is not explicitly specified in the spec body -- only shown in evidence. The `drainContributors()` code in Section 7.5 formats as `${agentId} ${displayName} ${docName}` with no escaping or quoting.
**Current text:** Section 7.5: `lines.push(\`  ${agentId} ${displayName} ${docName}\`);` and evidence: `agent-abc123 claude-code intro.md,setup.md`
**Evidence:** Section 7.7 allows arbitrary user labels: `"AGENT_LABEL": "research-agent"`. A label with spaces would break the space-delimited format.
**Status:** INCOHERENT
**Suggested resolution:** Specify a delimiter that cannot appear in display names or doc names. Options: (a) tab-delimited fields, (b) quoted display names, (c) JSON lines format, (d) restrict `AGENT_LABEL` to single-word identifiers. Also explicitly document the multi-doc separator (comma) in the spec body, not just the evidence file.

---

### [M2] Finding 4: Probe script referenced as existing does not exist in codebase

**Category:** FACTUAL
**Source:** T1
**Location:** Section 5 (Current State), Decision Log D1, evidence/mcp-sdk-identity.md
**Issue:** Section 5 states "Probe script -- `packages/cli/scripts/probe-mcp-identity.ts` proves identity extraction live." Decision D1 says "Proven by probe script." The evidence file references both `probe-mcp-identity.ts` (server) and `probe-mcp-identity-test.ts` (test harness). Neither file exists in the codebase. Only `packages/cli/scripts/probe-exec.ts` and `packages/cli/scripts/probe-read-document.ts` exist. This means the identity extraction was either proven via a since-deleted script, proven in a different branch, or the claim is aspirational.
**Current text:** "Probe script -- `packages/cli/scripts/probe-mcp-identity.ts` proves identity extraction live"
**Evidence:** `ls packages/cli/scripts/` shows only `probe-exec.ts` and `probe-read-document.ts`. No `probe-mcp-identity*` files exist at HEAD or baseline commit ce09519.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) add the probe scripts to the repo (they may exist in a local branch or were deleted), or (b) rewrite the evidence to say "identity extraction was verified via a local probe script (not committed)" with explicit steps to reproduce, or (c) commit the probe scripts as part of this spec's deliverables.

---

### [M3] Finding 5: Session eviction rationale assumes same-process architecture that doesn't always hold

**Category:** COHERENCE
**Source:** L3
**Location:** Decision Log D11, Section 13 (Risks)
**Issue:** D11 says "no session eviction for stdio" with rationale "MCP stdio subprocess and Hocuspocus share a process. When the harness kills the subprocess, the entire process exits -- no orphaned sessions possible." This is true for `open-knowledge start` (which embeds Hocuspocus in-process). But the MCP server (`open-knowledge mcp`) can also connect to a *separately running* Hocuspocus instance via `discoverServerUrl()` reading `server.lock`. In that architecture, the MCP stdio process creates DirectConnections via HTTP API calls to the Hocuspocus process. When the MCP process terminates (harness kills it), DirectConnections created in the Hocuspocus process are NOT cleaned up because they're in a different process. The spec's STOP_IF and SCOPE sections correctly scope to stdio transport only, but the rationale for D11 is incomplete for the real deployment topology.
**Current text:** "MCP stdio subprocess and Hocuspocus share a process. When the harness kills the subprocess, the entire process exits -- no orphaned sessions possible."
**Evidence:** `packages/cli/src/commands/mcp.ts` uses `discoverServerUrl()` to connect to a running server. When found, the MCP process makes HTTP calls to Hocuspocus at a different port/process. `AgentSessionManager` sessions are created in the Hocuspocus process, not the MCP process.
**Status:** INCOHERENT
**Suggested resolution:** Revise D11 rationale to distinguish two deployment modes: (1) embedded mode (`start` command -- same process, D11 holds), (2) connected mode (`mcp` command connecting to separate `start` instance -- sessions are in the server process and survive MCP process death). Note that in mode (2), sessions will accumulate but the practical impact is low (memory proportional to N agents x M docs, small in practice). Consider whether a heartbeat or TTL mechanism should be a future work item.

---

## Low Severity

### [L1] Finding 6: Evidence pipeline-trace.md references inaccurate line number for server.ts

**Category:** FACTUAL
**Source:** T1, L4
**Location:** Section 5 (Current State), evidence/pipeline-trace.md
**Issue:** The pipeline trace evidence says hardcoded point #1 is at `server.ts:140` with description "clientInfo never captured." Line 140 of `server.ts` is the `McpServer()` constructor call -- a reasonable location to annotate, but the line does not contain any clientInfo-related code (because the issue is that it's *missing*). The line reference implies there's something at line 140 that should be changed, when the actual fix involves adding entirely new code (the `oninitialized` callback). This is a misleading line reference rather than a factual error.
**Current text:** evidence/pipeline-trace.md: "server.ts:140 | clientInfo never captured"
**Evidence:** `packages/cli/src/mcp/server.ts` line 140 is `const server = new McpServer(`. The missing `oninitialized` hook needs to be added after `server.connect(transport)` around line 159.
**Status:** INCOHERENT
**Suggested resolution:** Change the pipeline trace entry to reference the general area where the fix is needed (e.g., "server.ts:140-159" or "server.ts (between McpServer construction and connect)") or describe it as "nowhere in server.ts" since the code is absent, not hardcoded.

---

### [L2] Finding 7: registerAllTools signature change not explicitly addressed

**Category:** COHERENCE
**Source:** L1, Phase 2 reader pass
**Location:** Section 7.1, Section 7.2, Section 9 Phase 1
**Issue:** Section 7.2 says "Each tool handler receives agentIdentity via closure from registerAllTools()." But the current `registerAllTools()` function has signature `registerAllTools(server, opts: { serverUrl?, projectDir, config })` and delegates to individual `register(server, serverUrl)` functions. Threading `agentIdentity` requires changing either (a) the `RegisterAllToolsOptions` interface to include `agentIdentity`, or (b) the individual tool `register()` signatures. The spec's Phase 1 file list includes `tools/index.ts` and individual tool files, but doesn't explicitly call out the signature changes needed in `RegisterAllToolsOptions` and each tool's `register()` function. An implementer would figure this out, but the spec should be explicit about the interface change given that it's a cross-file API surface.
**Current text:** "Each tool handler receives agentIdentity via closure from registerAllTools()"
**Evidence:** `packages/cli/src/mcp/tools/index.ts` shows `registerAllTools(server, opts)` where `opts: RegisterAllToolsOptions = { serverUrl?, projectDir, config }`. Individual tools like `write-document.ts` have `register(server, serverUrl)`.
**Status:** INCOHERENT
**Suggested resolution:** Add a note in Section 7.2 or Phase 1 step listing that `RegisterAllToolsOptions` needs an `agentIdentity` field, and individual tool `register()` signatures change from `(server, serverUrl)` to `(server, serverUrl, agentIdentity)` or similar.

---

## Confirmed Claims (summary)

**T1 (Own codebase) -- confirmed:**
- `DEFAULT_AGENT_ID = 'claude-1'` at agent-sessions.ts:46
- Hardcoded awareness `name: 'Claude'`, `color: '#D97757'`, `icon: 'claude'` at agent-sessions.ts:109-111
- Exactly 6 `DEFAULT_AGENT_ID` references in api-extension.ts at lines 573, 574, 662, 663, 969, 970
- `commitWip()` accepts `WriterIdentity` param (shadow-repo.ts:120-122)
- `parseWriterId()` classifies `agent-*` prefix (shadow-repo-layout.ts:116)
- `ShadowCommit` has `writerId`, `writerName`, `writerClassification` fields
- `WriterIdentity` is `{ id, name, email }` (shadow-repo.ts:31-35)
- shadow-log.ts uses `'--format=%H|%aI|%an|%s'` pipe-delimited format (line 94)
- save-version.ts calls httpPost with no body (line 22)
- `ActivityEntry` type has `{ agentId, timestamp, type, description }` shape

**T2/T3 (SDK verification) -- confirmed:**
- `McpServer.server` is `readonly server: Server` (mcp.d.ts:18)
- `Server.getClientVersion()` returns `Implementation | undefined` (index.d.ts:125)
- `Server.oninitialized?: () => void` callback exists (index.d.ts:84)
- `Implementation` type requires `name` + `version`, optionals: `title`, `description`, `websiteUrl`, `icons`
- SDK version 1.29.0 installed, access path is valid

**Design decisions -- confirmed coherent with STORY.md:**
- AgentIdentity struct aligns with STORY.md S14 D12 definition
- Per-agent sessions keyed by `(docName, agentId)` aligns with D5
- `ok-contributors:` commit message approach aligns with D3 (honest composite)
- Contributor accumulator approach addresses the L2 debounce coalescing problem correctly

## Unverifiable Claims

- **Cross-harness clientInfo.name values** (Cursor="cursor", Windsurf="cascade", Cline="cline", Copilot="copilot", Codex="codex"): Marked INFERRED in evidence. Cannot verify without connecting each harness. The probe script that could verify them is not committed to the repo.
- **Probe script live verification results**: The evidence claims Claude Code v2.1.101 sent specific clientInfo JSON. Without the probe scripts in the repo, the verification cannot be reproduced.
