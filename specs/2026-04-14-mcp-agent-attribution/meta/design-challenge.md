# Design Challenge: MCP Agent Attribution Spec

**Reviewer:** Claude Opus 4.6 (design challenge role)
**Date:** 2026-04-14
**Spec version:** DRAFT at baseline commit ce09519

---

## Finding 1: The "Honest Composite" (D3) Creates an Unsearchable Attribution Gap

**Severity:** HIGH

**What the spec says:** Shadow repo commits stay attributed to `WriterIdentity { id: 'server' }` with an `ok-contributors:` block in the commit message body. This is "honest" because L2 coalesces multiple agents' writes into a single directory snapshot (evidence/l2-attribution-design.md).

**The challenge:** The spec correctly identifies why per-agent WIP refs don't work for coalesced writes, but it underestimates the cost of the chosen approach. The `ok-contributors:` commit message metadata is a second-class citizen in git's data model:

1. **`git log --author` cannot filter by contributor.** If a user wants "show me all commits where Cursor wrote something," they cannot use standard git tooling. They must use the custom `ShadowCommit.contributors` parser, which only exists in the OK CLI and server. Any git GUI, IDE integration, or third-party tool that reads the shadow repo will attribute everything to "openknowledge-server."

2. **`git blame` is useless for agent attribution.** Every line is blamed on "server." The contributor metadata in the commit message doesn't flow to blame output. This means the primary git attribution primitive is permanently broken for multi-agent scenarios.

3. **The timeline-query.ts implementation (server-side history) does NOT parse `%b`.** The existing `GIT_LOG_FORMAT` in `timeline-query.ts` is `'%H%x00%aI%x00%an%x00%ae%x00%s'` -- subject only, no body. The spec's Phase 4 only extends `shadow-log.ts` (CLI-side reader) with `%b` parsing. The server-side `getDocumentHistory()` in `timeline-query.ts` -- which is what the `/api/history` endpoint and the `get_history` MCP tool actually call -- will NOT see contributors at all. The spec has a gap: the server's own history API won't surface the contributor data this spec adds.

**Alternatives:**

- **Hybrid approach:** Keep `server` as git author (honest composite), but ALSO maintain per-agent WIP refs (`refs/wip/main/agent-<uuid>`) for commits where a single agent is the sole contributor in the L2 window. Only fall back to `server` + `ok-contributors:` when genuine coalescing happens. This gives `git log --author` meaningful results in the common case (single-agent bursts).

- **Structured trailer instead of custom block:** Use `Co-authored-by:` git trailers (standard convention used by GitHub, GitLab). While the spec rejected trailers in D10 citing "no JS API in simple-git," `Co-authored-by` is parsed natively by GitHub's UI and many git tools. The custom `ok-contributors:` format is invisible to every tool except OK's own parser. The "no JS API" argument applies to `git interpret-trailers` but not to writing trailer-format lines in commit messages (which is just string formatting) or parsing them (which is just splitting on `Co-authored-by: `).

**Recommendation:** REVISE. At minimum, fix the timeline-query.ts gap -- the server's own history endpoint must parse `ok-contributors:` or the data is invisible to the timeline UI. Consider the hybrid per-agent-ref approach for the common single-agent case. Consider `Co-authored-by:` trailers as the format instead of `ok-contributors:` for ecosystem compatibility.

---

## Finding 2: Contributor Accumulator Has a Data Loss Window Under Concurrent L2 Commits

**Severity:** HIGH

**What the spec says:** `pendingContributors` is a server-local `Map` that accumulates at write time and drains at L2 commit time (Section 7.5). "Crash between agent write and L2 commit loses contributor metadata" is acknowledged as R-4 but dismissed as "same window where file content needs CRDT recovery."

**The challenge:** The risk assessment conflates two different failure modes:

1. **Content loss** after a crash is recoverable -- the CRDT state is in memory and the last L1 flush is on disk. Hocuspocus can recover from this.

