# Audit Findings

**Artifact:** /Users/timothycardona/inkeep/open-knowledge/specs/2026-04-24-preview-attach-once-per-session/SPEC.md
**Audit date:** 2026-04-24
**Total findings:** 12 (4 High, 5 Medium, 3 Low)

---

## High Severity

### [H] Finding 1: `PREVIEW_GUIDANCE` shared constant does not exist in the codebase

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 Current state (line 132); §2 Complication ("four static surfaces"); §6 FR1 Notes ("Shared constant per spec -15 D11"); §2 G4 ("reuse spec -15 D11's shared `PREVIEW_GUIDANCE` constant"); §9.1 ("New `PREVIEW_GUIDANCE` constant (replaces existing)")
**Issue:** The spec repeatedly asserts that a shared `PREVIEW_GUIDANCE` constant already exists and is consumed by both `buildInstructions` and `CLAUDE_MD_SECTION`. Source-code grep shows the constant does not exist anywhere under `packages/`:
```
$ grep -rn "PREVIEW_GUIDANCE" packages/
(no results)
```
The per-edit guidance in `packages/cli/src/mcp/server.ts:202-206` is written as an inline template literal, not consumed from a named constant. `packages/cli/src/content/init.ts` does not contain any preview guidance or CLAUDE.md injection code.
**Current text:** "Shared `PREVIEW_GUIDANCE` constant keeps MCP `instructions` ([packages/cli/src/mcp/server.ts:194](...)) and CLAUDE.md injection ([packages/cli/src/content/init.ts:144](...)) in sync."
**Evidence:** Inherits from evidence file `d1-current-contract-inventory.md` Finding 4 (line 95), which asserts the same non-existent pattern. Spec -15 D11 (decision log line 195 of that spec) describes the constant as the *intended* design, but it was apparently never landed OR was removed in a later change. The upstream PR #297 (46751128, "MCP guidance migration: saturated three-surface delivery") and SPEC 2026-04-22 explicitly removed CLAUDE.md writes from `ok init` (comment at `packages/cli/src/commands/init.ts:594-598`).
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite §8 to describe the actual topology: the per-edit mandate is duplicated as hand-written text in four places (MCP instructions inline in `server.ts`, SKILL.md, `get-preview-url.ts` tool description, and — historically — the `CLAUDE_MD_SECTION` which has been retired per SPEC 2026-04-22). Rewrite FR1 to introduce a new `PREVIEW_GUIDANCE` shared constant as part of this spec's work, OR drop the "reuse existing constant" framing and acknowledge the surface topology changed.

---

### [H] Finding 2: `CLAUDE_MD_SECTION` injection surface no longer exists

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 Current state line 132; §6 FR1 Notes ("propagates to MCP instructions + CLAUDE.md"); §16 Agent Constraints SCOPE (line 314, `packages/cli/src/content/init.ts` — `CLAUDE_MD_SECTION`)
**Issue:** The spec treats `CLAUDE_MD_SECTION` at `packages/cli/src/content/init.ts:144` as a live surface that needs editing. Per `packages/cli/src/commands/init.ts:594-598` comment (LOCKED under SPEC 2026-04-22 D2 / FR1): *"`ok init` no longer writes to root AGENTS.md / CLAUDE.md. Behavioral guidance ships via (1) compressed MCP instructions handshake, (2) per-tool MCP tool descriptions, and (3) the user-global Agent Skill."* Line 144 of `content/init.ts` is in the `ensureOkGitignoredAtRoot` function (about gitignore entries, not CLAUDE.md).
**Current text:** `§16` lists `packages/cli/src/content/init.ts` — `CLAUDE_MD_SECTION` as SCOPE.
**Evidence:** `packages/cli/src/commands/init.ts:594-598`; `packages/cli/src/content/init.ts` contains no preview or CLAUDE.md code; grep confirms no `CLAUDE_MD_SECTION` export anywhere in the repo.
**Status:** STALE (code changed after the research report was written; spec inherited the stale claim)
**Suggested resolution:** Remove `content/init.ts` / `CLAUDE_MD_SECTION` from §16 SCOPE; drop "+ CLAUDE.md" from FR1 Notes; rewrite §8 to reflect the post-SPEC 2026-04-22 three-surface topology (MCP instructions + SKILL.md + tool description). This is a drive-up-the-count simplification in the spec's favor — one fewer surface to keep in sync.

