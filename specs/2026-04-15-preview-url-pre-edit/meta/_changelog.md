# Changelog

## 2026-04-15 — Initial scaffold

- Scaffolded SPEC.md from template with SCR problem framing.
- Baseline commit: a6c279a.
- Loaded decisions D1–D8 from live conversation.
- Extracted open questions Q1–Q7.

## 2026-04-15 — Round 1 investigation

- Dispatched /Explore subagent on Q1–Q5. Wrote `evidence/current-state.md` and `evidence/subscriber-presence-cost.md`.
- Added D9, D10, D11. Resolved Q1–Q5.

## 2026-04-15 — Scope reduction (later reversed)

- User chose (b) demote D4 to Future Work based on (wrong) evidence that subscriber-presence check was ~1–2 days.

## 2026-04-15 — Audit + challenger returned

Both subagents run in parallel.

### Audit findings
- **High-1 (decision-implicating):** `@hocuspocus/server@4.0.0-rc.1` exposes public per-room subscriber API. D4's demotion was based on wrong cost basis. Verified directly in `.d.ts` — one-liner implementation.
- High-2: R6 encoding wording claimed "aligned with hashFromDocName" but that builder does no encoding.
- Medium: existing `server.openOnAgentEdit` prior art unmentioned.
- Medium: M1 referenced missing evidence file.
- Low: D5 framing, §8 stale annotation.

### Challenger findings
- C1 **dismissed as false.** Claimed lock port ≠ Vite port. Verified in `packages/app/src/server/hocuspocus-plugin.ts:232-239` and `packages/cli/src/commands/start.ts:124`: hocuspocus runs as Vite plugin on Vite's HTTP server in dev; sirv serves editor HTML on same port as Hocuspocus in prod. Lock port is correct.
- C2: config-first priority breaks local clones of cloud repos.
- C3: `previewUrl` on read tools = read-then-edit drift.
- C4: vibes launch concern (no enforcement, no measurement).
- C5: D9 "current machine" underspecified.
- C6–C10: smaller editorial and design items.

## 2026-04-15 — Post-audit decision reopens

User decisions on R1–R4:

- **R1 accepted.** D4 re-locked as P0 In Scope. Subscriber-presence check uses `hocuspocus.documents.get(docName)?.connections.size`. NG5 removed; M2 restored; risks row updated.
- **R2 accepted.** D1 priority flipped: env → lock → config → null. Fixes local-clone-of-cloud-repo footgun.
- **R3 accepted.** D3 narrowed: `previewUrl` emitted only on `write_document` / `edit_document`; new `get_preview_url(docName)` MCP tool added for pre-edit nav.
- **R4 accepted.** Keep `server.openOnAgentEdit` (existing) and new `preview.baseUrl` (top-level block); coexist with different mechanisms. D12 records this.
- **R5 dissolved** by R1 (subscriber-presence = measurement + feedback).

## 2026-04-15 — Corrections applied

- D9 predicate clarified: always use `localhost` when lock branch fires. Ignore `lock.hostname` entirely. No "current machine" predicate needed.
- D11: single `PREVIEW_GUIDANCE` constant replaces dual-surface hand-sync.
- D13 added: G4 scoped to syntactic validity, not runtime reachability (addresses C9).
- R6 encoding wording corrected — per-segment encode is correct, but `hashFromDocName` itself does no encoding on docName (only anchor); round-trip is via `docNameFromHash`'s per-segment decode.
- Adversarial encoding test cases added to FR (addresses C8).
- §9 alternatives rewritten — Alt C (separate tool) and Alt D (config-first) now reflect actual audit reopens rather than the original strawman framing.
- §14 risks updated — resolved rows for hostname, config leak, instruction drift, read-tool noise.
- §13 next-actions rewritten for the new scope (7 concrete steps).
- §16 SCOPE broadened to include new `get-preview-url.ts` and `preview-url.ts` files.
- `evidence/subscriber-presence-cost.md` marked superseded; `evidence/hocuspocus-subscriber-api.md` is now canonical.

## Status

All P0 items resolved. SPEC is ready for Step 8 (verify + finalize).

## 2026-04-15 — Finalized

Resolution-completeness gate passed:
- [x] All Decision Log rows have resolution status (all LOCKED).
- [x] No INVESTIGATING or ASSUMED decisions remain.
- [x] No P0 open questions remain (Q1–Q8 resolved).
- [x] 3P dependency named: Hocuspocus 4.0-rc.1 `Document.connections` (public API verified).
- [x] Architectural viability confirmed — resolver + tool + subscriber-check all exercise existing APIs.
- [x] Acceptance criteria verifiable — each FR row has a testable outcome.
- [x] No dependency on Future Work items.

Status: Approved. Baseline commit unchanged (no code written yet): a6c279a.
Ready for implementation (`/implement` or manual).
