# Keychain E2E smoke — signed DMG runbook

**Purpose.** Verify M5 Acceptance Criteria AC4, AC5, AC6, AC7 — the creds-gated proof points from [`specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md`](../../../../specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md).

**When to run.** After Apple Developer credentials (`CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are available on the test machine. The runbook is the deliverable; execution is deferred until creds land (see parent [`specs/2026-04-11-electron-desktop-app/SPEC.md`](../../../../specs/2026-04-11-electron-desktop-app/SPEC.md) §14).

**Est. elapsed time.** 45–60 minutes first run (fresh Mac provisioning dominates). 15 minutes thereafter.

---

## Acceptance coverage

| Step | Criterion | Evidence captured |
|---|---|---|
| 6, 7 | **AC4** — CFBundleDisplayName prompt shows "Open Knowledge" | Screenshot `keyring-ac4-prompt-<version>.png` |
| 9 | **AC5** — relaunch preserves signed-in state | Screenshot of signed-in app post-relaunch |
| 10 | **AC6** — v0.1.0 → v0.1.1 upgrade preserves token | Screenshot of signed-in app post-upgrade |
| 8 | **AC7** — `log show` identifies calling app as "Open Knowledge" | Terminal paste of `log show` output |

Also exercises **G1** (Device Flow end-to-end), **G2** (prompt UX), **G3** (round-trip persistence), **G4** (bundle-ID stability).

---

## Pre-flight

Before starting the signed runbook, confirm the unsigned-DMG driver (US-006 / AC8) is green on the same build commit:

```bash
bun run --cwd packages/desktop build:mac:unsigned
node scripts/verify-keyring-in-packaged-dmg.mjs \
  packages/desktop/dist-desktop/Open\ Knowledge-<version>-universal.dmg
# Expect: "verify-keyring: OK — backend=keyring durationMs=N" and exit 0
```

If the unsigned driver is red, fix that before attempting the signed runbook — any signed-mode failure is guaranteed to also be observable unsigned, so start debugging in the faster creds-free loop.

---

## Procedure

### 1. Build a signed + notarized DMG

With all four Apple creds exported in the current shell:

```bash
bun run --cwd packages/desktop build:mac
```

On success, `packages/desktop/dist-desktop/Open Knowledge-<version>-universal.dmg` is the notarized artifact. Do not proceed if the `afterSign` hook logs anything other than "Notarization successful" + "Stapled successfully".

### 2. Prepare a fresh Mac

Options, easiest first:

- **New user account** — `System Settings → Users & Groups → Add User`. Log in as the new user. Fastest; preserves host machine.
- **APFS snapshot** — restore to a pre-install snapshot captured before any earlier runbook attempt.
- **Fresh Mac or full factory reset** — strongest evidence, slowest.

**Why fresh matters.** A prior install (any variant — unsigned, signed, dev build) may have granted the Open Knowledge entry in the Keychain access ACL. A first-run ACL prompt (the thing AC4 is measuring) only fires on first access by the app bundle identifier `com.inkeep.open-knowledge`. Keychain entries from prior runs must be absent, else AC4 is unverifiable.

To inspect ACLs on the test user: `security dump-keychain -a login.keychain | grep -A2 open-knowledge` — must be empty before Step 6.

### 3. Install the DMG

1. Download or transfer the DMG to the test Mac.
2. Double-click to mount.
3. Drag "Open Knowledge.app" to `/Applications/` in the mount's symlinked target.
4. Eject the DMG.

### 4. Launch + accept Gatekeeper

1. Launch "Open Knowledge" from `/Applications/`.
2. First launch triggers Gatekeeper. Expected: app opens without prompting (notarization auto-approves). If a "cannot be opened because the developer cannot be verified" dialog appears, **notarization failed** — halt the runbook and investigate Step 1's output.
3. If the Mac is configured to always prompt for internet-downloaded apps, click "Open" once; this should be a silent approval, not a "developer could not be verified" warning.

### 5. Navigate to Sign In

The auth-flow UI (PR #166) ships the `AuthModal` inside the editor. Open any project (pick one or create a new folder). Trigger sign-in from the editor's auth affordance (see `packages/app/src/components/AuthModal.tsx` for the current UI surface).

The flow begins by displaying the Device Flow code + URL.

### 6. Complete Device Flow — observe prompt copy

1. Open `https://github.com/login/device` in Safari on the same Mac.
2. Paste the 8-character code from the app.
3. Authenticate in GitHub.
4. Approve the "Open Knowledge" OAuth scope request.
5. Switch back to Open Knowledge. Within seconds, the app will call `keyring.setPassword(...)`.
6. **macOS displays the keychain ACL prompt**.

**AC4 assertion.** The prompt headline reads:

> **"Open Knowledge" wants to use your confidential information stored in "login" in your keychain.**

If the headline reads "<some-helper-process>" or the bundle ID `com.inkeep.open-knowledge`, **R16 is regressed**. Halt, file bug, attach screenshot. The displayed name MUST be the `CFBundleDisplayName` — the human-readable name from `electron-builder.yml`'s `productName: Open Knowledge` field.

Click "Always Allow" to proceed.

### 7. Capture AC4 screenshot

Capture the prompt (before dismissing) via `Cmd+Shift+4` or macOS "System Screenshot" utility. Save as `keyring-ac4-prompt-<version>.png`. Attach to the PR when the runbook completes.

Expected in the screenshot:
- Alert headline contains exactly "Open Knowledge".
- Alert body references the app icon.
- Account shown = "github.com" (from the KeyringBackend's account-per-host scheme).

### 8. AC7 — `log show` evidence

In Terminal, immediately after completing Step 6 (within ~5 minutes):

```bash
log show --predicate 'subsystem == "com.apple.securityd"' --info --last 5m
```

**AC7 assertion.** At least one entry in the output includes:

- `clientTask: "Open Knowledge"` (the calling process display name)
- OR `tdm.uid` → resolves to the user running the app
- AND references the service `open-knowledge` (not `open-knowledge-smoke`)

If the entries show the calling task as a utility-process helper (pid-labeled, or `com.github.electron.helper`) instead of "Open Knowledge", R16 is regressed — the main app bundle is not the keychain caller. Halt + file bug.

**OQ-2 fallback.** macOS 15.x Sequoia's `log show` schema differs from 14.x Sonoma. If the predicate returns zero matching entries despite a successful keychain access, accept the visual AC4 screenshot as the R16 proof and annotate AC7 as "fallback: visual-only (log schema mismatch)" in the PR comment. Record the macOS version (`sw_vers`) in the PR.

Tested versions:
- macOS 14.6 Sonoma — `log show` returns entries with `clientTask` label (expected).
- macOS 15.x Sequoia — pending verification.

### 9. AC5 — relaunch persistence

1. Quit Open Knowledge (`Cmd+Q`).
2. Wait 5 seconds. Verify the app is gone from Dock / Activity Monitor.
3. Relaunch from `/Applications/`.
4. Open the same project.

**AC5 assertion.** The app shows the same signed-in state without re-triggering the Device Flow OR the keychain ACL prompt. The `use-git-sync-status` hook (see `packages/app/src/hooks/use-git-sync-status.ts`) reports authenticated.

Capture screenshot of signed-in state post-relaunch. Save as `keyring-ac5-relaunch-<version>.png`.

If a keychain ACL prompt DOES fire (user chose "Allow Once" in Step 6 instead of "Always Allow"), this is not an AC5 failure — re-run Step 9 after clicking "Always Allow" once.

### 10. AC6 — v0.1.0 → v0.1.1 upgrade persistence

Prerequisite: two signed DMGs built from two consecutive versions (bump `packages/desktop/package.json` version, re-build). Keep both notarized artifacts accessible.

1. Ensure the signed-in state from Step 9 is still present.
2. Quit Open Knowledge.
3. Copy/drag the v0.1.1 DMG's `.app` to `/Applications/`, overwriting the v0.1.0 install (Finder prompts: "Replace" — confirm).
4. Launch v0.1.1 from `/Applications/`.

**AC6 assertion.** Same as AC5 — signed-in state preserved, zero re-prompt. This proves the bundle-ID stability contract: v0.1.0 and v0.1.1 share `appId: com.inkeep.open-knowledge`, so the ACL grant carries forward.

Capture `keyring-ac6-upgrade-<new-version>.png`.

If AC6 fails, the most likely cause is a bundle-ID change sneaking in via `electron-builder.yml`. Run:

```bash
grep -E '^appId' packages/desktop/electron-builder.yml
# Must report: appId: com.inkeep.open-knowledge
```

### 11. Cleanup + PR artifact bundle

1. Log out of the test user / restore the APFS snapshot.
2. Assemble a comment on the M5 PR with:
   - All four screenshots (AC4, AC5, AC6) — use the filename convention `keyring-acN-<variant>-<version>.png`.
   - Pasted `log show` output for AC7 (tail 20 lines).
   - `sw_vers` output so reviewers know which macOS version validated.
   - Test Apple Developer Team ID (last 4 chars only — don't paste full cred).

Example PR comment:

> **M5 AC4-AC7 manual E2E — completed 2026-04-22**
>
> - [x] AC4 — prompt displays "Open Knowledge" (screenshot: keyring-ac4-prompt-0.1.0.png)
> - [x] AC5 — relaunch preserves signed-in state (screenshot: keyring-ac5-relaunch-0.1.0.png)
> - [x] AC6 — v0.1.0 → v0.1.1 upgrade preserves token (screenshot: keyring-ac6-upgrade-0.1.1.png)
> - [x] AC7 — `log show` identifies caller as "Open Knowledge"
>
> macOS: 14.6.1 Sonoma. Team ID: ...ABCD.

---

## Known issues / edge cases

- **Dev vs release coexistence** (OQ-4). Two Open Knowledge installs signed with different Team IDs on the same Mac are treated as different apps for ACL purposes. The `.dev` or `.debug` build will prompt independently on first keychain access.
- **Renamed app bundles** (OQ-3). Renaming `Open Knowledge.app` to anything else in Finder changes `CFBundleDisplayName` at read time. Subsequent prompt copy may differ. The bundle ID (inside Info.plist) is unchanged, so the ACL grant survives the rename; the prompt text does not.
- **Helper-process attribution**. The actual `setPassword` call originates in the utility process (per M5 R15 — utility-process native-module compat). macOS's Keychain Services attributes the access to the *code-signing identity at the top of the responsibility chain*, which is the main app bundle. This is what AC4/AC7 are actually verifying — that the chain attributes correctly under notarization.

---

## Related

- [SPEC.md](../../../../specs/2026-04-21-m5-keyring-packaged-e2e/SPEC.md) — M5 acceptance criteria.
- [investigation-findings.md](../../../../specs/2026-04-21-m5-keyring-packaged-e2e/meta/investigation-findings.md) — OQ-1 substrate read + D-M5-1 through D-M5-8 design decisions.
- [Parent Electron spec](../../../../specs/2026-04-11-electron-desktop-app/SPEC.md) §14 — milestone plan + D31 (keyring substrate), R15 (utilityProcess compat), R16 (prompt UX + bundle-ID stability).
- [`scripts/verify-keyring-in-packaged-dmg.mjs`](../../../../scripts/verify-keyring-in-packaged-dmg.mjs) — unsigned / headless driver (AC8, creds-free pre-flight).
