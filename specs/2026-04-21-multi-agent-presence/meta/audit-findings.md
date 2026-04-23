---
title: Audit Findings — Multi-Agent Presence Spec
tags: [spec, meta, audit]
---
# Audit Findings — Multi-Agent Presence Spec

**Artifact:** [[specs/2026-04-21-multi-agent-presence/SPEC]]
**Evidence audited:** [[specs/2026-04-21-multi-agent-presence/evidence/root-cause-trace]]
**Audit date:** 2026-04-21
**Auditor posture:** cold read — no author context carried in
**Total findings:** 11 (2 high, 5 medium, 4 low)

The spec's core code-fact citations hold up well: `agent-sessions.ts:202-211`, `api-extension.ts:1085, 1100`, `server.ts:290`, Hocuspocus `Document.ts:49-50`, and the `agent-focus.ts` map-valued pattern were all spot-checked against `05c7e371` and match. The architectural claim that `DirectConnection` contains no per-DC `Awareness` is verifiable from `node_modules/@hocuspocus/server/src/DirectConnection.ts`. High-severity findings are two internal-coherence issues around OQ5/D4 and the FR-9/FR-3 narrowing vs. FR-14 same-brand color variation. Medium findings are SCOPE / §9 mismatches and under-specified touchpoints (PresenceAvatar, clientID filter on `__system__`).

---

## High Severity

### [H1] D4 rationale contradicts its chosen value; OQ5 resolution is off-menu

**Category:** COHERENCE
**Source:** L1 (cross-finding contradiction), L2 (confidence-prose misalignment)
**Location:** §10 D4, §11 OQ5
**Issue:** D4 rationale says the TTL value "Matches existing `AGENT_FOCUS_STALE_MS` pattern" and cites `packages/app/src/lib/agent-focus.ts:17` as evidence. But `AGENT_FOCUS_STALE_MS = 5_000` (5 seconds) at that exact line, and the resolution locks `AGENT_PRESENCE_STALE_MS = 45_000` (45 seconds) — 9× the cited value. Separately, OQ5 offered three concrete options — 5s, 30s, 60s — and the resolution (45s) is none of them. That's not a fatal design flaw, but the "matches pattern" justification is misleading: the pattern matched is the *mechanism* (TTL filter), not the *value*.
**Current text (D4 Rationale):** "Matches existing `AGENT_FOCUS_STALE_MS` pattern. Value is reversible."
**Current text (OQ5 Options):** "5s (matches `AGENT_FOCUS_STALE_MS`), 30s (matches awareness default), 60s (generous), or driven by the keepalive WS (see §D-034 in CLAUDE.md)."
**Evidence:** `packages/app/src/lib/agent-focus.ts:17` reads `export const AGENT_FOCUS_STALE_MS = 5_000;`. Docstring on `AgentFocusEntry.ts` (`packages/core/src/types/awareness.ts:40`) says "Stale entries (>5s) are ignored" — so every on-repo anchor for the "pattern" is 5s, not 45s.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite D4 rationale to separate mechanism ("TTL filter matches the AGENT\_FOCUS\_STALE\_MS pattern") from value choice ("45s chosen because agent writes are lumpy and the 5s window caused spurious disappearance during long-running tool calls" — or whatever the real reason is). Explain why 45s beats the three offered options.

---

### [H2] FR-14 (per-brand color variation) contradicts FR-9's narrowing of the awareness schema and the OQ3 recommendation

