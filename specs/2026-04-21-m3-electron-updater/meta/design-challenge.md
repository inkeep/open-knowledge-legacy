---
title: M3 — Design Challenge Findings
description: Cold-read design challenge against specs/2026-04-21-m3-electron-updater/SPEC.md. Probes D5, D9, D10, D11, D6, sequencing, and toast copy.
tags: [meta, design-challenge, m3]
---
# Design Challenge Findings

**Artifact:** [[specs/2026-04-21-m3-electron-updater/SPEC]]
**Baseline commit:** `91ae79c4`
**Challenge date:** 2026-04-21
**Total findings:** 8 (3 H, 4 M, 1 L)

This challenge is scoped to the seven angles called out in the challenger brief: D5, D9, D10, D11, D6, the scaffolding-vs-DOD sequencing claim, and the toast text. The SPEC's §7 Decision Log was read end-to-end; findings below re-challenge only where either (a) the evidence base does not close the loop, or (b) the challenger independently arrives at a rejected alternative via fresh primary-source investigation.

---

## High Severity

### [H] Finding 1: Toast A copy ("Update downloaded — quit to install") misrepresents the install trigger on macOS

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** SPEC §4 (scope), §5 AC6, D11, D3.
**Issue:** The toast claims the install happens on "quit" — but macOS Cmd+W / close-last-window is the common "I'm done for now" gesture and does NOT fire `before-quit`. Confirmed by reading `packages/desktop/src/main/index.ts:423-428`: the app-level `window-all-closed` handler short-circuits on `process.platform === 'darwin'` ("keep app running so Dock icon click can re-open Navigator"). `electron-updater`'s install hook is `BaseUpdater.addQuitHandler()` (`curl .../BaseUpdater.ts` lines 78-103), which subscribes to `app.once("quit", ...)` via `ElectronAppAdapter.onQuit()`. `app.on('quit')` does NOT fire when windows are closed but the app stays Dock-resident on macOS, and does NOT fire on SIGKILL / Force Quit / `ps kill -9`. It DOES fire on Cmd+Q, File→Quit, and OS shutdown-drain.
**Current design:** "Update downloaded — quit to install" (SPEC §5 AC6, §7 D3, §7 D11; described as "version-agnostic" for stale-toast mitigation).
**Alternative:** Use copy that matches the actual install trigger AND accommodates the macOS app-stays-running default. Two credible shapes:

