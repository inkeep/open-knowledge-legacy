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

## 2026-04-14 — revision after PR #130 review (4 findings applied)

PR-review round from `inkeep-internal-ci` (4 findings + 1 consider). All factually verified before applying.

**Major — applied:**

1. **Awareness state shape** (SPEC §6.1, evidence/cc1-and-awareness-transport.md): the initial flat shape `{agentId, classification, currentDoc, ...}` collided with the existing `AwarenessState` type in `packages/core/src/types/awareness.ts`, which separates identity (`user: AwarenessUser`) from transient state (`mode`, `cursor`). Revised to add a parallel top-level `agentFocus?: Record<agentId, AgentFocusEntry>` field. Preserves existing structure; additive.
2. **`isSystemDoc` guard collision** (SPEC §6.1, §6.2, evidence/write-path-and-activity.md): `AgentSessionManager.getSession(docName)` at `agent-sessions.ts:101-103` throws when `isSystemDoc(docName)` is true. The initial design opened a per-agent `DirectConnection` to `__system__` — would either break the cross-cutting CC1 policy or require a parallel lifecycle. Revised to reuse the existing server-wide `__system__` DC owned by the CC1 broadcaster, via a new `AgentFocusBroadcaster` helper that maintains the `agentFocus` map via `setFocus` / `clearFocus`.
3. D10 reopened and relocked with new resolution (shared DC + map). New D11 added for the `agentFocus` field-shape decision. A2 rewritten — confidence raised from MEDIUM to HIGH since the shared-DC approach makes the `isSystemDoc` concern moot (we were always going to use the CC1 DC, which already carries awareness).
4. Implementation plan §14 restructured: new step 1 (core type extension), new step 2 (`AgentFocusBroadcaster` helper), step 3 (session-lifecycle wiring) replaces the old "open per-agent DC." Renumbered subsequent steps.

**Minor — applied:**

5. **Hub detection wording** (SPEC §6.5): instruction text said "any top-level doc in that folder"; impl §6.6 said "file whose name matches the folder name." Aligned instruction to match impl — now reads "a file whose name matches the folder name (e.g. `reports/r1/r1.md`)." Also added `README.md` to the explicit list.
6. **J2 typing-guard UX** (SPEC §4): removed the "Pin indicator briefly shows 'Agent writing elsewhere'" claim that wasn't specified in §6.4. Typing-guard suppression is now explicitly silent — presence bar remains the ambient signal if the user glances at it.

**Consider — applied:**

7. **Frontmatter format**: converted YAML frontmatter to markdown-header format matching recent specs (`specs/2026-04-14-clone-from-github/SPEC.md`, `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md`). Style consistency with repo convention.

No other findings. No design challenges reopened.