**Category:** COHERENCE
**Source:** L1, L6 (stance consistency)
**Location:** §6 FR-9, FR-14; §11 OQ3
**Issue:** FR-14 (Could) proposes "Seed color from `agentId` after the base icon color — modulo small hue variation." But `AgentPresenceEntry.color` is a single `string` (hex) per §9.1, and the server computes it from `AGENT_ICON_COLORS[icon] ?? colorFromSeed(...)` (today's pattern at `agent-sessions.ts:201`). OQ3 then says "Recommendation: leave identical for v0; revisit if bug-bash demos make confusion visible" — i.e. do NOT implement FR-14 for v0. But FR-14 is still listed as a "Could" requirement, and OQ3 has no `✅ Resolved` marker, unlike OQ2/OQ4/OQ5/OQ6/OQ7/OQ9. This is unresolved: is FR-14 in scope, out of scope, or "Could means maybe"? Combined with `AGENT_LABEL` env var (`packages/cli/src/mcp/server.ts:291`) providing a free-form label alternative, the correct v0 story may be "labels, not colors." The spec should pick one.
**Current text (OQ3):** "Yes — product judgment. Recommendation: leave identical for v0; revisit if bug-bash demos make confusion visible."
**Current text (FR-14):** "Per-agent color variation when two same-brand agents coexist (e.g. 2× Claude)."
**Evidence:** OQ2/4/5/6/7/9 all carry "✅ **Resolved 2026-04-21:**" prefixes; OQ3 does not. The mismatch matters because FR-14 is the only color-mutation path — without resolution, implementer has no guidance.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) resolve OQ3 with `✅ Resolved 2026-04-21: Leave identical for v0 (drop FR-14 from scope; revisit if bug-bash demos reveal confusion)`, and demote FR-14 to a §12 Future Work bullet; or (b) resolve OQ3 in favor of FR-14 and promote it to Must/Should. "Could" + unresolved OQ is the worst state.

---

## Medium Severity

### [M1] §15 SCOPE omits `packages/core/src/index.ts`, which §9 Affected Files lists as a touched file

**Category:** COHERENCE
**Source:** L1 (internal coherence)
**Location:** §9 "Affected files (10)" table; §15 SCOPE
**Issue:** The §9 table lists **11** rows (not 10 as the header claims), and one of them — `packages/core/src/index.ts` ("Export new type") — is absent from the §15 SCOPE list. Any `/ship` handoff would miss the re-export edit, causing a TS build break at consumers of `AgentPresenceEntry`.
**Current text (§15 SCOPE):** "`packages/core/src/types/awareness.ts`, `packages/server/src/agent-focus.ts` (→ rename `agent-presence.ts`), `packages/server/src/agent-sessions.ts`, `packages/server/src/api-extension.ts` (three write handlers), `packages/server/src/standalone.ts` (broadcaster wiring), `packages/app/src/lib/agent-focus.ts` (→ `agent-presence.ts`), `packages/app/src/components/SystemDocSubscriber.tsx`, `packages/app/src/editor/DocumentContext.tsx`, `packages/app/src/presence/use-presence.ts`, `packages/app/src/presence/PresenceBar.tsx`."
**Evidence:** Inspecting `packages/core/src/index.ts:100` and `:119` confirms `AgentFocusEntry` and `AGENT_ICON_COLORS` are re-exported there today. Adding `AgentPresenceEntry` requires editing the same file.
**Status:** INCOHERENT
**Suggested resolution:** Add `packages/core/src/index.ts` to the SCOPE list in §15. Fix the `(10)` header in §9 to `(11)`.

---

### [M2] §15 SCOPE omits the new test files it names in FR-7 / FR-8

**Category:** COHERENCE
**Source:** L1
**Location:** §6 FR-7, FR-8; §15 SCOPE
**Issue:** §15 SCOPE currently ends with "New tests: `packages/app/tests/integration/multi-agent-presence.test.ts`, `packages/app/tests/stress/multi-agent-presence.e2e.ts`." — so the new test files ARE in SCOPE. However, `packages/app/tests/integration/agent-focus-wiring.test.ts` is load-bearing per R1 and D6 ("behavior-parity gate") but NOT in SCOPE, meaning the implementer may feel forbidden from editing it if the broadcaster rename requires test updates. SCOPE should explicitly permit test-file edits for parity preservation.
**Current text (R1):** "Behavior-parity test — `agent-focus-wiring.test.ts` must pass unchanged after refactor. If the test file needs to change, that's the signal to reopen D6."
**Evidence:** `packages/app/tests/integration/agent-focus-wiring.test.ts` exists and references `server.instance.agentFocusBroadcaster.getFocusMap()` on lines 49, 67, 77, 81. Renaming the server-side broadcaster to `AgentPresenceBroadcaster` WILL require updating these references, which contradicts "must pass unchanged."
**Status:** INCOHERENT
**Suggested resolution:** Clarify R1: the *behavior* must remain parity; the *test file* may receive import-path / property-name edits. Add `packages/app/tests/integration/agent-focus-wiring.test.ts` and `packages/server/src/agent-focus.test.ts` to a "SCOPE (parity updates only)" sub-list.

