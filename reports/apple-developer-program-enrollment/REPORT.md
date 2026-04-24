---
title: "Apple Developer Program Enrollment Runbook for Direct-DMG macOS Distribution (2026)"
description: "Definitive procedural reference for verifying existing Apple Developer Program enrollment and enrolling if not present. Disambiguates Apple Business Manager, Apple at Work, Developer Program, and Developer Enterprise Program. Covers D-U-N-S carryover, Organization enrollment, Developer ID Application cert creation, Apple Notary Service credentials, and electron-builder CI integration."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Apple Developer Program
  - Apple Business Manager
  - D-U-N-S
  - Developer ID Application cert
  - Apple Notary Service
  - electron-builder
  - notarytool
topics:
  - macOS code signing procurement
  - Apple Developer Program enrollment
  - business Apple ID disambiguation
  - Developer ID cert creation
  - Apple Notary Service credentials
  - electron-builder mac notarize
  - CI secrets for macOS signing
---

# Apple Developer Program Enrollment Runbook for Direct-DMG macOS Distribution (2026)

**Purpose:** A runbook any engineering ops team can follow to (a) determine whether their company is already enrolled in the Apple Developer Program, (b) enroll if not, and (c) wire CI for signed+notarized direct-DMG macOS distribution. Designed for teams shipping an Electron desktop app as a downloadable DMG (NOT via the Mac App Store).

---

## Executive Summary

Shipping a direct-download DMG for macOS requires exactly one Apple program membership: the **Apple Developer Program** at $99 USD/yr. This program — and only this program — issues the **Developer ID Application** certificate that signs the `.app` bundle, and it gates access to the **Apple Notary Service** credentials required for Gatekeeper to trust the DMG on customer machines.

It is **not** the same as:
- **Apple Business Manager (ABM)** — free MDM/device-deployment platform; does not issue signing certs.
- **Apple at Work / Apple Business** — B2B hardware purchasing; not a developer program.
- **Apple Developer Enterprise Program** — $299/yr, in-house distribution to employees only; explicitly disallowed for external-customer apps and rejected by Apple for most new applicants per community reports.

