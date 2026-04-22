---
title: M5 — `@napi-rs/keyring` end-to-end in packaged, signed, notarized build
description: Prove the GitHub Device Flow + token storage round-trip works under hardened-runtime notarization. Verify R16 bundle-ID stability, CFBundleDisplayName prompt, upsert semantics, plaintext-YAML fallback. Closes M5's DOD; unblocks M6's auth-inclusive smoke.
tags: [spec, desktop, electron, m5, keyring, auth, notarization]
status: Draft — 2026-04-21
---

# M5 — `@napi-rs/keyring` end-to-end in packaged, signed, notarized build

**Milestone:** M5 of the [Electron desktop app](../2026-04-11-electron-desktop-app/SPEC.md) (§14). Parent spec is authoritative for D31 (inherit PR #166 substrate), R15 (utilityProcess compat), R16 (keychain prompt UX).

**Author:** Andrew (2026-04-21)
**Status:** Draft — not yet implemented. Partially scaffolded via M2 (asarUnpack globs + entitlements present).
**Depends on:** M2 (signed-DMG — **shipped** PR #245). Full E2E verification requires Apple Developer creds on hand for notarization (same external dependency that gates M2's DOD).
**Blocks:** M6's end-to-end Claude-Desktop smoke (M6 Phase 2 requires sign-in to work in the packaged build so auto-sync round-trip is demonstrable). M6 Phase 1 (CLI-on-PATH) does NOT depend on M5.
**Parallelizable with:** M3 (auto-update, another workstream), M4 (URL scheme). No shared files.

---

## 1) Problem statement

The parent Electron spec LOCKED D31 (inherit PR #166's `@napi-rs/keyring` substrate — merged `986ebafe` 2026-04-17) and R16 (first-keychain-prompt uses `CFBundleDisplayName`, not helper-process name; bundle-ID stability + upsert semantics are load-bearing). M2 shipped half the plumbing:

- `packages/desktop/electron-builder.yml` §asarUnpack: `**/@napi-rs/keyring/**` + `**/@napi-rs/keyring-*/**` present.
- Hardened-runtime entitlements include `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, `com.apple.security.cs.disable-library-validation` (required for N-API native modules).
- `packages/desktop/package.json` has `@napi-rs/keyring: ^1.2.0` in dependencies.
- D33 postinstall (`electron-builder install-app-deps`) rebuilds N-API against Electron's Node ABI.
- Electron version pinned at 41.2.1 (≥ 34 required per R15, PR #46380).

What's missing — the **end-to-end proof points R15 and R16 call out**:

1. **R15 smoke**: verify `@napi-rs/keyring` actually loads inside `utilityProcess.fork()` in the packaged build (not just dev mode). The pinned dependency is `HIGH CONFIRMED` to satisfy R15 at the version level, but no packaged-build smoke has been recorded.
2. **R16 prompt UX**: first sign-in triggers the macOS keychain dialog. Confirm the displayed app name is "Open Knowledge" (from `CFBundleDisplayName`), not a helper process name. Parent spec marks this `HIGH CONFIRMED` via Apple forums + 1Password production reports — we need to observe it ourselves in a notarized DMG.
3. **Bundle-ID stability regression check**: install v0.1.0, sign in, upgrade to v0.1.1, verify token persists (no re-prompt). Requires 2 builds + 2 installs + 1 upgrade.
4. **Upsert semantics guard**: ensure `packages/cli/src/auth/token-store.ts` (or wherever writes keychain entries) uses `Entry.setPassword` as upsert, NOT delete+recreate. Unit test + packaged-build manual verification. Tied to [steipete/CodexBar#340](https://github.com/steipete/CodexBar/issues/340) regression.
5. **Plaintext YAML fallback smoke**: inject a load failure for `@napi-rs/keyring`, confirm the system falls through to `~/.open-knowledge/auth.yml` (chmod 0600) per PR #166 substrate.

Without this milestone, M6 Phase 2's "open Claude Desktop → Claude writes a doc" end-to-end smoke can't sign in to the linked GitHub repo and therefore can't demonstrate the auto-sync round-trip.

## 2) Goals

- **G1.** GitHub Device Flow completes end-to-end in a **signed + notarized** DMG on a **fresh Mac**: device-code dialog → user pastes code into `https://github.com/login/device` → token arrives → `keyring.setPassword('open-knowledge', 'github-user', token)` succeeds.
- **G2.** First-access prompt displays **"Open Knowledge" wants to access your keychain** (app name from `CFBundleDisplayName`), NOT a helper-process identifier. Verified visually + via `log show --predicate` Keychain access trail.
- **G3.** Quit app → relaunch → `keyring.getPassword(...)` returns the same token. Zero re-auth. Round-trip persistence confirmed.
- **G4.** Upgrade v0.1.0 → v0.1.1 (same `appId`, same Apple Developer Team, different version string) → token survives, no re-prompt. Proves bundle-ID stability contract (R16).
- **G5.** `packages/cli/src/auth/token-store.ts` uses `Entry.setPassword` upsert (SecItemUpdate), NOT delete+recreate. Unit test asserts the shape; signed-build manual verification confirms no ACL loss on token refresh.
- **G6.** Plaintext YAML fallback path is reachable: inject `throw new Error('keyring load failed')` at the native-binding boundary → next `setPassword` call writes to `~/.open-knowledge/auth.yml` chmod 0600 → next `getPassword` reads it back.
- **G7.** R15 utility-process smoke: `setPassword` + `getPassword` round-trip via a dedicated test endpoint or debug IPC from `packages/desktop/src/utility/server-entry.ts` to prove the native module loads inside `utilityProcess.fork()` in the packaged build.
- **G8.** `bun run check` stays green; new tests don't flake.

## 3) Non-goals

- **[NEVER] NG1.** Re-architecting `@napi-rs/keyring` usage (the PR #166 substrate is LOCKED). This milestone ONLY proves it works end-to-end in packaged mode.
- **[NEVER] NG2.** Changing the plaintext YAML fallback shape (`~/.open-knowledge/auth.yml` chmod 0600). Also LOCKED by PR #166.
- **[NEVER] NG3.** Moving keychain calls out of utility process into main process. R15 currently marks relay-to-main as a fallback (option a), but the default is utility-local. Don't invert without OQ-driven evidence.
- **[NOT NOW] NG4.** Windows Credential Manager / Linux libsecret verification. D51 macOS-only; Windows/Linux re-enter scope per D51's promote trigger.
- **[NOT NOW] NG5.** Token rotation logic (refresh after N days, revoke on sign-out propagation). PR #166 substrate owns that; this spec ONLY verifies the substrate works in packaged mode.
- **[NOT NOW] NG6.** Keychain sharing across multiple OK installs on the same Mac (dev build + release build collision). Accept collision for now; document if user reports.

## 4) Scope

One PR. New verification infrastructure; no changes to the PR #166 keyring substrate itself.

| File | Change |
|---|---|
| `packages/cli/src/auth/token-store.test.ts` (if not already present) or new | **NEW/AUGMENTED** — unit test asserts `Entry.setPassword` is called with upsert semantics (mock-level), not delete+recreate. Negative test: a deliberately-broken implementation using `Entry.deletePassword` + `Entry.setPassword` would fail the new assertion. |
| `packages/desktop/src/utility/keyring-smoke.ts` | **NEW** — utility-process-local round-trip harness callable from a debug IPC. `runKeyringSmoke()` → setPassword → getPassword → compare → return `{ ok, error? }`. Shipped for diagnosis; gated behind `process.env.OK_DEBUG_KEYRING_SMOKE=1` so it never fires in normal runs. |
| `packages/desktop/src/main/debug-ipc.ts` (if not already present, otherwise augment) | Add `ok:debug:keyring-smoke` IPC channel invoking `runKeyringSmoke()` in the utility; guards on `NODE_ENV !== 'production'` OR `process.env.OK_DEBUG_KEYRING_SMOKE=1`. |
| `packages/cli/src/auth/fallback-yaml.ts` (if not already present per PR #166) + test | Verify the plaintext YAML fallback exists and works; if it lives elsewhere in PR #166's codebase, verify there. **DO NOT** re-implement. |
| `packages/desktop/tests/smoke/keyring-e2e.md` | **NEW** — manual smoke procedure (runbook). Step-by-step: build signed DMG → fresh Mac → run through G1–G7 checklist. Cannot be automated before Apple Dev creds land; runbook is the deliverable. |
| `packages/desktop/README.md` | New "Keychain + auth" subsection documenting: (1) the DisplayName-vs-helper-process prompt UX, (2) bundle-ID stability contract (don't ever change `appId`), (3) how to debug via `OK_DEBUG_KEYRING_SMOKE=1`. |
| `scripts/verify-keyring-in-packaged-dmg.mjs` | **NEW** — driver script: given a path to a mounted DMG, launches the app with `OK_DEBUG_KEYRING_SMOKE=1`, waits for the debug IPC response, fails on error. For CI integration once Apple creds ship. |

**No changes to** `electron-builder.yml` (asarUnpack + entitlements already correct), `packages/cli/src/auth/token-store.ts` substrate, or the PR #166 GitHub auth flow.

## 5) Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | Unit test for `token-store.ts` upsert semantics passes: asserts `Entry.setPassword` is the ONLY call path (mocked `Entry.deletePassword` must NOT be invoked during normal token refresh). | `bun test packages/cli/src/auth/token-store.test.ts`. |
| AC2 | `runKeyringSmoke()` in utility process: round-trip `setPassword('open-knowledge-smoke', 'test-user', 'test-token-' + Date.now())` + `getPassword` succeeds in dev mode via `bun run --filter=@inkeep/open-knowledge-desktop dev`. Cleans up via `deletePassword` after. | Manual smoke via `OK_DEBUG_KEYRING_SMOKE=1` + DevTools Console IPC call. |
| AC3 | Plaintext YAML fallback: inject `const mod = new Proxy({}, { get: () => { throw new Error('keyring unavailable') } })` at the `@napi-rs/keyring` load point → `setPassword` writes `~/.open-knowledge/auth.yml` with `chmod 0600` → `getPassword` reads same value back. | Unit test on the fallback resolver (PR #166's existing machinery — verify don't re-implement). |
| AC4 | **(Creds-gated)** Signed + notarized DMG produces the "Open Knowledge" wants to access your keychain prompt on first sign-in. Screenshot captured. | Manual E2E on fresh Mac once Apple creds land. Per runbook `packages/desktop/tests/smoke/keyring-e2e.md`. |
| AC5 | **(Creds-gated)** Quit app → relaunch → signed-in state preserved; no re-prompt; user remains authenticated per `use-git-sync-status` hook. | Manual E2E; part of runbook. |
| AC6 | **(Creds-gated)** Install v0.1.0 signed DMG → sign in → install v0.1.1 signed DMG over it → token persists, no re-prompt. | Manual E2E; part of runbook. Requires two signed builds. |
| AC7 | **(Creds-gated)** `log show --predicate 'subsystem == "com.apple.securityd"' --info --last 5m` during keychain access shows the calling app as "Open Knowledge" (not the utility-process helper). | CLI log inspection during E2E. |
| AC8 | `scripts/verify-keyring-in-packaged-dmg.mjs <path-to-dmg>` exits 0 when the round-trip succeeds; exits 1 with diagnostics on failure. Invocation documented in `desktop/README.md`. | Local run against `build:mac:unsigned` output (unsigned is sufficient for the smoke — AC4/AC7 require signed; round-trip works either way). |
| AC9 | `packages/desktop/README.md` documents the bundle-ID stability contract: `appId: com.inkeep.open-knowledge` MUST stay constant across versions, and changing Apple Developer Team ID requires a data-migration plan (not covered here). | Docs inspection. |
| AC10 | `bun run check` green. `bunx playwright test packages/desktop/` green (no new Playwright work required if the keyring smoke is IPC-based, not UI-based). | CI gate. |

## 6) Design notes

### 6.1 Why a debug IPC instead of a unit test for R15

The R15 concern is: *does `@napi-rs/keyring` load inside `utilityProcess.fork()` in the packaged + signed + hardened-runtime build?* Unit tests run under Bun in the dev tree, with a different ABI + no hardened runtime. They can't answer the question. A debug IPC that lives inside the utility process and can be invoked from DevTools Console (dev mode) OR from a driver script against the packaged DMG (signed mode) is the smallest surface that answers R15 empirically in both modes.

The IPC is one-way and idempotent; the smoke key `open-knowledge-smoke / test-user` is namespace-scoped so it never collides with real GitHub tokens. `runKeyringSmoke()` wipes the smoke entry on success to avoid keychain pollution.

### 6.2 Runbook structure (`keyring-e2e.md`)

Ten-step procedure:

1. Build signed DMG via `bun run --cwd packages/desktop build:mac` (requires `CSC_LINK` + `APPLE_*` creds).
2. Erase Mac to factory defaults (or provision a clean test user account; cleaner via Migration Assistant snapshot).
3. Download + mount DMG; drag to `/Applications/`.
4. Launch. Accept Gatekeeper (should be auto-approved via notarization; if prompt fires, notarization failed).
5. Navigate to Sign In (from the in-editor `AuthModal` per PR #166).
6. Complete Device Flow — **observe prompt copy** — should say "Open Knowledge" not "com.inkeep...helper".
7. Screenshot prompt; confirm G1+G2.
8. Run `log show --predicate 'subsystem == "com.apple.securityd"' --info --last 2m` in Terminal; confirm G2.
9. Quit app; relaunch. Confirm still signed in (G3).
10. Install v0.1.1; upgrade in-place; relaunch. Confirm still signed in (G4).

Runbook reads as a markdown file; no automation until post-M5 when a provisioned test runner exists.

### 6.3 What the plaintext YAML fallback is FOR

Two scenarios:

- **Linux without libsecret installed** (not in current scope but substrate already handles it).
- **macOS keychain access denied by enterprise MDM policy.** Rare on consumer Macs; possible on managed devices.

PR #166 already built this fallback. M5 verifies it's reachable via injection, nothing more. If the substrate diverges (e.g., PR #166 restructures auth), retest.

### 6.4 Why upsert matters (G5)

Token refresh flow (e.g., GitHub Device Flow re-auth after 1 year): if the code does `Entry.deletePassword(...)` followed by `Entry.setPassword(...)`, the keychain ACL is regenerated on each cycle. macOS treats ACL regeneration as "new app wants access" → prompt every refresh. User frustration, high support cost.

`Entry.setPassword` on `@napi-rs/keyring` internally maps to `SecItemUpdate` when the entry exists — idempotent upsert, preserves ACL. Source: [napi-rs/keyring-rs issue #XX discussion] and the T1 research reference in R16. The unit test asserts no `deletePassword` call during refresh.

## 7) Known gaps / open questions

- **OQ-1.** Does the PR #166 `token-store.ts` implementation already guarantee upsert semantics, or is there a delete+recreate hiding somewhere? **First task for the implementer**: read the current code, then write the assertion test. If the test fails on current code, that's a pre-existing bug to fix in this milestone — scope stays focused.
- **OQ-2.** `log show --predicate` visibility of Keychain access events varies across macOS versions (Sequoia 15.x may have different log signatures than Sonoma 14.x). Runbook should document the tested versions and fallback to visual-prompt confirmation if log doesn't show what's expected.
- **OQ-3.** What happens if the user signs in, runs the app, then renames `Open Knowledge.app` to something else in Finder? Bundle ID is inside Info.plist (doesn't change with rename), but `CFBundleDisplayName` does. Prompt copy on a subsequent access may differ. Minor edge; document in runbook, don't block M5.
- **OQ-4.** Two OK installs (debug + release) on the same Mac share keychain entries (same `appId` `com.inkeep.open-knowledge`) unless appId diverges. Dev build signed with a different Developer Team would be treated as a different app for ACL purposes. Document the dev-vs-release coexistence story in README.

## 8) Implementation sequence

1. Read `packages/cli/src/auth/token-store.ts`; write AC1 upsert-assertion unit test first. If fails on current impl, fix the substrate (scope creep, but necessary — escalate to parent spec D31 if the fix is non-trivial).
2. Implement `runKeyringSmoke()` + debug IPC (AC2).
3. Verify fallback-YAML injection path (AC3).
4. Write smoke runbook + `verify-keyring-in-packaged-dmg.mjs` driver (AC8).
5. README updates (AC9).
6. `bun run check`. Push.
7. **Creds-gated E2E** (AC4–AC7) — execute manually once Apple Developer creds are on the test machine; attach screenshots to the PR. This step may ship in a follow-up commit on the same PR (pre-merge) if creds land during review.

## 9) Agent constraints

- **SCOPE:** Packaging + verification layer only. Do NOT touch `packages/cli/src/auth/token-store.ts` unless AC1 test fails on current impl (then fix narrowly — reproduce the upsert guarantee).
- **EXCLUDE:** PR #166 auth-flow UI (`AuthModal`, `AuthSettingsPane`) — upstream scope. GitHub Device Flow internals — upstream scope.
- **STOP_IF:** The AC1 unit test reveals a delete+recreate anti-pattern in current `token-store.ts`. Stop, surface to reviewer, propose the upsert fix as a separate-PR or in-PR amendment. Do not silently rewrite the auth substrate.
- **ASK_FIRST:** Any change to `electron-builder.yml` entitlements or asarUnpack globs. Those were LOCKED at M2 and changing them risks notarization regressions.

---

## 10) Decision log

None new — M5's decisions (D31 substrate inheritance, R15 utilityProcess compat, R16 prompt UX + upsert semantics + bundle-ID stability) were LOCKED or CONFIRMED in the parent spec. This spec verifies them end-to-end.

## 11) References

- [meta/investigation-findings.md](./meta/investigation-findings.md) — OQ-1 substrate read + D-M5-1 through D-M5-8 design decisions produced during implementer's codebase investigation. Read this before /decompose — it enumerates every file the implementer will create/modify, reconciles the `fallback-yaml.ts` aspirational name, and captures IPC/relay/correlation-ID decisions.
- [Parent: specs/2026-04-11-electron-desktop-app/SPEC.md](../2026-04-11-electron-desktop-app/SPEC.md) — §14 M5 DOD, D31, D33 (postinstall rebuild), R15 (utilityProcess compat), R16 (prompt UX).
- [reports/electron-ai-coding-agent-development/REPORT.md](../../reports/electron-ai-coding-agent-development/REPORT.md) — T1 research on `@napi-rs/keyring` + Apple Keychain prompt semantics.
- [PR #166](https://github.com/inkeep/open-knowledge/pull/166) — merged `986ebafe` 2026-04-17 — GitHub-collaboration substrate including the `@napi-rs/keyring` + plaintext YAML fallback shape this spec verifies.
- [steipete/CodexBar#340](https://github.com/steipete/CodexBar/issues/340) — delete+recreate regression reference (R16 footnote).
- [electron/electron#47341](https://github.com/electron/electron/issues/47341) — Keychain prompt displays app name, not helper name.
- [electron/electron#46380](https://github.com/electron/electron/pull/46380) — utilityProcess+asar crash fix; floor = Electron 34.
- [Apple Developer Forums thread 78012](https://developer.apple.com/forums/thread/78012) — non-sandboxed apps don't need `personal-information.keychain` entitlement.
