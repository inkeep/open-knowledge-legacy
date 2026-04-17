# Evidence: Open Knowledge's existing awareness and notification infrastructure (1P)

**Dimension:** Per-user request, this is the 1P side — what our codebase has today for transient/ephemeral UX events.
**Date:** 2026-04-16
**Sources:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness` (branch: worktree-server-authoritative-bridge)

This evidence file is 1P-scoped by explicit user request (Part 2 of the task). See REPORT.md §9 for integration synthesis.

---

## Key files referenced

- `packages/core/src/types/awareness.ts` — `AwarenessState`, `ActivityEntry`
- `packages/core/src/constants/activity.ts` — `FLASH_DURATION_MS`, `ACTIVITY_TTL_MS=30_000`, eviction utils
- `packages/server/src/cc1-broadcast.ts` — CC1 broadcaster (pure-signal transport over `__system__`)
- `packages/app/src/lib/cc1.ts` — Client parser; typed `DerivedViewChannel = 'files' | 'backlinks' | 'graph'`
- `packages/app/src/components/SystemDocSubscriber.tsx` — CC1 consumer; emits via `emitDocumentsChanged`
- `packages/app/src/components/ui/sonner.tsx` — Sonner toaster wrapper, themed
- `packages/app/src/main.tsx:32` — `<Toaster richColors />` mount point (global)
- `packages/app/src/presence/use-sync-toasts.ts` — Existing "connection lost / reconnected" toast hook
- `packages/app/src/editor/clipboard/paste-failure-toast.ts` — Existing throttled-toast precedent (3s window, per-scope)
- `packages/app/src/components/EditorPane.tsx` — Holds `timelineOpen` state; owns `/api/save-version` and `/api/rollback` integration
- `packages/app/src/components/TimelinePanel.tsx` — Version-history right-rail panel (rendered conditionally)
- `packages/server/src/server-observers.ts:167-175` — The exact seam where Path B `mergeThreeWay` runs

---

## Findings

### Finding 1: `Y.Map('activity')` is a structured event schema — CAN carry a `bridge-loss` event
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/types/awareness.ts:44-49`

```ts
/** Entry in Y.Map('activity') side-channel for agent write attribution. */
export interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}
```

Current shape:
- **actor** (`agentId`) — long-lived identity
- **timestamp** — wall-clock when the event occurred
- **type** — discriminated union over 3 values
- **description** — free-form text

The schema explicitly follows precedent #3 in CLAUDE.md ("Structured event schemas"): `{actor, timestamp, action: {kind, metadata}, visibility}`. Extending to a 4th kind `'bridge-loss'` is an additive schema change — fully schema-compatible.

```ts
// Minimal extension — add a new type variant and optional fields
export interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete' | 'bridge-loss';  // ← NEW
  description?: string;
  // Optional bridge-loss context
  lostSubstrings?: string[];  // ← NEW, populated when type === 'bridge-loss'
  mergeKind?: 'path-b-dmp';   // ← NEW, tagged for future kinds
}
```

**Implications for integration:** `Y.Map('activity')` is the right transport for a `bridge-loss` event. It's per-doc (every Y.Doc has its own `activity` map), has TTL-based eviction (30s — longer than we'd want a toast to live, shorter than the user's edit session), observes natively on client side.

---

### Finding 2: `Y.Map('activity')` has auto-eviction + observability primitives already built
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/constants/activity.ts:20-41`; `packages/app/src/editor/plugins/agent-flash-source.ts:96-134`

`evictStaleEntries(map)` auto-removes entries older than 30s on every observation. `hasNewEntries(map, since)` checks for entries newer than a cursor timestamp. The existing agent-flash plugin pattern is exactly what we need:

1. `activityMap.observe(observer)` — fire on each entry set
2. `evictStaleEntries(activityMap)` — auto-purge stale entries
3. `hasNewEntries(activityMap, lastSeen)` — skip stale observations
4. Update lastSeen cursor, render UX (flash or toast)
5. `activityMap.unobserve(observer)` on unmount

**Implications for integration:** We can reuse this exact pattern. A `useBridgeLossToasts(doc)` hook would observe `activity` map just like `agent-flash-source.ts`, but dispatch `toast.warning(...)` instead of CodeMirror flash decorations.

---

### Finding 3: CC1 broadcaster is STRICTLY pure-signal — it canNOT carry a per-doc bridge-loss payload
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/cc1-broadcast.ts:19-24`; `packages/app/src/lib/cc1.ts:6-39`