- **Relaunch-framed:** "Update downloaded — ready on next relaunch" (true regardless of Cmd+W vs Cmd+Q, because `autoInstallOnAppQuit=true` triggers on any normal-exit `quit` event and the replacement is in place at next launch either way). This matches Obsidian's framing (forum evidence: Obsidian installs on next normal quit + relaunch).
- **Verb-neutral:** "Update downloaded — will install automatically" — maximum hedge, but loses the "why isn't my app updating?" explanatory power.
  The current "quit" framing is neither technically accurate (force-quit and close-window don't trigger install) nor behaviorally aligned with the Mac Dock-resident default.
  **Trade-off:** "Quit to install" is more *instructive* than "ready on next relaunch" (tells the user what to do next), BUT it's actionably wrong for the Cmd+W-only user who never explicitly quits and therefore never sees the update install. D11's stale-toast mitigation ("text is version-agnostic") argues the words don't get stale across multi-download windows, but D11 does NOT address the much more common case where the words are *wrong from the first render*.
  **Status:** CHALLENGED
  **Suggested resolution:** Either (a) adopt relaunch-framed copy and accept slight pedagogical loss; (b) keep "quit to install" but add a single-sentence rider for the Mac-stays-running case — e.g. "Update downloaded — quit the app (Cmd+Q) to install"; or (c) commit to the `exitCode !== 0` silent-skip edge case as acceptable and rely on the 6h recheck + re-download loop to eventually force install via a less-ambiguous path. The current D11 decision does not surface this gap in its rationale.

---

### [H] Finding 2: D10's 6-hour periodic interval is ~6× less frequent than the closest industry comparator (Obsidian = 1h)

**Category:** DESIGN
**Source:** DC3 (framing validity — is the rationale for 6h defensible?)
**Location:** SPEC §7 D10; supporting language "4× daily," "well below any GitHub rate-limit concern," "\~24× less frequent than the 15-minute default of many always-checking updaters."
**Issue:** D10 was resolved with HIGH confidence and described as "subject to redirect if usage shows cost," but the rationale compares only against (a) hypothetical 15-minute default of unnamed always-checking updaters and (b) a 24h strawman. The closest real comparator — Obsidian, which this entire product's update UX is explicitly modeled on (parent spec J6 = "Obsidian / Claude Desktop") — is NOT cited. Primary source (Obsidian forum thread `t/frequency-of-up-to-date-checks-is-insane/15170`) has an Obsidian team member quote: *"We check for updates once per hour."* That's 6× more frequent than M3's proposed 6h. The `update-electron-app` built-in module defaults to 10 minutes (minimum 5). Neither of these is a "launch-only in disguise" pattern; both are real-time-enough to catch same-day releases. 6h makes M3 the **outlier by a large margin** and contradicts D10's own stated rationale ("6h catches same-day hotfixes").
**Current design:** `setInterval(…, 6 * 60 * 60 * 1000)` (6h). Bandwidth risk surfaced as R6 with "minimal for M3" mitigation.
**Alternative:** 1h interval, matching Obsidian precisely. Rationale: (i) P1 persona is the same persona Obsidian targets (always-on reference tool for writers); (ii) the parent spec's J6 explicitly cites Obsidian as the design model, so diverging on cadence without new evidence is inconsistent; (iii) `checkForUpdatesAndNotify()` is a metadata HEAD to `latest-mac.yml` (tiny), not a full-download — R6's "50-100 MB" framing conflates the check with the download, which only happens when a new version is available (rare, by definition); (iv) GitHub CDN rate limits are a non-issue per `evidence/electron-updater-api.md` §3 ("not rate-limited" on the CDN path for public repos).
**Trade-off:** 1h ≈ 24 checks/day vs 4 checks/day. Both are order-of-magnitude-identical network cost (metadata HEAD). The only real delta is structured-log volume. If log noise is the actual concern, that's a logging-level decision (WARN→DEBUG), not a cadence decision.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) match Obsidian's 1h and drop the "6h is defensible" argument; (b) promote D10 from agent-selected to user-selected by surfacing the comparator data and asking the user to lock a rate; or (c) keep 6h but write the rationale around a concrete principle (e.g. "we are not an update-urgent product; crash rollback is manual per NG5, so same-day hotfixes are not load-bearing"), not the current comparison-against-strawmen.

---

### [H] Finding 3: D5's silent-retry-all-errors will produce an undetectable "stuck on old version" failure class with no operational escape hatch before FW5 (Sentry) lands

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE + customer-facing engineer)
**Location:** SPEC §7 D5; parent spec §6 J7a.
**Issue:** D5 accepts a known cost: "if an update is silently broken on a user's machine (cert rotated, notarization staple stale, disk corruption), they will simply never see updates, with no indication." The rationale points at parent §7 J7a ("log the error; next launch retries; no user-visible breakage") and at FW5 (Sentry) as the future escape hatch. The challenge: **the parent's J7a was written assuming the product had at least one escape hatch for the user** (parent spec line 232: *"Manual fallback: user can re-download DMG from website."*) — but M3's D5 does not require the user to be told that fallback exists. A user whose updates have been silently broken for 3 months will experience the app as "frozen in time" without any signal that their machine is the cause, AND without any signal that "download fresh DMG from website" is the remediation. FW5 (Sentry) is the telemetry — but telemetry helps the Inkeep team notice the issue; it does NOT tell affected users how to recover. Parent §7 J7a's "Manual fallback" clause is therefore orphaned — the manual-fallback signal never reaches the user under D5 as written.
**Current design:** Zero toast, zero dialog for any error class. Structured log only. Accepted cost per parent §7 J7a.
**Alternative:** Add a **single, extremely low-frequency** user-visible hint after N consecutive retry failures — not a toast-per-error (that would re-introduce the nag), but a once-ever "This app may not be receiving updates. Visit inkeep.com/open-knowledge/download for a fresh copy" surfaced on the N-th failed check (e.g. N=7, i.e. \~a week of 6h checks failing). This is the "persistent-failure-cluster" escape hatch D5's rationale gestures at, but it does NOT require FW5 to ship first — it's a local counter in electron-store. The distinguishing feature: the surface fires at most once per installation, not once per failure, so the "no nag" invariant is not violated.
**Trade-off:** Adds \~30 LOC of state and one new IPC channel to M3. Does NOT violate D2 "Obsidian-strict" persistent-affordance (the hint is ephemeral — it fires once and dismisses on click). Does introduce a new user-visible copy surface that needs a string review. Loss: the clean "zero toast in any error path" rule of D5. Gain: the parent J7a "Manual fallback" clause actually reaches the user.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) accept the hazard explicitly — document in a new risk R7 that the failure mode is **terminal per installation** until FW5 lands and Inkeep manually outreaches affected users; or (b) add the one-time "stuck-on-old-version" escape hatch. The current rationale conflates "log the error" (observable to Inkeep via FW5 later) with "user can recover" (parent J7a's explicit fallback) without bridging the two.

---

## Medium Severity

### [M] Finding 4: D9's "bare version string" rationale frames FW1a as a promotion path but the Decision Log does not surface a trigger condition that would be observable to the team

**Category:** DESIGN
**Source:** DC1 (simpler alternative) + DC3 (framing validity)
**Location:** SPEC §7 D9; FW1a.
**Issue:** The challenger-brief angle. D9 defers "GitHub Release body fetch" to FW1a with a promote trigger of "first successful user-hands silent upgrade confirmed (any FW1-derived signal that the update pipeline works in real users' hands)." This trigger is ambiguous: *any* successful update fires it, which means FW1a triggers on M3's first success — but without any separate signal that the bare-string toast was *insufficient* in practice. The simpler reading: if the bare string works, nobody will demand (a) and FW1a will never promote. That's not a bug — it's D9 doing its job. But SPEC D9's framing ("deferring (a) avoids shipping a REST dependency we don't yet need to prove") implies a *need* that will eventually materialize. The framing and the promote trigger are in tension.
**Current design:** `"Updated to v${VERSION} — see what's new"` + `shell.openExternal` to the release page. FW1a promotes on first update success.
**Alternative:** Either (a) commit to bare-string-forever (drop FW1a — explicit acceptance that the v1 design is the steady-state design); or (b) re-define the FW1a promote trigger around observable user pain (e.g. "any user-reported request to see changes in-app" OR "dogfood feedback from Nick or Miles that clicking through feels clunky") rather than "first successful upgrade." The current trigger fires on a neutral event and forces a decision nobody has asked for.
**Trade-off:** (a) simplifies the backlog but foreclosing FW1a is a one-way door against a 20-line follow-up. (b) preserves optionality without manufacturing the trigger.
**Status:** CHALLENGED
**Suggested resolution:** Refine FW1a's promote trigger to an observable user-signal, or drop FW1a and accept bare-string as the steady state.

---

### [M] Finding 5: D11's "permanent-until-clicked" inches into persistent-affordance territory that D2 explicitly forbids

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — persistent-affordance interpretation)
**Location:** SPEC §7 D2 ("Obsidian-strict: No menu entry, no status-bar badge, no persistent indicator. Only ephemeral toasts"), §7 D11, §10 R1.
**Issue:** D11 makes toast duration `Infinity` — the toast persists across window focus, blur, switch-to-another-app, switch-back — until the user explicitly clicks dismiss. For the most common flow (P1 writer opens the app in the morning, writes all day), this toast is visible as a **persistent on-screen element** for the entire working session. D2 calls that pattern out as the thing M3 is *not* supposed to do: "No menu entry, no status-bar badge, no persistent indicator." A toast left rendered for 10 hours is, functionally, a persistent indicator. It does not show in the menu bar and does not show in the status bar — but it occupies renderer real estate at roughly the same persistence level. D2's invariant is against "P1 sees a nag-shaped thing in their workspace"; D11 creates exactly that, just in a different DOM node.
**Current design:** Both toasts use `sonner` `duration: Infinity` + `once per version` persistence via electron-store. Stale-toast risk (R5) acknowledged and mitigated via version-agnostic text.
**Alternative:** A bounded duration with an escape hatch — e.g. toast A auto-dismisses after 15s but leaves a **one-shot status indicator in the existing `PresenceBar` / status-bar area** that D2 did NOT forbid (D2 forbids a badge; a subtle "upgrade staged" tag on an element that already exists is arguably a different UX). Alternatively: toast A lives for the session (not `Infinity`) — disappears on window blur or next focus-change — accepting the user may not see it.
**Trade-off:** `Infinity` guarantees the user sees the signal; auto-dismiss accepts some users never will. The current decision leans on "the user will see it because it's sticky"; the cost is that the toast overlap is itself a nag shape. There is no middle-ground in D11's rationale.
**Status:** CHALLENGED
**Suggested resolution:** Define in the spec where the line between "ephemeral toast" and "persistent indicator" sits. `Infinity` is at one end of that spectrum; 3s auto-dismiss is at the other; D11 committed to `Infinity` without arguing against shorter durations specifically. If `Infinity` is the right call, state explicitly that D2's "persistent indicator" scope covers menu/status/dock only, NOT renderer overlays.

