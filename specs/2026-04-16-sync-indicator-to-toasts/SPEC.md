# Replace SyncIndicator with Toast Notifications — Spec

**Status:** Draft
**Owner(s):** Sarah
**Last updated:** 2026-04-16
**Baseline commit:** 9f56bf2b
**Links:**

- Prior art: [[specs/2026-04-08-presence-awareness-ux/SPEC]] (FR9 — activity toast cut as redundant)
- Prior art: [[specs/2026-04-14-github-sync/SPEC]] (FR29 — future sync status badge)
- Prior art: [[reports/v0-day-zero-delight/divergent-agents-raw/D2c-micro-interactions]] (Octocat rule, conflict toast, delight discipline)

---

## 1) Problem statement

**Situation:** The editor header has a persistent `SyncIndicator` — a dot + label in the PresenceBar showing four states: connecting (amber pulse), connected/syncing (amber pulse), synced (green dot, label hidden), disconnected (red dot + label). It occupies permanent header real estate next to participant avatars. The app already has Sonner toast infrastructure wired up (`<Toaster>` in `main.tsx`, used in FileTree, EditorPane, and image-upload).

**Complication:** The SyncIndicator's information value is asymmetric:

- **Synced** (\~99% of time): zero information — a green dot confirming "everything is fine" that the user already knows. Visual noise.
- **Connecting/Syncing** (sub-second transients): low value — transitions too fast to be perceptible as a distinct state.
- **Disconnected** (rare, high stakes): high value — the user needs to know they're offline and edits may not persist to disk via server. But a tiny red dot is easy to miss.

The header is already dense: sidebar trigger, filename, pin, mode toggle, save version, timeline, presence avatars, theme toggle. The indicator adds clutter without earning its space. Additionally, [[specs/2026-04-14-github-sync/SPEC]] FR29 envisions a richer sync status badge (`synced / syncing / ahead N / behind N / conflict / offline / auth-error`) in the same header region — the current indicator will be replaced regardless.

**Resolution:** Remove the persistent SyncIndicator from the header. Surface the one high-value state transition (disconnected) via a toast notification. Add a reconnected toast to close the loop. Leave connecting/syncing and synced silent. This cleans the header chrome, makes the disconnect state more noticeable (toasts are harder to miss than a 2px dot), and frees the header slot for the future GitHub sync badge.

## 2) Goals

- G1: Remove the persistent SyncIndicator from the header — clean the chrome
- G2: Surface disconnect/reconnect transitions via toasts that are harder to miss than the current dot
- G3: Keep the source-mode disable logic intact (already uses `useSyncStatus` independently)
- G4: Forward-compatible with the GitHub sync status badge (FR29) — no new persistent UI in the header slot

## 3) Non-goals

- **\[NOT NOW]** NG1: Rich sync status badge with ahead/behind counts — belongs to [[specs/2026-04-14-github-sync/SPEC]] FR29
- **\[NOT NOW]** NG2: Connection-status popover or drawer — overkill for the current CRDT-only sync
- **\[NEVER]** NG3: Toast on every sync cycle (connecting → synced) — violates "never interrupt competent flow" (D2c)
- **\[NOT NOW]** NG4: Offline mode / local-only editing indicator — revisit when offline editing is a supported mode

## 4) Personas / consumers

