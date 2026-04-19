# Changelog

## 2026-04-16 — Initial draft

- Problem framing: SyncIndicator provides zero information 99% of the time (synced state), is easy to miss when it matters (disconnected), and occupies header space reserved for the future GitHub sync badge.
- User confirmed: minimal scope — remove indicator, add disconnect/reconnect toasts, nothing else.
- User confirmed: connecting/syncing are sub-second transients, should be silent.
- User confirmed: toast is sufficient for source-mode disable explanation (no additional tooltip needed).
- Blast radius analysis: zero test impact, zero CSS impact, resolves dark-mode gap.
- All decisions locked (D1-D7). No open questions remain.
- Spec ready for audit.

## 2026-04-16 — Post-audit corrections

Audit found 1 HIGH, 2 MEDIUM, 5 LOW. Design challenge found 1 HIGH, 4 MEDIUM, 2 LOW.

**Applied corrections (no judgment needed):**
- **Audit F1 (HIGH):** Fixed reconnect toast logic. Previous-state tracking via `prevRef` fails because intermediate transitions (`connecting`, `connected`) overwrite it before `synced` arrives. Switched to `wasDisconnectedRef` boolean flag that persists across intermediates. Added D10.
- **Audit F3 (MEDIUM):** Added FR8 — suppress disconnect toast before first sync. Prevents misleading "Connection lost" on initial page load failure. Added D9.
- **Audit F7 (LOW):** Clarified FR1 acceptance criteria — `SyncStatus` type import removed, `useSyncStatus` function import retained.
- **Design C1 (HIGH):** Fixed toast copy. "Your edits are saved locally" implies durable persistence (IndexedDB) that doesn't exist. Changed to "keep this tab open, your edits will sync when reconnected." Added D7 with rationale.

**Design challenges evaluated and deferred (D8):**
- **PresenceBar color-shift** (C3): Evaluated as hybrid — subtle red tint when disconnected + toast for initial notification. Adds complexity for a rare state; deferred to Future Work.
- **Disconnect debounce** (C4): 1-2s debounce before firing warning toast (Figma pattern). Good idea but premature — add when real-world flicker reports arrive. Noted in Future Work.
- **Dismissibility concern** (C7): Accepted that users who dismiss the disconnect toast lose ambient awareness. Source-mode disable provides secondary signal. Documented as D8.

**Dismissed findings:**
- **Design C6 (LOW):** First-time discoverability of collaborative nature. Challenger self-acknowledged as minor — presence avatars and mode toggle communicate this adequately.
- **Audit F2 (MEDIUM):** Failed reconnection cycle behavior. Verified correct — stable toast ID handles re-fires as no-op replacement. Added to Risks section.

Decisions D7-D10 added. All P0 items resolved. Spec finalized.
