---
title: Design Challenge — Multi-Agent Presence Spec
tags: [spec, meta, design-challenge]
---
# Design Challenge — Multi-Agent Presence Spec

**Artifact:** [[specs/2026-04-21-multi-agent-presence/SPEC]]
**Challenge date:** 2026-04-21
**Reviewer:** Independent challenger (cold read)
**Evidence:** [[specs/2026-04-21-multi-agent-presence/evidence/root-cause-trace]], native code reads of `packages/cli/src/mcp/keepalive.ts`, `packages/server/src/boot.ts`, `packages/server/src/agent-sessions.ts`, `packages/app/src/lib/agent-focus.ts`

---

## Challenges that should reopen decisions

### [H] Challenge 1 — D4 "45s TTL, no heartbeat" is inconsistent with the existing keepalive WS that already solves liveness deterministically

**Decision challenged:** D4 (LOCKED) — `AGENT_PRESENCE_STALE_MS = 45_000`, no heartbeat, reasoning "Matches existing `AGENT_FOCUS_STALE_MS` pattern."

**Counter-argument.** Two problems stack here:

1. **The cited "matches" rationale is factually wrong.** `packages/app/src/lib/agent-focus.ts:17` sets `AGENT_FOCUS_STALE_MS = 5_000` (5 seconds), not 45s. The spec increased the window 9x while justifying it as "consistent." If `agentFocus` has shipped at 5s and we're about to re-derive focus *from* presence (D6 — `pickPrimary` reads `agentPresence`), then a 45s presence TTL means agent-focus nav decisions effectively keep reading a 45s-old `currentDoc` signal. This is a regression of the shipped auto-nav behavior unless `pickPrimary` reads its own 5s window on top.

2. **A deterministic liveness signal already exists and is being ignored.** `packages/cli/src/mcp/keepalive.ts` holds a persistent WebSocket to `/collab/keepalive?pid=${process.pid}` for the lifetime of every MCP stdio process (D-034). `packages/server/src/boot.ts:210-234` intercepts this upgrade and already runs a 30s ping. **This is a server-observable heartbeat that the spec authored as "no heartbeat from MCP process."** The MCP process is ALREADY heartbeating. The spec waves off a heartbeat that is already built. Adding `connectionId` to the keepalive URL (today it carries `pid` only) costs one string concat on the client and gives the server an authoritative `agentId → isConnected` signal — `ws.on('close', () => presenceBroadcaster.clearPresence(agentId))` is \~5 LOC.

Additionally, I found that the spec's §9.4 "Session cleanup" names `closeAllForAgent` as the synchronous cleanup path — but **`closeAllForAgent` is never called from anywhere today** (grep confirms zero non-test call sites). So the TTL-only posture is not "simpler"; it is the *only* cleanup path that currently exists, and the "synchronous cleanup" claim in §9.4 is aspirational. A spec that LOCKS TTL-only should call that out explicitly or wire the missing path.

**Failure mode waved off.** OQ4 was closed as "reset on every write is sufficient." Concrete bug-bash scenario: a user runs Cursor in paired-programming mode; Cursor writes once at t=0 (presence badge appears), the user talks to Cursor for 90 seconds, Cursor writes again at t=90. Under 45s TTL with no heartbeat, the badge disappeared at t=45 and reappears at t=90 — a 45-second ghost period for a live agent. With the keepalive hookup: the badge persists exactly as long as Cursor's MCP stdio is running.

**Current design:** "TTL-based staleness filter, client-side. `AGENT_PRESENCE_STALE_MS = 45_000` (45s). No heartbeat from MCP process. LOCKED."

**Alternative:** `AGENT_PRESENCE_STALE_MS = 5_000` (matches the shipped `AGENT_FOCUS_STALE_MS` actually, not a new value), PLUS extend keepalive URL to `?pid=${pid}&agentId=${connectionId}` and wire `ws.on('close')` in `boot.ts` to `presenceBroadcaster.clearPresence(agentId)`. The TTL becomes a belt-and-suspenders defense; liveness is authoritative via WS.

**Trade-off:** +\~20 LOC server-side (boot.ts close handler + pass broadcaster handle into boot context), +1 URL query param client-side. Gains: deterministic presence (no ghosts, no 45s gaps mid-pairing), and truthful "matches existing pattern" rationale. Loses: nothing — TTL still filters the clock-skew case D4 already accepts.

**Status:** CHALLENGED

**Suggested resolution:** Re-open D4. Either (a) fix the rationale to "we set 45s because keepalive-based cleanup is deferred to Cluster A; the number is a product guess, not matching an existing constant" and accept the ghost window explicitly, or (b) wire keepalive WS-close → `clearPresence` and revert TTL to 5s matching `AGENT_FOCUS_STALE_MS`. Option (b) is \~1 day of work and removes an entire risk row (R2) from §13.