---

### [M3] Client-side ambiguity: `__system__` awareness has only one producer (server clientID), but the helper walks all peers

**Category:** COHERENCE / FACTUAL
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §9.5 `pickAgentsForDoc` signature, §8 bullet "`SystemDocSubscriber.tsx` opens `__system__` provider at app mount"
**Issue:** Current `pickPrimary` in `packages/app/src/lib/agent-focus.ts:48-62` walks `awareness.getStates().values()` — iterating ALL awareness peers (not just the server). The proposed `pickAgentsForDoc` repeats the pattern. If the test hook at `SystemDocSubscriber.tsx:119-136` injects a fake awareness peer (clientID `999999`), the helper would return entries from it. The spec should document that (a) only the server clientID actually publishes `agentPresence` in production, and (b) the iteration is defensive — matching the comment block at `packages/app/src/lib/agent-focus.ts:4-9` ("walking is defensive against future producers"). Without this note, a reader may wonder why the client walks all peers when only one produces.
**Current text:** "(a) humans via activeProvider.awareness (existing logic, filtered to user.type==='human') (b) agents via pickAgentsForDoc(systemProvider.awareness, activeDocName, now) with tick"
**Evidence:** `packages/app/src/lib/agent-focus.ts:4-9` has the defensive-walk comment today; the new spec does not.
**Status:** UNVERIFIABLE (design intent is right; the written doc hides it)
**Suggested resolution:** Copy the defensive-walk rationale into §9.5 or §8.

---

### [M4] FR-3 acceptance criterion may generate a false-positive grep hit on line 1193 (`agentFocusBroadcaster?.setFocus(...)`)

**Category:** COHERENCE
**Source:** L4
**Location:** §6 FR-3 acceptance criterion
**Issue:** FR-3 says the acceptance criterion is "Grep for `dc.document.awareness.setLocalState` and `setLocalStateField('mode'` on content docs returns zero hits in `packages/server/src/**`." That's checkable. But the `agentFocusBroadcaster?.setFocus(...)` call at `api-extension.ts:1193` does NOT match that grep AND stays in place under D6 (renamed to `presenceBroadcaster.setPresence`). So the grep correctly scopes to the per-doc awareness. However, lines 234, 247, 266, 287 of `agent-sessions.ts` each call `dc.document.awareness.setLocalState(null)` on close — these will match the grep. The spec needs to either (a) exempt these null-clearing lines in the acceptance criterion or (b) explicitly remove them as part of FR-3. Both readings are plausible from the current text.
**Current text:** "The three `handleAgentWrite*` handlers' `setLocalStateField('mode', ...)` on the content-doc awareness is relocated to the presence broadcaster. Grep for `dc.document.awareness.setLocalState` and `setLocalStateField('mode'` on content docs returns zero hits in `packages/server/src/**`."
**Evidence:** `packages/server/src/agent-sessions.ts:234,247,266,287` all invoke `dc.document.awareness.setLocalState(null)` on session teardown.
**Status:** INCOHERENT
**Suggested resolution:** Reword FR-3 acceptance to: "…returns zero non-null-clearing hits" OR explicitly list the null-clearing lines as also to be removed. The semantically correct choice is probably "remove the close-side nullifications too, because post-D2 there is no per-doc agent state to clear."

