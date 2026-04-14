# Spec changelog

## 2026-04-14 — spec created, scope frozen, decisions locked

Session: conversational shaping via `/spec` skill. Baseline commit `892290a`.

**Sequence of decisions (in order of conversation):**

1. Framed the problem: nav primitive (technical) + cadence norms (product) are complementary; neither works alone. Nav without cadence = flicker; cadence without nav = invisible work.
2. Investigated existing primitives via subagent (`Explore`): confirmed `__system__` CC1 broadcast transport, `SystemDocSubscriber` mount, URL-hash navigation, activity Y.Map scope, no existing focus signal. Persisted to `evidence/`.
3. D1 — Transport: locked awareness on `__system__` over CC1-payload-extension and activity-Y.Map. Rationale: awareness is global per connection, per-peer isolated by `clientID`, auto-expires, and requires no contract change.
4. D2 — Primary heuristic: locked latest-wins + 300ms debounce. Matches pair-programming intuition.
5. D3 — UX: locked follow-with-pin over always-follow / opt-in toggle / follow-with-undo-toast.
6. D4 — User-edit guard: locked pause-if-typed-in-last-3s.
7. D5 — Multi-tab: locked single-tab v1, no BroadcastChannel coordination. Deferred as FW-2.
8. User challenged #6 (explicit `open_file` MCP tool) — reframed as "the real problem is agent batching cadence, not the nav tool surface." Reopened to consider cadence norms.
9. Enumerated four norms (N1 hub-maintenance, N2 small-edits, N3 worklog, N4 link-as-you-write). Analyzed through usability/efficiency lens.
10. D6 — Cadence: locked N1 + N4 as instruction updates. Dropped N2 (emergent from N1). Skipped N3 (redundant with hubs, bureaucratic).
11. D7 — Tool nudge: locked orphan + parent-candidate hint in `write_document` response. Lightweight; makes right path the path of least resistance.
12. D8 — Explicit `open_file` tool: deferred as FW-1.
13. D9 — Enforcement: locked soft-nudge only. Nav flicker is self-correcting feedback signal.
14. D10 — Awareness clientID strategy: locked per-agent DirectConnection (vs. server-wide single slot with agent list).

**Open questions at finalization:** none. Assumption A2 (awareness interaction with `isSystemDoc` skip logic) flagged for 5-minute verification during implementation.

**Future Work registered:** FW-1 (open_file tool), FW-2 (multi-tab leader election), FW-3 (click-to-follow specific agent), FW-4 (hard cadence enforcement), FW-5 (worklog doc pattern), FW-6 (agent-visible recent-edits summary).

**Artifacts:**
- `SPEC.md` — full PRD + technical spec (~400 lines)
- `evidence/cc1-and-awareness-transport.md` — transport decision rationale
- `evidence/nav-and-url-state.md` — URL hash navigation mechanics
- `evidence/write-path-and-activity.md` — agent write flow and current side-effects
