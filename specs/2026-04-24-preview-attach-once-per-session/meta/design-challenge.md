# Design Challenge Findings

**Artifact:** `/Users/timothycardona/inkeep/open-knowledge/specs/2026-04-24-preview-attach-once-per-session/SPEC.md`
**Challenge date:** 2026-04-24
**Total findings:** 10 (4 High, 4 Medium, 2 Low)

These challenge the substance of the spec, not its prose. Decision Log §10 rejections (Shape A/B/C, two-PR rollout, §11 amendment, telemetry exclusion) were checked against the evidence; where the rejection rationale does not hold up, that is surfaced below with severity. The spec's core flip (Shape D) itself holds up — the concerns below are about how it is being landed.

---

## High Severity

### [H] Finding 1: The spec is built on a load-bearing factual premise (`PREVIEW_GUIDANCE` shared constant) that no longer exists in the codebase

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — cold-reader implementability)
**Location:** §2 Resolution ("reuses spec -15 D11's shared `PREVIEW_GUIDANCE` constant"), §6 FR1, §6 FR2, §8 Current state bullet 1, §9.1 "New `PREVIEW_GUIDANCE` constant (replaces existing)", §16 SCOPE.
**Issue:** The spec repeatedly assumes a shared `PREVIEW_GUIDANCE` constant exists and is imported by `buildInstructions` + `CLAUDE_MD_SECTION`. That constant was **deleted** by shipped spec `2026-04-22-mcp-guidance-no-project-pollution` under D13 LOCKED: *"Delete PREVIEW_GUIDANCE shared constant; each surface owns its wording; shared constant created fake reuse."* `CLAUDE_MD_SECTION` and `upsertRootInstructions` were deleted along with it. The current `packages/cli/src/content/init.ts` (verified at the spec's `Baseline commit: 46751128`) has no such export — it only exports `ensureOkGitignoredAtRoot` + `initContent`. `buildInstructions()` in `packages/cli/src/mcp/server.ts:187` now inlines its preview guidance as a string literal, not a named import.
**Current design:** "Replace per-edit mandate in `PREVIEW_GUIDANCE` with once-per-session rule" (FR1); "Shared constant per spec -15 D11; propagates to MCP instructions + CLAUDE.md" (FR1 Notes).
**Alternative:** Re-plan the agent-facing-text edits against the current three-surface reality: (a) inline string in `buildInstructions()`, (b) SKILL.md (the canonical delivery surface per spec -22 D11/D18), (c) `get_preview_url` tool description. The CLAUDE.md injection doesn't exist anymore — spec -22 explicitly removed it to stop polluting user project files. Refactor FR1/FR2/FR4 accordingly. G4 ("reuse spec -15 D11's shared `PREVIEW_GUIDANCE` constant") needs deletion or rephrasing around owning-per-surface.
**Trade-off:** Same end state (three surfaces edited), but the spec currently describes changes to a file/export that an implementer will not find. An implementer who opens `init.ts` looking for `PREVIEW_GUIDANCE` will be blocked and must reconstruct what actually happened — blowing the resolution-completeness gate.
**Status:** CHALLENGED
**Suggested resolution:** (1) Re-verify the current state against baseline commit 46751128 (the spec's own baseline). (2) Rewrite §8 "Current state", §9.1, FR1, FR2, FR4, §16 SCOPE to match the post-22 topology: no shared constant, no `CLAUDE_MD_SECTION`, SKILL.md is the primary agent-facing guidance surface, `buildInstructions` is deliberately slim (≤1,500 bytes per spec -22 FR3). (3) Delete or demote G4.

---

### [H] Finding 2: FR9 OTel counter cannot fire from where the spec says it does — telemetry is not initialized in the stdio MCP process

**Category:** DESIGN
**Source:** DC2 (SRE / operations stakeholder gap)
**Location:** §6 FR9, §9.4 "Metric counter".
**Issue:** The spec's §9.4 shows the counter emission code placed in `packages/cli/src/mcp/tools/write-document.ts` / `edit-document.ts` (the MCP tool process). `initTelemetry()` is not called anywhere in `packages/cli/src/` — a grep returns zero hits. `getMeter()` called without `initTelemetry()` first is a no-op (per `packages/server/src/telemetry.ts` contract and CLAUDE.md's Observability section, which lists `initTelemetry` call sites as `bootServer()` + dev plugin only). The stdio MCP binary runs as a child process under the AI host (Claude Code / Cursor / Codex) with no OTel SDK attached; its `stdout`/`stderr` is parsed as MCP framing, so blindly adding an OTLP exporter there would also corrupt the MCP channel.
**Current design:** "Add an OTel counter increment at the `attach-preview-once` emission site in `write-document.ts` / `edit-document.ts`" (§9.4).
**Alternative:** Move the counter to the server-side hint-decision site. The actual `subscriberCount === 0` (or FR7's `systemSubscriberCount === 0`) computation already lives in `api-extension.ts` (the handler returns `subscriberCount` to the MCP tool in the HTTP response). Emit `ok.preview_attach.hint_emitted` from the server handler where `initTelemetry()` IS live (via `bootServer()`). The MCP tool becomes a pure dumb consumer of the HTTP response shape.
**Trade-off:** Marginal code relocation; semantics identical; counter actually fires. Moving it to the server also means one metric per write, not split across two code paths (write-document + edit-document), which tightens FR8 testability.
**Status:** CHALLENGED
**Suggested resolution:** Rewrite §9.4 to emit the counter from the server HTTP handler (`handleAgentWriteMd` region in `api-extension.ts`) at the same site that computes `systemSubscriberCount === 0`. Delete the `getMeter()` import from the MCP tool. Update FR9 acceptance criteria to assert the counter is observable via the existing `/api/metrics/*` surface.

---

### [H] Finding 3: "Once per session" under-specifies multi-tab and reconnect scenarios — the guarantee is actually "at least one editor tab is subscribed to `__system__`", not "the agent opened a preview once"

**Category:** DESIGN
**Source:** DC3 (framing validity) + DC2 (customer-facing engineer stakeholder gap)
**Location:** §1 Resolution, §2 G1, §5 J1/J2/J3, §6 FR7, §11 OQ6 (deferred).
**Issue:** The contract is stated in agent-session terms ("once at session start"), but the actual mechanism the spec relies on is **transport presence** — a live Hocuspocus WS connection to `__system__`. The two come apart in at least three routine cases:

1. **User closes and reopens the preview tab mid-session.** `systemSubscriberCount` drops to 0 then comes back >0 before the next agent write. No hint fires; but the new tab has no client-side nav history — the next write's push-nav lands it on the right doc (fine). However, the period between close and next agent write is not defined: if the agent writes during the zero-subscriber window, FR7 triggers a hint; the agent is told "attach preview once" but it already did — compliance confusion (R4 only addresses this obliquely).

2. **Two MCP sessions, one preview tab.** Agent A opens preview; Agent B connects in a separate Claude Code instance (common during agent simulator / nested Claude usage, which is explicitly supported by CLAUDE.md "Concurrent development"). Agent B's first write sees `systemSubscriberCount > 0` → no hint → Agent B never learns it *could* open its own tab. User-facing: Agent B's edits race with Agent A's for the single preview's focus. This is the multi-agent thrashing concern deferred as NG3, but it is *created* by the once-per-session framing — under the current per-edit contract, both agents independently navigate.

3. **Reconnect after compaction / context compression.** The spec says (§5) "agent re-reads skill/instructions on next tool call; state is stateless per write." True — but this means the agent has NO memory that it previously opened a preview. If `systemSubscriberCount > 0` (because the user's tab is still open), no hint fires, and the agent's re-read guidance says "open once at session start" — which the agent, believing this IS session start, will dutifully do again. Extra `preview_start` call, same URL, no user-visible harm. But the "once per session" guarantee is now false from the agent's perspective: it happens on every compaction boundary.

OQ6 ("multi-tab edge case, does warning logic change?") is marked P2 and deferred to spec -14 FW-2, but multi-tab is the *default* case (user leaves editor open from previous session + MCP connects fresh), not an edge case.
**Current design:** "Agents open the preview once at session start" + "After that, edit freely" (§1, §9.1 guidance text).
**Alternative:** Reframe the contract in transport terms, which is what the code actually does: **"ensure at least one editor tab is attached to this server"**. Update SKILL.md + MCP instructions guidance to say *"if no editor is attached, open one now — multiple agents may share one tab."* This disambiguates (1) and (2) above without changing any code. For (3), add a note in G1 that the hint is **server-driven** (not agent-memory-driven), so repeating the "attach" action on reconnect is cheap and expected.
**Trade-off:** Slightly longer guidance text (but still shorter than today's per-edit mandate). Eliminates three classes of compliance confusion. Makes OQ6 not a P2 deferral but a P0 clarification inline.
**Status:** CHALLENGED
**Suggested resolution:** Promote OQ6 to P0 and resolve it in this spec. Reframe §1 Resolution, G1, and §9.1 guidance text to describe the transport-presence invariant rather than a session-lifecycle event. Alternatively, add a §12 assumption stating "`systemSubscriberCount` is a correct proxy for 'user is watching'" with an explicit verification that matches what FR7 actually checks.

---

### [H] Finding 4: D3 (single-PR rollout) bundles a 1-way-door instruction change (load-bearing visible to every agent on every connect) with additive runtime work (FR7 + FR9). The research's two-PR recommendation was rejected on "shared test surface" grounds that do not hold up.

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC2 (SRE / rollback stakeholder gap)
**Location:** §10 D3 LOCKED, §9 preamble ("all changes in §9.1-9.4 land in one PR"), research report §"Cross-dimension synthesis" (recommended two PRs).
**Issue:** The research report explicitly recommended two small PRs — PR 1 instruction-only (zero runtime change), PR 2 the structured hint + counter. The spec collapsed this to a single PR on the stated rationale: "Shared test surface; subsections 9.1-9.4 cluster cleanly for single review." Two problems with that rejection:

1. **The test surfaces are not shared.** FR1/FR2/FR3 (text edits in three separate files: `server.ts`, `SKILL.md`, `get-preview-url.ts`) use snapshot tests. FR4/FR7/FR8 (server HTTP response shape change + MCP tool logic) use the integration harness (`createTestServer`/`createTestClient`). FR9 (OTel counter) uses the metrics-test surface. FR5/FR10 (corrigendum on spec -15) is a markdown edit with no test coverage at all. These do not cluster — they touch four distinct test files with four distinct harnesses.

2. **The rollback cost is asymmetric.** A broken runtime change (FR4 warning shape / FR7 threshold) is caught by tests and is easy to revert cleanly. A broken instruction change (FR1/FR2/FR3) propagates to **every connected agent on every MCP handshake** — an agent can be ~5 minutes into a session when the server is deployed and receive the new instructions on its next `tools/list` refresh. An over-broad commit that ships bad wording + a bad runtime change means rolling back both or cherry-picking across test boundaries. Two PRs localize each class's blast radius.

3. **FR4 depends on FR7.** The spec's own §9.2 couples the hint structure to the threshold refinement — FR4's "fire hint on `subscriberCount === 0`" is what changes under FR7 to `systemSubscriberCount === 0`. If FR7 turns out to have the race described in R2, the fix is to revert the threshold, not the hint. A single PR lets them ride together when they shouldn't.

The research report's two-PR structure was DC1's simpler alternative, and it was rejected on evidence that does not hold up.
**Current design:** "Single-PR rollout (instructions + hint + FR7 + FR9 + corrigendum)" (D3 LOCKED).
**Alternative:** Ship as two PRs per the research report:
- **PR 1:** FR1/FR2/FR3 + FR5/FR10. Pure text/markdown edits. Zero runtime change. Ship first; watch in a dogfood session for 24-48 hours.
- **PR 2:** FR4/FR7/FR8/FR9. HTTP response shape change + counter. Tested against the already-shipped guidance.
**Trade-off:** One extra PR round-trip. Gained: cleanly revertable text rollout; isolated runtime change; matches research report's recommendation; matches how spec -15 + spec -22 were themselves staged.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D3. If the intent is to keep a single PR for team throughput reasons not named in the spec, make that trade-off explicit in the rationale rather than citing "shared test surface" which is not borne out by the test plan in §15.

---

## Medium Severity

### [M] Finding 5: FR9 counter cardinality constraint is asserted but not substantiated against the actual attribute producers

**Category:** DESIGN
**Source:** DC2 (SRE stakeholder gap, OTel cardinality hygiene per CLAUDE.md STOP rule)
**Location:** §6 FR9, §7 M2 instrumentation, §9.4.
**Issue:** FR9 says "Bounded-cardinality labels per CLAUDE.md STOP rule (no raw session IDs; use count only)" and §9.4 lists `writer.kind` + `agent.type` as the chosen labels. The CLAUDE.md STOP rule requires normalization to classifiers/enums, but:

- `writerKind` is a real enum, drawn from the five-category taxonomy in precedent #25 (`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`). Safe.
- `agent.type` as described in §9.4 comment (`agentType ?? 'unknown'`) looks unbounded. But the actual source — `resolveAgentType(clientName)` at `packages/server/src/api-extension.ts:1219-1227` — IS bounded to six values (`claude`, `cursor`, `codex`, `cline`, `windsurf`, `bot`). The spec should cite that function + its bound enum by name, so an implementer doesn't accidentally pass the raw `clientName` string (which contains version suffixes in practice: `"Claude Code v2.6.1"`, `"cursor-agent/3.0.0"`). A reader of the spec today cannot tell which one is meant.

**Current design:** "'agent.type': agentType ?? 'unknown', // pre-validated; never raw strings." (§9.4 code comment).
**Alternative:** Name the bounded-enum helper in FR9 acceptance criteria: *"The `agent.type` label is the output of `resolveAgentType(clientName)` (6-valued enum); any other source is a STOP-rule violation."* Add a unit test asserting the counter's label set is ≤ 6 × 5 = 30 unique combinations over any test input.
**Trade-off:** One extra sentence in FR9; one extra test. Prevents the exact class of bug the STOP rule exists to catch.
**Status:** CHALLENGED
**Suggested resolution:** Update FR9 acceptance criteria + §9.4 code comment to cite `resolveAgentType` by file:line. Add the cardinality-bound assertion to FR8 test coverage.

---

### [M] Finding 6: The spec's description of how FR7 reaches the MCP tool conflates two processes — the HTTP contract change is invisible in §9.2

**Category:** DESIGN
**Source:** DC2 (implementer stakeholder gap)
**Location:** §6 FR7, §9.2 "Threshold refinement".
**Issue:** `getSystemSubscriberCount()` is sketched as a helper inside `packages/server/src/api-extension.ts` (correct). But the hint-fire decision is made in `packages/cli/src/mcp/tools/write-document.ts:95` (`noPreviewAttached = subscriberCount === 0`), which reads `subscriberCount` from the HTTP response at line 94. FR7 doesn't name the HTTP-contract change that must accompany the helper: the `/api/agent-write-md` response body must emit a NEW field (`systemSubscriberCount` or similar), and the MCP tool must read that new field rather than (or in addition to) the existing `subscriberCount`. Without that wiring, `getSystemSubscriberCount` is dead code. §9.2's code example — `computeNoPreviewAnywhere = getSystemSubscriberCount() === 0` — is shown as if it runs in the same function as `write-document.ts`'s handler, which crosses the cli-server package boundary.
**Current design:** "Use in write-handler to compute `noPreviewAnywhere = getSystemSubscriberCount() === 0`; fire the `action: "attach-preview-once"` hint only when no preview anywhere." (§9.2).
**Alternative:** Split FR7 into FR7a (server helper + response field) + FR7b (MCP tool reads new field). Explicitly name the response-shape change as an FR9-adjacent item so it gets its own test in FR8.
**Trade-off:** Slightly more prose in the spec; eliminates a whole class of "which layer does this edit land in?" implementer confusion.
**Status:** CHALLENGED
**Suggested resolution:** Rewrite §9.2 to show both sites with their package prefixes (`packages/server/src/api-extension.ts` vs `packages/cli/src/mcp/tools/write-document.ts`). Add an FR describing the HTTP response shape evolution.

---

### [M] Finding 7: D6 ("rescope `get_preview_url` to advisory, not retract") leaves a compliance-drift risk — the tool's description still carries the "IMMEDIATELY BEFORE" mandate

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer stakeholder gap)
**Location:** §6 FR3 ("Update `get_preview_url` tool description to advisory"), §10 D6 LOCKED, §9.1 proposed tool description.
**Issue:** Agents read tool descriptions on every MCP handshake — they do not cache them per session. Rewording the description from "call IMMEDIATELY BEFORE every write" (current `get-preview-url.ts:31`) to "Per-edit navigation is not required" is fine, but the tool **still exists** with the same signature, and agents that have memorized the old pattern from training-data or the session's prior turns will keep calling it. Today's Claude Code with an old cached skill, or any agent that hit the per-edit pattern in the current turn before the new skill loads, will keep paying the tool-call tax.

More importantly — and this is the drift concern — if some future update of SKILL.md or the `buildInstructions` inline guidance re-introduces per-edit language (e.g., a new contributor sees the description "useful for manual re-navigation" and thinks "so I should tell agents to use it per edit"), the tool will silently accept that drift. There is no enforcement that keeps the three surfaces (SKILL.md, MCP instructions, tool description) in sync other than human review — which is exactly the drift mode spec -22's D13 identified when it killed the shared constant.

The research report's D7 recommendation was to rescope, not retract — but it did so specifically because **embedding preview links in doc content** is a legitimate non-nav use. The spec accepts that. What the spec doesn't do is add a drift-detection test: e.g., a test asserting "no `get_preview_url`-before-`write_document` pattern appears in any canonical example in SKILL.md or the MCP instructions." That test would catch future regressions without forcing retraction.
**Current design:** D6 LOCKED: "Keep `get_preview_url` tool; rescope not retract."
**Alternative:** Keep D6 as-is but add an FR (say FR11): a lint-style test that scans `SKILL.md` + `buildInstructions()` output + tool descriptions for "`get_preview_url`(.*)" followed by "`write_document`" within N tokens, failing if any match survives. This operationalizes the once-per-session contract as a grep-able invariant, closing the "three surfaces will drift again" loop that spec -15 + spec -22 both had to fix.
**Trade-off:** One extra lint test; eliminates the "by 2026-07 someone will add the mandate back" regression risk.
**Status:** CHALLENGED
**Suggested resolution:** Add FR11 (anti-drift lint) to the spec. Alternatively, keep D6 and note the compliance-drift risk in §13 Risks with a "Medium likelihood, 6-month horizon" tag and no new code.

---

### [M] Finding 8: FR5 references FR10 for wording — the spec's structure bounces the reader across two FRs for a single requirement

**Category:** DESIGN
**Source:** DC2 (cold-reader + implementer stakeholder gap)
**Location:** §6 FR5 ("See FR10 for verbatim text"), FR10 (verbatim text).
**Issue:** This is a minor self-reference but it's load-bearing for the corrigendum — an implementer reading FR5 has to page down to FR10 to know what to paste. FR5 exists only to name the requirement ("apply to every occurrence"); FR10 carries the text. Both are Must-priority. This is a spec-internal indexing quirk: it works but adds friction for no benefit over a single FR that names-the-requirement-and-includes-the-text inline.
**Current design:** Two FR rows, FR5 pointing at FR10.
**Alternative:** Merge FR5 + FR10 into a single FR. Or keep FR5 as the requirement-naming row and inline the verbatim text in the Acceptance Criteria column (it's ~200 chars — fits).
**Trade-off:** None meaningful. Spec becomes one row shorter.
**Status:** CHALLENGED
**Suggested resolution:** Merge FR5 and FR10 into a single FR.

---

## Low Severity

### [L] Finding 9: M1's target (≥80% single-tool-call writes) is asserted without stating what counts as "a write" — does `edit_document` with a summary count as one or two tool calls?

**Category:** DESIGN
**Source:** DC3 (framing validity — is the success metric falsifiable?)
**Location:** §7 M1.
**Issue:** M1 says "≥ 80% of writes should be a single tool call (just `write_document`)". But an agent's real transcript has: `search` → `read_document` → `write_document` → `get_backlinks` → `write_document` (summary fix). The M1 measurement is implicitly about the `get_preview_url` + host-nav tool call pair, not literally a single tool call per write. Worth naming.
**Current design:** "≥ 80% of writes should be a single tool call (just `write_document`)".
**Alternative:** Rephrase as "≥80% of `write_document` / `edit_document` invocations should NOT be preceded by `get_preview_url` OR a host preview-nav tool call within the same agent turn."
**Trade-off:** Cleaner success criteria; same substance.
**Status:** CHALLENGED
**Suggested resolution:** Tighten the M1 definition.

---

### [L] Finding 10: J4 ("backwards compat: agent still uses per-edit pattern") claims zero breakage but doesn't acknowledge the `get_preview_url` description was rewritten

**Category:** DESIGN
**Source:** DC2
**Location:** §5 J4, §6 FR3.
**Issue:** J4 step 1 says: "Agent calls `get_preview_url("docs/foo")` → returns URL (tool still works)." Correct behaviorally. But an agent that has the old mandate internalized is now reading a tool description that tells it *not* to do this per-edit. The two sources of truth (agent's cached/trained behavior vs tool's current description) contradict for the duration of the backwards-compat window. §5's "no breakage; just wasted work" framing is true at the code level but false at the agent-behavior level — the agent receives conflicting instructions (act one way, tool says act another). Worth a sentence in J4 or R4.
**Current design:** J4 claims no backwards-compat issue.
**Alternative:** Add a sentence to J4 or R4: "Agents with the old mandate internalized may observe a description-behavior contradiction for 1-2 tool calls until the updated guidance re-anchors."
**Trade-off:** None — just a completeness statement.
**Status:** CHALLENGED
**Suggested resolution:** Add a sentence acknowledging the transient contradiction.

---

## Confirmed Design Choices (summary)

Design choices that held up under the three lenses, grouped by lens:

- **DC1 (simpler alternative):** Shape D itself (vs A/B/C) is well-argued in the research report with traced file:line evidence. The "three surfaces + structured hint" decomposition is genuinely the minimum viable contract. Shape C (MCP resources) correctly deferred; Shape A-alone correctly rejected (no just-in-time reinforcement). No simpler viable alternative was found.
- **DC2 (stakeholder gap):** D7 (telemetry = FR9 counter + M1 transcript sampling, both) correctly closes the spec -15 audit gap. §13 R2 correctly names the `__system__` materialization race and mitigates via graceful fallback. Failure / recovery paths in §5 cover preview-tab-close and `previewUrl === null`. The gaps above (Findings 2/3/6) are additive, not substitutive — the core stakeholder thinking is present.
- **DC3 (framing validity):** The Complication's three dimensions (redundant tool calls, typing-guard bypass, compliance drift) are truly interconnected — each points at the same flip. The strongest dimension is the typing-guard bypass (Finding 5 in the research report's D2), which makes the current design worse on user sovereignty, not merely less efficient. Removing any one dimension still leaves the flip justified — but the *urgency* of the flip comes from the intersection, and the spec frames that honestly.

---

## Meta-note on the rejections in §10

Per the protocol: Shape A / B / C rejections in the Decision Log were checked against the research report's evidence files. All three hold up under DC1 challenge. I did NOT independently arrive at a preference for any of them. Shape D is the right recommendation.

The two rejections that do NOT hold up under challenge are:
- **Two-PR vs single-PR rollout** (Finding 4). Rejection rationale ("shared test surface") is not supported by the test plan.
- **Telemetry-in-spec vs deferred** (OQ5 resolved to C = both). This one holds up — the research report flagged the spec -15 audit gap; closing it in this spec is sound. But the *placement* of the counter (Finding 2) does not.

No signal to reopen the Shape A/B/C vs D decision. Strong signal to reopen D3 and the code-location of FR9.