2. **Attribution loss** is NOT recoverable. The `pendingContributors` Map exists only in process memory. There is no L1-equivalent flush for attribution. If the process crashes after 10 agent writes but before the L2 commit (a 30-second window by default), ALL attribution for those writes is permanently lost. The content survives but every write shows as "server" with no contributors. This is qualitatively different from content loss.

More critically, the `drainContributors()` function calls `pendingContributors.clear()` atomically. If `commitWip()` throws after `drainContributors()` has been called but before the commit succeeds (e.g., git lock contention, disk full), the contributor data is lost AND the commit didn't happen. The next successful commit won't have those contributors.

**Alternatives:**

- Move `drainContributors()` to AFTER `commitWip()` succeeds (read then clear pattern instead of drain-and-clear).
- Persist pending contributors to the shadow repo's lock file or a dedicated sidecar file so they survive crashes.

**Recommendation:** REVISE the drain ordering. `drainContributors()` must not clear the map until `commitWip()` succeeds. This is a one-line fix with significant correctness implications. The crash-recovery concern (persisting to disk) can remain deferred, but the drain-after-success ordering is mandatory.

---

## Finding 3: Session Key Collision Between MCP and Non-MCP Callers

**Severity:** MEDIUM

**What the spec says:** Session map key changes from `docName` to `${docName}\0${agentId}` (Section 7.4). Callers without `agentId` fall back to `DEFAULT_AGENT_ID` (Section 7.3).

**The challenge:** The fallback creates a collision surface. If:
- A non-MCP caller (e.g., the agent simulator, a test, a future direct HTTP API user) writes to doc `intro.md` without an `agentId`, it gets session key `intro.md\0claude-1`.
- If the `DEFAULT_AGENT_ID` constant is removed (AC-8) but the fallback string `'claude-1'` is still hardcoded somewhere, the behavior is fragile.
- More importantly, ALL non-MCP callers share the same fallback session. If two non-MCP callers write to the same doc, they collide on the same `DirectConnection` and share awareness state. The spec doesn't acknowledge this as a regression from the current state (which has the same problem but doesn't claim to solve multi-agent isolation).

The spec says both "Remove `DEFAULT_AGENT_ID`" (AC-8) and "Callers without `agentId` fall back to `DEFAULT_AGENT_ID`" (AC-2). These are contradictory. If the constant is removed, what do callers fall back to? The spec needs to clarify whether the fallback uses a hardcoded string literal, a new constant, or generates a unique ID per request.

**Alternatives:**

- Generate a random `agentId` for callers that don't provide one (breaking the session-reuse assumption for non-MCP callers, but providing true isolation).
- Keep `DEFAULT_AGENT_ID` as a constant but rename it to `ANONYMOUS_AGENT_ID` to clarify its role as a fallback, not a primary identity.

**Recommendation:** INVESTIGATE. Clarify the contradiction between AC-8 and the backward-compat fallback. Decide whether non-MCP callers should get unique sessions or share one anonymous session, and document the choice explicitly.

---

## Finding 4: The `oninitialized` Mutation-in-Place Pattern Has a Subtle Race

**Severity:** MEDIUM

**What the spec says:** "The `agentIdentity` object is mutated in place -- tool handlers read from the same reference, so they always see the latest value" (Section 7.1). R-1 acknowledges the timing risk but dismisses it because "Tool calls will never arrive before initialize per MCP spec."

**The challenge:** The race isn't between initialize and tool calls -- it's between the `oninitialized` callback and the tool handler's closure capture. The code creates `agentIdentity` as a `let` binding and reassigns it in `oninitialized`:

```typescript
let agentIdentity: AgentIdentity = { connectionId, displayName: 'Agent', ... };
server.server.oninitialized = () => {
  agentIdentity = { ... clientInfo ... };  // REASSIGNS the variable
};
```

But the tool handlers close over `agentIdentity` via `registerAllTools(server, ...)`. The spec implies tool handlers will read the variable directly, but the current `registerAllTools` signature passes `opts` as a parameter object -- it doesn't close over a mutable variable. The spec's proposed code wouldn't work with the current tool registration pattern without changing how `agentIdentity` is threaded through.

