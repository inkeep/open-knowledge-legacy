---
title: _changelog
tags: [spec, meta]
---
# Changelog — specs/2026-04-21-multi-agent-presence

Append-only process history.

---

## 2026-04-21

- **Intake (SCR).** Framed problem: per-doc agent presence stomps under Hocuspocus's one-Awareness-per-Document constraint; two+ agents collapse to one badge. Ran five-probe stress-test — passed. (See [[specs/2026-04-21-multi-agent-presence/SPEC]] §1.)
- **Scaffold created.** `SPEC.md` at baseline commit `05c7e371`. `evidence/root-cause-trace.md` captures the /explore trace from pre-spec exploration session. `meta/_changelog.md` opened.
- **Evidence captured.** Root cause trace enumerates: (a) per-MCP connectionId is correct per-process; (b) server session keying is correct (`(docName, agentId)`); (c) `Document.awareness` is shared across DCs → single clientID → setLocalState stomp; (d) existing `AgentFocusBroadcaster` on `__system__` already solves this via map-valued field — pattern to extend.
- **World model skipped** (intentionally). /explore pre-work produced the trace brief in the originating conversation; spec lifts from there. No /worldmodel subagent dispatch needed.
- **Direction locked in intake:** Option 2 (unify on `__system__`). User directed during pre-spec AskUserQuestion. Option 1 (per-doc map-valued) and Option 4 (patch Hocuspocus for per-DC Awareness) rejected with rationale in SPEC §9 Alternatives.
- **Decision Log opened with D1-D9.** D1-D3, D5, D9 LOCKED. D4, D6, D8 DIRECTED. D7 DELEGATED.
- **Open Questions opened with OQ1-OQ8.** OQ2-OQ7 are P0 and need user input before the spec can finalize. OQ1 and OQ8 are P2.
- **Visual overlap fix (triage #1) folded in.** User confirmed during intake to bundle (D5 LOCKED).
- **Stopping for user input.** Draft complete; handing off for OQ resolution before Audit (phase 6).

### Resolutions (2026-04-21, same session)

- **OQ2 ✅** Hide until first write (D8 confirmed).
- **OQ4 ✅** No heartbeat.
- **OQ5 ✅** `AGENT_PRESENCE_STALE_MS = 45_000` (45s). D4 upgraded DIRECTED → LOCKED.
- **OQ6 ✅** Keep `mode` field. D10 added LOCKED.
- **OQ7 ✅** Cross-doc agents visible in bar with priority to current-doc. D11 added LOCKED. User note: "explore options for how I can see all agents connected to my project" — prompts OQ9.
- **OQ9 ✅** Design C (popover chip). D12 added LOCKED. FR-15 description specialized to the popover chip shape.
- **All P0 open questions resolved.** Spec is ready for Audit (phase 6) on user signal.

### Audit + design challenge (2026-04-21, same session)

- **Auditor** (cold read via `shared:audit`) produced 11 findings: 2 high, 5 medium, 4 low. Code-fact citations all verified at baseline `05c7e371`. Key findings:
  - H1: D4 rationale was incoherent — cited "matches AGENT\_FOCUS\_STALE\_MS pattern" but that constant is 5s, spec locked 45s.
  - H2: FR-14 / OQ3 mismatch — FR-14 was "Could" but OQ3 unresolved. Resolved by moving FR-14 to Future Work + adding NG8.
  - Medium cluster: SCOPE ↔ §9 mismatches; defensive-walk rationale missing in §9.5; FR-3 grep criterion false-positive on teardown nulls; Participant shape post-refactor underspecified.
- **Challenger** (cold read via design-challenge protocol) produced 4 reopens + 5 surfaced concerns:
  - **Challenge 1 (H): Keepalive WS already exists.** `packages/cli/src/mcp/keepalive.ts` ↔ `boot.ts:210-234` ships a per-MCP heartbeat today. Spec authored "no heartbeat" against infra that's already there.
  - **Challenge 2 (H): Design C chip collision with D7.** Two adjacent popover chips (`+K` overflow + `⋯ N elsewhere`) visually indistinguishable.
  - Challenge 3 (M): D4 rationale factual error — subsumed by Challenge 1.
  - Challenge 4 (M): Option 1 vs Option 2 scope weighed differently after D11 locked cross-doc in v0.
- **All three reopens resolved** in user-directed batch:
  - **D4 LOCKED:** Wire keepalive → clearPresence; `AGENT_PRESENCE_STALE_MS = 5_000` as backup. D13 + D14 added for the client/server wiring.
  - **D12 LOCKED:** Switched from Design C (popover chip) to Design B (sectioned bar with divider).
  - **D1 rationale rewritten:** Removed "Cluster A needs it" argument; documented as architectural investment over narrow fix.
- **Silent corrections applied** in the full rewrite: file count (10→11), `core/index.ts` added to SCOPE, R1 clarified for parity-test updates, FR-3 AC reworded to include teardown nulls, §9.6b added for Participant shape, dead pointer (`§D-034`) removed, defensive-walk rationale copied into §9.5, S1 fan-out note added to NFR performance, S2 test-env warning gate added to FR-10, S3 cold-start replay covered by FR-12, S4 clock skew caveat added to R2, S6 respawn dedup resolves naturally under D4's keepalive wiring.
- **Status change:** Draft → Scope Frozen. All P0 OQs resolved (9 ✅); no INVESTIGATING or ASSUMED decisions remain.

### Finalization (2026-04-21, session close)

- **Mechanical adversarial checks** passed:
  - Zero ASSUMED decisions. 14 total: 10 LOCKED, 1 DIRECTED (D6, reversible), 1 DELEGATED (D7, visual polish), 2 LOCKED keepalive wiring (D13, D14).
  - 1-way-door decisions (D2, D3) both LOCKED with supporting evidence.
  - Non-goal temporal tags: all audited. NG1/NG2 NEVER (structural/prior-spec). NG3/NG4/NG5/NG7/NG8 NOT NOW (deferral reasons recorded). NG6 NOT UNLESS (escape-hatch).
- **Resolution completeness gate** passed for all In Scope items:
  - All decisions made; 3P dependencies named (shadcn Popover, HocuspocusProvider, keepalive WS primitive); architectural viability validated via Challenger; integration feasibility confirmed via code traces; acceptance criteria are verifiable (grep, integration, E2E, manual).
- **Future Work** classified: Cluster A (Identified), FR-14 color variation (Noted), V0-14 per-agent undo (Noted), capability badges (Noted), narrow-viewport collapse (Noted).
- **Baseline commit** unchanged (`05c7e371`) — no repo commits during session.
- **Artifact sync verified:** SPEC.md, evidence/root-cause-trace.md, meta/\_changelog.md, meta/audit-findings.md, meta/design-challenge.md all current and coherent.
- **Handoff:** Ready for `/ship`. Suggested title: `feat(presence): unify agent presence on __system__ with deterministic keepalive cleanup`.
- **Tangent for the user:** `projects/v0-launch/bug-bash-triage.md` references `specs/2026-04-17-multi-agent-presence/SPEC.md` (the placeholder path that never existed). The real spec is at `specs/2026-04-21-multi-agent-presence/SPEC.md`. Worth a one-line edit to the triage doc when convenient — not done here to avoid scope creep.
- **FR-15 added** to requirements table to reflect D11.
- **§9.7b added** to proposed solution with the three candidate designs.