---

### [M] Finding 6: AC6 "reload page, assert toast does not re-render" tests a behavior that sonner's in-memory model already guarantees — the test does not exercise what the spec claims

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — test-design rigor)
**Location:** SPEC §5 AC6.
**Issue:** "Shown exactly once per pending-update state (tracked via `version-pending-install` key in `electron-store`, cleared when install completes). **Verification:** Playwright E2E: seed a mock `update-downloaded` IPC, assert toast renders, reload page, assert toast does not re-render." The test-on-reload case does not exercise the persistence logic: sonner toasts live in React state, so a page reload unmounts the component tree and the toast would be gone regardless of whether the `electron-store` key exists or not. The real test is: **re-seed the mock `update-downloaded` IPC after reload** (simulating a second `update-downloaded` event firing while the pending state is still set) — if the toast re-renders on that path, the `version-pending-install` gate is leaking. As written, AC6 will pass even if the electron-store gate is absent.
**Current design:** Reload-based test per AC6.
**Alternative:** Replace the reload step with a second IPC re-seed. More specifically: (a) seed `update-downloaded` v1, assert toast; (b) re-seed `update-downloaded` v1 (same version), assert NO second toast; (c) re-seed `update-downloaded` v2, assert a NEW toast for v2 (state transition). This actually tests the "once per pending-update state" claim.
**Trade-off:** More IPC-plumbing in the test harness. No functional risk.
**Status:** CHALLENGED
**Suggested resolution:** Revise AC6's verification to re-seed the IPC rather than reload the page.