**Reopen or accept?** Reopen. Evidence: `packages/cli/src/mcp/keepalive.ts`, `packages/server/src/boot.ts:210-234`, `packages/app/src/lib/agent-focus.ts:17`.

---

### [H] Challenge 2 — Design C's "⋯ N elsewhere" chip double-counts the popover overflow in D7 and degrades at N≥2

**Decision challenged:** D12 (LOCKED) — Design C (popover chip) for cross-doc agents.

**Counter-argument.** D7 already DELEGATED "M=4 primary avatars side-by-side, remainder behind a `+K` popover chip" for the overflow case. D12 now adds a SEPARATE "⋯ N elsewhere" popover chip for cross-doc agents. Concrete rendering question the spec doesn't answer: what does the bar look like when there are 5 current-doc agents AND 3 cross-doc agents?

- Option (i): `[Andrew] [C1] [C2] [C3] [C4] [+1] [⋯ 3 elsewhere]` — two adjacent chips, both opening popovers, with near-identical visual treatment. Users will click the wrong one.
- Option (ii): collapse overflow cross-doc into the same chip — but then the chip's semantics become "more agents AND agents elsewhere," breaking the clean "current-doc vs cross-doc" mental model D12 is sold on.
- Option (iii): show cross-doc entries INSIDE the `+K` popover — but now there are nested popovers, and the D7/D12 compositional logic is nontrivial.

The user picked Design C in isolation during OQ9, but I don't see evidence the D7+D12 *composition* was evaluated together. The rationale "matches the overflow chip for current-doc agents in D7" is the bug, not the feature: it matches so well the two chips are visually indistinguishable.