---

### [M5] PresenceAvatar rendering assumes `user.type === 'agent'` but FR-9 removes that branch from per-doc awareness — spec doesn't resolve where the agent-avatar render path reads from

**Category:** COHERENCE
**Source:** L1, L4
**Location:** §6 FR-9, §9.7 PresenceBar
**Issue:** `packages/app/src/presence/PresenceBar.tsx:70-88` contains a dedicated agent-render branch gated on `user.type === 'agent'`. FR-9 says "`use-presence.ts` stops reading `state.user` when `user.type === 'agent'`." So after FR-9, no `Participant.user.type === 'agent'` entry exists anymore — yet the PresenceBar's `PresenceAvatar` component still renders via that check. The spec's §9.7 JSX snippet shows `{visibleParticipants.map(p => <PresenceAvatar ... />)}` without specifying how an agent participant's shape differs from a human's. The implementer needs to know: does `Participant` grow an `AgentPresenceEntry` discriminator, or does `usePresence` synthesize a `user: AwarenessUser` from the presence entry?
**Current text:** "Render overflow chip; visual treatment for `mode`" (§9 Affected Files row for PresenceBar.tsx)
**Evidence:** `packages/app/src/presence/PresenceBar.tsx:70-88` reads `user.type === 'agent'` and expects `user.icon`, `user.color`, `user.name`; `use-presence.ts:30-34` assembles `{clientId, user, mode}` where `user` is typed `AwarenessUser`.
**Status:** INCOHERENT
**Suggested resolution:** Add a §9.6b (or extend §9.6) specifying the `Participant[]` shape post-refactor — likely `Participant = HumanParticipant | AgentParticipant` with agent carrying `AgentPresenceEntry`. Make sure PresenceBar's render code is part of the affected files (it's in the table) and that the implementer knows the branch at lines 70-88 needs adaptation, not just removal.

---

## Low Severity

### [L1] OQ5 references "§D-034 in CLAUDE.md" — no such anchor exists

**Category:** FACTUAL
**Source:** T1
**Location:** §11 OQ5
**Issue:** OQ5 says "…driven by the keepalive WS (see §D-034 in CLAUDE.md)." Grep of `CLAUDE.md` for `D-034`, `D034`, or `keepalive` returns zero matches. The keepalive implementation itself exists at `packages/cli/src/mcp/keepalive.ts` (confirmed), but there's no CLAUDE.md section `D-034`. Minor — OQ5 is resolved, so the dead pointer just confuses future readers of the decision log.
**Current text:** "(see §D-034 in CLAUDE.md)"
**Evidence:** `grep -n 'D-034\|D034\|keepalive' CLAUDE.md` → no hits.
**Status:** UNVERIFIABLE (dead pointer)
**Suggested resolution:** Remove the parenthetical, or replace with "see `packages/cli/src/mcp/keepalive.ts`."

---

### [L2] §9 Affected Files table header says "(10)" but lists 11 rows

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** §9 header
**Issue:** Pure arithmetic — the table has 11 rows. Reader might wonder which one shouldn't be there.
**Evidence:** Count: awareness.ts, core/index.ts, server/agent-focus.ts, server/agent-sessions.ts, server/api-extension.ts, server/standalone.ts, app/lib/agent-focus.ts, app/components/SystemDocSubscriber.tsx, app/editor/DocumentContext.tsx, app/presence/use-presence.ts, app/presence/PresenceBar.tsx = 11.
**Status:** INCOHERENT
**Suggested resolution:** Update header to `(11)`.

---

### [L3] Evidence file's Hocuspocus line citations are approximate

