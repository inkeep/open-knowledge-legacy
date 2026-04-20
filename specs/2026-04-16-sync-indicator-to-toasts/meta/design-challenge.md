# Design Challenge

Reviewer: Design Challenger (cold read)
Date: 2026-04-16
Artifact: `specs/2026-04-16-sync-indicator-to-toasts/SPEC.md`

---

## Challenge 1 — Toast copy accuracy: "your edits are saved locally"

**What the spec says:** D7 directs the disconnect toast to read "Connection lost — your edits are saved locally" and notes the key constraint is reassuring users that edits are in Y.Doc in-memory.

**Alternative or concern:** "Saved locally" is materially misleading. There is no IndexedDB provider, no service worker, no local persistence layer. Edits are in an in-memory Y.Doc that evaporates on tab close, page refresh, or OS memory pressure. "Saved locally" implies durability — the user reasonably reads it as "I can close this tab and come back." The actual guarantee is: edits survive in the browser tab's RAM and will be sent to the server when the WebSocket reconnects, but only if you keep this tab open and nothing crashes. Furthermore, the `ProviderPool` has a 4-second `RECYCLE_DEBOUNCE_MS` after which it recycles disconnected providers with `unsyncedChanges === 0` — but if the user types *after* disconnect, `unsyncedChanges` becomes > 0, which prevents the recycle. However if the user had NOT typed after disconnect, the provider gets recycled, and now what? The Y.Doc is gone. The toast's "saved locally" promise is only conditionally true, and even in the best case "saved" is the wrong word for "held in volatile RAM."

**Strength of challenge:** HIGH

**Recommendation:** Change to copy that is both accurate and reassuring without overpromising durability. Examples: "Connection lost — keep this tab open, your edits will sync when reconnected" or "Connection lost — edits will sync automatically when the connection returns." Avoid the word "saved" entirely — it implies persistence that does not exist. If the team wants to use "saved locally," the prerequisite is adding IndexedDB persistence first (which is a non-trivial project).

---

## Challenge 2 — Transition gap: disconnected to connected (not synced)

**What the spec says:** FR3 fires the reconnect toast when status transitions from `disconnected` to `synced`. FR5 says no toast on `connecting` or `connected`.

**Alternative or concern:** The Hocuspocus provider's lifecycle is `disconnected -> connecting -> connected -> synced`. The `connected` state means the WebSocket is open but the initial Y.Doc sync handshake has not completed. If the sync handshake stalls (slow server, large doc), the user stares at the persistent "Connection lost" toast even though the WebSocket is alive. Worse, if reconnection succeeds at the WebSocket level but the sync event never fires (a documented Hocuspocus edge case where `synced` is only emitted once per provider lifetime unless the provider is recycled), the disconnect toast stays forever. The implementation sketch's `useSyncToasts` only clears the disconnect toast on `status === 'synced'`, not `status === 'connected'`. This creates a stuck-toast scenario that is worse than the current UI, where the dot at least transitions through intermediate states.

**Strength of challenge:** MEDIUM

**Recommendation:** Consider dismissing the disconnect toast on `connected` (with a brief "Reconnecting..." intermediate), or at minimum on `connected` after a short timeout (e.g. 2 seconds) with fallback text "Reconnecting..." that then resolves to "Reconnected" on `synced`. Alternatively, verify empirically that the `disconnected -> synced` path always completes in the Hocuspocus provider's reconnection flow and document that evidence.

---

## Challenge 3 — Alternative: PresenceBar color shift instead of toast

**What the spec says:** D1 removes the persistent indicator entirely. The Decision Log does not record evaluating a PresenceBar background/border color shift as an alternative.

**Alternative or concern:** The spec correctly identifies that the green dot is zero-information 99% of the time. But the dismissal of persistent UI may be overcorrected. A middle ground: keep the PresenceBar visually clean in the happy path (no dot, no label), but add a subtle red/amber border or background tint to the entire PresenceBar container when disconnected. This approach is (a) zero-cost in the happy path (no visual noise), (b) persistent and always visible (toasts can be dismissed, and users develop toast-blindness), (c) naturally clears when reconnection happens (no transition-tracking logic needed — just conditional CSS), (d) does not compete for toast real estate with error toasts from FileTree/image-upload. The disconnect toast with `duration: Infinity` is essentially trying to be persistent UI anyway — a persistent-but-dismissible toast is an awkward halfway house between "no persistent UI" and "persistent UI."

**Strength of challenge:** MEDIUM

**Recommendation:** Evaluate the PresenceBar color-shift pattern as a hybrid. The toast can still fire for the initial disconnect notification, but the PresenceBar tint provides ongoing ambient awareness without occupying the toast stack. This also avoids the stuck-toast concern from Challenge 2.

---

## Challenge 4 — Flaky WiFi oscillation and toast fatigue

**What the spec says:** Risk table acknowledges rapid disconnect/reconnect and cites D5 (stable toast ID) as mitigation. The Hocuspocus provider has built-in reconnection with backoff.

**Alternative or concern:** The stable `id` prevents *stacking*, but not *flicker*. On flaky WiFi, the sequence `disconnected -> connected -> synced -> disconnected -> connected -> synced` can repeat every few seconds. Each cycle replaces the toast: warning appears, success appears for 3 seconds, warning appears again. This creates a pulsing distraction in the bottom-right corner that is arguably worse than the current small pulsing dot. The current SyncIndicator at least pulses quietly in the header — a toast overlay demands attention by design. The Hocuspocus exponential backoff helps with server-down scenarios but does not prevent rapid oscillation from network-layer flapping (WiFi roaming, cellular handoff).