---

### [H] Finding 3: FR4 / FR7 internal consistency — FR4 says `subscriberCount === 0`, FR7 promotes to `systemDocSubscriberCount === 0`

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §6 FR4 (line 101) vs §6 FR7 (line 104); §9.2 text at line 198
**Issue:** FR4 (Must) specifies the acceptance criterion as *"when `subscriberCount === 0`"* — the existing per-doc count. FR7 (also Must) states that `getSubscriberCount` gets a sibling `getSystemSubscriberCount()` and *"Write-tool hint uses the new signal"*. §9.2 implementation text confirms FR7's intent: *"fire the `action: 'attach-preview-once'` hint only when no preview anywhere. Existing per-doc `subscriberCount` stays in the response for diagnostics."* FR4's AC is therefore stale relative to FR7 — an implementer reading the FR table in isolation would code FR4 literally (per-doc count trigger) and produce a non-spec-compliant result. FR8 correctly references `systemDocSubscriberCount` in its test matrix, further confirming FR7 is the winning signal.
**Current text:** FR4: *"Response's `warning` object contains `action: "attach-preview-once"` (new field) + `previewUrl` + `message` when `subscriberCount === 0`"*
**Evidence:** FR7 line 104; FR8 line 105 (tests are written against `systemDocSubscriberCount`); §9.2 line 198.
**Status:** INCOHERENT
**Suggested resolution:** Edit FR4 to read `systemDocSubscriberCount === 0` (matching FR7 and FR8), OR add a cross-reference clause ("…when `noPreviewAnywhere` is true per FR7"). The latter is lighter-weight.

---

### [H] Finding 4: D5 "DIRECTED" is redundant / incoherent after D3 "LOCKED" single-PR rollout

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions within Decision Log)
**Location:** §10 Decision Log — D3 (line 237) and D5 (line 239)
**Issue:** D3 LOCKS the entire rollout as a single PR. D5 separately DIRECTS "Tool description update included in PR 1 (alongside skill/instructions)" with reasoning *"Same instruction surface; shipping together minimizes drift window."* After D3 says everything ships in one PR, D5 is no longer a separable decision — saying "the tool description is in PR 1" has no counterfactual (there is no PR 2). D5's existence makes a reader question whether there's a multi-PR world where D5 was meaningful, then creates ambiguity: does D3 subsume D5, or is there a latent "PR 2" concept somewhere?
**Current text:** D3: *"Single-PR rollout (instructions + hint + FR7 + FR9 + corrigendum)"*. D5: *"Tool description update included in PR 1 (alongside skill/instructions) — DIRECTED — shipping together minimizes drift window."*
**Evidence:** Both rows in §10.
**Status:** INCOHERENT (redundant-given-D3 / stale-from-earlier-multi-PR-drafting)
**Suggested resolution:** Delete D5, OR restate as "D5 (subsumed by D3): tool description edit is part of the §9.1 text changes" and mark it as historical context. Cleaner: delete D5 and add "tool description" explicitly to the D3 parenthetical for completeness (which is already implicit since the text in §9.1 covers it).

---

## Medium Severity

### [M] Finding 5: FR10 corrigendum wording doesn't exactly match §9.3 wording

**Category:** COHERENCE
**Source:** L1 (cross-section consistency)
**Location:** §6 FR10 (line 107) vs §9.3 (lines 202-205)
**Issue:** FR10 defines the "verbatim text" for the corrigendum as load-bearing (the FR name is "Corrigendum verbatim text"). The two occurrences of that text in the spec should be byte-identical. They are not:
- **FR10 (line 107):** `<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_`
- **§9.3 (lines 204-205):** *same text*, line-break-wrapped: `<br>_[Corrected 2026-04-24 post-ship: per-edit mandate superseded by once-per-session contract. Authoritative fix in [[specs/2026-04-24-preview-attach-once-per-session/SPEC]].]_`