If `registerAllTools` captures `agentIdentity` by value (as a property of an options object), it will freeze the pre-`oninitialized` value. If it captures by reference (closing over the `let` binding), it works but is fragile -- any refactor that moves the tool registration to a different scope would break it.

**Alternatives:**

- Use a `Ref` pattern: `const identityRef = { current: initialIdentity }`. Pass `identityRef` to tool registrations. Mutate `identityRef.current` in `oninitialized`. Tool handlers read `identityRef.current` at call time. This is the same pattern used by `ShadowRef` elsewhere in the codebase.

**Recommendation:** REVISE to use the `Ref` pattern (`{ current: AgentIdentity }`). The codebase already has this pattern in `ShadowRef`. Mutation-in-place of a `let` binding across closure boundaries is a known source of subtle bugs in JavaScript, and the codebase's own idiom provides a safer alternative.

---

## Finding 5: Two Parallel Shadow Log Readers Create a Maintenance Divergence Risk

**Severity:** MEDIUM

**What the spec says:** Phase 4 extends `shadow-log.ts` (CLI-side, in `packages/cli`) with `ShadowContributor` parsing. The server-side has `timeline-query.ts` (in `packages/server`) with its own `getDocumentHistory()`.

**The challenge:** The codebase now has TWO independent shadow repo readers:

