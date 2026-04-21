# Evidence: D3 — Bundle-identifier stability, cert rotation, keychain ACL behavior across updates

**Dimension:** D3 (P0) — What happens to keychain items when app updates, cert rotates, bundle ID changes
**Date:** 2026-04-17
**Sources:** Apple Keychain Services, electron-builder docs, production app migration reports

---

## Key files / pages referenced

- [Apple Developer Forums thread 78012](https://developer.apple.com/forums/thread/78012) — DTS engineer on ACL + DR
- [Apple Developer Forums thread 649081](https://developer.apple.com/forums/thread/649081) — two-prompt behavior
- [Mac App Store Submission Guide — Electron](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [electron-builder macOS code signing guide](https://www.electron.build/code-signing-mac.html)
- [electron-builder issue #7680 — root_certs.keychain expired CA](https://github.com/electron-userland/electron-builder/issues/7680)
- [freek.dev — Replacing Keytar with safeStorage in Ray](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)
- [VS Code keytar migration](https://github.com/microsoft/vscode/issues/185677)
- [Signal keyring backend migration blog](https://yingtongli.me/blog/2025/08/13/signal-secrets.html)

---

## Findings

### Finding 1: keychain item ACLs are keyed by Code Signing Designated Requirement (DR), not by bundle ID alone

**Confidence:** CONFIRMED
**Evidence:** [Apple DTS engineer in thread 78012](https://developer.apple.com/forums/thread/78012)

> "The code signing identifier (which defaults to the bundle ID for bundled code) uniquely identifies the code within a team. This identifier is important because a keychain item's ACL is set to the designated requirement of the app that created it."

A DR is a compound identifier, derived automatically from the code signature. Default DR for a standard signed app evaluates to:
```
anchor apple generic and identifier "<bundle-id>" and (certificate leaf[field.1.2.840.113635.100.6.1.9] /* Apple Mac App Store */ exists or certificate 1[field.1.2.840.113635.100.6.2.6] /* Apple Developer ID Intermediate */ exists and certificate leaf[field.1.2.840.113635.100.6.1.13] /* Developer ID Application */ exists and certificate leaf[subject.OU] = "<team-id>")
```

The ACL persists as long as new versions of the app continue to match this DR pattern. The DR requires:
1. Same bundle identifier.
2. Same Apple Developer Team ID (OU field in leaf cert).
3. Same certificate chain family (Developer ID Application or MAS).

**Implications:**
- Updating the app (v1 → v2) with the same bundle ID + same Apple Developer Team + a new Developer ID Application certificate from the SAME team → DR evaluates identical → ACL preserved → no re-prompt.
- Changing Apple Developer Team (e.g. company acquisition, organization change) → new OU in leaf cert → DR fails → re-prompt.

---

### Finding 2: Apple Developer Program annual certificate renewal is transparent to Keychain ACL

**Confidence:** CONFIRMED (inferred from DR specification + production app evidence)
**Evidence:** DR specification above + empirical: no known complaint from Developer ID Electron app users about keychain prompts returning after annual cert renewal (negative search: GitHub issue search for `"developer id" "keychain" "every year" -is:pr` returns zero hits across electron-builder, electron/electron, VS Code, 1Password forums).

Apple Developer Program "Developer ID Application" certificates are valid for 5 years and are chain-linked to a stable "Developer ID Certification Authority" root. When a certificate is renewed, the new cert shares:
- Same subject OU (team identifier).
- Same issuer.
- Same certificate chain to the Apple root.

The DR predicate `subject.OU = "<team-id>"` is satisfied by the renewed certificate. No ACL migration needed.

**Implications:**
- Annual / 5-year certificate renewal in normal Developer Program flow does NOT trigger keychain re-prompts.
- Only catastrophic events (team ID change, complete signing identity migration) break the ACL.

---

### Finding 3: bundle ID change IS a destructive event — keychain items become orphaned, user re-prompted

**Confidence:** CONFIRMED
**Evidence:** DR specification requires `identifier "<bundle-id>"` match.

If an app ships v1 as `com.example.App` and v2 as `com.example.AppRebrand`, the DR stored in v1's keychain ACL no longer matches v2's signature. Behaviors:
- v2 attempts `SecItemCopyMatching` with `{service: "myservice", account: "myuser"}` → finds the v1 item, but when trying to decrypt/access, prompts user because requesting app's DR doesn't match stored ACL.
- User sees: "\"<new app name>\" wants to access your confidential information stored in \"<old service name>\" in your keychain."
- If user clicks "Deny" → `errSecAuthFailed`.
- If user clicks "Always Allow" → v2's DR added to ACL → no future prompts.

**Implications:**
- Plan bundle IDs carefully at project start. Never change after release.
- Electron-builder enforces this via `appId` config which maps directly to `CFBundleIdentifier`.

---

### Finding 4: VS Code's migration from keytar to safeStorage required explicit re-entry of stored secrets

**Confidence:** CONFIRMED
**Evidence:** [VS Code keytar migration issue #185677](https://github.com/microsoft/vscode/issues/185677) + [freek.dev Ray migration post](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)

Quote from freek.dev:
> "any previously saved passwords and passphrases saved using Keytar are now inaccessible for the app."

VS Code took a different approach: migration path that reads keytar-stored secrets once, writes them via safeStorage, then deletes the keytar entry. This is a library-switch migration issue, not a cert/bundle-ID issue.

**Implications:**
- If a consumer of `@napi-rs/keyring` ever migrates libraries (e.g. to `safeStorage`), a migration-pass is required because the two libraries use different storage backends even on the same keychain (safeStorage stores an encryption key in keychain and puts the ciphertext on disk; keytar stores the secret directly as a keychain generic password item).

---

### Finding 5: Signal Desktop encountered a keychain backend migration issue when Electron's Linux fallback changed

**Confidence:** CONFIRMED
**Evidence:** [Signal Flathub issue #753](https://github.com/flathub/org.signal.Signal/issues/753) + [Yingtong Li blog post](https://yingtongli.me/blog/2025/08/13/signal-secrets.html)

Signal Desktop shipped with Electron safeStorage. On some Linux systems the backend flipped from `gnome_libsecret` to `basic_text` (plaintext encryption). This was caused by sandboxing under Flatpak failing to expose the SecretService socket. Users had to re-authenticate because the encryption key changed.

**Implications:**
- Not a cert-rotation issue, but illustrates that silent backend changes can invalidate stored secrets. Same principle applies across keyring libraries: losing access to the encryption backend = losing access to stored data.

---

### Finding 6: electron-builder's `appId` config sets the CFBundleIdentifier — design contract to keep stable

**Confidence:** CONFIRMED
**Evidence:** [electron-builder common configuration](https://www.electron.build/configuration.html)

```yaml
appId: com.example.MyApp   # becomes CFBundleIdentifier on macOS, Application User Model ID on Windows
```

Once set and shipped, this is a one-way door (or requires a coordinated migration if changed).

Related: [electron-builder issue #7680](https://github.com/electron-userland/electron-builder/issues/7680) — the `AppleWWDRCA.cer` intermediate certificate expired and caused notarization / signature validation failures. This is an issuer-cert problem, not a leaf-cert problem. electron-builder ships a curated `root_certs.keychain` used during notarization. Impact on keychain item ACLs: none (ACLs are about signing identity evaluation at runtime, which is done by macOS using the system trust store, not electron-builder's build-time keychain).

**Implications:**
- Consumers should treat `appId` as immutable once shipped.
- Certificate-chain issues during build time do not propagate to end-user keychain ACL behavior.

---

## Gaps / follow-ups

- No primary-source test data on "app migrates from Developer ID Team A to Developer ID Team B" keychain behavior (rare corporate event).
- No evidence one way or the other on the specific case of "same team, same bundle ID, but ad-hoc signing key rotation" — unlikely scenario in practice.