---

### [M] Finding 7: D6 adds a scope delta to M2's electron-builder.yml — but M2 is "Implementation Complete — pending review + QA gates," which creates a coupling D6's rationale does not acknowledge

**Category:** DESIGN
**Source:** DC1 (simpler alternative: is a separate M2-patch the right PR boundary?)
**Location:** SPEC §7 D6; `specs/2026-04-20-m2-signed-dmg-scaffolding/SPEC.md` line 5 (`status: Implementation Complete — pending review + QA gates`).
**Issue:** D6 argues `.zip` target belongs in M3 "rather than a separate M2-patch PR" because "M3 is the first consumer." But M2 is at this moment in review, and M2's fuse-verification (`scripts/afterSign.mjs`) + its test matrix were designed around a single-artifact DMG path. Adding a `.zip` target mid-review means either: (a) M2 merges as-is and M3's PR touches M2-scope files (electron-builder.yml) which creates a file-ownership dance with M2's reviewers, or (b) M2's review is paused to absorb the `.zip` delta. D6's "first consumer" framing is about the runtime consumer of the ZIP (electron-updater), not the review timing. The evidence at `evidence/electron-updater-api.md` §3 makes the stronger point: electron-builder's **documented default** for Mac targets is `["dmg", "zip"]` — i.e., M2 *deviated* from the default and M3 is now correcting it. That framing makes the change look like a bug fix to M2, not a scope expansion for M3.
**Current design:** `.zip` target added in M3's PR via D6.
**Alternative:** Ship `.zip` as a tiny M2-patch PR before M3's branch lands, letting M2's review close cleanly. Then M3's diff is purely additive (electron-updater code + release workflow). Pros: clean review boundaries; M2's "Implementation Complete" status reflects the final scaffolding; M3's PR size is smaller. Cons: splits one conceptually-atomic change across two PRs; adds a day to the calendar.
**Trade-off:** PR-boundary aesthetics vs merge-velocity. D6's rationale focuses on "first consumer" — a runtime argument — not on merge hygiene. For a greenfield codebase with a tight review loop, the time cost of a tiny M2-patch is low and the diff-clarity gain is real.
**Status:** CHALLENGED
**Suggested resolution:** Either (a) accept the coupling explicitly — note in D6 that M3's PR will touch M2-owned files and coordinate with M2's reviewer; or (b) split the `.zip` delta to an M2-patch PR that M2's reviewer owns, merging before M3's PR opens.

