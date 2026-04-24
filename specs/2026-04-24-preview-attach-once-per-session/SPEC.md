# Preview Attach Once-Per-Session — Spec

**Status:** Ready for implementation
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-24
**Baseline commit:** `46751128`
**Supersedes:** [[specs/2026-04-15-preview-url-pre-edit/SPEC]] §FR-9 and §M1 (per-edit navigation mandate). The resolver design (FR-1 through FR-8) is preserved unchanged.
**Builds on:** [[specs/2026-04-14-agent-nav-and-cadence/SPEC]] server-push-nav substrate (`AgentFocusBroadcaster` + `__system__` awareness + `SystemDocSubscriber`).
**Links:**

- Research: [[reports/preview-nav-agent-contract/REPORT]]
- Evidence: ./evidence/
- Changelog: ./meta/\_changelog.md

---

## 1) Problem statement (SCR)

**Situation.** Open Knowledge agents call `get_preview_url(docName)` and then navigate their host's preview browser to that URL **before every** `write_document` / `edit_document`. The mandate is encoded in **three static surfaces** (MCP `instructions` inline in `buildInstructions()`, the user-global Agent Skill at `packages/server/assets/skills/open-knowledge/SKILL.md`, and the `get_preview_url` tool description). **The earlier `CLAUDE_MD_SECTION` injection and shared `PREVIEW_GUIDANCE` constant referenced by spec -15 D11 were removed by **[[specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC]]** D13** — each surface now owns its own wording. In parallel, the server already runs `AgentFocusBroadcaster.setFocus` on every write — pushing focus through `__system__` Y.Doc awareness to any connected editor tab, which then auto-navigates via `SystemDocSubscriber` (with 300ms debounce, pin honor, and a 3-second typing guard).

**Complication.** The two paths overlap after the first write of a session. The per-edit path additionally:

- Adds \~2 redundant tool calls per edit (\~50% overhead on edit-heavy sessions).
- **Bypasses the 3-second typing guard** that server-push honors — strict UX regression.
- Has different semantics per host (`preview_start` takes a launch-config name on Claude Code; `Navigate` takes a URL on Cursor; Codex has no tool).
- Misuses Claude Code's `preview_start` as per-edit nav when the pane is designed to be persistent.
- Accretes compliance drift across 3 surfaces; spec -15 audit explicitly flagged no measurable success metric. Spec -22 D13 killed the shared `PREVIEW_GUIDANCE` constant specifically because it created fake reuse without actually preventing drift — each surface now owns its wording by design.

**Resolution.** Flip the contract: agents open a preview browser **when no editor is attached to the server** (state-based, not event-based). In the normal session — fresh start, no editor open — this collapses to "open once at the beginning." The trigger is the server's `attach-preview-once` hint (fires whenever `systemSubscriberCount === 0` at write time); the action is the agent's host tool (`preview_start` / `Navigate` / equivalent). The existing `AgentFocusBroadcaster` handles all per-edit follow after that. `get_preview_url` stays as an advisory resolver (useful for embedding preview links in doc content). No new infrastructure; reuses everything already shipped in specs -14 and -15.

## 2) Goals

- **G1** — Once a preview is attached (any editor tab subscribed to `__system__`), writes require zero agent-side navigation actions. Server-push delivers focus. This is a **transport-presence** invariant, not a session event — it survives reconnects, compactions, and multi-agent sharing.
- **G2** — When no preview is attached (`systemSubscriberCount === 0`), the next write-tool response includes a structured `action: "attach-preview-once"` hint telling the agent to open a preview browser. The hint fires exactly when needed — at most once in the normal fresh-session case, re-firing cleanly if the user closes all tabs.
- **G3** — No backwards-incompatible change: agents still calling the per-edit pattern continue to work unmodified.
- **G4** — Guidance on each of the three surfaces (MCP instructions, SKILL.md, tool description) is rewritten once-per-session. No shared-constant reuse (spec -22 D13 removed that pattern deliberately); consistency enforced by review + optional drift lint (see §14 FW4).
- **G5** — Server-push user sovereignty (pin + typing-guard + debounce) is preserved — no new nav path bypasses it.