- **P1: Human editor** — Writes in the browser. Needs to know when connection drops (edits still live in Y.Doc in-memory but don't persist to disk until server reconnects). Currently can miss the tiny red dot.
- **P2: Demo audience** — Watches the editor. A clean header with no ambient status noise looks more polished.

## 5) Requirements

### Functional requirements

| Priority | ID  | Requirement                           | Acceptance criteria                                                                                                                                                                                                                                                                                             |
| -------- | --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Must     | FR1 | Remove SyncIndicator from PresenceBar | `SyncIndicator` component, `SYNC_CONFIG` constant, and the `SyncStatus` type import in PresenceBar are deleted. `useSyncStatus` function import remains (feeds `useSyncToasts`). PresenceBar renders only participant avatars.                                                                                  |
| Must     | FR2 | Toast on disconnect                   | When sync status transitions to `disconnected` (and the session has previously reached `synced` at least once), fire `toast.warning("Connection lost — keep this tab open, your edits will sync when reconnected", { id: 'sync-status', duration: Infinity })`. Toast persists until dismissed or reconnection. |
| Must     | FR3 | Toast on reconnect                    | When sync status reaches `synced` after having been `disconnected`, fire `toast.success("Reconnected", { id: 'sync-status', duration: 3000 })`. Replaces the disconnect toast (same `id`).                                                                                                                      |
| Must     | FR4 | Source-mode disable logic unchanged   | `EditorHeader.tsx` continues to use `useSyncStatus` to derive `isConnected` and disable source toggle when disconnected. No change to this behavior.                                                                                                                                                            |
| Must     | FR5 | Silent on happy path                  | No toast, no indicator, no visual signal when status is `connecting`, `connected`, or `synced` (unless transitioning from `disconnected`).                                                                                                                                                                      |
| Should   | FR6 | Use stable toast ID for dedup         | All sync toasts use `id: 'sync-status'` to prevent stacking — a reconnect toast replaces the disconnect toast, rapid disconnect/reconnect cycles don't accumulate toasts.                                                                                                                                       |
| Must     | FR7 | `useSyncStatus` hook retained         | The hook stays in `use-sync-status.ts` — it's still consumed by EditorHeader for the source-mode gate and by PresenceBar for toast transitions.                                                                                                                                                                 |
| Must     | FR8 | Suppress toast before first sync      | No disconnect toast fires until the session has reached `synced` at least once. This prevents misleading "Connection lost" toasts on initial page load when the server is unreachable (the user never had a connection to lose).                                                                                |

### Non-functional requirements

- **Performance:** No change — replacing a React component render with a toast call is neutral or positive.
- **Accessibility:** Toast announcements are handled by Sonner's built-in ARIA live regions. The disconnect warning is more accessible than the current 2px colored dot.

## 6) Proposed solution

### Architecture

New hook `useSyncToasts` watches `useSyncStatus` and fires toasts on transitions. The SyncIndicator component and its config are deleted.

```
Before:
  PresenceBar → useSyncStatus → SyncIndicator (persistent dot)
  EditorHeader → useSyncStatus → isConnected (source-mode gate)

After:
  PresenceBar → useSyncStatus → useSyncToasts (fires toasts on transitions)
  EditorHeader → useSyncStatus → isConnected (source-mode gate, unchanged)
```

### Implementation sketch

**New: **`useSyncToasts`** effect** (in `packages/app/src/presence/use-sync-toasts.ts`):

```typescript
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';
import type { SyncStatus } from './use-sync-status';

const TOAST_ID = 'sync-status';

export function useSyncToasts(status: SyncStatus) {
  const hasConnectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (status === 'synced') {
      hasConnectedRef.current = true;
    }

    if (status === 'disconnected' && hasConnectedRef.current) {
      wasDisconnectedRef.current = true;
      toast.warning(
        'Connection lost \u2014 keep this tab open, your edits will sync when reconnected',
        { id: TOAST_ID, duration: Infinity },
      );
    } else if (wasDisconnectedRef.current && status === 'synced') {
      wasDisconnectedRef.current = false;
      toast.success('Reconnected', { id: TOAST_ID, duration: 3000 });
    }
  }, [status]);
}
```

Key design choices in the implementation:

- `hasConnectedRef`: Tracks whether the session has ever reached `synced`. Prevents misleading toasts on initial connection failure (FR8).
- `wasDisconnectedRef`: Persists across intermediate states (`connecting`, `connected`) during reconnection. The reconnect toast fires when `synced` is reached after any prior `disconnected` state — not just the immediately-previous state. This avoids the bug where intermediate transitions (`disconnected → connecting → connected → synced`) would prevent the reconnect toast from firing.
- **Stable **`id: 'sync-status'`: All sync toasts share one ID. Reconnect replaces disconnect. Failed reconnection cycles (`disconnected → connecting → disconnected`) re-fire the warning, but same-ID means it's a no-op replacement — no stacking.

**Modified: **`PresenceBar.tsx`**:**

- Delete `SYNC_CONFIG`, `SyncIndicator` component
- Remove `SyncStatus` type import (TypeScript infers the return type of `useSyncStatus`)
- Add `import { useSyncToasts } from './use-sync-toasts'`
- Add `useSyncToasts(syncStatus)` call
- PresenceBar renders only the avatar row

**Unchanged: **`EditorHeader.tsx`**:**

- Still imports `useSyncStatus`, derives `isConnected` — no changes needed.

**Unchanged: **`use-sync-status.ts`**:**

- Hook retained as-is.

### Files touched

| File                                           | Change                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `packages/app/src/presence/PresenceBar.tsx`    | Delete SyncIndicator + SYNC\_CONFIG. Add useSyncToasts call. |
| `packages/app/src/presence/use-sync-toasts.ts` | New file (\~25 lines).                                       |
| `packages/app/src/components/EditorHeader.tsx` | No changes.                                                  |
| `packages/app/src/presence/use-sync-status.ts` | No changes.                                                  |

### Blast radius

- **Zero existing test impact:** No tests reference `SyncIndicator`, `data-sync-status`, or `SYNC_CONFIG`.
- **Related E2E test (unaffected):** `packages/app/tests/stress/fr-7a-disconnect-source-mode.e2e.ts` exercises the disconnect/reconnect flow via `useSyncStatus` for source-mode disable testing. Unaffected by this change but a potential extension point for verifying toast behavior.
- **Zero CSS impact:** All styling is inline Tailwind classes deleted with the component.
- **Dark mode spec gap inventory:** `specs/2026-04-11-dark-mode/evidence/gap-inventory.md` noted the hardcoded hex colors (#f59e0b, #22c55e, #ef4444). Deleting the component resolves this gap — toasts use theme-aware Sonner styling.
- **Playwright E2E:** No selectors target sync indicator.
- **GitHub sync forward-compat:** FR29's future badge will be a new component in the header; no collision.

## 7) Decision log

| ID  | Decision                                                                                     | Status   | Rationale                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Remove persistent indicator entirely (no replacement badge)                                  | LOCKED   | Header slot reserved for GitHub sync badge (FR29). Current indicator is a stopgap.                                                                                                                                                                                                                                                                                        |
| D2  | Toast only on disconnect and reconnect (not connecting/syncing)                              | LOCKED   | Connecting/syncing are sub-second transients. Toasting them violates "never interrupt competent flow" (D2c micro-interactions).                                                                                                                                                                                                                                           |
| D3  | Disconnect toast persists (duration: Infinity)                                               | LOCKED   | Disconnect is a state the user needs to be aware of until it resolves. Auto-dismissing would hide ongoing disconnection. Toast is user-dismissible — if they dismiss, they lose ambient awareness, but this is an intentional choice (see D8).                                                                                                                            |
| D4  | Reconnect toast auto-dismisses (3s)                                                          | LOCKED   | "Good news" toasts should clear quickly. User doesn't need to act on reconnection.                                                                                                                                                                                                                                                                                        |
| D5  | Use stable `id: 'sync-status'` for all sync toasts                                           | LOCKED   | Prevents toast stacking on rapid state changes. Reconnect replaces disconnect naturally. Failed reconnection cycles re-fire warning as no-op replacement.                                                                                                                                                                                                                 |
| D6  | Retain `useSyncStatus` hook                                                                  | LOCKED   | Still consumed by EditorHeader for source-mode disable gate and by PresenceBar for toast transitions.                                                                                                                                                                                                                                                                     |
| D7  | Toast copy avoids "saved" — uses "keep this tab open, your edits will sync when reconnected" | LOCKED   | No local persistence (no IndexedDB). Edits live in volatile Y.Doc RAM — "saved locally" implies durability that doesn't exist. Copy must be accurate about the guarantee: edits survive in-tab and will sync on reconnection, but only if the tab stays open.                                                                                                             |
| D8  | Accept that dismissed disconnect toast loses ambient awareness                               | DIRECTED | Trade-off: toasts are more noticeable than a 2px dot but can be dismissed. Users who dismiss are making a deliberate choice. The source-mode toggle remaining disabled provides a secondary signal. A PresenceBar color-shift was evaluated as a hybrid but adds complexity for a rare state — deferred unless real-world usage shows users routinely dismiss and forget. |
| D9  | Suppress disconnect toast before first sync (FR8)                                            | LOCKED   | Prevents misleading "Connection lost" on initial page load failure when no connection was ever established. Only toast after the session has successfully synced at least once.                                                                                                                                                                                           |
| D10 | Track `wasDisconnected` flag, not previous-state                                             | LOCKED   | On reconnection, `useSyncStatus` transitions through intermediate states (connecting, connected) before reaching synced. A simple previous-state check would see `prev=connected`, not `prev=disconnected`, causing the reconnect toast to never fire. The `wasDisconnectedRef` flag persists across intermediates.                                                       |

## 8) Open questions

None — all P0 items resolved.

## 9) Risks / unknowns

| Risk                                                                  | Severity | Mitigation                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flaky WiFi causes rapid disconnect/reconnect toast flicker            | Low      | Stable toast ID (D5) prevents stacking. Each cycle replaces the previous toast. Hocuspocus provider has exponential backoff on reconnection. If real-world usage shows WiFi-roaming flicker is distracting, a 1-2s debounce on the disconnect toast can be added without spec changes. |
| User dismisses disconnect toast and loses awareness                   | Low      | Accepted trade-off (D8). Source-mode toggle disabled state provides secondary signal. The current 2px red dot was also easy to miss — net improvement in noticeability.                                                                                                                |
| Failed reconnection cycles (disconnected → connecting → disconnected) | Low      | Handled correctly: disconnect toast persists through intermediate states. Re-firing the warning on the second `disconnected` is a same-ID no-op replacement — no stacking.                                                                                                             |

## 10) Future work

- **\[Explored]** GitHub sync status badge (FR29): Richer badge with ahead/behind, conflict, auth-error states + click-to-open popover. This is where persistent header status UI returns — scoped to the [[specs/2026-04-14-github-sync/SPEC]], not this change.
- **\[Explored]** PresenceBar color-shift on disconnect: Subtle red border/tint on PresenceBar container when disconnected. Would provide non-dismissible ambient awareness alongside the toast. Deferred — adds complexity for a rare state, and the toast + disabled source toggle are sufficient signals for now. Revisit if users routinely dismiss the disconnect toast and then are surprised by data loss.
- **\[Identified]** Disconnect debounce: Fire warning toast only after 1-2s of sustained disconnect (matching Figma/Liveblocks pattern). Prevents sub-second WiFi-roaming flashes. Add when real-world flicker reports arrive.
- **\[Identified]** Agent-arrival toast (D2c #12): "Claude pulled up a chair" style toast on first agent connect per session. Separate from sync status — lives in the presence/awareness domain.
- **\[Noted]** Offline mode indicator: If the product ever supports intentional offline editing (with IndexedDB persistence), a persistent mode indicator would return. Not the same as "disconnected" (which is an error state with no durability guarantee).

## 11) Agent constraints

- **SCOPE:** `packages/app/src/presence/PresenceBar.tsx`, new `packages/app/src/presence/use-sync-toasts.ts`
- **EXCLUDE:** `use-sync-status.ts` (no changes), `EditorHeader.tsx` (no changes), server-side code
- **STOP\_IF:** Changes would affect the source-mode disable logic in EditorHeader
- **ASK\_FIRST:** Toast copy changes beyond minor wordsmithing
