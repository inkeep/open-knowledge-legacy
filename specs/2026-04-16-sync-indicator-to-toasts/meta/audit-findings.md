# Audit Findings

**Spec:** Replace SyncIndicator with Toast Notifications  
**Auditor:** Claude Opus 4.6 (cold read)  
**Date:** 2026-04-16  
**Files audited:** SPEC.md, evidence/blast-radius.md, PresenceBar.tsx, use-sync-status.ts, EditorHeader.tsx

---

## Finding 1 — HIGH — Logical coherence / Implementation correctness

**Description:** The `useSyncToasts` implementation sketch will never fire the reconnect toast. On reconnection, HocuspocusProvider emits events in order: `status: 'connecting'` then `status: 'connected'` then `synced: {state: true}`. The `useSyncStatus` hook transitions through: `disconnected` -> `connecting` -> `connected` -> `synced`. Because `prevRef.current` is updated on every `status` change via the `useEffect`, by the time `status` reaches `'synced'`, `prevRef.current` will be `'connected'` (not `'disconnected'`). The guard `prev === 'disconnected' && status === 'synced'` (SPEC line 106) will never be true.

**Evidence:** `use-sync-status.ts` lines 31-39: `onStatus` callback sets `'connecting'` for unknown status values and `'connected'` for connected. The React state update batching may or may not coalesce intermediate states, but the `useRef` in the sketch is updated synchronously on every effect run, so even with batching, `prevRef` will reflect whatever the last rendered status was -- which after the `connecting` transition is no longer `'disconnected'`.

**Recommendation:** The reconnect toast guard should check whether the *previous* status was in a "not connected" set, or track a separate `wasDisconnected` ref that persists across intermediate transitions. For example:

```typescript
const wasDisconnectedRef = useRef(false);

useEffect(() => {
  if (status === 'disconnected') {
    wasDisconnectedRef.current = true;
    toast.warning(...);
  } else if (wasDisconnectedRef.current && status === 'synced') {
    wasDisconnectedRef.current = false;
    toast.success('Reconnected', { id: TOAST_ID, duration: 3000 });
  }
}, [status]);
```

Alternatively, FR3's acceptance criteria should be reworded from "transitions from `disconnected` to `synced`" to "reaches `synced` after having been `disconnected`" and the implementation sketch updated accordingly.

---

## Finding 2 — MEDIUM — Completeness / Edge case

**Description:** The spec does not address what happens to the disconnect toast during the intermediate `connecting`/`connected` states between disconnect and reconnect. With the current sketch, the Infinity-duration disconnect toast would persist through `connecting` and `connected` until either (a) the `synced` toast replaces it (which per Finding 1 never fires), or (b) the user manually dismisses it. If Finding 1 is fixed, the disconnect toast would persist for potentially several seconds during reconnection, which is correct behavior. But if the reconnect attempt fails and the provider falls back to `disconnected`, the toast is already showing -- no duplicate fires because of the `prev !== 'disconnected'` guard, which is correct.

However, there is no handling for the case where the provider cycles `disconnected` -> `connecting` -> `disconnected` (reconnect attempt that fails). In that scenario, the disconnect toast is already visible and the `connecting` state updates `prevRef`, so when the second `disconnected` arrives with `prev === 'connecting'`, the disconnect toast would fire again -- but since it uses the same `id`, this is a no-op replacement. This is actually fine, but worth documenting as "considered."

**Evidence:** HocuspocusProvider has reconnection with exponential backoff. Each failed attempt cycles through `connecting` -> `disconnected`.

**Recommendation:** Add a brief note in the Risks section acknowledging that failed reconnection cycles are handled correctly by the stable toast ID (D5), and that the disconnect toast persists through intermediate states until `synced` is reached.

---

## Finding 3 — MEDIUM — Completeness / Missing edge case

**Description:** The spec does not address the initial page load state. `useSyncStatus` initializes with `'connecting'` (line 11 of use-sync-status.ts). If the initial connection fails (server down, wrong URL), the status will transition `connecting` -> `disconnected`. The `useSyncToasts` sketch would fire the disconnect toast because `prev` (`'connecting'`) !== `'disconnected'` and `status === 'disconnected'`. This is arguably correct behavior (user should know the server is unreachable), but the "Connection lost" copy implies a previously-established connection was lost, which is misleading on initial load failure. The user never had a connection to lose.

**Evidence:** SPEC line 102: `toast.warning('Connection lost — your edits are saved locally', ...)`. On initial load failure, "Connection lost" is inaccurate -- the connection was never established. Additionally, "your edits are saved locally" may be misleading if the Y.Doc hasn't loaded any content yet.

**Recommendation:** Either (a) differentiate initial connection failure from mid-session disconnection (e.g., different copy: "Unable to connect to server" vs "Connection lost"), or (b) suppress the toast until the first `synced` state has been reached (i.e., only fire disconnect toast after the user has successfully connected at least once), or (c) acknowledge this as an accepted behavior in the Risks section. Option (b) is simplest and avoids confusing first-time users whose server isn't running.

---