1. `packages/cli/src/content/shadow-log.ts` -- used by CLI-side enrichment (the `exec` tool's enriched paths)
2. `packages/server/src/timeline-query.ts` -- used by `/api/history` endpoint and the `get_history` MCP tool

These parse the same git log output but with different format strings, different parsers, and different return types (`ShadowCommit` vs `TimelineEntry`). The spec adds contributor parsing ONLY to the CLI-side reader. This means:

- `get_history` MCP tool (which calls `/api/history` which calls `getDocumentHistory()`) will NOT show contributors
- `exec("cat foo.md")` enrichment (which calls `readShadowLog()`) WILL show contributors
- The timeline UI (PR #39, consuming `/api/history`) will NOT show contributors

This is the exact divergence-by-copy-paste problem that architectural precedent #4 ("shared computation, per-surface rendering") was created to prevent. The contributor parsing logic should live in a shared module (likely `@inkeep/open-knowledge-core`) consumed by both readers.

**Recommendation:** REVISE. Either consolidate the two shadow log readers into a single shared implementation in `core`, or at minimum ensure both readers parse `ok-contributors:`. The spec should add `timeline-query.ts` to the SCOPE section and add `%b` parsing to the server-side reader.

---

## Finding 6: The `ok-contributors:` Format Conflates Agent ID and Display Name Without Quoting

**Severity:** MEDIUM

**What the spec says:** The commit message format is:
```
ok-contributors:
  agent-abc123 claude-code intro.md,setup.md
  agent-def456 cursor auth-flow.md
```

**The challenge:** The format uses space-delimited fields with no quoting. This breaks when:

1. **Display name contains spaces:** `AGENT_LABEL="My Research Agent"` produces `agent-abc123 My Research Agent intro.md` -- the parser cannot distinguish where the display name ends and the doc name begins.

2. **Doc names contain spaces or commas:** `articles/my doc.md` would break the space-delimited parsing. While the current codebase may not have spaces in doc names, the format is a backward-compat surface (per ASK_FIRST) and should be designed for robustness.

3. **Multiple docs per agent use comma separation** (`intro.md,setup.md`), but doc names themselves could theoretically contain commas.

The spec establishes this as a durable format (D10 status: LOCKED, ASK_FIRST before changing) but the format is not robust enough for a committed API surface.

**Alternatives:**

- JSON in the commit body: `ok-contributors: [{"id":"agent-abc","name":"claude-code","docs":["intro.md"]}]`
- Tab-separated fields with proper escaping
- One line per (agent, doc) pair: `ok-contributor: agent-abc123 intro.md` (no display name in the commit message; look up display name from a separate mapping)

**Recommendation:** REVISE the format before it ships. Either use JSON (parseable, extensible, handles all edge cases) or adopt a strict one-line-per-doc format with tab separation. The display name should be quoted or the format should be structured enough to handle spaces. This is a backward-compat surface -- getting it right before first implementation is critical.

---

## Finding 7: No Test Strategy for Multi-Agent Attribution

**Severity:** MEDIUM

**What the spec says:** The spec has detailed acceptance criteria (AC-1 through AC-8) but no test plan. The CLAUDE.md documents extensive test infrastructure (test harness, bridge-matrix, Playwright, fuzz) but the spec doesn't describe how to test multi-agent scenarios.

**The challenge:** Multi-agent attribution is inherently a multi-process concern:

- Two MCP clients connecting simultaneously to the same server
- Two agents writing to the same document within one L2 window
- Contributor accumulator draining correctly under concurrent writes
- Session isolation under concurrent `getSession()` calls

The existing test harness (`createTestServer`, `createTestClient`) is designed for single-agent tests. There's no facility for simulating two MCP connections with different `clientInfo`. The agent simulator (`agent-sim.ts`) uses hardcoded identity. The spec mentions updating the simulator (Phase 4, step 18) but doesn't describe multi-agent test scenarios.

**Recommendation:** INVESTIGATE. Add a test strategy section to the spec. At minimum, the integration test harness needs a `createAgentClient(port, identity)` variant, and there should be explicit test cases for: two agents writing the same doc, contributor accumulator coalescing, session key isolation, and `ok-contributors:` round-trip parsing.

---

## Finding 8: Phase Ordering Has a Hidden Dependency -- Timeline Query Must Be Updated Before Phase 4 Is Useful

**Severity:** MEDIUM

**What the spec says:** Phase 3 adds the contributor accumulator and commit message metadata. Phase 4 extends `shadow-log.ts` to parse it.

**The challenge:** The phasing assumes the CLI-side `shadow-log.ts` is the primary consumer of contributor data. But the primary consumer is actually the timeline UI (PR #39), which reads from `/api/history` (server-side `timeline-query.ts`). Phase 4 extends the wrong reader. 

The correct dependency chain is:
1. Phase 3 writes `ok-contributors:` to commit messages (correct)
2. `timeline-query.ts` must parse `%b` to extract contributors (MISSING from all phases)
3. The MCP `get_history` tool surfaces contributors (MISSING -- depends on step 2)
4. Timeline UI renders contributors (out of scope, PR #39)

Without step 2, the contributor data is written but invisible to the system's primary query surface.

**Recommendation:** REVISE phasing. Add `timeline-query.ts` updates to Phase 4 (or create a Phase 3.5). The `TimelineEntry` type in `@inkeep/open-knowledge-core` needs a `contributors` field. The `GIT_LOG_FORMAT` in `timeline-query.ts` needs `%b`. Without this, the spec delivers attribution data that nothing can read through the primary API.

---

## Finding 9: Agent Color Determinism Has a UX Problem Across Sessions

**Severity:** LOW

**What the spec says:** `colorFromSeed(connectionId)` generates deterministic colors from the `connectionId` UUID (Section 7.4). The `connectionId` is a `randomUUID()` generated per MCP server process startup.

**The challenge:** The same agent (e.g., "Claude Code" running from the same `.mcp.json` config) gets a DIFFERENT color every time the MCP server restarts. This happens on every IDE restart, every `claude code` session, every system reboot. The color is deterministic within a session but random across sessions. This means:

- The presence bar shows a different color for "Claude Code" each session
- The timeline (if it uses colors) shows inconsistent colors for the same logical agent across history
- Users cannot build a mental model of "Claude Code is always blue"

The spec's `colorSeed: connectionId` makes the color stable within a connection but unstable across connections. Since `AGENT_LABEL` is the user-provided stable identifier, seeding from the label (when present) or from `clientInfo.name` would give users consistent colors.

**Alternatives:**

- `colorSeed: label ?? clientInfo.name ?? connectionId` -- prefer stable identity for color, fall back to UUID only when nothing else is available
- Store a color mapping in `.open-knowledge/config.yml` so users can pin colors

**Recommendation:** REVISE. Change `colorSeed` to prefer `label ?? clientInfo?.name ?? connectionId`. This gives stable colors when the agent has a stable identity (the common case) while still providing unique colors for anonymous agents.

---

## Finding 10: The Spec Doesn't Address the `save-version` Identity Gap

**Severity:** LOW

**What the spec says:** Section 7.2 shows `save-version.ts` passing a `writers[]` array to `POST /api/save-version`. But the current `save-version.ts` implementation (lines 19-26) sends an empty POST body with no parameters.

**The challenge:** The spec proposes adding `writers[]` to the save-version POST body, but:

1. The server-side `handleSaveVersion` handler (in `api-extension.ts`) doesn't currently accept or use a `writers` parameter. The spec doesn't show the server-side changes needed to consume it.

2. Save-version creates a checkpoint commit, not a WIP commit. Checkpoint commits use a different code path (`saveVersion()` in `shadow-repo.ts`). The contributor accumulator pattern (drain pending contributors into commit message) doesn't apply here because checkpoints snapshot ALL docs, not just recently-changed ones.

3. The `writers[]` on save-version is semantically different from the contributor accumulator. The contributor accumulator tracks "who wrote what since last WIP commit." A checkpoint is "snapshot everything right now." The spec doesn't clarify what `writers[]` means for a checkpoint -- is it "who requested the save" or "who has contributed since last checkpoint"?

**Recommendation:** INVESTIGATE. Clarify the semantics of `writers[]` on save-version. If it means "who requested the save," the server side needs changes. If it means "who has contributed," it should drain the same accumulator. The spec should either flesh this out or explicitly mark it as out of scope.

---

## Finding 11: The `iconFromClientName()` Map Is Fragile and Not Extensible

**Severity:** LOW

**What the spec says:** A static `ICON_MAP` maps known `clientInfo.name` values to icon identifiers (Section 7.4). Unknown clients get `'bot'`.

**The challenge:** The `clientInfo.name` values for 5 of 7 listed harnesses are INFERRED, not confirmed (evidence/mcp-sdk-identity.md). If Cursor sends `"cursor-mcp"` instead of `"cursor"`, or Windsurf sends `"windsurf"` instead of `"cascade"`, the map silently falls back to `'bot'`. There's no diagnostic logging for unrecognized client names, so users won't know why their agent shows a generic icon.

More importantly, the icon map is in `agent-sessions.ts` (server package), meaning adding support for a new MCP client requires a server-side code change, rebuild, and republish. This is unnecessarily coupled.

**Alternatives:**

- Move the icon map to config (`config.yml`) so users can extend it without code changes
- Log unknown `clientInfo.name` values at INFO level so they're discoverable
- Use a `startsWith` or fuzzy match instead of exact match (e.g., `"cursor-mcp"` matches `"cursor"`)

**Recommendation:** KEEP the static map for v1 but add INFO-level logging for unrecognized client names. This provides enough signal to extend the map without requiring user config changes on day one.

---

## Finding 12: The Spec Misses the `closeSession()` Signature Change

**Severity:** LOW

**What the spec says:** Session keying changes to `(docName, agentId)` and `getSession()` accepts `agentId`. `closeSession()` and `closeAll()` are not mentioned.

**The challenge:** The current `closeSession(docName)` and `closeAll(docName?)` signatures take only `docName`. With the new composite key, `closeSession` needs both `docName` and `agentId` to close a specific session. `closeAll(docName?)` needs to either:
- Close all sessions for a given doc (all agents) -- requires iterating the map by prefix
- Close all sessions for a given agent (all docs) -- requires a different iteration
- Close everything -- current behavior, but the key format changes

The `destroy()` function in `standalone.ts` calls `sessionManager.closeAll()` during shutdown. This will continue to work. But `closeSession(docName)` is called from unknown consumers and the signature change is breaking.

**Recommendation:** REVISE. Add `closeSession(docName, agentId)` and optionally `closeAllForDoc(docName)` to the spec's design. This is a small addition but the current spec leaves the cleanup path underspecified.