---

## Low Severity

### [L] Finding 8: Sequencing claim "scaffolding can ship today, end-state DOD gated on M2 creds + universal-merge" misses a hidden dependency — signed DMG smoke for the `latest-mac.yml` asset-URL correctness (R2)

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — SRE verifying release pipeline)
**Location:** SPEC §1 (problem statement resolution) + §6 Known Gaps; §10 R2.
**Issue:** The spec claims "scaffolding (main-process autoUpdater wiring, release pipeline that attaches DMG+latest-mac.yml to a GitHub Release, desktop-package version bootstrap, toast + "What's new" UX, J7a failure handling, structured logging) is independent of that gate — it can be built, type-checked, unit-tested, and dry-run-smoked today against a mock update manifest." R2 surfaces that `latest-mac.yml` must be uploaded exactly to `https://github.com/.../releases/latest/download/latest-mac.yml` — with the mitigation "smoke-test asset URLs before first real release." But the mock-manifest tier 2 smoke uses `GenericProvider` (not `GitHubProvider`) per D4, and the dry-run does NOT exercise the GitHub URL resolution (evidence/electron-updater-api.md §4 explicitly flags "approach 2 uses GenericProvider not GitHubProvider, so the URL-resolution logic of §3 is not exercised"). So the CI-landing scaffolding PR is testable but **`desktop-release.yml`'s asset-upload path is NOT verified** until a signed DMG is published and a real GitHubProvider fetch lands. That's the hidden dependency: the release workflow itself can only be smoke-tested post-creds.
**Current design:** Ship desktop-release.yml today; verify asset URLs "before first real release" (post-creds).
**Alternative:** Either (a) add a dry-run-tag stage to `desktop-release.yml` that publishes to a `staging-release` channel using a fake DMG so the workflow itself is exercised pre-creds (risky — clutters real Releases page); or (b) add a unit test that statically asserts the workflow's `gh release upload` step uploads the expected filenames in the expected positions (checks the config, not the execution).
**Trade-off:** The scaffolding-tier claim is \~95% true — main-process code + toast code + unit tests + tier-2 smoke all ship today. The remaining 5% is the release workflow's execution path, which is creds-gated. The SPEC frames it as 100% unblocked. That's a minor framing issue, not a design flaw.
**Status:** CHALLENGED
**Suggested resolution:** Adjust §1 Resolution language: "the main-process wiring + toast UX + mock-manifest smoke ship today; `desktop-release.yml` lands today but its execution path verifies post-creds (same gate as M2 FU-2)."

---

## Confirmed design choices (summary)

Held up under DC1/DC2/DC3 review:

- **D1 scaffolding-tier decomposition** mirrors M2's pattern and is well-precedented in the sibling spec.
- **D4 three-tier dev-mode validation** (unit event-stub + mock-HTTP + end-state `dev-app-update.yml`) is exactly the layering evidence/electron-updater-api.md §4 recommends; no credible simpler alternative surfaces.
- **D7 version-bootstrap via changesets fixed group** avoids hand-bumping and matches M2's pattern. Clean.
- **D8 new tag-triggered `desktop-release.yml`** insulates npm publish from macOS-runner cost; the wait-for-release polling pattern is defensible.
- **Decision to exclude Toast on `download-progress`** is correct — progress bars on a 50-100 MB download are a nag shape and parent J6 forbids them.
- **OQ10, OQ11, OQ12 auto-resolutions** (userData safety, team-ID stability, concurrent-check singleton) are traceable to parent-spec invariants and reasonable.

Held up with minor framing refinements flagged above:

- **D2 Obsidian-strict** persistent-affordance level — sound as a principle, but D11 (Finding 5) requires the scope of "persistent" to be defined more sharply.
- **D5 silent-retry** — the policy is internally consistent; the gap (Finding 3) is in whether users are told about the manual fallback parent §7 J7a references.