**Category:** FACTUAL
**Source:** T1
**Location:** evidence/root-cause-trace §3
**Issue:** Evidence cites `node_modules/@hocuspocus/server/src/Document.ts:49-50` — the actual `new Awareness(this)` line is 49, `setLocalState(null)` is 50. Matches. But `DirectConnection.ts:12-27` — the actual class body is lines 9-27 (class declaration opens on line 9, `addDirectConnection()` at line 26). The snippet quoted in evidence matches the semantic content but the line range is off by a few. Low-impact — evidence's architectural claim is correct.
**Status:** STALE (approximate, not wrong)
**Suggested resolution:** No action needed, or adjust line ranges to `9-27` for precision.

---

### [L4] D12 is split across multiple table rows with `\|` literal-escape prose style — readability, not coherence

**Category:** COHERENCE (cosmetic)
**Source:** L7 (inline source attribution / readability)
**Location:** §10 Decision log rows D10, D11, D12
**Issue:** Rows D10, D11, D12 use `\|` literal-escape markdown (starting with `\|`) rather than the contiguous table format used for D1-D9. Visually breaks the table into two blocks. Reader coherence cost, not correctness.
**Suggested resolution:** Unify with D1-D9's table syntax (or use the same escape style throughout).

---

## Verification Coverage (what was spot-checked)

**Verified against repo HEAD `05c7e371` (+ `git fetch` to `dcf09723`):**

- ✅ `packages/cli/src/mcp/server.ts:290` — `const connectionId = randomUUID();` — **CONFIRMED.**
- ✅ `packages/server/src/agent-sessions.ts:202-211` — `setLocalState({user: ..., mode: 'idle'})` block — **CONFIRMED.** Lines match exactly, including `tabId: \`agent-$\{agentId}\`\`.
- ✅ `packages/server/src/api-extension.ts:1085, 1100` — `setLocalStateField('mode', ...)` pairs — **CONFIRMED.** Two more similar pairs at 1170/1185 and 1664/1718 (three handlers total, matches spec's "three `handleAgentWrite*` handlers").
- ✅ `packages/server/src/agent-focus.ts:8-10` — explicit comment documenting map-valued pattern — **CONFIRMED.** (Spec cites 8-10; comment block is 9-10, trivial off-by-one.)
- ✅ `packages/server/src/agent-sessions.test.ts:16-22` — mock inverts bug premise — **CONFIRMED.** Mock's `setLocalStateField` is a no-op; each DC gets its own awareness object.
- ✅ `packages/app/src/presence/use-presence.ts:25-34` — iterates awareness states, collects any `state.user` — **CONFIRMED.**
- ✅ `packages/app/src/presence/PresenceBar.tsx:136-138` — one avatar per clientId — **CONFIRMED** (actual lines 136-138 match verbatim).
- ✅ `node_modules/@hocuspocus/server/src/Document.ts:49-50` — `new Awareness(this)` / `setLocalState(null)` — **CONFIRMED.**
- ✅ `node_modules/@hocuspocus/server/src/DirectConnection.ts` — no `new Awareness` in constructor — **CONFIRMED** (class body 9-27; no Awareness instantiation).
- ✅ `AGENT_ICON_COLORS['claude'] = '#D97757'` (warm orange / terracotta) — **CONFIRMED** at `packages/core/src/utils/identity.ts:17`.
- ✅ `iconFromClientName` exported from `agent-sessions.ts` — **CONFIRMED**, with tests at `agent-sessions.test.ts:58-75`.
- ✅ Originating bug (`[[projects/v0-launch/bug-bash-triage]]` §1 item #1 "Collab icon and Claude icon overlapping in top-right") — **CONFIRMED.**
- ✅ `AGENT_FOCUS_STALE_MS = 5_000` at `packages/app/src/lib/agent-focus.ts:17` — **CONFIRMED** (basis for finding H1).

**Not spot-checked:**

- Exact behavior of `HocuspocusProvider.awareness` on the browser side (trusted the prior-art reference from `specs/2026-04-08-presence-awareness-ux/SPEC`).
- PresenceBar overflow-popover a11y claims (R4) against shadcn Popover internals.
- Test files proposed in FR-7 / FR-8 — they do not exist yet (by design, they ship with the implementation PR).



