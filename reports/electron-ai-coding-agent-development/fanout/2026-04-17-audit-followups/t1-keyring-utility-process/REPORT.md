---
title: "@napi-rs/keyring in Electron utilityProcess: Compatibility + Keychain UX (2026)"
description: "Factual reference for shipping @napi-rs/keyring inside Electron utilityProcess.fork() in signed, notarized direct-DMG builds on macOS, Windows, and Linux. Covers native-module loading path, asarUnpack requirements, first-access keychain UX, bundle-ID stability across updates, cert rotation, Linux backend fallbacks, and comparison with Electron's built-in safeStorage."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - "@napi-rs/keyring"
  - Electron
  - utilityProcess
  - macOS Keychain
  - Windows Credential Manager
  - Linux libsecret
  - keytar
  - safeStorage
  - Apple Developer Program
  - Azure Trusted Signing
topics:
  - native N-API module loading in Electron utilityProcess
  - macOS Keychain first-access UX
  - bundle-ID stability across app updates
  - code-signing cert rotation
  - Linux SecretService fallback chains
  - Electron safeStorage vs external keyring libs
---

# @napi-rs/keyring in Electron utilityProcess: Compatibility + Keychain UX (2026)

**Purpose:** Factual reference for shipping `@napi-rs/keyring` (a Rust-backed keychain-access library) inside Electron's `utilityProcess.fork()` runtime in production signed + notarized builds. Downstream reader decides whether the combination meets their requirements.

---

## Executive Summary

**Primary answer: Yes, `@napi-rs/keyring` is a viable choice inside `utilityProcess.fork()` on Electron 34+ across macOS direct-DMG, Windows, and Linux. Confidence: INFERRED-strong.** The library is actively maintained (v1.2.0, September 2025), N-API 3-based (ABI-stable across all current Electron versions), ships prebuilt binaries for 12 platform targets, and its architectural loading path is identical to main-process native modules once binaries are asar-unpacked. No architectural barrier specific to `utilityProcess` exists for N-API modules. Confidence is short of CONFIRMED only because no publicly documented end-to-end case study of this exact combination in a signed+notarized production build exists — the evidence is compositional.

**Primary risks are packaging and UX, not runtime compatibility:**