**To verify existing enrollment (fastest path):** A candidate Account Holder signs in at [developer.apple.com/account](https://developer.apple.com/account/). A membership card with organization name, 10-character Team ID, and expiration date is the ground-truth indicator. Access to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) and Certificates, Identifiers & Profiles is gated by active membership. If no one internally is the Account Holder, finance's recurring-charges log (APPLE.COM/BILL $99/yr) and any prior-issued Developer ID certs on engineer Macs (Keychain Access shows Team ID in the OU field) are secondary verifiers.

**To enroll (no existing membership):** The canonical flow at [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) requires an Apple ID with 2FA, a D-U-N-S Number (free via Apple's lookup; 5-7 business days if new), legal-entity attestation, and payment. Approval timing ranges from same-day (D-U-N-S pre-validated, no verification call needed) to ~4 weeks (new D-U-N-S + manual Apple verification). The single most common snag is a D-U-N-S legal-entity mismatch — resolve by confirming the D&B record matches the registered legal entity before starting.

**Post-enrollment setup:** The Account Holder creates a Developer ID Application certificate (no Admin can do this), exports to `.p12` with a repackage step for OpenSSL 3 compatibility, and generates an App Store Connect API key (`.p8`) for notary authentication. Wire into electron-builder via `CSC_LINK` + `CSC_KEY_PASSWORD` + `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` + `APPLE_TEAM_ID` environment variables. electron-builder v24.13+ auto-detects these and runs `@electron/notarize` → `xcrun notarytool` → `xcrun stapler staple` in sequence.

**Key Findings:**

- **One program, one membership:** Apple Developer Program ($99/yr) covers macOS Developer ID + App Store signing + iOS/iPadOS/tvOS/watchOS/visionOS. No platform-specific or DMG-specific tier exists.
- **ABM is orthogonal:** Having Apple Business Manager does not enroll you in Developer Program, but it may pre-validate your D-U-N-S, shortening the timeline.
- **Developer ID Application is the only cert needed** for direct-DMG. Developer ID Installer is for `.pkg` files and is unused when shipping DMGs.
- **notarytool replaced altool** in Nov 2023. @electron/notarize (wrapped by electron-builder v24.13+) uses notarytool under the hood.
- **API key auth > app-specific password** for CI — survives Apple ID password changes, scoped to team not person.

---

## Research Rubric

**Report Type:** Integration Research (procedural runbook)
**Primary Question:** What are the exact steps (with verification checkpoints) for a business to enroll in the Apple Developer Program for direct-DMG macOS distribution, and how does a team verify if they are already enrolled vs confused with adjacent Apple programs?
**Stance:** Factual/Academic with embedded procedural runbook
**Audience:** Engineering ops / release engineering teams

### Dimensions investigated

| # | Dimension | Depth | Priority | Evidence |
|---|-----------|-------|----------|----------|
| D1 | How to verify existing Apple Developer Program enrollment | Deep | P0 | [d1](evidence/d1-verify-existing-enrollment.md) |
| D2 | Distinguishing Apple program memberships | Deep | P0 | [d2](evidence/d2-program-disambiguation.md) |
| D3 | D-U-N-S: what it is, how to look up, timing | Deep | P0 | [d3](evidence/d3-duns-number.md) |
| D4 | Apple Developer Program Organization enrollment step-by-step | Deep | P0 | [d4](evidence/d4-enrollment-runbook.md) |
| D5 | Post-enrollment cert + notary credential setup | Deep | P0 | [d5](evidence/d5-certs-and-notary-creds.md) |
| D6 | electron-builder + notarytool CI integration | Deep | P0 | [d6](evidence/d6-electron-builder-ci.md) |
| D7 | Business Apple ID vs Developer Program Apple ID | Moderate | P1 | [d7](evidence/d7-business-id-vs-developer-id.md) |

### Non-goals

- iOS / iPadOS / tvOS / watchOS enrollment specifics (one Dev Program covers all).
- Mac App Store submission workflow (product constraint — direct-DMG only).
- Third-party cert providers (Apple is sole issuer for macOS).
- Individual Apple ID Developer enrollment (target is Organization).

---

## Apple Program Disambiguation Table

The five programs most often confused when a team first engages with Apple for business purposes:

| Program | URL | Cost | Purpose | D-U-N-S? | Apple ID type | Issues Developer ID? |
|---------|-----|------|---------|----------|---------------|---------------------|
| **Apple Developer Account (free)** | [developer.apple.com/account](https://developer.apple.com/account) | Free | Beta SW, forums, test on 1 device | No | Any Apple ID | No |
| **Apple Developer Program** | [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) | **$99/yr** | App Store + Developer ID + TestFlight + all platforms | Yes (Org) | Consumer Apple ID w/ 2FA | **Yes — this is the one you need** |
| **Apple Developer Enterprise Program** | [developer.apple.com/programs/enterprise](https://developer.apple.com/programs/enterprise/) | $299/yr | In-house-only distribution to own employees | Yes | Separate Apple ID from Developer Program | Yes (but revocable; external use is TOS violation) |
| **Apple Business Manager (ABM) / "Apple Business"** | [business.apple.com](https://business.apple.com/) | Free | MDM / automated device enrollment / Managed Apple IDs | Yes | Managed Apple IDs | No |
| **Apple at Work / Apple Business (purchasing)** | [apple.com/shop/business](https://www.apple.com/shop/business) | Free (purchasing) | B2B procurement of hardware/software | Yes (volume) | Business Apple ID | No |

**Key rule for this use case:** For a company shipping an Electron desktop app to external customers via direct DMG, the **Apple Developer Program ($99/yr)** is mandatory and sufficient. Enterprise Program is explicitly disallowed (Apple's terms prohibit external distribution under Enterprise certs). ABM and Apple at Work are unrelated to signing; having them does not substitute for Developer Program enrollment.

**D-U-N-S carryover:** The same Dun & Bradstreet identifier backs all three D-U-N-S-requiring programs. A D-U-N-S already validated for ABM typically validates faster during subsequent Developer Program enrollment (inferred; Apple does not publicly commit to this guarantee — see evidence/d2).

---

## Self-Verification Checklist

Run this before assuming you need to enroll. Any "yes" at step 1-4 means you likely already have a Developer Program membership somewhere in the organization.

### Step 1 — Ask leadership

- [ ] Has anyone at the company ever shipped an iOS/iPadOS app under the company's name (not a contractor's)? If yes, the Developer Program account exists.
- [ ] Does finance see a recurring ~$99/yr charge descriptor `APPLE.COM/BILL` or `APPLE DEVELOPER PROGRAM` on any corporate card?
- [ ] Does anyone remember creating an `appleid.apple.com` account on behalf of the company (e.g., `developer@`, `apple@`, `ios@`, `admin@company.com`)?

### Step 2 — Inspect engineer Macs

- [ ] On any engineer's Mac, open **Keychain Access** > search "Developer ID." If a cert exists with your company's legal name in the subject, inspect "Get Info" > "Organizational Unit (OU)" — that 10-character alphanumeric value is the Team ID.
- [ ] If a Team ID surfaces, you have a membership. Record the Team ID — you'll need it for CI later.

### Step 3 — Check the App Store

- [ ] Search [apps.apple.com](https://apps.apple.com) for your company's name. Company-owned apps will show the legal entity name as seller. If found, the Developer Program account exists under that Apple ID.

### Step 4 — Sign in to developer.apple.com

Have a candidate Account Holder (or anyone who might hold the seat) sign in at [developer.apple.com/account](https://developer.apple.com/account/):

- [ ] Landing page shows a **Membership card** with legal entity name, Team ID, program name, and expiration date. → **Enrolled. Document the Team ID and proceed to Post-Enrollment Setup.**
- [ ] Landing page shows "Enroll Today" button or "Start Your Enrollment" prompt, with no membership card. → **Not enrolled under this Apple ID; try other candidates.**
- [ ] [appstoreconnect.apple.com](https://appstoreconnect.apple.com/) loads the team dashboard (not just a blank "no access" state). → **Enrolled.**

### Step 5 — Check Apple Business Manager (separate signal — not sufficient)

- [ ] Sign in to [business.apple.com](https://business.apple.com/). If access exists, the company has ABM — NOT the Developer Program. But the D-U-N-S is already validated, which shortens Developer Program enrollment.

### Step 6 — Escalate if ambiguous

- [ ] If finance sees charges but no one knows the Account Holder, the role is held by a former employee or an archived email. Contact [Apple Developer Support](https://developer.apple.com/contact/) with legal-authority documentation to transfer the Account Holder role (typically 1-2 weeks).

**Outcome of this checklist:** A confirmed Team ID OR a decision to proceed to enrollment.

---

## Enrollment Runbook

Follow this if the self-verification checklist concluded the company is not enrolled.

### Phase 1 — Prerequisites (do these before clicking Enroll)

**1.1 Legal entity confirmation** — Confirm the company's registered legal entity name (as filed with the state/country). Not a DBA, trade name, or fictitious business name. Apple rejects these.

**1.2 D-U-N-S Number**
- Visit [enroll.apple.com/enroll/duns-lookup](https://enroll.apple.com/enroll/duns-lookup/).
- Enter legal entity name, HQ address, mailing address, work contact.
- **If found and Apple-validated:** Record the 9-digit D-U-N-S. Proceed to 1.3.
- **If not found:** Click "Request a D-U-N-S Number" — free, submits to D&B. Expect up to 5 business days D&B processing + 2 business days Apple propagation = **up to 7 business days total**. Expediting does NOT shorten this window.
- **Common error** — "Your organization is not listed as a legal entity": Your D&B record shows sole proprietorship or unverified status. Contact [D&B Apple support](https://support.dnb.com/?CUST=APPLEDEV) with incorporation documents; allow 2 business days for update propagation to Apple.

**1.3 Account Holder Apple ID**
- Create a dedicated Apple ID for the Account Holder role if one does not exist. Recommended: `developer@company.com` or similar role-based email.
- Enable 2FA (required — enrollment rejects non-2FA Apple IDs). 2FA should be on a device owned by engineering leadership (not a departing employee's personal phone).
- Ensure the Apple ID's first and last name fields are the Account Holder's **legal name** (change via [appleid.apple.com](https://appleid.apple.com) if an alias is set).

**1.4 Binding authority** — Confirm the Account Holder has legal authority to bind the organization to Apple agreements. Acceptable roles: owner, founder, executive, senior project lead, or employee with written authority from an executive. If the Account Holder is NOT the owner/founder, Apple may request a secondary contact at executive level to corroborate.

**1.5 Contact information** — Work email on the org's domain (not Gmail/personal). Phone number answered during business hours (Apple often calls to verify binding authority). No P.O. boxes.

**1.6 Public website** — Functional, publicly accessible website on the organization's domain. Social media profiles don't count. A parked domain with registrar placeholders doesn't count.

**1.7 Payment method** — Credit card for initial $99 USD (or local-currency equivalent) + auto-renewal (if enrolling via the Apple Developer app on iPhone/iPad).

### Phase 2 — Submit enrollment

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/). Click "Start Your Enrollment."
2. Sign in with the Account Holder Apple ID (from 1.3).
3. Select **"Organization"** (not Individual).
4. Enter organization details. Use the exact legal entity name from 1.1.
5. Enter or look up D-U-N-S from 1.2.
6. Attest to binding authority (1.4).
7. Submit. You receive a confirmation email with an Enrollment ID.

### Phase 3 — Apple verification (the waiting phase)

**Timing — expected scenarios:**

| Scenario | Typical | Confidence |
|---|---|---|
| D-U-N-S pre-validated + immediate phone response + no issues | Same day to 2 days | UNCERTAIN (community) |
| Standard new org enrollment, D-U-N-S in D&B | 3-5 business days | UNCERTAIN (community consensus) |
| New D-U-N-S required | +5-7 business days before Phase 2 | CONFIRMED ([Apple D-U-N-S docs](https://developer.apple.com/help/account/membership/D-U-N-S/)) |
| Legal-authority call-back needed | 1-2 weeks | UNCERTAIN (community) |
| Regional/dispute verification | Up to 1 month | UNCERTAIN (community) |

**During this phase:**
- Apple may call the phone number on the form. Ensure it's answered; voicemail is acceptable but return the call within 3 business days.
- Monitor the Account Holder's email for requests from `developer@apple.com` or similar Apple-domain senders.

**If verification stalls >2 weeks:** Email [Apple Developer Support](https://developer.apple.com/contact/) with your Enrollment ID.

### Phase 4 — Accept agreements + pay

1. Upon Apple's approval, the Account Holder receives an email with a "complete your purchase" link.
2. Sign in; accept the **Apple Developer Program License Agreement (PLA)**.
3. Enter credit card; pay $99 USD (or local equivalent + any regional tax).
4. Membership activates within 24 hours. You receive a confirmation; [developer.apple.com/account](https://developer.apple.com/account/) now shows the membership card with your 10-character Team ID.

### Phase 5 — Team setup

1. Account Holder invites engineers at [App Store Connect > Users and Access](https://appstoreconnect.apple.com/access/users).
2. For each engineer: click **+**, enter their personal Apple ID email, select role:
   - **Admin** — full dev + distribution. Cannot create Developer ID certs (reserved to Account Holder).
   - **App Manager** — manage app submissions.
   - **Developer** — build/test only.
   - **Marketer** / **Finance** — narrower roles.
3. Engineers accept the invitation via email, sign in with their own Apple ID, and the organization appears as a team in their developer.apple.com account.

**Transfer plan (do this now, not later):** Document the process for transferring the Account Holder role from the current holder to a designated successor ([transfer docs](https://developer.apple.com/help/account/access/transfer-the-account-holder-role)). Recovery from a lost Account Holder via Apple Support is 1-2 weeks minimum.

---

## Post-Enrollment Setup (Certs + Notary Credentials)

### 6.1 Discover your Team ID

Sign in to [developer.apple.com/account](https://developer.apple.com/account/). The Team ID appears on the membership card — 10 characters alphanumeric (e.g., `ABCDE12345`). Record it as a GitHub secret under `APPLE_TEAM_ID`.

### 6.2 Create Developer ID Application certificate (Account Holder only)

This is Account Holder–restricted. Delegation note: the Account Holder creates the cert on a Mac, exports `.p12`, and hands the `.p12` + password to the build-engineering team. Engineers cannot create this cert themselves even with Admin role.

**On the Account Holder's Mac:**

1. Open **Keychain Access** → **Certificate Assistant** → **Request a Certificate from a Certificate Authority**.
2. Enter email; common name = "Developer ID Application: <Company Name>"; leave CA blank; select "Saved to disk" and "Let me specify key pair information."
3. Save the `.certSigningRequest` file.
4. Sign in at [developer.apple.com/account/resources/certificates/list](https://developer.apple.com/account/resources/certificates/list). Click **+** → **Software** → **Developer ID** → **Developer ID Application** → Continue. Upload the CSR.
5. Download the `.cer` file. Double-click to install in Keychain Access on the same Mac (the private key must be on this Mac).
6. In Keychain Access, locate the cert (usually in `login` keychain). Option-click to select both the cert AND its private key. Right-click → **Export 2 items…** → Personal Information Exchange (.p12). Choose a strong password; save the password.

**CI-compatibility repackage (critical for OpenSSL 3.x, used by GitHub Actions macos-12+):**

```bash
# Repackage to modern cipher
openssl pkcs12 -in exported.p12 -nodes -legacy -out certs.pem
openssl pkcs12 -export -in certs.pem -out ci-ready.p12
rm certs.pem exported.p12
# Base64 encode for GitHub secret
base64 -i ci-ready.p12 -o cert.b64
```

Store as GitHub secrets: `MAC_CERT_P12_BASE64` = contents of `cert.b64`; `MAC_CERT_PASSWORD` = the export password.

### 6.3 Choose notary authentication: App Store Connect API key (recommended) OR app-specific password

**Method A — App Store Connect API key (recommended for CI):**

1. Go to [appstoreconnect.apple.com/access/api](https://appstoreconnect.apple.com/access/api). This requires Account Holder or Admin role.
2. Under **Team Keys** (not Individual Keys for team use), click **+**. Name: "CI Notarization"; Access: **Developer** (sufficient) or **Admin**.
3. Click **Generate**. Download the `.p8` file. **Only downloadable once** — save immediately.
4. Note the **Key ID** (10 chars, e.g., `ABCD123456`) and **Issuer ID** (UUID at the top of the page).

Store as GitHub secrets: `APPLE_API_KEY_P8_BASE64` = `base64 -i AuthKey_ABCD123456.p8`; `APPLE_API_KEY_ID` = the 10-char Key ID; `APPLE_API_ISSUER` = the UUID Issuer ID.

**Method B — App-specific password (simpler, less preferred):**

1. Go to [appleid.apple.com](https://appleid.apple.com) (sign in as Account Holder).
2. Under **Sign-In and Security** → **App-Specific Passwords** → **Generate Password**. Label it "notarytool-CI."
3. Copy the 19-character password with hyphens (format `abcd-efgh-ijkl-mnop`). You cannot retrieve it later.

Store as GitHub secrets: `APPLE_ID` = the Account Holder's Apple ID email; `APPLE_APP_SPECIFIC_PASSWORD` = the generated password.

**Trade-off:** API keys are team-scoped and survive Apple ID password changes. App-specific passwords tie to the Account Holder's Apple ID and revoke when that Apple ID's password changes.

### 6.4 Verify credentials locally before wiring CI

```bash
# Using API key
xcrun notarytool store-credentials "test-profile" \
  --key AuthKey_ABCD123456.p8 \
  --key-id ABCD123456 \
  --issuer 00000000-0000-0000-0000-000000000000

# OR using app-specific password
xcrun notarytool store-credentials "test-profile" \
  --apple-id developer@company.com \
  --team-id ABCDE12345 \
  --password abcd-efgh-ijkl-mnop
```

If validation succeeds, credentials are correct. Remove the test profile: `xcrun notarytool delete-credentials test-profile`.

---

## CI Integration (electron-builder + GitHub Actions)

### 7.1 electron-builder configuration

```yaml
# electron-builder.yml
appId: com.company.productname
productName: Product Name
mac:
  category: public.app-category.productivity
  notarize: true              # default; electron-builder v24.13+ auto-detects env vars
  hardenedRuntime: true       # required for notarization
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
  gatekeeperAssess: false
  target:
    - target: dmg
      arch: [arm64, x64]
```

`build/entitlements.mac.plist` — a minimal Electron entitlement set:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
```

### 7.2 GitHub Actions workflow

```yaml
name: Release macOS
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

      - name: Build + sign + notarize DMG
        env:
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY_P8_BASE64 }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npx electron-builder --mac --publish never

      - uses: actions/upload-artifact@v4
        with:
          name: dmg
          path: dist/*.dmg
```

### 7.3 Verification in CI logs

Successful notarization produces log lines like:

```
  • signing         file=dist/mac-arm64/Product Name.app identityName=Developer ID Application: Company Name (ABCDE12345)
  • notarize        file=dist/Product Name-1.0.0-arm64.dmg
  • notarize status  status=Accepted
  • stapling        file=dist/Product Name-1.0.0-arm64.dmg
```

### 7.4 Alternative — afterSign hook for custom notarization logic

```yaml
mac:
  notarize: false
afterSign: scripts/notarize.js
```

```js
// scripts/notarize.js
const { notarize } = require('@electron/notarize');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CI !== 'true') return;  // skip local dev builds
  const { productFilename } = context.packager.appInfo;
  await notarize({
    appPath: `${context.appOutDir}/${productFilename}.app`,
    appleApiKey: process.env.APPLE_API_KEY,
    appleApiKeyId: process.env.APPLE_API_KEY_ID,
    appleApiIssuer: process.env.APPLE_API_ISSUER,
  });
};
```

---

## Common Pitfalls

### Enrollment-phase pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| "Your organization is not listed as a legal entity" | D&B has your business as sole proprietor or unverified | Email D&B with incorporation docs; wait 2 business days for Apple propagation |
| Enrollment stuck "in review" >2 weeks | Missed Apple's verification call; binding authority dispute | Check voicemails; email Apple Developer Support with Enrollment ID |
| "2FA required" error on enrollment | Account Holder Apple ID has no 2FA | Enable 2FA at appleid.apple.com; restart enrollment |
| D-U-N-S lookup doesn't find obvious match | Using DBA or trade name instead of legal entity | Use exact registered legal entity name |
| Enrolled but can't access App Store Connect | Invited as Developer role, not Admin | Account Holder changes role in App Store Connect > Users and Access |

### Certificate-phase pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| "Create Developer ID" button greyed out | Logged in as Admin, not Account Holder | Account Holder must create; or transfer Account Holder role |
| Can't export .p12 — option greyed out | Only selected the cert, not the private key | Option-click to select BOTH cert AND private key in Keychain Access |
| `security: error importing certificate` in CI | .p12 uses RC2 cipher; OpenSSL 3 rejects | Repackage: extract with `-legacy`, re-encrypt without `-legacy` |
| Cert expired unexpectedly | Developer ID certs have 5-year lifetime | Create new cert before expiry; re-sign + re-notarize new releases |
| Two Developer ID certs with same name | Created twice | Delete one via developer.apple.com/account/resources/certificates; keep the one with the private key |

### Notarization-phase pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| "The executable does not have the hardened runtime enabled" | `codesign` run without `--options runtime` | Set `mac.hardenedRuntime: true` in electron-builder (default) |
| "The signature of the binary is invalid" | Native module signed incorrectly; re-bundled after sign | Ensure all native deps are signed; don't mutate .app after `afterSign` |
| "Authentication failed" (HTTP 401) | Wrong API key Issuer, wrong Apple ID password, or using login pw instead of app-specific pw | Regenerate API key OR generate app-specific password |
| "Team ID mismatch" | APPLE_TEAM_ID env doesn't match the cert's OU | `security find-identity -v -p codesigning` to confirm Team ID |
| Notarization silently skipped, no error, unsigned DMG | electron-builder 24.0-24.12 bug with API key env vars | Upgrade electron-builder to 24.13+ |
| Stapling fails with "CloudKit Error" | Notarization ticket not yet propagated | Wait 1-2 minutes; retry `xcrun stapler staple` |
| First-launch fails on offline Mac | DMG not stapled after notarization | Ensure `xcrun stapler staple` ran; electron-builder does this automatically when notarize=true |
| Gatekeeper blocks app despite notarization | App bundle was modified after notarization (even trivially) | Never modify the .app after notarize; re-notarize if changed |

### CI/Secrets-phase pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `.p12` path doesn't resolve in CI | Using file path in CSC_LINK instead of base64 | Use `base64 -i` output as CSC_LINK directly |
| API key `.p8` not found | Forgot to decode base64 in CI step | Decode and write to a temp file, OR pass base64 content directly where supported |
| Secrets accidentally committed to git | .p12 / .p8 committed unintentionally | Rotate immediately: revoke cert, regenerate API key; audit git history |
| Different Team ID on different engineer machines | Personal Apple IDs also in team; picking wrong identity | Set `CSC_NAME` to the exact "Developer ID Application: <Company> (<TeamID>)" string |

---

## Limitations & Open Questions

### Uncertain findings

- **Enrollment timing variability** — Apple publishes "up to 24 hours after purchase" but community reports span same-day to 4 weeks. Quoted timings in this runbook are community consensus (multiple forum threads, vendor blogs, Quora) and marked UNCERTAIN.
- **Enterprise Program rejection rates** — community reports describe frequent rejections for small companies but Apple does not publish statistics.
- **D-U-N-S carryover speed** — INFERRED from shared D&B backing; Apple does not formally commit to faster D-U-N-S validation for orgs already validated in ABM.
- **electron-builder version of silent-skip fix** — stated as "24.13+" in GitHub issue #8040 but not pinned to an exact patch release.

### Not covered (out of rubric scope)

- Windows + Linux code signing (DMG-specific runbook).
- Mac App Store (.pkg) distribution path.
- Self-signed / ad-hoc signing for internal distribution (e.g., CI-only builds).
- Regional specifics (China mainland fapiao, EU DMA variations, etc.).
- Apple Developer University Program (academic-only).

---

## References

### Evidence Files

- [d1-verify-existing-enrollment.md](evidence/d1-verify-existing-enrollment.md) — How to confirm existing Developer Program membership
- [d2-program-disambiguation.md](evidence/d2-program-disambiguation.md) — Disambiguation of Apple's business programs
- [d3-duns-number.md](evidence/d3-duns-number.md) — D-U-N-S number mechanics + timing
- [d4-enrollment-runbook.md](evidence/d4-enrollment-runbook.md) — Organization enrollment sequence
- [d5-certs-and-notary-creds.md](evidence/d5-certs-and-notary-creds.md) — Developer ID cert + notary credential creation
- [d6-electron-builder-ci.md](evidence/d6-electron-builder-ci.md) — electron-builder + GitHub Actions integration
- [d7-business-id-vs-developer-id.md](evidence/d7-business-id-vs-developer-id.md) — Apple ID topology best practice

### External Sources

**Apple official:**
- [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/)
- [Apple Developer Enterprise Program](https://developer.apple.com/programs/enterprise/)
- [D-U-N-S Number help](https://developer.apple.com/help/account/membership/D-U-N-S/)
- [D-U-N-S lookup tool](https://enroll.apple.com/enroll/duns-lookup/)
- [Create Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Resolving common notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
- [App Store Connect API keys](https://appstoreconnect.apple.com/access/api)
- [About your developer account (roles)](https://developer.apple.com/help/account/get-started/about-your-developer-account/)
- [Transfer the Account Holder role](https://developer.apple.com/help/account/access/transfer-the-account-holder-role)

**D&B:**
- [D&B Apple support portal](https://support.dnb.com/?CUST=APPLEDEV)
- [D&B public D-U-N-S lookup](https://www.dnb.com/duns-number/lookup.html)

**Tooling:**
- [electron-builder code signing](https://www.electron.build/code-signing)
- [electron-builder MacConfiguration reference](https://www.electron.build/app-builder-lib.Interface.MacConfiguration.html)
- [@electron/notarize](https://github.com/electron/notarize)
- [notarytool man page](https://keith.github.io/xcode-man-pages/notarytool.1.html)
- [GitHub Action: import-codesign-certs](https://github.com/Apple-Actions/import-codesign-certs)
- [GitHub Docs — Installing an Apple certificate on macOS runners](https://docs.github.com/en/actions/use-cases-and-examples/deploying/installing-an-apple-certificate-on-macos-runners-for-xcode-development)

**Community references:**
- [BigBinary — Code-sign & notarize Mac desktop app](https://www.bigbinary.com/blog/code-sign-notorize-mac-desktop-app)
- [Federico Terzi — Auto code-signing & notarization for macOS via GitHub Actions](https://federicoterzi.com/blog/automatic-code-signing-and-notarization-for-macos-apps-using-github-actions/)
- [electron-builder #8040 — notarize:true with API key silent skip](https://github.com/electron-userland/electron-builder/issues/8040)
- [Twinr — Enroll in Apple Developer Program (2025 guide)](https://twinr.dev/blogs/how-to-enroll-in-the-apple-developer-program/)
- [scriptingosx — Notarize a command-line tool with notarytool](https://scriptingosx.com/2021/07/notarize-a-command-line-tool-with-notarytool/)
