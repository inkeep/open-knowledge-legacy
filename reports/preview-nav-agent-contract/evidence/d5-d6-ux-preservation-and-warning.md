# Evidence: D5 + D6 — UX Preservation and Subscriber-Presence Warning

**Dimension:** Does moving to "open once + server-push-nav" preserve the "user watches every edit land in real time" UX? How does the subscriber warning change?
**Date:** 2026-04-24
**Sources:** 1P `SystemDocSubscriber`, `agent-focus` broadcaster, `api-extension` warning logic, spec -14 journeys.

---

## Key files referenced

- `packages/app/src/components/SystemDocSubscriber.tsx:87-130` — debounce + typing guard + nav execution.
- `packages/app/src/lib/agent-presence.ts` — `pickPrimary`, debounce / typing-guard constants.
- `packages/server/src/agent-focus.ts:34-45` — `setFocus` upsert / map merging.
- `packages/server/src/api-extension.ts:1547-1571, 2281-2294, 3028-3040` — server-side `setFocus` call sites + subscriber warning emission.
- `packages/cli/src/mcp/tools/write-document.ts:93-135` / `edit-document.ts:95-137` — client-side surface of the warning.
- `specs/2026-04-14-agent-nav-and-cadence/SPEC.md` §J1-J4 — designed user journeys for server-push-nav.

---

## Findings

### Finding 1: Server-push-nav already delivers the "live edit watching" UX end-to-end
**Confidence:** CONFIRMED
**Evidence:** `SystemDocSubscriber.tsx:106-109`:
```typescript
const primary = pickPrimary(awareness, Date.now());
if (!primary) return;
if (primary === activeDocRef.current) return;
window.location.hash = hashFromDocName(primary);
```
Combined with `AgentFocusBroadcaster.setFocus` firing at `api-extension.ts:1550` on every write, the end-to-end behavior is: agent writes → server upserts focus on `__system__` awareness → `SystemDocSubscriber` observes change within `AGENT_PRESENCE_DEBOUNCE_MS` → hash mutates → App.tsx hashchange handler switches doc → CRDT streams the new content into the editor. No client-side pre-navigation needed.

**Implications:** From the user's perspective, the outcome is identical whether nav was driven by agent (per-edit) or by server (post-write). The only difference is *when* the nav happens: ~300ms before the edit (per-edit pattern) vs ~300ms after (server-push). Since the CRDT stream is the thing the user watches, and the stream arrives with the focus signal, there is no perceptible difference. The "pre-open" framing is aesthetically appealing but technically unnecessary — CRDT updates land on whatever doc is active, and the focus push brings the user there in time to see the stream.

### Finding 2: Typing guard + pin are strictly better on server-push path
**Confidence:** CONFIRMED
**Evidence:** `SystemDocSubscriber.tsx:98-103`:
```typescript
// Pin: user has chosen to stay put. Honor unconditionally.
if (pinnedDocRef.current !== null) return;
// Typing guard: suppress nav silently while the user is actively editing.
const sinceLastKeystroke = Date.now() - getLastUserKeystroke();
if (sinceLastKeystroke < AGENT_PRESENCE_TYPING_GUARD_MS) return;
```
The agent-driven per-edit path has no equivalent — when the agent calls `preview_start`/Navigate with a URL, the preview jumps regardless of user state.

**Implications:** Moving to server-push-nav *improves* user sovereignty. The pin + typing-guard + debounce collectively mean the user's current action is never yanked. The per-edit pattern is strictly worse on this dimension.

### Finding 3: Cold-start case — server-push-nav silent when no tab exists
**Confidence:** CONFIRMED
**Evidence:** `SystemDocSubscriber` is a React component that runs only when an editor tab is loaded. If no tab is open, `AgentFocusBroadcaster.setFocus` upserts awareness state that nobody observes. `api-extension.ts:1563-1571` then emits `subscriberCount: 0` in the response, which the write tool surfaces as a warning.

**Implications:** The cold-start case IS the "first-write" case Shape A/B/D handle. The subscriber count is already the canonical signal. This is the single case where the once-per-session open matters.

### Finding 4: Subscriber-presence warning works per-doc, not per-session
**Confidence:** CONFIRMED
**Evidence:** `api-extension.ts:823-826`:
```typescript
function getSubscriberCount(docName: string): number {
  try {
    const doc = hocuspocus.documents.get(docName);
    return doc?.connections.size ?? 0;
  } catch {
    return 0;
  }
}
```
`connections.size` is per-Hocuspocus-room, not global. If the user has an editor tab open on `docs/foo` and the agent writes `docs/bar`, the write-tool response for `docs/bar` will report `subscriberCount: 0` UNTIL the server-push-nav carries the user to `docs/bar` and the client materializes that Hocuspocus room.

**Implications for Shape D (hybrid):** The warning is currently noisy — it fires every time an agent writes to a doc the user hasn't visited yet, even if a preview browser IS open on some doc. Moving to a once-per-session model surfaces a redesign opportunity: the meaningful "is the user watching?" signal is "is ANY editor tab connected to the workspace?" not "is a tab specifically subscribed to this doc?" The `__system__` doc subscriber count answers the former.

**Proposed refinement:** Change the warning threshold from `perDocSubscriberCount === 0` to `systemDocSubscriberCount === 0`. The former is correct for "did my edit land on a watched doc"; the latter is correct for "is any editor tab open at all?" — which is what the once-per-session contract cares about.

### Finding 5: Cadence norms (spec -14 §N1) still apply regardless of contract
**Confidence:** CONFIRMED
**Evidence:** `specs/2026-04-14-agent-nav-and-cadence/SPEC.md` §J1 ("human watching a single agent") describes interleaved child-then-hub cadence so the push-nav "has something worth following." The cadence norm is independent of whether the agent also pre-navigates its own preview browser.

**Implications:** Shape A/B/D preserve the cadence recommendation untouched. The only thing changing is the per-edit `get_preview_url` obligation, not the broader "keep the narrative legible" guidance.

### Finding 6: Pre-edit navigation adds zero value for reconnected sessions
**Confidence:** INFERRED (from the two-mechanism redundancy documented in D1)
**Evidence:** When an agent reconnects mid-session (e.g., after a compaction or host restart), it may call `get_preview_url` on the first new write. But the user's preview browser has been sitting idle, still subscribed to `__system__` awareness — so as soon as the agent writes, `setFocus` broadcasts, and the pre-existing subscriber navigates. The agent's "navigate my preview" action is invisible to the user because the user's preview already followed server-push.

**Implications:** The per-edit pattern is valuable ONLY in the "very first write, no tab anywhere yet" case. Once any tab exists, server-push-nav dominates.

---

## Gaps / follow-ups

- **Switching subscriber-warning to `__system__` subscriber count:** would require 1P implementation work; not measured. The `__system__` doc has one shared Awareness (see CLAUDE.md on agent-presence), so counting connections there is a clean "any editor open?" signal.
- **UX of the first-write warning:** today it says "open this URL to watch FUTURE edits live." For a batch edit (agent writes 5 docs then reports), the user sees the last doc, not the first. A post-session "here's what the agent did" view (per spec -14 FW-5 worklog) is the 3P-recognized mitigation — out of scope here.