Additionally, the spec does not address the UX of a `disconnected -> connected` (without reaching `synced`) -> `disconnected` cycle. In this case the disconnect toast was never cleared (per Challenge 2), so the user sees the warning toast persist through the entire flap — which is actually correct behavior, but the toast text ("Connection lost") is stale during the `connected` intermediate phase.

**Strength of challenge:** MEDIUM

**Recommendation:** Add a debounce to the disconnect toast — e.g. only fire the warning toast after the `disconnected` state has persisted for 1-2 seconds. Sub-second disconnects (which are common during WiFi roaming) would be invisible to the user. This is the pattern used by Figma and Liveblocks. The `RECYCLE_DEBOUNCE_MS` of 4 seconds in `ProviderPool` suggests the codebase already understands this pattern for provider lifecycle — apply the same philosophy to the notification layer.

---

## Challenge 5 — Scope creep: is this really zero-test-impact?

**What the spec says:** Blast radius analysis claims zero test impact. No tests reference `SyncIndicator`, `data-sync-status`, or `SYNC_CONFIG`.

**Alternative or concern:** The blast radius analysis is technically correct for *existing* tests, but the spec introduces a new behavior (toast on disconnect/reconnect) that has zero test coverage in the plan. The new `useSyncToasts` hook has a transition-detection `useRef` + `useEffect` pattern that has at least two edge cases worth testing: (a) what happens when the provider changes (new doc navigated) and `prevRef` still holds the old status, and (b) what happens on mount when initial status is already `disconnected` (e.g. page reload while offline). The spec's implementation sketch would fire a disconnect toast on every mount if the provider starts in `disconnected` state, which may or may not be desirable. The "zero test impact" framing is accurate for the removal but understates the testing need for the addition.

**Strength of challenge:** LOW

**Recommendation:** Add at minimum a unit test for `useSyncToasts` that covers: (a) no toast on initial `connecting` -> `synced`, (b) toast on `synced` -> `disconnected`, (c) replacement toast on `disconnected` -> `synced`, (d) no spurious toast on provider swap (new doc navigation). The spec's Agent Constraints section says "test files (none to update)" — this should be revised to "new test file for useSyncToasts."

---

## Challenge 6 — First-time user experience and discoverability

**What the spec says:** The spec focuses on removing clutter. No consideration of onboarding or first-time user experience.

**Alternative or concern:** The current green dot, while low-information for experienced users, serves as a subtle signal to first-time users that "this is a collaborative editor with a live connection." Its presence communicates the product's nature. Removing it means a first-time user's only discovery of the collaboration capability is through presence avatars (which require multiple participants) or through a disconnect event (which may never happen in a demo). For demo audiences (P2), the spec argues a clean header is more polished — but a first-time user or demo viewer who sees zero connection UI may not understand they're looking at a real-time collaborative editor at all. This is a minor concern, acknowledged, because presence avatars and the mode toggle already communicate the editor's nature.

**Strength of challenge:** LOW

**Recommendation:** No action needed. The presence avatars, WYSIWYG/Source toggle, and eventual GitHub sync badge collectively communicate the collaborative nature. The green dot was not an effective onboarding signal anyway.

---

## Challenge 7 — Toast dismissibility and the "permanent warning" pattern

**What the spec says:** D3 sets `duration: Infinity` for the disconnect toast. The user can manually dismiss it.

**Alternative or concern:** Sonner toasts with `duration: Infinity` are dismissible by default (swipe or close button). If a user dismisses the disconnect toast, they lose all awareness that they are disconnected. There is no way to recover that awareness until they happen to notice the source-mode toggle is disabled, or until they try to perform an action that fails. The current red dot, while small, is persistent and not dismissible. By moving to a toast, the spec trades "always visible but easy to miss" for "attention-grabbing but possible to dismiss and forget." For a state that can persist for minutes (server down, extended offline), the dismissible-toast pattern may leave the user worse off than the permanent dot.

**Strength of challenge:** MEDIUM

**Recommendation:** Consider making the disconnect toast non-dismissible (`dismissible: false` in Sonner config), or pair it with the PresenceBar color-shift from Challenge 3 so that even after dismissal there is ambient awareness. Alternatively, accept the trade-off and document the reasoning: most users who dismiss the toast are doing so deliberately and will notice when their edits fail to sync.

---

## Things the spec gets right

1. **D2 (toast only on high-value transitions) is exactly correct.** Toasting connecting/syncing would be hostile. The asymmetric information value analysis in the Problem Statement is sharp and well-argued.

2. **D5 (stable toast ID) is the right dedup mechanism.** This is the standard Sonner pattern and prevents the most obvious failure mode (toast stacking on flap). The spec demonstrates awareness of the right library primitives.

3. **The dark mode gap resolution is a genuine win.** Deleting hardcoded hex colors (#f59e0b, #22c55e, #ef4444) that were flagged in the dark mode gap inventory, and replacing them with theme-aware Sonner styling, is a real quality improvement that the spec correctly claims as a side benefit.

4. **Forward-compatibility with FR29 (GitHub sync badge) is well-reasoned.** The spec correctly identifies that the current indicator is a stopgap that will be replaced regardless. Investing in improving the stopgap (e.g. making the dot bigger, adding animations) would be wasted work.

5. **The blast radius analysis is thorough and honest.** Checking test references, CSS references, dark mode gaps, and Playwright selectors is disciplined evidence-gathering. The zero-blast-radius claim is well-supported for the removal.

6. **Scope discipline is genuine.** Two files modified, one new file of approximately 20 lines, no server changes, no test changes for the removal path. This is correctly minimal for the removal. (The addition side needs test coverage, per Challenge 5, but the scope is still small.)