1. **Packaging (D1):** The `.node` binary inside `node_modules/@napi-rs/keyring-<platform>/` must be asar-unpacked. Electron Forge's `plugin-auto-unpack-natives` does this automatically; electron-builder auto-detects by default but has reported edge cases ([electron/forge#3934](https://github.com/electron/forge/issues/3934)). Test in a packaged build, not just dev.
2. **macOS UX (D2):** First read prompts `"<AppName>" wants to access your keychain`. User clicks "Always Allow" → persistent ACL. **Critical anti-pattern**: application code must use `SecItemUpdate` (not delete+recreate) on token refresh. Production bug at [steipete/CodexBar#340](https://github.com/steipete/CodexBar/issues/340) shows delete+recreate wipes the ACL and re-prompts every time.
3. **Update UX (D3):** Same bundle ID + same Apple Developer Team across v1 → vN = keychain ACL preserved. Normal cert renewal is transparent. Bundle ID change or team change = re-prompt.
4. **Linux (D5):** Fails fast if SecretService AND kernel keyutils both unavailable — stricter than Electron's safeStorage which silently falls back to hardcoded-key plaintext. Fail-loud is the correct behavior for tokens.
5. **Electron ≥ 34 required:** `utilityProcess.fork` + asar-path crash ([electron/electron#41396](https://github.com/electron/electron/issues/41396)) resolved by [PR #46380](https://github.com/electron/electron/pull/46380) merged April 2025.

**safeStorage is NOT a drop-in alternative for utility-process architectures (D6):** Main-process-only. Using it from utility requires IPC relay. `@napi-rs/keyring` can be called directly from utility code.

**Key Findings:**
- **Compat with Electron utilityProcess:** No architectural barrier. Same N-API loading path as main-process. INFERRED-strong.
- **Keychain prompt attribution:** App name from `CFBundleDisplayName`, NOT utility helper-process name. CONFIRMED.
- **Bundle-ID + Team stability:** ACL preserved if both constant across updates. Cert rotation transparent. CONFIRMED.
- **Delete+recreate anti-pattern:** Wipes ACL, re-prompts on every refresh. Production-observed. CONFIRMED.
- **Direct-DMG entitlement:** `com.apple.security.personal-information.keychain` NOT required (sandbox-only entitlement). CONFIRMED.
- **Linux fail-loud:** Throws when neither SecretService nor keyutils available — safer than safeStorage's silent plaintext fallback. CONFIRMED.
- **safeStorage alternative:** Not drop-in — main-only, incompatible storage model, stability coupled to Electron internals. CONFIRMED.

---

## Research Rubric

| Dimension | Priority | Purpose |
|---|---|---|
| D1 — `@napi-rs/keyring` + Electron packaging compatibility | P0 (Deep) | Verify loading, binary-split pattern, asarUnpack requirements |
| D1a — Native N-API modules in utilityProcess (general) | P0 (Deep) | Baseline: are N-API modules known to work in utilityProcess at all? |
| D2 — macOS Keychain first-access UX from direct-DMG | P0 (Deep) | Identify prompt wording, attribution, entitlement requirements |
| D3 — Bundle-ID stability + cert rotation + ACL | P0 (Deep) | Verify ACL persistence across updates + Apple Developer Program renewal |
| D4 — Windows Credential Manager UX | P1 (Moderate) | Document prompt behavior, signing-cert rotation impact |
| D5 — Linux libsecret fallback | P1 (Moderate) | Fallback chain, Flatpak/Snap edge cases, headless-env behavior |
| D6 — Alternative architectures (safeStorage, main-relay) | P1 (Moderate) | Evaluate whether `safeStorage` obsoletes external keyring libs |

**Non-goals (out of scope):** OAuth Device Flow security; library recommendation; 1P Open Knowledge configuration; MAS-sandboxed apps.

---

## Detailed Findings

### D1 — @napi-rs/keyring + Electron packaging compatibility [P0]

**Finding:** `@napi-rs/keyring` 1.2.0 distributes N-API 3 prebuilt binaries for 12 platform targets via npm `optionalDependencies` subpackage pattern (e.g., `@napi-rs/keyring-darwin-arm64`). The binding loader in `index.js` has two resolution paths per platform:

```js
require('./keyring.<platform>.node')      // colocated (dev only)
require('@napi-rs/keyring-<platform>')    // subpackage (production)
```

Both require the `.node` file to be a real filesystem path — inside `app.asar`, `dlopen` fails. Therefore `asarUnpack` is mandatory.

**Evidence:** [evidence/d1-keyring-electron-compat.md](evidence/d1-keyring-electron-compat.md)

**Confidence:** INFERRED-strong. Compositional evidence covers every link (N-API ABI-stable, prebuilts exist, loader pattern documented, asarUnpack is a known Electron primitive). No single combined-integration case study.

**Implications:**
- Electron ≥ 34 required: `utilityProcess.fork` pre-ready asar-path crash (electron/electron#41396) fixed by PR #46380 in April 2025.
- `asarUnpack` globs needed: `"**/*.node"` + `"**/node_modules/@napi-rs/**"` (the latter catches the platform-split subpackages).
- `electron-builder install-app-deps` handles rebuild-against-Electron-ABI during packaging; CI must include this step for the desktop cell.

**Decision triggers:**
- If using bare electron-builder → explicit `asarUnpack` is the hedge against auto-detection edge cases.
- If targeting Electron < 34 → upgrade is mandatory to avoid the asar+utility crash.
- If supporting RHEL 8 / Ubuntu 20.04 → test glibc compatibility of exact pin (v1.1.9 regressed on RHEL 9; fixed in v1.1.10).

**Remaining uncertainty:** No primary-source confirmation of exact combination `@napi-rs/keyring` + `utilityProcess.fork()` in a signed+notarized build. Recommend smoke test on {macOS Intel, macOS Apple Silicon, Windows x64, Linux x64} during first-release QA.

### D1a — Native N-API modules in utilityProcess (general) [P0]

**Finding:** Electron `utilityProcess` (GA since Electron 22, April 2023) runs a Node.js runtime functionally equivalent to the main process for native-module loading. N-API modules load via `process.dlopen` — a Node primitive, not gated per process type. No issue-tracker entry reports utilityProcess-specific N-API loading failures. Reported failures (e.g., [better-sqlite3 in worker_thread#43513](https://github.com/electron/electron/issues/43513)) are packaging issues, not runtime loading.

**Evidence:** [evidence/d1a-native-napi-in-utilityprocess.md](evidence/d1a-native-napi-in-utilityprocess.md)

**Confidence:** INFERRED-strong.

**Implications:**
- The utility runtime is not a second-class citizen for native-module use. Packaging hygiene is the only gotcha.
- Bundling strategy matters: when bundling the utility entrypoint via webpack/esbuild, mark native modules as externals AND copy `.node` files to output. Electron-vite and electron-forge Vite template handle this built-in.

**Decision triggers:**
- Bundled utility entrypoint → explicit externals list + copy step.
- Unbundled (raw `require` from node_modules) → default works.

### D2 — macOS Keychain first-access UX from direct-DMG [P0]

**Finding:** First keychain read from any process of a signed Electron app displays `"<AppName>" wants to access your confidential information stored in "<item>" in your keychain.` with Always Allow / Allow / Deny buttons. App name from CFBundleDisplayName — **not** from helper/utility process name. All processes sharing the `.app`'s code-signing identity are attributed to the parent app.

Direct-DMG apps do NOT require `com.apple.security.personal-information.keychain` — that is a sandbox entitlement for MAS apps only. Hardened-runtime-but-not-sandboxed direct-DMG apps have default access to their own keychain items ([Apple DTS engineer, Apple Developer Forums thread 78012](https://developer.apple.com/forums/thread/78012)).

**Critical anti-pattern**: deleting and recreating a keychain item on token refresh wipes the ACL. Production bug at [steipete/CodexBar#340](https://github.com/steipete/CodexBar/issues/340): OAuth refresh caused "Allow always" to re-prompt every time. Fix: use `SecItemUpdate` — which `keyring-rs::Entry.set_password` does when entry exists.

**Evidence:** [evidence/d2-macos-keychain-ux.md](evidence/d2-macos-keychain-ux.md)

**Confidence:** CONFIRMED (prompt attribution to app name), CONFIRMED (direct-DMG entitlement not required), CONFIRMED (delete+recreate anti-pattern).

**Implications:**
- The earlier R16 assumption ("utilityProcess name surfaces in keychain prompt dialog instead of 'Open Knowledge' — either rename utility to user-friendly string or accept the artifact") is **incorrect**. The prompt shows the app's `CFBundleDisplayName` regardless of which internal process triggered the access. No utility-process renaming needed.
- The earlier spec note that direct-DMG apps don't require the keychain entitlement was correct.
- Implementation MUST use upsert-style token refresh (`set_password` on existing entry → `SecItemUpdate`), never delete+recreate. `@napi-rs/keyring`'s `Entry.setPassword` does the right thing.

**Decision triggers:**
- In-place binary updater (Sparkle, Squirrel) → verify update flow doesn't re-sign with DR-changing identity.
- Token-refresh code pattern check: anywhere using `deletePassword` → `setPassword` → refactor to single `setPassword` call.
- Minimize prompts: use single `{service, username}` pair for all token storage (one ACL).

### D3 — Bundle-ID stability + cert rotation + ACL [P0]

**Finding:** macOS keychain ACLs key on Code Signing Designated Requirement (DR). Default DR evaluates to `(anchor apple generic) AND (identifier "<bundle-id>") AND (subject.OU = "<team-id>")`. As long as bundle ID AND Apple Developer Team stay constant, ACL is preserved across updates. Annual Developer ID renewal is transparent because DR targets team ID, not specific leaf cert. Bundle ID or team change breaks ACL.

Negative search: zero GitHub issues or support complaints of mass keychain re-prompts after Developer ID annual renewal across electron-builder, electron/electron, VS Code, 1Password forums.

**Evidence:** [evidence/d3-bundle-id-stability-cert-rotation.md](evidence/d3-bundle-id-stability-cert-rotation.md)

**Confidence:** CONFIRMED (DR mechanism), CONFIRMED (cert rotation transparency via negative search).

**Implications:**
- Treat `appId` in electron-builder config as immutable once shipped — one-way door. Choose carefully before first release.
- Team migration (company acquisition) is rare but requires a re-authentication flow.
- Library migration (e.g., keytar → safeStorage, or vice versa) requires explicit migration pass (read-old + write-new + delete-old). Not transparent.

**Decision triggers:**
- If bundle-ID change is forced (rebrand, acquisition) → plan user-visible re-auth flow.
- If migrating from keytar or safeStorage to `@napi-rs/keyring` → write a migration pass that reads the old storage, writes to the new, and deletes the old entry.

### D4 — Windows Credential Manager UX [P1]

**Finding:** Windows Credential Manager has **zero per-application access prompts**. Any process running as the Windows user can read any Generic Credential. DPAPI user-key derivation ties encryption to user password. Signing cert rotation (Azure Trusted Signing, Sectigo EV, DigiCert) has zero impact on credential access.

Generic Credentials unaffected by Credential Guard (which targets NTLM/Kerberos). Normal password change is transparent; admin password reset invalidates stored credentials (app must handle re-authentication).

**Evidence:** [evidence/d4-windows-credential-manager-ux.md](evidence/d4-windows-credential-manager-ux.md)

**Confidence:** CONFIRMED.

**Implications:**
- No first-run prompt on Windows, unlike macOS. Simpler onboarding.
- Trade-off: weaker process-isolation — any malicious process running as the user can read stored tokens. Same threat model as every Windows app using Credential Manager.
- Azure Trusted Signing cert procurement (1-20 business days) does not gate Credential Manager access — only gates SmartScreen reputation + installer trust.

**Decision triggers:**
- Admin password reset scenario → UX for re-auth must be considered.
- Signing-cert expiration in middle of release cycle → no impact on stored credentials.

### D5 — Linux libsecret fallback + missing-backend handling [P1]

**Finding:** `@napi-rs/keyring` Linux implementation (per [src/linux_credential_builder.rs](https://github.com/Brooooooklyn/keyring-node/blob/main/src/linux_credential_builder.rs)) tries SecretService (DBus → gnome-keyring / KWallet / keepassxc) first, falls back to kernel keyutils (`keyctl`), throws if both fail. **No silent plaintext fallback** — unlike Electron's safeStorage which degrades to hardcoded-key plaintext when neither libsecret nor kwallet are available.

Flatpak/Snap sandboxing commonly breaks SecretService DBus access — need explicit `--talk-name=org.freedesktop.secrets` (Flatpak) or `password-manager-service` interface (Snap). Direct DEB/RPM/AppImage unaffected.

Kernel keyutils user keyring has default 3-day inactivity expiry — long-lived secrets may need periodic re-auth.

**Evidence:** [evidence/d5-linux-libsecret-fallback.md](evidence/d5-linux-libsecret-fallback.md)

**Confidence:** CONFIRMED (fallback chain source-verified), CONFIRMED (fail-loud vs safeStorage's silent-plaintext divergence).

**Implications:**
- Fail-loud is correct for tokens. Users on headless/minimal desktops get a clear error rather than silent plaintext storage.
- Flatpak/Snap distribution requires manifest entries for DBus Secrets access. Direct packaging (AppImage, DEB, RPM) has no such requirement.

**Decision triggers:**
- Flatpak/Snap distribution → test manifest exposes DBus Secrets.
- Minimal/headless Linux → plan "secure storage unavailable" UX path with environment-variable fallback.
- Kernel keyutils users → periodic heartbeat read/write (every 2 days) to reset inactivity timer, OR accept occasional re-auth prompts.

### D6 — Alternative architectures (safeStorage, main-relay) [P1]

**Finding:** Electron's `safeStorage` is **main-process-only** per official docs. For utility-process architectures, requires IPC relay. `@napi-rs/keyring` can be called directly from utility code.

Storage models differ:
- **safeStorage**: encryption key in OS keyring + ciphertext on disk (in user-data dir). App responsible for persisting ciphertext.
- **@napi-rs/keyring**: secret stored directly as keychain item. No disk-side state.

Not drop-in compatible — migration requires explicit re-entry. freek.dev's Ray migration confirms: "any previously saved passwords... now inaccessible for the app."

safeStorage has had Electron-upgrade-induced data-loss bugs ([electron/electron#43233](https://github.com/electron/electron/issues/43233)) — stability coupled to Electron internals. keyring-rs stability derives from OS-native keychain APIs, which evolve slower.

VS Code's keytar → safeStorage migration was driven by keytar's unmaintained status (archived Dec 2022), not inherent safeStorage advantage. `@napi-rs/keyring` 1.2.0 (Sep 2025) is actively maintained — VS Code's "library of last resort" rationale does not apply.

**Evidence:** [evidence/d6-alternative-architectures.md](evidence/d6-alternative-architectures.md)

**Confidence:** CONFIRMED.

**Implications:**
- If all credential access is in the main process → safeStorage is ergonomically lighter (no native-module packaging).
- If credential access is needed from utility process → `@napi-rs/keyring` OR main-process-relay via IPC.
- safeStorage's storage model (encrypted ciphertext on disk) is semantically different from `@napi-rs/keyring`'s (keychain item). Migrations require explicit planning.

**Decision triggers:**
- Credential access needed ONLY from main → safeStorage is simpler.
- Credential access needed from utility process → `@napi-rs/keyring` directly, OR an IPC relay (renderer/utility → main → safeStorage → main → renderer/utility).
- Migrating FROM keytar → plan migration pass (read-old + write-new + delete-old); see D3 implications.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **End-to-end combined integration:** No OSS Electron project publicly documents `@napi-rs/keyring` inside `utilityProcess.fork()` in a signed+notarized build. Evidence is compositional (N-API loading works + keyring works + utility process works separately, but no "all three together" case study).
- **Fresh macOS 14/15 screenshots of first-access keychain dialog:** Not captured (no primary screenshot evidence; text description only from multiple forum threads).
- **Cross-team Developer ID migration:** No public OSS case study of an app migrating Apple Developer Team between v1 and v2. Behavior inferred from DR spec, not empirically observed.

### Out of Scope (per Rubric)

- OAuth Device Flow security (covered elsewhere in the Electron research fanout).
- Recommendation on whether to use `@napi-rs/keyring` vs other libraries (factual only).
- 1P Open Knowledge configuration (this is 3P research).
- macOS MAS-sandboxed apps (NG2 excludes MAS distribution).

---

## References

### Evidence Files
- [evidence/d1-keyring-electron-compat.md](evidence/d1-keyring-electron-compat.md) — @napi-rs/keyring loading path, asarUnpack requirements, Electron ≥ 34 gate
- [evidence/d1a-native-napi-in-utilityprocess.md](evidence/d1a-native-napi-in-utilityprocess.md) — N-API modules in utilityProcess baseline
- [evidence/d2-macos-keychain-ux.md](evidence/d2-macos-keychain-ux.md) — macOS first-access prompt, attribution, anti-patterns
- [evidence/d3-bundle-id-stability-cert-rotation.md](evidence/d3-bundle-id-stability-cert-rotation.md) — Designated Requirement, ACL persistence, annual Developer ID renewal
- [evidence/d4-windows-credential-manager-ux.md](evidence/d4-windows-credential-manager-ux.md) — DPAPI, zero-prompt behavior, cert rotation impact
- [evidence/d5-linux-libsecret-fallback.md](evidence/d5-linux-libsecret-fallback.md) — SecretService → keyutils → fail-loud chain, Flatpak/Snap edge cases
- [evidence/d6-alternative-architectures.md](evidence/d6-alternative-architectures.md) — safeStorage, main-process-relay, VS Code's keytar migration

### External Sources
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage)
- [@napi-rs/keyring GitHub](https://github.com/Brooooooklyn/keyring-node)
- [keyring-rs (Rust crate)](https://github.com/hwchen/keyring-rs)
- [electron/electron#41396 — utilityProcess asar crash](https://github.com/electron/electron/issues/41396)
- [electron/electron PR #46380 — fix for #41396](https://github.com/electron/electron/pull/46380)
- [steipete/CodexBar#340 — delete+recreate ACL wipe anti-pattern](https://github.com/steipete/CodexBar/issues/340)
- [Apple Developer Forums thread 78012 — keychain entitlement for direct-DMG](https://developer.apple.com/forums/thread/78012)
- [Apple Developer Forums thread 649081 — avoiding double keychain prompts](https://developer.apple.com/forums/thread/649081)
- [atom/node-keytar#135 — persistent prompts in Electron keytar](https://github.com/atom/node-keytar/issues/135)
- [electron/electron#47341 — provision profile + keychain prompt every launch](https://github.com/electron/electron/issues/47341)
- [electron/electron#43233 — safeStorage Electron-upgrade data-loss](https://github.com/electron/electron/issues/43233)
- [electron/forge#3934 — plugin-auto-unpack-natives edge case](https://github.com/electron/forge/issues/3934)
- [freek.dev — Ray keytar → safeStorage migration](https://freek.dev/ray-migration-notes)

### Related Research
- [reports/electron-desktop-app-operations-2025/REPORT.md](../../../../electron-desktop-app-operations-2025/REPORT.md) — Code signing economics, auto-update, hardened runtime
- [reports/electron-ai-coding-agent-development/fanout/2026-04-15-oq-narrowers/oq-m-azure-trusted-signing-eligibility/](../../2026-04-15-oq-narrowers/oq-m-azure-trusted-signing-eligibility/) — Windows code-signing procurement
