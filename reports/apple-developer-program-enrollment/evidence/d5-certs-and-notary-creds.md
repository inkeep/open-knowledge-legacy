# Evidence: D5 — Post-Enrollment Certificate Creation + Notary Service Credentials

**Dimension:** Post-enrollment cert + notary credential setup
**Date:** 2026-04-17
**Sources:** Apple developer-id page, certificate help docs, notarytool documentation, @electron/notarize README

---

## Key URLs referenced

- `https://developer.apple.com/developer-id/` — Signing Mac software with Developer ID overview
- `https://developer.apple.com/help/account/certificates/create-developer-id-certificates/` — Step-by-step for Developer ID certs
- `https://developer.apple.com/support/certificates/` — All certificate types
- `https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution` — Notarization docs
- `https://appstoreconnect.apple.com/access/api` — App Store Connect API keys page
- `https://appleid.apple.com` — App-specific password creation

---

## Findings

### Finding: For direct-DMG macOS distribution, only "Developer ID Application" certificate is needed

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/certificates/create-developer-id-certificates/`

| Certificate type | Purpose | Needed for direct-DMG? |
|---|---|---|
| **Developer ID Application** | Sign a Mac app (.app bundle) | **Yes — required** |
| **Developer ID Installer** | Sign a Mac Installer Package (.pkg) | No (DMG is not a .pkg) |
| Apple Development | Dev/test signing (not distribution) | No |
| Apple Distribution | App Store distribution | No |
| Mac App Distribution | App Store only | No |
| Mac Installer Distribution | Mac App Store installer | No |

**Implications:** One certificate type. Name correctly when creating: choose Software > Developer ID > Developer ID Application (NOT Developer ID Installer, which signs .pkg installers — unused when shipping DMGs).

---

### Finding: Developer ID certificate creation requires the Account Holder role

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/certificates/create-developer-id-certificates/`

> "Required role: Account Holder only"

Admins can create most other cert types but NOT Developer ID. This is a common surprise for teams where the Account Holder isn't an engineer.

**Implications:** Either (a) the Account Holder creates the cert and exports the .p12 for engineers, or (b) the Account Holder role is transferred to an engineer. Option (a) is standard practice.

---

### Finding: Apple allows up to 5 Developer ID Application + 5 Developer ID Installer certs per account

**Confidence:** CONFIRMED
**Evidence:** Same help page

> "Up to 5 Developer ID Application certificates per account; Up to 5 Developer ID Installer certificates per account."

**Implications:** Rotate certs as they approach 5-year expiry. Never revoke a valid cert unless compromised — a revoke invalidates every app signed with it for users who haven't already installed (the notarization ticket separately protects already-distributed versions, but new installs fail signature validation).

---

### Finding: Cert creation steps are CSR → upload → download .cer → install in Keychain → export .p12

**Confidence:** CONFIRMED
**Evidence:** Apple help docs + `https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request`

1. On the target Mac, open **Keychain Access** > Certificate Assistant > Request a Certificate from a Certificate Authority.
2. Enter email, common name. Select "Saved to disk" and "Let me specify key pair information."
3. Save the `.certSigningRequest` file.
4. Go to `https://developer.apple.com/account/resources/certificates/list`, sign in as Account Holder.
5. Click **+**, select Software > Developer ID > Developer ID Application. Upload the CSR.
6. Download the `.cer` file. Double-click to install in Keychain Access on the same Mac (must be same Mac that generated the CSR, because private key lives there).
7. To export for CI: in Keychain Access, find the cert (Login or System keychain). Select both the cert and its private key (Option-click). Right-click > "Export 2 items..." > Personal Information Exchange (.p12). Set a strong password.

**Critical CI gotcha (2024+):** macOS 13+ exports .p12 with RC2 encryption which OpenSSL 3.x rejects. Repackage for GitHub Actions:

```bash
# Extract then re-encrypt with modern cipher
openssl pkcs12 -in exported.p12 -nodes -legacy -out certs.pem
openssl pkcs12 -export -in certs.pem -out ci-ready.p12
```

