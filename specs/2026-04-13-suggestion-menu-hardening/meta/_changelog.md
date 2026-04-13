# Changelog

## 2026-04-13 — Initial draft

- Created SPEC.md from findings surfaced during PR #78 (wiki-link suggestion migration)
- Verified all 4 claims against codebase at baseline 47e858b
- Created evidence files: positioning-duplication.md, slash-command-safety.md
- Problem stress-test passed all 5 probes

## 2026-04-13 — Audit + Challenger pass

Spawned parallel audit (3 findings) + challenger (5 findings). All 8 survived /assess-findings evaluation.

**Applied corrections:**
- [Audit H + Challenger H1] Reframed "command atomicity fix" → "command error safety" — the fix is error containment (try/catch), not transactional atomicity. Updated §1/§2/§3.2/D3. The spec was promising more than the fix delivers.
- [Audit M + Challenger L5] Corrected A3: `popup.isConnected` IS required (not "unnecessary"). `computePosition` is async — `.then()` can fire after `popup.remove()` was called, making the reference non-null but disconnected. Verified from `@floating-ui/core` source (line 135: `async`).
- [Challenger M2] Changed API: `createSuggestionPopup` returns `startAutoUpdate` function instead of calling `autoUpdate` internally. Preserves content-before-autoUpdate ordering.
- [Challenger M3] Added `preventFocusSteal` (onMouseDown → preventDefault) on SlashCommandMenu container to §3.4. Real gap — clicking container padding steals editor focus.
- [Challenger M4] Expanded §3.4 from aria-live only to full a11y parity: `useId()`, per-item `id`, `aria-activedescendant`, `tabIndex={-1}`.
- [Audit L] Removed `wiki-link-suggestion/` from Location header (no files in that directory are in scope).

## 2026-04-13 — Finalized

- Status → Final. All findings applied. Baseline: 47e858b.
