---
title: M3 spec — session changelog
description: Append-only process history for the M3 (auto-update) spec.
tags: [meta, changelog, m3]
---
# M3 spec — session changelog

## 2026-04-21 — Session 1: Intake + scaffold

### Intake

- Created worktree `.claude/worktrees/m3-auto-update-spec` per user direction ("in a worktree let's create a spec for M3").
- Grounded against parent spec ([[specs/2026-04-11-electron-desktop-app/SPEC]] §14 M3 lines 1213-1224, §8.10 electron-updater config, §6 J6 install-on-quit UX, §7 J7a failure modes) and M2 decomposition pattern ([[specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC]]).
- Drafted SCR problem statement; stress-tested with 5 probes (demand reality / status quo / narrowest wedge / observation / future-fit) — all five pass.
- Confirmed `electron-updater` has no existing footprint on `main` (`grep -rn "autoUpdater|electron-updater" packages/` → only parent spec + README fence).

### User-confirmed decisions

- **D1 — Scope = scaffolding tier (mirrors M2).** Ship wiring + release pipeline + toast UX now; gate end-state silent-upgrade smoke on M2 creds + universal-merge fix.
- **D2 — Persistent-affordance level = Obsidian-strict (Q3 option a).** No menu, no status-bar, no badge.
- **D3 — Notification layer = two ephemeral toasts.** Update-downloaded toast + "What's new" post-update toast. User expanded In Scope beyond initial recommendation: toasts promoted from FW to In Scope; "What's new" promoted likewise; beta channel / Windows-Linux / auto-rollback / Sentry stay Out of Scope.
- **Spec directory: `specs/2026-04-21-m3-electron-updater/`.**

### Artifacts created

- `SPEC.md` — draft skeleton with problem statement, goals, non-goals, scope, known blockers, D1–D3 captured, FW/risks placeholders.
- `evidence/current-state.md` — factual findings from code traces at baseline `91ae79c4` (desktop package, electron-builder.yml, desktop-build.yml, release.yml, main-process index).
- `meta/_changelog.md` — this file.

### Research agent returned (2026-04-21)

`evidence/electron-updater-api.md` written. Load-bearing findings:

- **9 events, wire 6.** `checking-for-update`, `update-available`, `update-not-available`, `download-progress` (debug log only, no UI), `update-downloaded`, `error`. Skip `login` (public repo), `update-cancelled` (fire-and-forget), `appimage-filename-updated` (Linux).
- **13 `ERR_UPDATER_*` / `HTTP_ERROR_*` codes** with clear semantics. Classify on `err.code`, NOT `err.message`. **Critical gap:** Squirrel.Mac native errors (signature mismatch, notarization break) forward as bare `Error` with no `.code` — M3 rule: unclassified errors → silent retry + structured log.
- **GitHub URL:** CDN path `/releases/download/<TAG>/latest-mac.yml`. Filename must be exactly `latest-mac.yml`.
- **Scope delta (new P0 OQ13):** `MacUpdater.ts:89` downloads `.zip`, NOT `.dmg`. Current `electron-builder.yml` only ships `dmg`. M3 must add `zip` to `mac.target`. electron-builder's documented default is `["dmg", "zip"]`; M2 shipped `.dmg` only because auto-update was out of M2's scope — M3 is the first consumer that needs `.zip` (F10 audit — neutral framing). SPEC §4 scope updated.
- **Dev-mode:** three approaches ranked. Pick approach 2 (mock HTTP + hand-crafted manifest) for `smoke-mock-update.mjs`; approach 3 (event-stub) for `auto-updater.test.ts`; approach 1 (`dev-app-update.yml`) post-creds for end-state dry-run.

### Backlog extraction (Phase 3 — complete)

12 open questions extracted via three-probe sweep (walk-through / tensions / negative space). 7 classified P0 (In Scope resolution required), 5 as P2 (Future Work) or auto-resolved by investigation.

### Decisions batch #1 resolved (Phase 4 — iterate)

User locked all 8 items across two decision turns:

- **D4** (OQ6) — Dev-mode dry-run = three-tier validation (unit event-stub + mock-HTTP integration + end-state canonical post-creds).
- **D5** (OQ7) — Error-routing policy = classified `ERR_UPDATER_*` / `HTTP_ERROR_*` + unclassified Squirrel.Mac bare errors both route to silent retry + structured log. No toast, no dialog. Accepted cost: silent failures on user's machine.
- **D6** (OQ13) — `.zip` target added to `electron-builder.yml` (scope delta to M2's scaffolding; `MacUpdater.ts:89` downloads `.zip` not `.dmg`).
- **D7** (OQ1) — Version bootstrap = sync naturally via `changesets fixed` group. No hand-bump; first release version is whatever the group lands at.
- **D8** (OQ2) — Release trigger = new tag-triggered `.github/workflows/desktop-release.yml` firing on `push.tags: ['v*']`. Insulated from `release.yml` npm publish path.
- **D9** (OQ3) — "What's new" source = bare version string + link for first release. FW1a promotes to GitHub Release body fetch after v1 validates.
- **D10** (OQ4) — Update-check cadence = launch + every 6h. Agent-selected 6h interval with HIGH confidence; subject to redirect if usage shows cost.
- **D11** (OQ5) — Toast duration = permanent-until-clicked. Both toasts use `duration: Infinity`; show once per version; text is version-agnostic so stale content is still accurate (R5 mitigation).

### Added since batch #1

- **FW1a** — promote What's new to Release-body fetch post-validation.
- **R5** — stale-toast risk from permanent-until-clicked + multi-release scenarios. Mitigated via version-agnostic text.
- **R6** — 6h periodic check bandwidth cost on metered connections. Mitigated via log for now; promote opt-out if usage complaints surface.

### Next (Phase 5 — Audit)

All P0 items resolved. Scope stabilized. Ready to spawn parallel auditor + challenger nested Claude instances per spec skill Step 6.

## 2026-04-21 — Session 1: Audit + assess-findings

Parallel auditor + challenger subagents run against scope-stable SPEC.md.

### Auditor findings (18 total: 7 H / 8 M / 3 L)

See [[specs/2026-04-21-m3-electron-updater/meta/audit-findings]].

### Challenger findings (8 total: 3 H / 4 M / 1 L)

See [[specs/2026-04-21-m3-electron-updater/meta/design-challenge]].

### /assess-findings — applied silently (23 corrections)

Coherence + factual corrections that don't implicate prior user decisions:

- **F1** — §4 scope now names `ipc-events.ts` (not `ipc-channels.ts`); AC2 uses `ok:update:downloaded` + `ok:update:whats-new` per `EventChannels` convention.
- **F2** — AC10 + D10 updater check is now gated on "end of `app.whenReady().then(...)` handler" (not `createNavigatorWindow()`), since Navigator only opens on the Option-held / no-last-project path per `main/index.ts:416-420`.
- **F3** — `electron-store` is NOT installed; switched to extending `AppState` in `state-store.ts` with `versionPendingInstall` + `lastSeenVersion`. Added `state-store.ts` to §4 scope.
- **F4** — added `bridge-contract.ts` + `core/desktop-bridge.ts` to §4 scope per CLAUDE.md's deliberate-duplication directive.
- **F5** — canonical Toast B copy is D9's `"Updated to v${VERSION} — see what's new"`; D3/D11 references updated to reference that canonical form.
- **F6** — evidence file acknowledges line numbers need re-citation at A4 pin-time; claims themselves are correct.
- **F7** — A1 tightened: release workflow invokes `electron-builder --mac --publish always` with `GH_TOKEN`; named the explicit mechanism.
- **F8** — §4 tag shape matches AC5/D8 (no `desktop-v*` stragglers) — moot because trigger moved to `release: published` (F14).
- **F9** — evidence/current-state.md corrected: changesets versions private packages (updates package.json + CHANGELOG.md); only `changeset publish` skips npm upload for them.
- **F10** — softened "M2 deviated" framing in evidence + changelog: M2 shipped `.dmg` only because auto-update was out of scope; M3 is the first consumer needing `.zip`.
- **F11** — §1 correctly attributes signature-verify to native Squirrel.Mac (not electron-updater).
- **F12** — OQ10 cites parent D40 (not CC8) for userData quiescence before `.app` swap.
- **F13** — A4 added to pin `electron-updater` version at install time against the `electron-builder@^26.9.0` line.
- **F14** — trigger changed from `push.tags: ['v*']` to `on: release: types: [published]` — decouples from App-token-vs-GITHUB\_TOKEN push semantics; no wait-for-release polling needed. A5 added.
- **F15** — `.changeset/m3-electron-updater.md` added to §4 scope per D7.
- **F17** — AC10 + D10 updater-interval cleared on `will-quit` (not `before-quit`) — matches parent D40 canonical ordering.
- **F18** — G2 acknowledges scope delta (parent J6 step 7 "optional" toast promoted to required via D3).
- **C4** — FW1a promote trigger refined to observable user demand (not "first successful upgrade").
- **C5** — D2 "persistent indicator" scope sharpened to menu / status-bar / Dock badge only; explicitly NOT including renderer-overlay toasts.
- **C6** — AC6 verification replaced reload-test with re-seed-IPC test (actually exercises the `versionPendingInstall` gate).
- **C7** — D6 includes M2-reviewer coordination note (per user's "we can implement the fix as part of the M3 spec" direction).
- **C8** — §1 framing tightened: scaffolding + toast + version + J7a + logging ship today; release workflow lands today but execution path verifies post-creds.

### /assess-findings — escalated to user (3 items)

- **C1 — Toast A copy on macOS.** "Quit to install" is wrong for users who Cmd+W close-window (common macOS idiom — app stays Dock-resident per `main/index.ts:423-428`). Install hook is `app.once('quit')` per `BaseUpdater.addQuitHandler`, fires on Cmd+Q only.
- **C2 — D10 cadence of 6h is outlier.** Obsidian (parent spec's cited UX model per J6) checks hourly per Obsidian forum primary source. `update-electron-app` defaults to 10 minutes. 6h needs either (a) re-justification around concrete principle or (b) move to 1h to match parent's named UX model.
- **C3 — D5 orphans parent J7a's manual-fallback.** User confirmed "no toast on error" earlier; challenger surfaces a narrower middle path not previously presented: one-time-ever hint after N consecutive failed checks, pointing at manual re-download fallback per parent J7a. Distinguishing from D5's rejected "toast-per-error" pattern: fires at most once per installation.

### Escalation decisions (user-confirmed 2026-04-21)

- **C1 → D3 revised.** Toast A now has an explicit "Relaunch now" action button (sonner `action` prop) + IPC `ok:update:relaunch-now` → `autoUpdater.quitAndInstall()`. Body text drops the "quit to install" phrasing. User response: "make a click to relaunch button like".
- **C2 → D10 revised.** Cadence moved from 6h to **1h** to match Obsidian (parent's cited UX model per §6 J6). User response: "2a".
- **C3 → new D12.** Added one-time-ever "stuck update" hint (Toast C) after 7 consecutive calendar days without a successful check. Closes parent J7a's orphaned manual-fallback clause. User response: "3b".

### Cascading updates

- §4 Scope: added IPC request channel `ok:update:relaunch-now` + IPC event channel `ok:update:stuck-hint`; extended `AppState` with four fields (`versionPendingInstall`, `lastSeenVersion`, `lastSuccessfulCheckAt`, `stuckHintShown`).
- AC17 added for D12 behavior; AC18 added for D3 revised relaunch-button behavior.
- R6 updated: 1h HEAD is \~negligible cost, not the 50-100 MB misframing; R7 added for 7-day silent-failure window.
- D3 rewritten for 3-toast model (A/B/C); D5 updated to reference D12 as the closed-loop for silent-failure recovery.

### Phase 7 — Verify and finalize

Agent Constraints populated (§13): SCOPE / EXCLUDE / STOP\_IF / ASK\_FIRST derived from D1-D12 + AC1-AC18. Mechanical adversarial checks: no ASSUMED decisions; no 1-way-door decisions at LOW/MEDIUM confidence; NG1-NG8 temporal tags reviewed. Baseline commit stamped: `91ae79c4`.

SPEC.md status updated to "Scope-frozen post-audit — ready for implementation".