**Implications:** Don't ship the raw Keychain-exported .p12 to CI; repackage for OpenSSL 3 compatibility.

---

### Finding: Two supported notary authentication methods — App-Specific Password and App Store Connect API Key

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution` and `https://github.com/electron/notarize/blob/main/README.md`

**Method A: App-Specific Password** (simpler, less preferred for CI)
- Create at `https://appleid.apple.com` > Sign-In and Security > App-Specific Passwords > Generate
- Required env vars:
  - `APPLE_ID` (the Account Holder's Apple ID email)
  - `APPLE_APP_SPECIFIC_PASSWORD` (the 19-character password with hyphens)
  - `APPLE_TEAM_ID` (10-char alphanumeric)

**Method B: App Store Connect API Key** (recommended, less revocation exposure, survives Apple ID password changes)
- Create at `https://appstoreconnect.apple.com/access/api` (requires Admin or Account Holder role)
- Role: **Developer** role on the key is sufficient for notarization; some teams use **Admin**
- Download the `.p8` private key (only downloadable once — save it immediately)
- Note the Key ID (10 chars) and Issuer ID (UUID)
- Required env vars:
  - `APPLE_API_KEY` (path or content of `.p8` file)
  - `APPLE_API_KEY_ID` (10-char Key ID)
  - `APPLE_API_ISSUER` (UUID; can be omitted with Xcode 26+ for individual keys)
  - `APPLE_TEAM_ID`

**Implications:** Prefer API Key for CI. App-specific passwords are tied to the Account Holder's Apple ID and revoke if that Apple ID changes password. API keys are team-scoped and survive Apple ID changes.

---

### Finding: notarytool replaces altool (deprecated Nov 2023)

**Confidence:** CONFIRMED
**Evidence:** Apple documentation + `https://scriptingosx.com/2021/07/notarize-a-command-line-tool-with-notarytool/` + `@electron/notarize` README

`xcrun altool --notarize-app` was deprecated by Apple in November 2023. All modern tooling uses `xcrun notarytool`:

```bash
# Submit
xcrun notarytool submit MyApp.dmg \
  --apple-id "developer@company.com" \
  --team-id "ABCDE12345" \
  --password "abcd-efgh-ijkl-mnop" \
  --wait

# OR with API key
xcrun notarytool submit MyApp.dmg \
  --key "AuthKey_ABCD123456.p8" \
  --key-id "ABCD123456" \
  --issuer "00000000-0000-0000-0000-000000000000" \
  --wait

# Staple the notary ticket
xcrun stapler staple MyApp.dmg
```

**Implications:** Any CI tooling still using altool is broken. electron-builder v24.13+ already uses notarytool via @electron/notarize.

---

### Finding: Hardened runtime is mandatory for notarization

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/documentation/security/resolving-common-notarization-issues`

The app must be signed with `codesign --options runtime`. This enables hardened runtime protections (no JIT, no unsigned executable memory, etc. — relaxed via specific entitlements).

For Electron: electron-builder sets hardened runtime by default (`mac.hardenedRuntime: true`). Add entitlements in `build/entitlements.mac.plist` for exceptions your app needs:

```xml
<!-- Common Electron entitlements -->
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
```

**Implications:** Disable hardened runtime → notarization fails with "The executable does not have the hardened runtime enabled."

---

### Finding: Notarization requires stapling for offline Gatekeeper validation

**Confidence:** CONFIRMED
**Evidence:** Apple notarization docs

Notarization produces a "ticket" Apple stores server-side. Stapling (`xcrun stapler staple`) embeds a copy of the ticket into the DMG/.app so Gatekeeper can validate offline. Without stapling, first-launch on a machine with no internet fails.

**Implications:** Always staple after notarization. electron-builder does this automatically when @electron/notarize integration is enabled.

---

## Gaps / follow-ups

- Apple's exact API key role requirements for notarization are inconsistently documented (Developer role vs Admin role — community reports both work).
- The minimum entitlements set for typical Electron apps is app-specific and evolves with Electron versions.