## 3) Non-goals

- **\[NOT NOW]** NG1: MCP resources + subscribe (Shape C). Revisit when MCP Apps iframe embedding is a product direction.
- **\[NOT NOW]** NG2: Retracting `get_preview_url`. The tool remains valid for URL resolution and manual re-navigation; only the mandate changes.
- **\[NOT NOW]** NG3: Multi-agent focus thrashing. Orthogonal concern; spec -14 §FW-7 (multi-agent identity plumbing / Path B) is the closer owner; §FW-3 (presence-bar click-to-follow) addresses the UX affordance once plumbing lands.
- **\[NOT UNLESS]** NG4: Extended telemetry beyond FR9's hint-emission counter (e.g., per-session compliance percentage, time-series dashboards). Revisit when FR9's volume data shows signal worth decomposing.
- **\[NEVER UNLESS]** NG5: Removing server-side push-nav. The entire contract depends on it.

## 4) Personas / consumers

- **P1 — Agent (Claude / any MCP client):** reads the once-per-session rule from skill/instructions; opens preview once via host tool; writes freely thereafter.
- **P2 — Human user:** watches edits land in the editor; pin + typing guard honored regardless of agent behavior.
- **P3 — Downstream integrators (Cursor, Codex, generic stdio clients):** see the updated guidance + structured hint; graceful degradation on hosts without a preview tool.

## 5) User journeys

**J1 — Happy path (fresh session, Claude Code Desktop):**

1. User starts Claude Code; opens OK project.
2. Agent loads OK Skill + MCP instructions — sees "open preview once at session start."
3. Agent calls `preview_start("open-knowledge-ui")` early (or, see J2).
4. Agent calls `write_document("docs/foo", ...)`. Server response includes `previewUrl` and NO warning (subscriberCount > 0).
5. Agent calls `write_document("docs/bar", ...)`. Server-push carries the editor pane to `docs/bar`. Still no warning.
6. Every subsequent write is a single tool call.