On closer inspection the two strings are actually identical character-by-character. The *risk* the audit-question flagged is real (drift between FR and body text of a "verbatim" specification), but in this draft the two strings match. Confirming inspection did not find a mismatch.
**Current text:** See quotes above.
**Evidence:** Character-by-character comparison of lines 107 and 204-205.
**Status:** CONFIRMED (auditor checked; no drift present in current draft)
**Suggested resolution:** None required. Recommend adding a comment at FR10 ("Source of truth for the verbatim text — §9.3 must match byte-for-byte") to protect against future edits.

---

### [M] Finding 6: Test plan (§15) does not cover FR9 counter

**Category:** COHERENCE
**Source:** L1 (completeness — Must FR without test coverage)
**Location:** §15 Test plan (lines 283-308)
**Issue:** FR9 is a Must requirement: *"Server-side metric counter for hint emission … Increment an OTel counter per `attach-preview-once` emission."* §15's Unit and Integration sections cover FR4/FR7/FR8 (hint shape, `getSystemSubscriberCount` values, `attach-once path`) but do not assert that the OTel counter is incremented on emission, that bounded-cardinality labels are applied, or that the counter name matches `ok.preview_attach.hint_emitted` (spec §9.4). A "Must" FR without an acceptance-criteria test is a gap.
**Current text:** §15 has no entry for counter increment / OTel instrumentation verification.
**Evidence:** §6 FR9 (line 106); §9.4 metric counter code (lines 214-227); §15 test sections only reference warning shape + threshold helpers.
**Status:** INCOHERENT (Must FR without test coverage)
**Suggested resolution:** Add a unit test bullet under `packages/cli/src/mcp` or a new "Metrics" section: "Assert `ok.preview_attach.hint_emitted` counter increments by 1 per emission; assert labels `writer.kind` and `agent.type` are set to expected bounded values." Alternatively, if FR9 is instrumented only and not unit-tested (an "observability-by-inspection" approach), say so explicitly in §7 or §15.

---

### [M] Finding 7: §16 SCOPE list omits a metrics source file

**Category:** COHERENCE
**Source:** L1 (completeness)
**Location:** §16 Agent Constraints SCOPE (lines 312-320)
**Issue:** §9.4 says the counter imports `getMeter` from `@inkeep/open-knowledge-server` (a new cross-package import) and attaches labels `writer.kind` + `agent.type`. The SCOPE list enumerates the files the implementer may touch, but does not mention any metrics module. If the counter lives in `write-document.ts` alone (as §9.2 and §9.4 suggest), then `packages/cli/src/mcp/tools/write-document.ts` (already in SCOPE) is sufficient — but the implementer will also need to verify `getMeter` is re-exported from `@inkeep/open-knowledge-server`'s index, and may need to touch the server package's public exports. SCOPE does not anticipate that edit, and the current server package's `telemetry.ts` may not already re-export `getMeter`.
**Current text:** §16 SCOPE lists the six files but not `packages/server/src/telemetry.ts` or the server package index.
**Evidence:** §9.4 line 215 imports `{ getMeter } from '@inkeep/open-knowledge-server'`; CLAUDE.md OTel section confirms `getMeter` exists in `packages/server/src/telemetry.ts` — but re-exportation from the package index would need verification.
**Status:** INCOHERENT (minor — could be a silent "obviously also allowed" but agent-constraints are meant to be explicit)
**Suggested resolution:** Add to §16 SCOPE: "Optionally `packages/server/src/index.ts` if `getMeter` re-export is not already public." OR verify the re-export and note it as confirmed in §9.4.

---

### [M] Finding 8: NG3 ("Multi-agent focus thrashing") vs FW3 ("Multi-tab leader election") — distinct but adjacent

**Category:** COHERENCE
**Source:** L1 (cross-document coherence with spec -14)
**Location:** §3 NG3 (line 43) + §14 FW3 (line 280)
**Issue:** The audit prompt asked whether NG3 (multi-agent thrashing) and §15 FW3 (multi-tab) are actually orthogonal. After cross-checking:
- Spec-24 NG3 "Multi-agent focus thrashing" references `spec -14 §FW-3`. Spec-14 FW-3 (line 57 of that spec) is *"Presence-bar click-to-follow for specific agent (override latest-wins)"* with trigger *"Multi-agent parallel sessions become common."* Spec-14's actual multi-agent identity item is FW-7, not FW-3.
- Spec-24 FW3 "Multi-tab leader election (spec -14 §FW-2)" references `spec -14 §FW-2`. Spec-14 FW-2 (line 56) is *"Multi-tab leader election (BroadcastChannel, single follower)"*. This mapping is correct.