```ts
export interface CC1Signal {
  v: typeof CC1_CONTRACT_VERSION;  // always 1
  ch: string;                       // client-side: 'files' | 'backlinks' | 'graph'
  seq: number;                      // per-channel monotonic
}
```

CC1 deliberately has NO `docName`, NO `event kind`, NO payload. Per the CC1 contract in CLAUDE.md: "`ch` is a flat kebab-case string; `seq` is per-channel monotonic from server startup. No event kind, no path, no docName — clients respond by re-fetching the channel's REST endpoint."

This is a deliberate design constraint. Adding a `'bridge-loss'` channel to CC1 would make every client re-fetch some bridge-loss endpoint, but there's no per-doc targeting — every open doc would get spammed with re-fetches.

**Implications for integration:** **Do NOT use CC1 for bridge-loss events.** CC1 is for derived-view invalidation (files, backlinks, graph). Use `Y.Map('activity')` instead — it's per-doc, carries structured payloads, and the observer pattern is already in use for agent-flash.

---

### Finding 4: Sonner toast infrastructure is shipped, themed, and used in 2 places already
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/ui/sonner.tsx`; `packages/app/src/main.tsx:32`; `packages/app/src/presence/use-sync-toasts.ts`; `packages/app/src/editor/clipboard/paste-failure-toast.ts`

Pre-existing precedents that map directly to our need:

**Connection-loss toast (`use-sync-toasts.ts`):**
```ts
toast.warning(
  'Connection lost — keep this tab open, your edits will sync when reconnected',
  { id: TOAST_ID, duration: Infinity },
);
```
A transient warning with a persistent `id` for dedupe. Perfect pattern for "connection-state" messaging.

**Paste-degradation toast (`paste-failure-toast.ts`):**
```ts
export function notifyPasteDegraded(scope: string, message = '...'): boolean {
  const now = Date.now();
  const last = lastShownAt.get(scope) ?? 0;
  if (now - last < THROTTLE_MS) return false;
  lastShownAt.set(scope, now);
  toast.error(message);
  return true;
}
```
Throttled 3s per scope. Per-scope counters. Documented rationale: "The throttle prevents a rapid sequence of failures (e.g. drag-sweeping 50 files into the editor at once) from spamming the notification tray." Bridge-loss will need a similar throttle.

**Implications for integration:** The UI primitive exists. The message-pattern exists. A `useBridgeLossToasts(doc)` hook can literally copy-paste the paste-failure-toast pattern and observe the activity map instead.

---

### Finding 5: Version-history integration point is `EditorPane.tsx` — toast CTA can link to TimelinePanel
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/EditorPane.tsx:22` (`timelineOpen` state); `packages/app/src/components/EditorPane.tsx:167-173` (TimelinePanel render); `/api/save-version` at `EditorPane.tsx:104`; `/api/rollback` at `EditorPane.tsx:122`

TimelinePanel is already wired:
- `EditorPane` holds `timelineOpen` state
- `EditorHeader` toggles via `onTimelineToggle`
- Restore/rollback is a single POST to `/api/rollback`

A toast's CTA `action` (Sonner pattern) can simply call `setTimelineOpen(true)`. The seam is a 2-line change in `EditorPane.tsx`: lift a setter into context or pass through a hook.

Sonner's `toast.warning` supports an `action` prop:
```ts
toast.warning('Some edits may have diverged — view history?', {
  action: {
    label: 'View history',
    onClick: () => setTimelineOpen(true),
  },
  duration: 10_000,
});
```

**Implications for integration:** The CTA-to-version-history wiring is trivial. No new UI components, no new endpoints. The existing TimelinePanel is our "see version history" target.

---