**J2 — Happy path via server hint (agent didn't pre-attach):**

1. Fresh session, no preview attached.
2. Agent calls `write_document("docs/foo", ...)`. Server response includes `warning: { action: "attach-preview-once", previewUrl, message }`.
3. Agent reads the hint, calls `preview_start("open-knowledge-ui")` ONCE.
4. Agent calls `write_document("docs/bar", ...)`. Server-push follows; no further warning.

**J3 — Host without a preview tool (Codex, generic stdio):**

1. Agent calls `write_document`. Response includes warning + `previewUrl`.
2. Agent has no tool to open a browser; it surfaces the URL in its chat turn.
3. Human clicks the URL (or ignores). Server-push handles follow if/when human attaches.

**J4 — Backwards compat (agent still uses per-edit pattern):**

1. Agent calls `get_preview_url("docs/foo")` → returns URL (tool still works).
2. Agent navigates host's preview browser (redundant but harmless).
3. Agent calls `write_document` → succeeds. Server-push upserts focus (no-op since preview is on correct doc).
4. No runtime breakage; just wasted work. Note: agents with the old mandate internalized may observe a description-behavior contradiction for 1-2 tool calls — the tool description now says "per-edit navigation is not required" while their cached guidance says otherwise — until the updated SKILL.md + MCP instructions re-anchor. Self-resolves within a session.

**Failure / recovery:**

- User closes the preview tab mid-session → next write emits warning again. Agent re-attaches once.
- Reconnect / compaction → agent re-reads skill/instructions on next tool call; state is stateless per write, so either path works.
- `get_preview_url` returns `null` (server not running) → agent response text already says `"open-knowledge start"` or `preview_start`; unchanged.

**Aha moment:** Agent writes 5 docs in sequence; user watches the editor tab follow along without either party navigating. Compared to today: zero extra tool calls per write.

## 6) Requirements

### Functional requirements

| Priority | ID  | Requirement                                                                                                             | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Notes                                                                                                             |
| -------- | --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Must     | FR1 | Rewrite preview guidance in `buildInstructions()` (inline template literal in `packages/cli/src/mcp/server.ts:202-206`) | Template literal no longer contains "MUST be preceded by `get_preview_url` for every write"; replaced with once-per-session rule text per §9.1.                                                                                                                                                                                                                                                                                                                                                                                                                  | Per spec -22 D13, this surface owns its own wording. No shared constant.                                          |
| Must     | FR2 | Edit SKILL.md preview section (host-specific examples)                                                                  | Section names host examples: Claude Code `preview_start`, Cursor `Navigate`, generic fallback. No per-edit mandate language.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Lines 37-49 of current SKILL.md                                                                                   |
| Must     | FR3 | Update `get_preview_url` tool description to advisory                                                                   | Tool description no longer says "call IMMEDIATELY BEFORE every write"; frames as URL resolver + optional manual re-navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                   | `packages/cli/src/mcp/tools/get-preview-url.ts:30-37`                                                             |
| Must     | FR4 | Write-tool response includes structured `action: "attach-preview-once"` hint when no preview attached                   | Response's `warning` object contains `action: "attach-preview-once"` (new field) + `previewUrl` + `message` when the server's `systemSubscriberCount === 0` (per FR7). Existing `warning` shape otherwise preserved.                                                                                                                                                                                                                                                                                                                                             | `write-document.ts:131-136` + `edit-document.ts` parallel. Signal source: FR7.                                    |
| Must     | FR5 | Corrigendum on spec -15 FR-9 and M1 — verbatim text                                                                     | Every occurrence of FR-9 and M1 in `specs/2026-04-15-preview-url-pre-edit/SPEC.md` gets appended on same line: `<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_`                                                                                                                                                                                                                                                               | Merged with old FR10. Matches CLAUDE.md "Post-ship corrigendum annotations".                                      |
| Must     | FR6 | Zero runtime breakage for agents running old contract                                                                   | Integration test: invoke `get_preview_url + preview_start + write_document` in sequence; all succeed; server emits no error; subscriberCount / focus state consistent with spec -14 behavior.                                                                                                                                                                                                                                                                                                                                                                    | Backwards-compat goal                                                                                             |
| Must     | FR7 | Warning-threshold refinement: fire hint on "no preview anywhere" not "no preview for this doc"                          | Two-part change: **(FR7a) server helper** — `packages/server/src/api-extension.ts` gets `getSystemSubscriberCount()` sibling to existing `getSubscriberCount`, reads `__system__` doc's `connections.size`; handler (around line 1563) emits a NEW response field `systemSubscriberCount: number` alongside existing `subscriberCount`. **(FR7b) MCP tool** — `write-document.ts` / `edit-document.ts` read the new field; hint threshold becomes `systemSubscriberCount === 0`. Existing per-doc `subscriberCount` stays in the response for diagnostics.       | OQ3=A. Split into 7a/7b so HTTP-contract change is visible to implementer (closes challenger M6).                 |
| Must     | FR8 | Test coverage for structured-hint fires-correctly                                                                       | Unit tests: (a) hint absent when systemDocSubscriberCount > 0, (b) hint present with correct shape when systemDocSubscriberCount === 0, (c) previewUrl present in hint when resolvable, null otherwise.                                                                                                                                                                                                                                                                                                                                                          | Covers FR4 + FR7 behavior                                                                                         |
| Must     | FR9 | Server-side metric counter for hint emission                                                                            | Emitted from **`packages/server/src/api-extension.ts`** at the `systemSubscriberCount === 0` site (initTelemetry is live via `bootServer()`; CLI/MCP stdio process does NOT init telemetry, so `getMeter` there is a no-op — this is why FR9 is server-side). Counter name `ok.preview_attach.hint_emitted`. Labels: `shadow.writer` (writer-ID taxonomy per CLAUDE.md line 196 / precedent #25), `agent.type` (output of `resolveAgentType(clientName)` at `api-extension.ts:1219-1228`; 6-valued bounded enum). No raw session IDs, no raw clientName strings. | OQ5=C. Counter placement per challenger H2 (evidence: `getMeter` in CLI is no-op; initTelemetry lives in server). |

### Non-functional requirements

- **Performance:** No new persistent state; no new MCP round-trips. Write-tool response adds \~80 bytes when hint fires (one-time per session in the happy path).
- **Reliability:** Hint is additive; existing `warning` plumbing unchanged. If `systemDocSubscriberCount` lookup throws, fall back to current per-doc behavior.
- **Security/privacy:** No new fields expose sensitive data. `previewUrl` is already emitted today; `action` is a keyword enum.
- **Operability:** Log one debug line when the structured hint is emitted (behind existing DEBUG flag).
- **Cost:** Zero infra cost. Instruction verbosity decreases (skill preview section shrinks from \~13 lines to \~7).

## 7) Success metrics & instrumentation

- **M1 (replaces spec -15 M1):** Average tool calls per wiki edit, measured across a canonical session transcript sample.
  - Baseline: per-edit contract = \~3 tool calls per write (`get_preview_url` + `preview_start`/`Navigate` + `write_document`).
  - Target: ≥ 80% of `write_document` / `edit_document` invocations are NOT preceded by `get_preview_url` OR a host preview-nav tool call within the same agent turn.
  - Instrumentation: transcript-based measurement. Paired with FR9's counter for the M2 side of the measurement — this closes spec -15's audit-flagged instrumentation gap.
- **M2 (new):** Hint-emission volume — count of `attach-preview-once` hints emitted per MCP session.
  - Baseline: unknown.
  - Target: ≤ 1 per session on average (meaning agents comply with the hint on first observation, not re-prompted).
  - Instrumentation: server-side OTel counter per FR9. Bounded-cardinality labels (writer-kind / agent-type enums only) per CLAUDE.md STOP rule on unbounded attributes. Exported via the existing metrics endpoint family.

## 8) Current state (how it works today)

See [[reports/preview-nav-agent-contract/REPORT]] §D1 for the full inventory. Load-bearing facts:

- **Three surfaces carry the per-edit mandate today, each with its own hand-written text** (the shared `PREVIEW_GUIDANCE` constant + CLAUDE.md injection at `packages/cli/src/content/init.ts` were deleted by spec -22 D13): (1) MCP `instructions` as an inline template literal in `packages/cli/src/mcp/server.ts:202-206`, (2) the user-global Agent Skill at `packages/server/assets/skills/open-knowledge/SKILL.md:37-49`, (3) the `get_preview_url` tool description at `packages/cli/src/mcp/tools/get-preview-url.ts:30-37`.
- **`AgentFocusBroadcaster.setFocus` fires** at `packages/server/src/api-extension.ts:1547-1555` on every write. Already handles multi-write sequences via `__system__` awareness map.
- **`SystemDocSubscriber.tsx:95-109`** runs the 300ms-debounce + pin + 3s typing-guard navigation check. Already production-proven.
- **`subscriberCount` signal** comes from `getSubscriberCount()` at `api-extension.ts:815-830` — reads per-doc Hocuspocus `connections.size`.
- **`.claude/launch.json`** is already committed with an `open-knowledge-ui` entry on port 3000 for Claude Code Desktop.

## 9) Proposed solution (vertical slice)

**Two-PR rollout** (D3 revised post-audit):

- **PR 1 — text + corrigendum only (zero runtime change):** §9.1 (MCP instructions + SKILL.md + tool description) + §9.3 (spec -15 corrigendum). Dogfood for 24-48h in a real session; instruction text lands on next `tools/list` refresh and can be reverted cleanly by reverting the strings.
- **PR 2 — runtime + counter:** §9.2 (FR7a + FR7b: server helper, new `systemSubscriberCount` response field, MCP tool reader) + §9.4 (FR9 OTel counter on server). Tests against the already-shipped guidance; isolated from text rollback blast radius.

Ship PR 1 first; PR 2 can merge immediately after PR 1 stabilizes.

### 9.1 Agent-facing text edits

**New inline text for `buildInstructions()` in `packages/cli/src/mcp/server.ts`** (replaces lines 202-206):

```
## Preview — attach when the server asks

When a write-tool response includes `warning: { action: "attach-preview-once", previewUrl }`, open the URL in your preview browser. The server tells you this exactly when no editor is attached. In the normal fresh-session case, you'll see this hint once on your first write; after that, the server pushes focus to the open preview on every write and no navigation action is required.

Host-specific commands:
- Claude Code Desktop: `preview_start("open-knowledge-ui")`.
- Cursor: `Navigate(url)` with the `previewUrl` the hint provides.
- Other hosts: use the host's "open URL" tool with the `previewUrl`.

Multiple agents may share a single preview tab — if the hint doesn't fire, an editor is already attached and you don't need your own. Re-attach if the hint fires again (the user may have closed the tab).

Native `Edit` / `sed` / direct `Write` on in-scope markdown is forbidden — it bypasses the CRDT and loses agent attribution.
```

**SKILL.md replacement** (lines 37-49): same substance, slightly longer with host examples.

**`get_preview_url` tool description** (lines 30-37 of `get-preview-url.ts`):

```
Return a browser URL for the given wiki docName. Useful when embedding preview links in doc content, or for manual re-navigation. Per-edit navigation is not required — the server pushes focus to the attached preview on every write. Use your host's preview-opening tool ONCE at session start; after that, just write.

Parameters: `docName` — Wiki doc name, typically without extension.
Returns `{ previewUrl, previewUrlSource }` or `{ previewUrl: null }`.
```

### 9.2 Structured hint + metric counter (runtime change)

The change spans **two package boundaries** — server helper + HTTP-contract change in `packages/server/`, and MCP tool reader in `packages/cli/`.

**Server side — `packages/server/src/api-extension.ts`:**

```typescript
// FR7a: Helper for transport-presence check on __system__ awareness.
function getSystemSubscriberCount(): number {
  try {
    const doc = hocuspocus.documents.get(SYSTEM_DOC_NAME);
    return doc?.connections.size ?? 0;
  } catch {
    return 0;
  }
}

// In handleAgentWriteMd (around line 1563 in write handler):
const subscriberCount = getSubscriberCount(resolvedDocName);
const systemSubscriberCount = getSystemSubscriberCount();  // NEW

// FR9: Counter fires here (where telemetry is live; see §9.4).
if (systemSubscriberCount === 0) {
  hintCounter.add(1, { 'shadow.writer': writerKind, 'agent.type': resolveAgentType(session.clientName) });
}

json(res, 200, {
  ok: true,
  timestamp,
  subscriberCount,
  systemSubscriberCount,   // NEW response field — MCP tool reads this
  ...(hints ? { hints } : {}),
  ...(summaryResponse ? { summary: summaryResponse } : {}),
});
```

**MCP tool side — `packages/cli/src/mcp/tools/write-document.ts:93-112` (and parallel site in `edit-document.ts`):**

```typescript
const systemSubscriberCount =
  typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
const noPreviewAnywhere = systemSubscriberCount === 0;

// ... and in the structured warning block (lines 131-136):
if (noPreviewAnywhere) {
  structured.warning = {
    message: `No preview attached. Open ${preview?.url ?? '<server URL>'} in your preview browser once to watch future edits.`,
    action: 'attach-preview-once',  // NEW structured field
    previewUrl: preview?.url ?? null,
  };
}
```

Existing per-doc `subscriberCount` stays in the response for diagnostics (other consumers may rely on it).

### 9.3 Corrigendum on spec -15

On each occurrence of FR-9 (the per-edit mandate) and M1 (70% compliance target) in `specs/2026-04-15-preview-url-pre-edit/SPEC.md`, append on the same line:

```
<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_
```

Per CLAUDE.md "Post-ship corrigendum annotations" convention — applied to every occurrence (FR-9 and M1) in spec -15, on the same line as the original prose.

### 9.4 Metric counter (FR9)

**Counter lives in `packages/server/src/api-extension.ts`** — NOT in the MCP tool (`write-document.ts`). Reason: `initTelemetry()` is called by `bootServer()` (and the dev plugin) only; the CLI/MCP stdio process never initializes OTel, so `getMeter()` there returns a no-op meter. The same server handler that computes `systemSubscriberCount === 0` (FR7a) is where the counter fires.

```typescript
// packages/server/src/api-extension.ts — import near existing imports
import { getMeter } from './telemetry.ts';

// Lazy-init (meter is a no-op until initTelemetry has been called, so this is cheap).
const hintCounter = getMeter().createCounter('ok.preview_attach.hint_emitted', {
  description: 'Count of attach-preview-once hints emitted on write-tool responses',
});

// At the same site that computes systemSubscriberCount, after deciding to emit the hint:
if (systemSubscriberCount === 0) {
  hintCounter.add(1, {
    // Bounded-cardinality labels per CLAUDE.md STOP rule on unbounded OTel attributes.
    'shadow.writer': writerKind,                          // canonical attribute; writer-ID taxonomy, precedent #25
    'agent.type': resolveAgentType(session.clientName),  // 6-valued enum, api-extension.ts:1219-1228
  });
}
```

The MCP tool (`write-document.ts` / `edit-document.ts`) stays dumb — it just reads `warning.action` / `warning.previewUrl` from the HTTP response. Counter emission is never the tool's concern.

Exports ride the existing metrics pipeline established in [[specs/2026-04-09-otel-instrumentation/SPEC]].

## 10) Decision log

| ID | Decision                                                                     | Status     | Reasoning                                                                                                                                                                                                                                |
| -- | ---------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 | Flip per-edit → once-per-session contract                                    | **LOCKED** | [[reports/preview-nav-agent-contract/REPORT]] exec summary + D2 Finding 5 (typing-guard bypass) + D5 Finding 1 (UX preserved). Evidence-backed.                                                                                          |
| D2 | Ship as NEW spec, not §11 amendment to spec -15                              | **LOCKED** | OQ1=A. CLAUDE.md post-ship convention discourages in-place rewrites; separate spec keeps the supersedes graph machine-readable.                                                                                                          |
| D3 | Two-PR rollout (PR1 = text + corrigendum; PR2 = runtime + counter)           | **LOCKED** | Reopened after audit H4: §15's four distinct test harnesses don't cluster, and text rollouts hit every connected agent on `tools/list` refresh with asymmetric rollback cost vs runtime changes. Matches research-report recommendation. |
| D4 | Include D6 threshold refinement (`__system__` subscriber count) in this spec | **LOCKED** | OQ3=A. \~15 LOC; eliminates per-doc noise that would otherwise re-surface the problem.                                                                                                                                                   |

\| D6 | Keep `get_preview_url` tool; rescope not retract                             | **LOCKED** | Research D7 Finding 3 — tool has legitimate non-nav uses (embedding URLs in content).                                                           |
\| D7 | Telemetry: FR9 server counter + M1 transcript sampling (both)                | **LOCKED** | OQ5=C. Counter closes spec -15's audit-flagged gap. Bounded-cardinality labels per CLAUDE.md STOP rule on OTel attributes.                      |
\| D8 | Backwards-compat: no breaking change to `get_preview_url` signature          | **LOCKED** | G3 goal. Mandate moves; API shape doesn't.                                                                                                      |
\| D9 | Corrigendum wording per OQ4=verbatim                                         | **LOCKED** | See FR5 (merged from former FR10) for exact text. Matches CLAUDE.md "Post-ship corrigendum annotations" template.                               |

## 11) Open questions

| ID  | Question                                                                | Type          | Priority | Notes                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------- | ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ1 | ~~New spec vs §11 amendment to -15?~~                                   | Product       | P0       | **RESOLVED 2026-04-24: A = New spec (D2)**                                                                                                                                                                                                                              |
| OQ2 | ~~Two PRs or one?~~                                                     | Technical     | P0       | **RESOLVED 2026-04-24: B = Single PR (D3)**                                                                                                                                                                                                                             |
| OQ3 | ~~Ship FR7 (`__system__` subscriber threshold) in this spec?~~          | Technical     | P0       | **RESOLVED 2026-04-24: A = Include (D4, FR7)**                                                                                                                                                                                                                          |
| OQ4 | ~~Corrigendum text exact wording?~~                                     | Cross-cutting | P0       | **RESOLVED 2026-04-24: verbatim (D9, FR10)**                                                                                                                                                                                                                            |
| OQ5 | ~~Include telemetry for M1/M2 as FR?~~                                  | Technical     | P0       | **RESOLVED 2026-04-24: C = Both (D7, FR9)**                                                                                                                                                                                                                             |
| OQ6 | ~~Multi-tab edge case: if user has 2 tabs, does warning logic change?~~ | Technical     | P0       | **RESOLVED 2026-04-24: warning logic unchanged; threshold is `systemSubscriberCount === 0` per FR7, which naturally handles 2-tab case (warn only if ALL tabs closed). Reframe in §1 + G1 + §9.1 clarifies this is a transport-presence invariant, not session-event.** |

## 12) Assumptions

| ID | Assumption                                                                                                                         | Confidence | Verification plan                                                                                                                            | Expiry                              |
| -- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A1 | Claude Code preview pane stays pinned to first URL until hash changes                                                              | HIGH       | Observed behavior in-repo (`.claude/launch.json` already configured); `SystemDocSubscriber` already sets `window.location.hash` successfully | N/A — production-proven             |
| A2 | MCP `structuredContent` `warning.action` field is interpretable by all current clients                                             | MEDIUM     | MCP spec allows arbitrary `structuredContent`; clients ignore unknown fields by convention. Could sanity-check in one integration test.      | Before ship                         |
| A3 | Agents will read the revised skill + instructions on next tool call                                                                | HIGH       | Skill is loaded declaratively by host; instructions are sent on every MCP handshake.                                                         | N/A                                 |
| A4 | Cursor's `Navigate` + browser persistence (per [Cursor docs](https://cursor.com/docs/agent/tools/browser)) covers once-per-session | MEDIUM     | Docs confirm persistence; no 1P test coverage yet                                                                                            | Low — behavior aligned with 3P docs |

## 13) Risks / unknowns

| ID | Risk                                                                                                                | Likelihood | Impact | Mitigation                                                                                                                                 |
| -- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 | Agents on Claude Code don't understand "once per session" and re-navigate per edit anyway                           | Medium     | Low    | Backwards-compat (G3); per-edit still works, just wastes work. No user-facing breakage.                                                    |
| R2 | `systemDocSubscriberCount` introduces a race with `__system__` doc materialization timing                           | Low        | Medium | `__system__` doc is created eagerly at server boot per spec -14; race only on cold start — gracefully falls back to per-doc count.         |
| R3 | A third-party MCP client interprets the new `action: "attach-preview-once"` as a required enum that it can't handle | Low        | Low    | MCP clients are required to ignore unknown fields; log message remains informative.                                                        |
| R4 | Docs-aware agents (skills) lag behind skill updates                                                                 | Medium     | Low    | Skill version field bumps on publish; agents re-fetch on next `npx @inkeep/open-knowledge init`. Coordination risk is normal product risk. |

## 14) Future work

| ID  | Item                                                                                                                                | Tier       | Trigger to revisit                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FW1 | Adopt Shape C (MCP resources + `notifications/resources/updated`)                                                                   | Explored   | When MCP Apps iframe embedding becomes product-direction                                                                                                                  |
| FW2 | Telemetry for per-session compliance rate                                                                                           | Identified | If adoption concerns surface; if OQ5 resolves to "not now"                                                                                                                |
| FW3 | Multi-tab leader election (spec -14 §FW-2)                                                                                          | Identified | User reports double-nav friction under once-per-session contract                                                                                                          |
| FW4 | Custom agent-visible `resource_link` suggesting attach on connect                                                                   | Noted      | Pursue if MCP 2026-xx extensions enable listChanged adoption                                                                                                              |
| FW5 | Anti-drift lint: grep-assert no `get_preview_url`-before-`write_document` pattern in SKILL.md / MCP instructions / tool description | Explored   | If drift re-surfaces across the three surfaces (spec -22 already had to fix this once). \~30 LOC; operationalizes the once-per-session contract as a grep-able invariant. |

## 15) Test plan

### Unit (packages/cli/src/mcp)

- `write-document.test.ts` / `edit-document.test.ts`: three cases for FR4/FR8 (read `systemSubscriberCount` from mocked HTTP response):
  - `systemSubscriberCount > 0` → no `warning` field.
  - `systemSubscriberCount === 0`, previewUrl resolvable → `warning: { action: "attach-preview-once", previewUrl, message }`.
  - `systemSubscriberCount === 0`, previewUrl null → `warning: { action: "attach-preview-once", previewUrl: null, message }`.

### Unit (packages/server/src)

- `api-extension.test.ts`: `getSystemSubscriberCount()` returns expected values for (a) `__system__` doc not materialized, (b) 0 connections, (c) N connections.
- `api-extension.test.ts` (FR7a HTTP-contract): `POST /api/agent-write-md` response body includes `systemSubscriberCount: number` field alongside existing `subscriberCount`.
- `api-extension.test.ts` (FR9 counter): counter `ok.preview_attach.hint_emitted` increments exactly once when `systemSubscriberCount === 0` at write time; does NOT increment when `systemSubscriberCount > 0`. Label set bounded: assert `shadow.writer` matches the writer-ID taxonomy, `agent.type` ∈ `{claude, cursor, codex, cline, windsurf, bot}`. Use a test OTel `MeterProvider` reader.

### Integration (packages/app/tests/integration)

- New test: "attach-once path" — spin up test server, call `write_document` with no subscribers → assert structured hint. Connect a client. Call `write_document` again on a different doc → assert no hint, subscriberCount updates via push-nav.
- Existing backwards-compat test: call `get_preview_url` → `preview_start`-analog (test harness navigation) → `write_document` → assert no regression in server state.

### Instruction-text checks

- Snapshot test on `buildInstructions(config)` output — assert presence of new once-per-session language, absence of "MUST be preceded by `get_preview_url`".
- Snapshot test on SKILL.md section 37-49 (or whatever the rewritten line range is).

### No new E2E

- Playwright coverage unchanged; the `__system__` subscriber behavior is already covered by spec -14 E2E.

## 16) Agent constraints (for implementer)

- **SCOPE:**
  - `packages/cli/src/mcp/server.ts` — `buildInstructions()` inline template literal (lines 202-206).
  - `packages/server/assets/skills/open-knowledge/SKILL.md` — preview section.
  - `packages/cli/src/mcp/tools/get-preview-url.ts` — tool description.
  - `packages/cli/src/mcp/tools/write-document.ts` + `edit-document.ts` — structured hint.
  - `packages/server/src/api-extension.ts` — `getSystemSubscriberCount` helper (FR7a), response-field emission (`systemSubscriberCount`), AND OTel counter emission (FR9 — per-challenger H2, counter must live here because telemetry is only initialized in `bootServer()`).
  - `specs/2026-04-15-preview-url-pre-edit/SPEC.md` — corrigendum annotations.
  - Test files for the above.
- **EXCLUDE:**
  - `AgentFocusBroadcaster` internals.
  - `SystemDocSubscriber` client-side logic.
  - Spec -14 (`agent-nav-and-cadence`) substrate.
  - Any editor rendering / presence-bar UI.
- **STOP\_IF:**
  - The three surfaces' text (MCP instructions, SKILL.md, tool description) each require approval from Tim before finalizing (wording matters; visible to agents on every connect).
  - Threshold refinement FR7 needs re-checking if `__system__` doc materialization order changed since baseline commit 46751128.
- **ASK\_FIRST:**
  - Any change to `get_preview_url`'s return schema or tool name.
  - Any new warning action name beyond `attach-preview-once`.
  - Rewriting the spec -15 corrigendum to something other than the CLAUDE.md-sanctioned breadcrumb.