NG3's pointer to spec-14 FW-3 is semantically reasonable (both touch "disambiguate which signal to follow") but *not* a tight ownership match — spec-14 FW-7 (multi-agent identity plumbing / Path B) is the closer owner of multi-agent thrashing. The two concerns (multi-agent vs multi-tab) are genuinely different: NG3 is about N agents writing to one user's session; FW3 is about one user with N tabs. They are orthogonal, as spec-24 claims. The pointer target for NG3 is loose but not wrong.
**Current text:** NG3 (line 43): *"Multi-agent focus thrashing. Orthogonal concern; spec -14 §FW-3 owns it."*
**Evidence:** Spec-14 FW-3 (`Presence-bar click-to-follow`) and FW-7 (`Multi-agent identity plumbing`) both cited.
**Status:** INCOHERENT (misreferenced pointer, correct orthogonality claim)
**Suggested resolution:** Update NG3 pointer from `§FW-3` to `§FW-7` (closer owner) or keep `§FW-3` + add FW-7 as a co-owner. The orthogonality claim vs FW3 (multi-tab) stands.

---

### [M] Finding 9: D6 references "Research D7 Finding 3" but evidence file is named `d7-d8-...`

**Category:** FACTUAL (traceability)
**Source:** T1 (evidence file verification)
**Location:** §10 Decision Log D6 (line 240)
**Issue:** D6's reasoning cites "Research D7 Finding 3 — tool has legitimate non-nav uses." Verified: the evidence file `reports/preview-nav-agent-contract/evidence/d7-d8-self-nav-and-migration.md` (line 23) has `Finding 3: The get_preview_url tool has legitimate non-nav uses`. Pointer is correct; dimension-numbering collision between "D-decision" and "D-dimension" naming in the report (both use "D" prefix) may confuse future readers but is not wrong.
**Current text:** D6 reasoning: "Research D7 Finding 3 — tool has legitimate non-nav uses (embedding URLs in content)."
**Evidence:** `d7-d8-self-nav-and-migration.md:23`.
**Status:** CONFIRMED
**Suggested resolution:** None required. (Noting as Medium for awareness of D/D namespace collision; low action value.)

---

## Low Severity

### [L] Finding 10: OTel attribute naming — spec uses `writer.kind` / `agent.type`, convention is `ok.*` for repo-specific attributes