### Finding 6: The seam point is `packages/server/src/server-observers.ts:172`
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/server-observers.ts:166-186`

```ts
doc.transact(() => {
  if (currentText === lastSyncedXmlMd) {
    // Path A: Y.Text in sync with baseline — use diffLines
    applyIncrementalDiff(ytext, currentText, md);
  } else {
    // Path B: Y.Text diverged — hybrid diff3+DMP three-way merge
    const mergedText = mergeThreeWay(lastSyncedXmlMd, md, currentText);
    applyFastDiff(ytext, currentText, mergedText);
  }
}, OBSERVER_SYNC_ORIGIN);
```

Per spec R1 (LOCKED D2 in `specs/2026-04-16-bridge-correctness/SPEC.md`), after `mergeThreeWay` returns, compute the content-preservation post-condition. On violation:
- Dev/test: throw `BridgeMergeContentLossError`
- Prod (LOCKED D3): `console.warn(JSON.stringify({event: 'bridge-merge-content-loss', ...}))` + metrics counter

The question: do we ADD a per-doc `Y.Map('activity')` write here with `type: 'bridge-loss'`? It would be inside the same `doc.transact` block (or a second transact immediately after), origin-tagged `OBSERVER_SYNC_ORIGIN`. Client agent-flash observer already skips `OBSERVER_SYNC_ORIGIN` writes (via origin guard), so adding a bridge-loss entry here won't fire the flash — we'd add a DIFFERENT observer hook specifically for toast emission.

**Implications for integration:** The write path is a single line inside `mergeThreeWay`'s post-condition check:
```ts
if (lostSubstrings.length > 0) {
  activityMap.set(`bridge-loss-${Date.now()}`, {
    agentId: '__bridge__',
    timestamp: Date.now(),
    type: 'bridge-loss',
    description: `${lostSubstrings.length} substring(s) may have diverged`,
    lostSubstrings: lostSubstrings.slice(0, 3),  // Truncate for transport
  });
}
```
Wrapped in the same `doc.transact` as the merge, tagged `OBSERVER_SYNC_ORIGIN`. Client picks up via existing observe pattern.

---

### Finding 7: The existing `AGENT_WRITE_ORIGIN` transaction origin is the right precedent
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:1023-1033`

```ts
dc.document.transact(() => {
  applyAgentMarkdownWrite(dc.document, `${content}\n`, 'append');

  const activityMap = dc.document.getMap('activity');
  activityMap.set(agentId, {
    agentId,
    timestamp: Date.now(),
    type: 'insert',
    description: `Added (${agentName}): ${content.slice(0, 50)}`,
  });
}, AGENT_WRITE_ORIGIN);
```

Exact template: transact → write content + write activity entry atomically, tag with origin. The new bridge-loss emission just swaps `AGENT_WRITE_ORIGIN` for `OBSERVER_SYNC_ORIGIN` and sets `type: 'bridge-loss'`.

**Implications for integration:** The pattern is already established and understood. No new transaction-origin design; no new CRDT-write codepath.

---

## Negative searches

- Searched for "bridgeLoss", "bridge-loss", "content-loss", "mergeLoss" in the codebase: no existing usage — greenfield.
- Searched for in-editor toast that opens a panel: `useSyncToasts` opens no panel, paste-failure-toast no action. No existing toast-with-CTA pattern, but Sonner supports `action` natively — zero lib-level work needed.
- No existing "bridge health metrics" dashboard; `packages/server/src/metrics.ts` counters exist but no UI surface.

---

## Gaps / follow-ups

- Current spec R1 emits `console.warn(JSON.stringify(...))`. Extending to also write the activity entry is a small spec addendum, not a scope change. The spec text already cites Google Docs / Notion / Figma / Linear's "keep typing" philosophy; adding an opt-in toast CTA doesn't contradict this — it ADDs a recovery signal without blocking.
- Server → client observer latency for `Y.Map('activity')` writes should be <100ms (same path as agent-flash) — acceptable for this UX.
- Throttle policy (e.g. 30s per doc) should be decided at spec time; suggest per-doc throttle with `id: 'bridge-loss-${docName}'` to coalesce bursts.
