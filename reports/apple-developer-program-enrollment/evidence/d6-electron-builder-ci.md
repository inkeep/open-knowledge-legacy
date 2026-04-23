# Evidence: D6 — electron-builder + notarytool CI Integration

**Dimension:** electron-builder + notarytool CI integration
**Date:** 2026-04-17
**Sources:** electron-builder docs, @electron/notarize README, GitHub Actions ecosystem

---

## Key URLs referenced

- `https://www.electron.build/code-signing` — electron-builder code signing docs
- `https://www.electron.build/app-builder-lib.Interface.MacConfiguration.html` — Mac config reference
- `https://github.com/electron/notarize/blob/main/README.md` — @electron/notarize docs
- `https://github.com/Apple-Actions/import-codesign-certs` — GitHub Action for importing certs
- `https://docs.github.com/en/actions/use-cases-and-examples/deploying/installing-an-apple-certificate-on-macos-runners-for-xcode-development` — GitHub's guide

---

## Findings

### Finding: electron-builder v24.13+ notarizes via @electron/notarize by default when credentials are present

**Confidence:** CONFIRMED
**Evidence:** `https://www.electron.build/app-builder-lib.Interface.MacConfiguration.html` + `https://github.com/electron/notarize`

- `mac.notarize` is a **boolean** in electron-builder's current schema (not the object-with-teamId some older guides describe).
- Default: `true` (electron-builder auto-notarizes if credentials are detected)
- To disable: `mac.notarize: false`
- Activation requires one of these env var sets:
  - `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` + `APPLE_TEAM_ID` (API key path)
  - `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (app-specific password path)

**Schema excerpt from electron-builder MacConfiguration:**

```yaml
mac:
  notarize: true              # boolean; default true
  identity: null              # use CSC_LINK/CSC_NAME env instead
  hardenedRuntime: true       # default true — required for notary
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
  gatekeeperAssess: false
  target:
    - target: dmg
      arch: [arm64, x64]
```

**Implications:** No explicit `notarize: { teamId: ... }` object syntax is needed in modern electron-builder — env vars do the work. The team ID is read from `APPLE_TEAM_ID` (not a config field).

---

### Finding: CSC_LINK + CSC_KEY_PASSWORD carry the .p12 identity to CI

**Confidence:** CONFIRMED
**Evidence:** `https://www.electron.build/code-signing`

| Env var | Purpose |
|---|---|
| `CSC_LINK` | Path to .p12, `file://` URI, HTTPS URL, OR base64-encoded content of the .p12 |
| `CSC_KEY_PASSWORD` | Password to decrypt the .p12 |
| `CSC_NAME` | (macOS only) Identity name to look up in login.keychain instead of CSC_LINK |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Default `true`; set `false` to force explicit identity |
| `CSC_INSTALLER_LINK` / `CSC_INSTALLER_KEY_PASSWORD` | For .pkg signing (NOT needed for DMG) |

**Base64 encoding for CI:**
```bash
# macOS (output safe for GitHub secret)
base64 -i certificate.p12 -o cert.b64
```

Set `CSC_LINK` to the base64 content (not a file path) in GitHub secrets.

---

### Finding: Canonical GitHub Actions workflow pattern

**Confidence:** CONFIRMED
**Evidence:** Synthesis of electron-builder docs + GitHub Actions patterns + Federico Terzi's canonical blog post

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build

      - name: Build + sign + notarize
        env:
          # Signing
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          # Notarization (API key approach — recommended)
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY_P8_BASE64 }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # If using app-specific password instead:
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
        run: npm run release  # typically calls electron-builder --mac
```

**GitHub Secrets to configure:**

| Secret | Source |
|---|---|
| `MAC_CERT_P12_BASE64` | `base64 -i ci-ready.p12` (repackaged for OpenSSL 3) |
| `MAC_CERT_PASSWORD` | The .p12 export password |
| `APPLE_API_KEY_P8_BASE64` | `base64 -i AuthKey_ABCD123456.p8` |
| `APPLE_API_KEY_ID` | 10-char Key ID from App Store Connect |
| `APPLE_API_ISSUER` | UUID from App Store Connect |
| `APPLE_TEAM_ID` | 10-char Team ID from developer.apple.com/account |

---

### Finding: Common failure mode — notarize:true with API key env vars silently no-ops in some versions

**Confidence:** CONFIRMED
**Evidence:** `https://github.com/electron-userland/electron-builder/issues/8040`

In some electron-builder versions around 24.0-24.12, `notarize: true` + `APPLE_API_KEY` triggered no notarization AND no error (silent skip). Fixed in later 24.13+ versions. **Always pin electron-builder to a known-good version and verify notary output in CI logs.**

Verification: Successful notarization logs should show a line like `notarize  Finished 'notarize' (18.5s)` and a subsequent `stapler staple` success.

---

### Finding: Alternative — afterSign hook with custom @electron/notarize script

**Confidence:** CONFIRMED
**Evidence:** `https://www.bigbinary.com/blog/code-sign-notorize-mac-desktop-app` and many community workflows

Some teams prefer bypassing electron-builder's built-in notarization with an afterSign hook:

```js
// scripts/notarize.js
const { notarize } = require('@electron/notarize');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  await notarize({
    appPath,
    appleApiKey: process.env.APPLE_API_KEY,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  });
};
```

```yaml
# electron-builder.yml
mac:
  notarize: false
afterSign: scripts/notarize.js
```

**When to use:** Need custom logic (e.g., conditional notarization for dev builds), or troubleshooting electron-builder's built-in integration.

---

### Finding: Common notarization failures and their causes

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/documentation/security/resolving-common-notarization-issues`

| Error | Root cause | Fix |
|---|---|---|
| "The executable does not have the hardened runtime enabled" | Signing without `--options runtime` or `mac.hardenedRuntime: false` | Set `hardenedRuntime: true` (default in electron-builder) |
| "The signature of the binary is invalid" | Missing entitlements or re-signed after bundling | Sign all binaries + use `afterSign` order |
| "The binary uses an SDK older than the 10.9 SDK" | Shipping ancient deps | Update Electron version (rare in 2024+) |
| "Team ID mismatch" | `APPLE_TEAM_ID` doesn't match cert's OU field | Verify Team ID at developer.apple.com/account |
| "Authentication failed" (401) | Wrong API key, wrong Apple ID password (should be app-specific), wrong issuer ID | Regenerate credentials; confirm 2FA is on |
| Silent skip with no output | electron-builder 24.0-24.12 + API key bug | Upgrade to 24.13+ |
| "Expired certificate" | Developer ID cert expired (5-year lifetime) | Re-create cert; re-sign; re-notarize |

---

## Gaps / follow-ups

- Exact electron-builder version that fixed the silent-skip bug (#8040) is stated as "24.13+" in the thread but not pinned to a specific patch release.
- Windows + Linux signing in the same workflow introduces complexity not covered here (out of scope).