Design B (sectioned bar with divider) sidesteps this entirely: current-doc uses its own M=4+overflow rule within the left section; cross-doc uses its own M=K+overflow rule within the right section; the divider owns the semantic split. The cost the spec assigns to B is "takes more horizontal space" — but at **zero cross-doc agents** the divider disappears (same cost as C's chip), and at **one+ cross-doc agents** it's a thin vertical rule, not a chip. The "scalability" advantage C claims (vs A/B) collapses once you realize B also scales via its own K-popover within the right section.

Design C's other selling point — "natural migration path to Cluster A" — is tenuous. Cluster A (per D9 / NOT NOW NG3) is "Activity sidebar," a LEFT-side persistent surface. A chip in the top-right that opens a popover and a sidebar on the left are different interactions; the migration path the spec asserts is not structural.

**Current design:** "Design C — popover chip." Single chip for all cross-doc agents. Chip hidden when none.

**Alternative:** Design B — sectioned bar with pipe divider, each section overflow-chipped independently using the D7 rule. At N=0 cross-doc, divider absent: identical to C. At N≥1 cross-doc, user sees agents inline (not hidden behind a click).

**Trade-off:** B takes a few more horizontal pixels when cross-doc agents exist. Gains: no visual collision with D7 overflow; cross-doc agents visible at a glance (matches D11 "user wants project-wide agent visibility"); single consistent overflow idiom. Loses: compactness at high-N.

**Status:** CHALLENGED

**Suggested resolution:** Re-open D12. Render the composite case (5 current + 3 cross-doc) as a mock for both B and C, and pick with the composition in view.

**Reopen or accept?** Reopen. Evidence: D7 + D12 compositional analysis (spec does not show a mock with both chips active); §9.7b pros/cons treat C in isolation.

---

### [M] Challenge 3 — "Matches existing `AGENT_FOCUS_STALE_MS` pattern" claim contradicts the actual constant

**Decision challenged:** D4 evidence/rationale column.

**Counter-argument.** The Decision Log's evidence cell for D4 reads: "Matches existing `AGENT_FOCUS_STALE_MS` pattern" with link to `packages/app/src/lib/agent-focus.ts:17`. That file defines `AGENT_FOCUS_STALE_MS = 5_000`. The spec's 45s is 9x the cited pattern. This is either (a) a copy-paste error that should be fixed regardless of D4's outcome, or (b) a tell that the rationale was bolted on after the number was picked (see DC3 in the challenge protocol).

This is a **factual** finding about the Decision Log, not a design disagreement — flagging here so the audit trail catches it separately from Challenge 1.

**Status:** CHALLENGED (as a coherence/factual issue tagged onto the design decision)

**Suggested resolution:** If keeping 45s: strike the "matches existing pattern" clause and replace with the actual rationale (product guess, conservative against the 5s `AGENT_FOCUS_STALE_MS`, accepting the ghost window). If dropping to 5s per Challenge 1's alternative: the rationale becomes truthful as written.

**Reopen or accept?** Reopen the evidence cell regardless of outcome.

---

### [M] Challenge 4 — Option 1 (per-doc map-valued) rejection rationale does not hold after D11

**Decision challenged:** §9 Alternatives Option 1 — "in-place per-doc fix." Rejected because "Cluster A (triage #17/#18) needs cross-doc agent visibility; building it first without `__system__` would mean two implementations."

**Counter-argument.** The rejection predates D11 (cross-doc agents in the bar) and D12 (chip popover). After D11+D12, the spec has committed to rendering cross-doc agents NOW — cross-doc visibility is no longer "Cluster A future work," it's a v0 requirement. So the original rejection rationale ("we'd need __system__ eventually for Cluster A") still holds — we *do* need __system__ for cross-doc rendering *now* — but it does so more weakly: we need __system__ for cross-doc visibility, period. Not for Cluster A.

The flip side: Option 1 (per-doc `{agents: {[agentId]: {...}}}`) solves the ACTUAL bug (the stomping) with strictly less surface area — \~50 LOC vs the spec's 10-file, 2 test-file, broadcaster consolidation (FR-11, D6). Cross-doc visibility could still be delivered by the existing `agentFocus` map on `__system__` (untouched, still works), with the presence bar reading from TWO sources: per-doc agents + `__system__` agentFocus for cross-doc. That's the shape today minus the stomping bug.

Is that uglier? Yes — two sources. But the LOCKED D6 consolidates them anyway, which means the spec is choosing a larger diff. The question: does the bug-bash urgency (item #1, P0) justify the larger scope, or would a narrower fix ship faster and let Cluster A drive the consolidation?

This is a real judgment call that the Decision Log resolved via "user directed in intake" without a weighed alternative. I'm surfacing it because "user directed" isn't the same as "alternative examined on merits" — the cold read is that the smaller fix would ship the bug-bash blocker in days while the bigger one risks bundling FR-6/FR-10/FR-11 regressions into the same PR.

**Current design:** Unified substrate on `__system__`; delete per-doc agent awareness entirely; consolidate `AgentFocusBroadcaster` → `AgentPresenceBroadcaster` (10-file diff).

**Alternative:** Ship the narrow per-doc map-valued fix (\~50 LOC) plus the visual overlap fix (D5, still bundled, still correct to bundle). Defer D1/D6/FR-11 unification to Cluster A's spec, where cross-doc rendering is properly scoped. D11's cross-doc "right now" requirement gets delivered via the existing `agentFocus` field on `__system__` (already works), read by the presence bar as a second source.

**Trade-off:** Narrow-fix alternative: 2 sources temporarily, less cleanup. Gains: smaller PR, smaller blast radius on R1 (agent-focus nav regression), faster to bug-bash green. Loses: one more iteration before the "single substrate" design lands.

**Status:** CHALLENGED

**Suggested resolution:** Explicitly document the scope trade-off — either commit to the unified approach as an *architectural* investment (not just a bug fix) with the attendant schedule risk, or narrow to the stomp-fix + overlap-fix and defer unification. Either is fine; the ambiguity is what's costly.

**Reopen or accept?** Reopen scoping. Evidence: D6 is DIRECTED (not LOCKED), indicating the user's latitude on this is still open.

---

## Challenges that strengthen existing decisions

### Option 4 (patch Hocuspocus for per-DC Awareness) — rejection holds

I probed this independently. Looking at `node_modules/@hocuspocus/server/src/Document.ts:49-50` and `DirectConnection.ts:12-27`: `Awareness` is instantiated once per `Document` and `DirectConnection` explicitly does not allocate a new one. Patching this would require a fork of `@hocuspocus/server` and changes to `y-protocols/awareness`'s clientID model — a much larger surface than the map-valued pattern. Rejection evidence is strong in the root-cause trace. No challenge.

### D5 (bundle visual overlap fix) — rationale holds

The overlap fix (triage #1) and the multi-agent fix both touch `PresenceBar.tsx` and the same CSS. Splitting would cause merge churn. The spec's rationale "splitting would require two round-trips on the same file" is verified by the §Affected files table — `PresenceBar.tsx` is the last row. Holds.

### D8 (hide until first write) — holds under OQ2 reopen consideration

I independently arrived at "show idle-but-connected" as a natural extension but the spec's reasoning ("presence means doing work now; avoids ghost badges for MCP sessions that keep-alive but never write") is defensible, and the reversibility note (OQ2 remains re-openable) gives the right escape hatch. No challenge.

### D9 (Cluster A out of scope) — holds

Cluster A's shell decisions (sidebar vs tab vs modal) are legitimately out of scope; shipping the substrate first is the right factoring. No challenge.

---

## Surfaced but not-yet-addressed concerns

### S1 — Broadcast fan-out scales with N-agents × N-browser-tabs, not with N-active-editors

Every awareness update on `__system__` is broadcast to every connected `__system__` client (every browser tab). Today this is low-volume because `agentFocus` fires on doc-nav only (one event per 5-10 seconds per agent). With D10 (`mode: 'editing' | 'idle'` flips), this becomes two events per agent per write — potentially tens per minute for an active agent. At 5 open browser tabs and 3 concurrent agents writing, that's 3 × 2 × 5 = 30 awareness broadcasts/minute. Low but not zero; worth noting so the first field report of "lag on mode flip" isn't mysterious.

The spec's Non-functional §Performance says "Adding N entries to `__system__` awareness is O(N) but N is tiny" — that's about the map size, not the fan-out cost. Different concern. Suggest adding a line to §Performance covering fan-out, or explicitly folding `mode` flips into the FR-4 TTL rather than broadcasting them (derive mode from `ts` — active if `ts < 3s`).

### S2 — Dev-mode warning on legacy `user.type === 'agent'` (FR-9) may spam in test environments

§13 R5 mentions "Log once per clientID" as the mitigation. The current test harness (`createTestClient` in `tests/integration/test-harness.ts`) may legitimately produce this state while migrating existing integration tests. Suggest that the warning be gated on `NODE_ENV !== 'test'` in addition to the per-clientID throttle — otherwise every migration-in-progress PR gets noisy test output.

### S3 — `getPresenceMap()` diagnostic is server-local; no replay for a just-connecting browser

§FR-2 adds `getPresenceMap()` for "diagnostics/tests." What about a just-opened browser tab that connects mid-session? The `__system__` awareness state replays on WS sync, so the browser will see current presence — BUT only after the server has broadcast at least once since the tab connected. If no agent writes for 30 seconds after the tab opens, the bar is empty for 30 seconds despite two Claudes actively writing to other docs. Suggest the broadcaster re-emit its current state on any new `__system__` connection OR add a `GET /api/metrics/agent-presence` that the browser polls on mount (§Observability mentions this endpoint — verify the presence bar uses it as a cold-start fallback).

### S4 — Clock skew footnote undersells the ghost-live agent case

The Failure Modes table treats clock skew as "acceptable." Under the D4 45s TTL, server→client clock drift of even 30s will hide a live agent permanently (client's `now - entry.ts` always > 45s). 30s drift is rare but possible on dev laptops waking from sleep or VMs. Under the proposed 5s TTL (Challenge 1's alternative), this becomes catastrophic. Either clock skew needs an explicit server-authoritative `ts` protocol (server stamps, client trusts, filter on server time via monotonic delta) OR it needs a stronger caveat. Currently neither.

### S5 — FR-3 acceptance criterion is "grep returns zero hits" but the grep pattern will also flag humans

Acceptance criterion: `grep for dc.document.awareness.setLocalState and setLocalStateField('mode' on content docs returns zero hits`. But `dc.document.awareness.setLocalState` for humans (per-tab browser clients) is how human awareness propagates — the grep will return non-zero in `@hocuspocus/provider` internals and likely in existing human-presence code. Suggest narrowing the AC to "in `packages/server/src/agent-sessions.ts` and `packages/server/src/api-extension.ts`," or changing the assertion to a more targeted pattern.

### S6 — No behavior specified for the `(docName, agentId) → new agentId with same docName` case

If a user's Claude Code crashes and respawns, the respawned process gets a new `connectionId` (UUID at `mcp/server.ts:290`). The old `agentPresence[oldUuid]` entry remains until TTL. The new `agentPresence[newUuid]` appears immediately. Bar shows BOTH for up to 45s — looks like two Claudes on one doc when there's actually one. Edge case but common enough (crash recovery, `claude --resume`) to warrant a spec'd behavior. Options: client-side dedupe by `displayName + icon` if two entries share both within the TTL window; or server-side cleanup on reconnect (MCP reads its own stable agentId from env/file). Falls out naturally if Challenge 1's keepalive hookup lands (old WS closes → old entry cleared immediately).

---

## Summary

- Total findings: 9 (2 High, 2 Medium, 5 S-series "surfaced concerns")
- High-severity reopens recommended: **Challenge 1 (D4 TTL + keepalive)** and **Challenge 2 (D12 Design C composition with D7)**
- Medium reopens: Challenge 3 (D4 rationale factual fix), Challenge 4 (Option 1 scope)
- Confirmed design choices: Option 4 rejection, D5, D8, D9 hold

The strongest reopen is Challenge 1: the spec locks a 45s TTL with "no heartbeat" as a simplicity win while the repo already ships a per-MCP-process heartbeat WebSocket (`keepalive.ts`, D-034) that the spec does not cite. Wiring into it turns presence cleanup into a deterministic O(ms) signal and matches the shipped `AGENT_FOCUS_STALE_MS = 5_000` that the spec's own rationale claims to match.
