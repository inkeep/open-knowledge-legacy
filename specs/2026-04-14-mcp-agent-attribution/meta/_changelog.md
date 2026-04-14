# Changelog

## 2026-04-14 — Initial draft

- Created SPEC.md with problem statement, goals, non-goals, detailed design (7 subsections), acceptance criteria (8 ACs), 4 implementation phases
- Persisted 3 evidence files: pipeline-trace, mcp-sdk-identity, l2-attribution-design
- Scope confirmed with Miles: data contract + agent label config only. Per-agent undo and timeline UI rendering explicitly out of scope.
- 8 decisions locked (D1-D5 from research, D6-D8 from scoping)
- 4 open questions identified (OQ-1 through OQ-4)
- Baseline commit: ce09519

## 2026-04-14 — OQ resolution (all 4 P0 resolved)

- OQ-1 → D9: Contributor accumulator in dedicated `contributor-tracker.ts` module
- OQ-2 → D10: Custom `ok-contributors:` block with `%x00` null-byte delimiter (not git trailers)
- OQ-3 → D11: No session eviction for stdio — same-process assumption; revisit for HTTP transport
- OQ-4 → D12: Raw UUID in HTTP body; server prefixes `agent-`
- Cascaded decisions into SPEC.md §7.2 (raw UUID), §7.3 (server prefix), §7.5 (dedicated module), §7.6 (%x00 delimiter)
- Updated Agent Constraints SCOPE to include `contributor-tracker.ts`
- Updated Phase 3 to reference new module
- All P0 open questions resolved — spec ready for audit

## 2026-04-14 — Audit findings applied (7 corrections)

- H1: Rewrote §7.3 code to use current ActivityEntry shape (not TQ11 refactored)
- H2/F3: Clarified DEFAULT_AGENT_ID removal — named constant removed, fallback inlined
- F2: Fixed drain ordering — read then clear after commit success
- F4: Adopted Ref pattern `{ current: AgentIdentity }` matching ShadowRef idiom
- F9: Fixed colorSeed to prefer stable identity (label > clientInfo.name > connectionId)
- F12: Added closeSession/closeAllForAgent/closeAllForDoc signatures
- L2: Made RegisterAllToolsOptions interface change explicit
- D11: Amended rationale for connected mode (MCP → separate start instance)
- Pending user decisions: timeline-query.ts scope (F1/F5/F8), ok-contributors format (F6/M1), probe script commitment (M2)

## 2026-04-14 — Design challenge resolution (3 user decisions)

- D13: timeline-query.ts added to scope — shared parseContributors() in core, both readers consume it (per precedent #4)
- D14: ok-contributors format changed to JSON lines — handles spaces, extensible, trivially parseable
- D15: Probe scripts deleted, not committed. Evidence references updated to methodology description.
- D16-D18: Drain ordering, Ref pattern, color seed stability — all locked from audit corrections
- Added §7.6 (shared contributor parser in core), §7.8 (timeline query extension)
- Updated Phase 4 to include timeline-query.ts + shared parser
- Updated SCOPE to include timeline-query.ts, core/types/timeline.ts
- Section numbering adjusted (§7.6-7.10)
- All audit and challenger findings resolved — spec ready for finalization

## 2026-04-14 — Timeline UI promoted to In Scope

- PR #39 (timeline & rollback) merged 2026-04-14 — "PR #39 owns timeline UI" rationale is stale
- Added §7.11 Timeline Panel UI with rendering spec for contributors
- Added AC-9 (timeline rendering acceptance criteria)
- Updated D8 from OUT OF SCOPE to IN SCOPE
- Added TimelinePanel.tsx to SCOPE, moved timeline rendering from Future Work/Identified
- Updated Phase 4 to include step 18 (TimelinePanel.tsx update)
- Renumbered AC-8 → AC-10, sections 7.9-7.10 → 7.12-7.13

## 2026-04-14 — Finalized

- Removed stale "Timeline panel UI rendering" from Out of Scope (contradicted D8)
- Updated STOP_IF for `%x00` delimiter (original `|` collision concern resolved by D10)
- Final completeness sweep: all P0s resolved, all decisions LOCKED, all ACs verifiable
- Status → FINAL, baseline → 107e2ef
