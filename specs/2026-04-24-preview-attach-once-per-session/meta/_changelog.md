# Changelog

## 2026-04-24 — Spec drafted

- Scaffolded spec at `specs/2026-04-24-preview-attach-once-per-session/` with baseline commit `46751128`.
- Drafted SPEC.md from the research report [[reports/preview-nav-agent-contract/REPORT]]. SCR, goals, non-goals, personas, user journeys, FRs, decisions, open questions, assumptions, risks, test plan, agent constraints all populated.
- Inherited evidence base from the research report; no new evidence files created at scaffolding (research already captured D1-D8 in `reports/preview-nav-agent-contract/evidence/`).
- 3 LOCKED decisions (D1: flip contract, D6: rescope don't retract `get_preview_url`, D8: no breaking change) + 1 DIRECTED (D5: tool description shipped alongside instruction surfaces).
- 5 Open Questions carried to user: OQ1 (new spec vs amendment), OQ2 (PR sequencing), OQ3 (ship FR7 now?), OQ4 (corrigendum wording), OQ5 (telemetry), OQ6 (multi-tab — deferred).

## 2026-04-24 — Open questions resolved; cascade applied

User batch answered: OQ1=A (new spec), OQ2=B (single PR), OQ3=A (include FR7), OQ4=verbatim, OQ5=C (both counter + transcript). Cascade:
- Promoted FR7 from Should→Must; added FR9 (server-side OTel counter) and FR10 (corrigendum verbatim text) to the §6 requirements table.
- D2/D3/D4/D7 moved from Open→LOCKED; added D9 for corrigendum wording LOCKED.
- NG4 reframed from "NOT NOW — no telemetry" to "NOT UNLESS — extended telemetry beyond FR9 counter."
- §9 reframed from two-PR split to single PR with four subsections (9.1 text, 9.2 hint, 9.3 corrigendum, 9.4 counter).
- OQ1-OQ5 struck through in §11 as RESOLVED; OQ6 kept as P2 Future Work pointer.
- §7 M1 instrumentation wired to FR9; M2 retargeted to hint-emission volume via the counter.
- Status: Draft → Ready for audit.

## 2026-04-24 — Audit + challenger processed; pure corrections applied

Auditor: 4H / 5M / 3L. Challenger: 4H / 4M / 2L. Both corroborated H1/H2 on non-existent PREVIEW_GUIDANCE constant.

**Verified via codebase grep** (`grep -rn "PREVIEW_GUIDANCE" packages/` → no results): spec -22 D13 deleted the shared constant and `CLAUDE_MD_SECTION` injection. Current topology is THREE surfaces (not four) and no constant-based sync.

**Pure corrections autonomously applied (no decision-reopens):**
- §1 Situation + §1 Complication + G4: surface count 4→3; cite spec -22 D13 as the deletion event.
- §8 Current state: rewrite to reflect three-surface post-spec-22 topology.
- FR1: no longer "replace PREVIEW_GUIDANCE"; now "rewrite inline template literal in `server.ts:202-206`."
- FR4: signal source now FR7's `systemSubscriberCount === 0`, not stale `subscriberCount === 0` (audit H3).
- FR5: merged with FR10; old FR10 row deleted; single verbatim corrigendum row (challenger M8).
- FR7: split into FR7a (server helper + new response field `systemSubscriberCount`) and FR7b (MCP tool reader), per challenger M6.
- FR9: counter moves from MCP tool to `packages/server/src/api-extension.ts` — initTelemetry is only called in `bootServer()`, so CLI-side getMeter would be a no-op (challenger H2). Attribute naming updated from `writer.kind` to canonical `shadow.writer` per CLAUDE.md line 196 (audit L10); `agent.type` now cites `resolveAgentType(clientName)` at `api-extension.ts:1219-1228` (challenger M5).
- §9.2 rewritten to show both package-boundary sides (server helper + MCP tool reader) per challenger M6.
- §9.4 counter code block moved server-side; uses `shadow.writer` label.
- §16 SCOPE: remove non-existent `packages/cli/src/content/init.ts` — `CLAUDE_MD_SECTION`; update `api-extension.ts` entry to include FR7a + FR9 counter emission.
- §10 D5 deleted — redundant under D3 LOCKED single-PR (audit H4).
- §3 NG3: pointer corrected from spec-14 §FW-3 to §FW-7 (audit M8 — tighter owner).
- §15 test plan: add FR9 counter tests + FR7a HTTP-contract field assertion (audit M6).
- §5 J4: add transient description-vs-cached-behavior contradiction note (challenger L10).
- §7 M1: tighten target definition — "not preceded by `get_preview_url` OR host preview-nav within same turn" (challenger L9).

**Confirmed non-issues:** FR10/§9.3 corrigendum text byte-identical (audit M5). `.claude/launch.json` claim in §8 (audit L11). write-document.ts:131-136 line reference (audit L12). D6 pointer to `d7-d8-self-nav-and-migration.md` Finding 3 (audit M9).

**Escalated to user as decision reopens** (see next session turn):
1. **Challenger H3**: "once per session" narrative under-specifies the multi-tab / reconnect / shared-preview cases. Mechanism (FR7) is correct; user-facing narrative needs reframe from session-based to transport-presence-based.
2. **Challenger H4**: D3 LOCKED single-PR rollout reopen — research recommended two PRs; spec's "shared test surface" rationale doesn't hold given §15 has four distinct test harnesses.
3. **Challenger M7**: add anti-drift lint FR11? Optional insurance against the three-surface drift that spec -22 already had to fix.

The Shape D flip itself (D1 LOCKED) held up under challenge — no signal to reopen.

## 2026-04-24 — Post-assessment user decisions cascaded

User answers on the three escalated design challenges:
1. **Challenger H3 (narrative reframe): accepted.** §1 Resolution, G1/G2, §9.1 guidance text all reframed from session-based ("once per session") to transport-presence-based ("when no editor is attached"). OQ6 promoted to P0 and resolved inline — mechanism already handles multi-tab correctly; narrative now matches. Multi-agent share explicitly allowed in §9.1 text.
2. **Challenger H4 (2-PR split): accepted.** D3 reopened: ship PR 1 (text + corrigendum, zero runtime) first; PR 2 (runtime + FR9 counter) after dogfood stabilizes. Reverses OQ2=B. §9 preamble rewritten with sequencing.
3. **Challenger M7 (anti-drift lint FR11): deferred to FW5.** Added to §14 Future Work with explicit trigger; no scope added to this spec.

All three decision reopens resolved. Spec ready for finalization (Step 8).

## 2026-04-24 — Finalization

Mechanical adversarial checks:
- No ASSUMED / INVESTIGATING / Open decisions remain; D1-D9 all LOCKED (D5 deleted as redundant per audit H4).
- No 1-way-door decision at LOW or MEDIUM confidence.
- Assumption confidence: A1/A3 HIGH (production-proven); A2/A4 MEDIUM with verification plans.
- Non-goal temporal tags checked: NG1 (MCP resources) = NOT NOW, NG2 (retract `get_preview_url`) = NOT NOW, NG3 (multi-agent thrashing, pointer corrected to FW-7) = NOT NOW, NG4 (extended telemetry) = NOT UNLESS, NG5 (remove server-push) = NEVER UNLESS. All appropriate.

Resolution completeness gate for all In Scope FRs:
- FR1-FR3: agent-facing text edits — 3 files named, wording sketched in §9.1.
- FR4: structured hint shape defined; reads FR7's `systemSubscriberCount`.
- FR5: corrigendum verbatim text defined; target occurrences named.
- FR6: backwards-compat coverage defined.
- FR7a/FR7b: server helper + HTTP-contract change + MCP tool reader all named with file:line.
- FR8: test matrix defined against FR4 + FR7.
- FR9: counter site (server), name, labels (`shadow.writer`, `agent.type`), enum source (`resolveAgentType`) all named.
- No dependency on any Out of Scope item.

Agent Constraints (§16) verified — SCOPE / EXCLUDE / STOP_IF / ASK_FIRST all populated.

Future Work has maturity tiers on FW1-FW5.

Status: Ready for audit → Ready for implementation.
Baseline commit: re-verified at `46751128` (no upstream changes since scaffolding — spec was written in one session).