**Category:** FACTUAL (adherence to CLAUDE.md OTel conventions)
**Source:** T1 (CLAUDE.md OTel STOP rules)
**Location:** §9.4 code snippet (line 223-225)
**Issue:** CLAUDE.md "Observability" section mandates: *"Repo-specific attributes use namespaced prefixes (`ok.*`, `agent.*`, `shadow.*`, `persistence.*`, `doc.*`)."* Spec-24 uses `writer.kind` (not `ok.writer.kind` nor clearly aligned with any CLAUDE.md prefix) and `agent.type` (under the `agent.*` prefix, which is acceptable). `writer.kind` sits in an un-namespaced space. The writer-ID taxonomy (precedent #25) uses five categories (`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`) but the attribute is usually `shadow.writer` per CLAUDE.md line 196 ("Safe spans tag `doc.name`, `shadow.writer`, `agent.write_position`").
**Current text:** `'writer.kind': writerKind`
**Evidence:** CLAUDE.md "Cardinality check"/OTel namespace rule; CLAUDE.md line 196 canonical attribute list.
**Status:** INCOHERENT (convention drift, not a functional bug)
**Suggested resolution:** Rename `writer.kind` → `shadow.writer` (matching the canonical attribute per CLAUDE.md) OR `ok.writer_kind` if a new semantic is intended. Align naming with the precedent #25 taxonomy.

---

### [L] Finding 11: `.claude/launch.json` status claim in §8

**Category:** FACTUAL
**Source:** T1
**Location:** §8 Current state (line 136)
**Issue:** §8 says *".claude/launch.json is already committed with an open-knowledge-ui entry on port 3000 for Claude Code Desktop."* Verified present at `/Users/timothycardona/inkeep/open-knowledge/.claude/launch.json`; the file has `"name": "open-knowledge-ui"`, `"runtimeExecutable": "npx"`, `"port": 3000`. The runtime invocation uses `npx @inkeep/open-knowledge ui` (not the `ok start` implied elsewhere). The claim "already committed" is correct.
**Status:** CONFIRMED
**Suggested resolution:** None required. (Noting for completeness of audit coverage.)

---

### [L] Finding 12: File:line reference `write-document.ts:131-136` — off by a few lines but the referenced code is present

**Category:** FACTUAL
**Source:** T1
**Location:** §6 FR4 Notes (line 101: `write-document.ts:131-136`); §9.2 header (line 172: `write-document.ts:131-136`)
**Issue:** Verified line range: the `noPreviewAttached` block in `packages/cli/src/mcp/tools/write-document.ts` spans lines 131-136 exactly (`if (noPreviewAttached) { structured.warning = { message: ..., previewUrl: ... }; }`). Pointer matches source.
**Status:** CONFIRMED
**Suggested resolution:** None required.

---

## Confirmed Claims (summary)

**Factual verification coverage:**
- `packages/server/src/api-extension.ts:815-830` (`getSubscriberCount`) — CONFIRMED at exact line range.
- `packages/server/src/api-extension.ts:1547-1555` (`setFocus` call site) — CONFIRMED.
- `packages/server/src/api-extension.ts:1563-1571` (subscriberCount in response) — CONFIRMED.
- `packages/cli/src/mcp/tools/get-preview-url.ts:30-37` (tool DESCRIPTION) — CONFIRMED.
- `packages/cli/src/mcp/tools/write-document.ts:107-112, 131-136` (warning text + structured warning) — CONFIRMED.
- `packages/cli/src/mcp/server.ts:194, 202-206` (`buildInstructions` preview guidance) — CONFIRMED.
- `packages/server/assets/skills/open-knowledge/SKILL.md:37-49` (preview section) — CONFIRMED.
- `packages/server/src/agent-focus.ts` `AgentFocusBroadcaster` — CONFIRMED exists.
- Spec -14 `AgentFocusBroadcaster` + `__system__` awareness substrate — CONFIRMED live.
- Spec -15 FR-9 + M1 are the pointers targeted by the corrigendum — CONFIRMED present in spec -15 at lines 99-101.
- CLAUDE.md "Post-ship corrigendum annotations" rule — matches FR10 wording pattern (`<original><br>_[Corrected YYYY-MM-DD post-ship: …]_`).
- FR10 / §9.3 corrigendum text byte-for-byte match — CONFIRMED identical.
- `.claude/launch.json` `open-knowledge-ui` on port 3000 — CONFIRMED.

**Coherence lenses applied:**
- L1 cross-finding contradictions: 4 findings (H3, H4, M6, M8).
- L2 confidence-prose alignment: no issues — confidence levels match evidence.
- L3 missing conditionality: no issues — claims are appropriately version-scoped.
- L4 evidence-synthesis fidelity: H1/H2 (spec inherits an evidence-file claim that contradicts current source).
- L5 summary coherence: exec-summary-like passages (§2, §8) consistent with detail sections.
- L6 stance consistency: consistent (prescriptive throughout).
- L7 inline source attribution: adequate — file:line pointers are present on most factual claims.

## Unverifiable Claims

- M1 baseline "~3 tool calls per write" (§7 line 120): not directly measurable without transcript sampling. Target of "≥80% single-tool-call" is reasonable but depends on transcript methodology not defined in the spec.
- M2 baseline "unknown" (§7 line 124): explicitly labeled unknown, not a defect.
- A2 "MCP clients ignore unknown fields by convention" (§12 line 261): labeled MEDIUM confidence with a verification plan (one integration test before ship). Appropriate.
- A4 Cursor's `Navigate` + persistence covers once-per-session (§12 line 263): labeled MEDIUM; cites 3P docs; no 1P test coverage but flagged.