## Finding 4 — LOW — Factual accuracy

**Description:** The blast radius doc (line 38) states "Position: Sonner default (bottom-right)." Sonner's actual default position is `bottom-right` -- this is correct. However, it's worth noting that the Toaster component in `sonner.tsx` uses `{...props}` spread, so the position could be overridden. No override is applied currently, so the claim is accurate.

**Evidence:** `packages/app/src/components/ui/sonner.tsx` passes no `position` prop; `main.tsx` line 32 renders `<Toaster />` with no props. Sonner documentation confirms default is `bottom-right`.

**Recommendation:** No action needed. Noting for completeness.

---

## Finding 5 — LOW — Factual accuracy

**Description:** The blast radius doc (line 12) cites "PresenceBar.tsx:160" for the `useSyncStatus` call. This is correct as of the baseline commit -- `const syncStatus = useSyncStatus(activeProvider);` is at line 160.

The blast radius doc (line 13) cites "EditorHeader.tsx:50-52" for the `isConnected` derivation. This is also correct -- lines 50-52 contain the `syncStatus`, `isConnected`, and `sourceDisabled` declarations.

**Evidence:** Verified against current file contents.

**Recommendation:** No action needed.

---

## Finding 6 — LOW — Completeness / Blast radius gap

**Description:** The blast radius analysis claims "Zero test impact" and "Playwright E2E: No selectors target sync indicator." This is technically correct -- no tests reference `SyncIndicator`, `data-sync-status`, or `SYNC_CONFIG`. However, the analysis omits the existence of `packages/app/tests/stress/fr-7a-disconnect-source-mode.e2e.ts`, a Playwright E2E test that exercises the disconnect/reconnect flow via `useSyncStatus`. While this test is unaffected by the proposed changes (it tests EditorHeader's source-mode disable, not PresenceBar's indicator), it is a related test that validates the same `useSyncStatus` hook and disconnect/reconnect lifecycle that the new `useSyncToasts` hook will depend on. An implementer might want to extend this test to verify toast appearance.

**Evidence:** `packages/app/tests/stress/fr-7a-disconnect-source-mode.e2e.ts` -- tests FR-7a source-mode toggle disabled during disconnect. No selectors target sync indicator, but it exercises the same status transitions.

**Recommendation:** Mention this test in the blast radius analysis as a related (but unaffected) E2E test, and consider noting it as a potential extension point for verifying toast behavior in a follow-up E2E test.

---

## Finding 7 — LOW — Completeness / Traceability

**Description:** FR1 says "PresenceBar renders only participant avatars" but the current PresenceBar wrapping `<div>` (line 163) also renders the `data-slot="presence-bar"` container with padding. The spec's architecture diagram shows `PresenceBar -> useSyncStatus -> useSyncToasts` (line 79), meaning PresenceBar still calls `useSyncStatus` and passes the result to `useSyncToasts`. This means PresenceBar will still import `useSyncStatus` -- contradicting FR1's acceptance criteria which says "the `SyncStatus` import in PresenceBar are deleted." The `SyncStatus` type import is used by the `useSyncToasts` hook's parameter type, but if `useSyncToasts` accepts the result of `useSyncStatus` (which returns `SyncStatus`), then PresenceBar still needs to call `useSyncStatus` (which auto-infers the return type, so the `SyncStatus` type import can be removed, but the `useSyncStatus` import stays).

**Evidence:** SPEC line 54 FR1 acceptance criteria: "SyncIndicator component, SYNC_CONFIG constant, and the SyncStatus import in PresenceBar are deleted." But line 79 shows PresenceBar still calls `useSyncStatus`. The `type SyncStatus` import would indeed be removable (TypeScript can infer it), but `useSyncStatus` itself stays.

**Recommendation:** Clarify FR1 acceptance criteria: the `SyncStatus` *type* import is removed (since the new code no longer references the type directly), but the `useSyncStatus` *function* import remains because PresenceBar still calls it to feed `useSyncToasts`. The current wording could confuse an implementer into thinking all sync-related imports should be deleted.

---

## Finding 8 — LOW — Suggestion

**Description:** The spec's code style uses `useRef` from React, which is fine per the project's code style rules (React Compiler prohibition list does not include `useRef`). The `import { useEffect, useRef } from 'react'` in the implementation sketch (line 89) is correct.

**Evidence:** CLAUDE.md Code Style section: "Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`." `useRef` is not prohibited.

**Recommendation:** No action needed.

---

## Summary

| Severity | Count | Summary |
|----------|-------|---------|
| HIGH     | 1     | Reconnect toast will never fire due to intermediate state transitions |
| MEDIUM   | 2     | Toast persistence during reconnection attempts; initial load failure copy mismatch |
| LOW      | 5     | Factual verifications (all pass), blast radius gap (related E2E test), FR1 wording, code style |

**Blocking findings:** Finding 1 is blocking. The implementation sketch's core reconnection logic is broken. The fix is straightforward (track a `wasDisconnected` flag rather than checking the immediately-previous state), but the spec text and sketch must both be updated before implementation.
