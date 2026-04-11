# Evidence: Code Signing (macOS + Windows)

**Dimension:** Code Signing
**Date:** 2026-04-11
**Sources:** Apple Developer, Microsoft, CA/B Forum, Sectigo, DigiCert, Azure Trusted Signing

---

## Key sources
- [Apple Developer Program](https://developer.apple.com/programs/enroll/)
- [Apple notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [CA/B Forum 2023 code signing requirements](https://garantir.io/new-2023-ca-browser-forum-code-signing-requirements/)
- [Azure Trusted Signing pricing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/)
- [Authenticode in 2025 — textslashplain](https://textslashplain.com/2025/03/12/authenticode-in-2025-azure-trusted-signing/)
- [electron/notarize](https://github.com/electron/notarize)

---

## macOS Code Signing

### Finding: Apple Developer Program = $99/year (Individual or Organization)
**Confidence:** CONFIRMED

- Individual: $99/yr, same-day enrollment
- **Organization: $99/yr, requires D-U-N-S Number, 1-6 weeks enrollment**
- Trust dialog shows "Developer: [legal entity name]" — Organization shows "Inkeep, Inc." vs personal name for Individual

**UX implication:** Organization is the right choice for any commercial product. The trust dialog impact is worth the 1-6 week wait. Start D-U-N-S registration immediately; D&B delivers in 5-30 business days.

### Finding: Developer ID Application cert is the only cert needed for OK
**Confidence:** CONFIRMED

- **Developer ID Application** — sign .app bundles and .dmg files (REQUIRED)
- Developer ID Installer — only if shipping .pkg (OK ships .dmg, skip)
- Apple Distribution / Mac App Distribution — only for Mac App Store (OK is skipping MAS)

Max 5 of each Developer ID cert type per account. Certs are free (included in $99 membership).

### Finding: Notarization is mandatory since macOS 10.15 Catalina (Feb 2020)
**Confidence:** CONFIRMED

Workflow:
```bash
# 1. Sign with hardened runtime
codesign --deep --force --options runtime \
  --sign "Developer ID Application: Inkeep Inc. (TEAMID)" \
  --entitlements entitlements.plist \
  --timestamp \
  OpenKnowledge.app

# 2. Zip for submission
ditto -c -k --keepParent OpenKnowledge.app OpenKnowledge.zip

# 3. Submit (prefer App Store Connect API key over Apple ID)
xcrun notarytool submit OpenKnowledge.zip \
  --keychain-profile "OK_NOTARY" \
  --wait

# 4. Staple the ticket (required for offline first-launch)
xcrun stapler staple OpenKnowledge.dmg
xcrun stapler validate OpenKnowledge.dmg
```

**Timing:** Apple SLA says 98% of submissions complete in <15 min; most in <5 min. Long tail: first-ever submissions or >1GB apps reported 30min-4.5hrs.

**Use App Store Connect API key (not Apple ID)** — doesn't expire, can be revoked per-key, avoids Apple ID 2FA weirdness in CI.

### Finding: macOS 15 Sequoia (Sept 2024) removed right-click-Open bypass
**Confidence:** CONFIRMED

For unsigned apps, the macOS 13-14 workaround was: right-click → Open → second dialog with "Open" button (~15 seconds friction).

**macOS 15+ workflow for unsigned apps:**
1. Double-click → "cannot be opened" dialog, only "Move to Trash"
2. User goes to System Settings → Privacy & Security
3. Scrolls to "X was blocked"
4. Clicks "Open Anyway"
5. Authenticates with Touch ID/password

**~45 seconds + confusion per new user on first launch. This is a UX killer.**

**Implication:** Even beta builds must be signed and notarized. The right-click bypass is gone.

### Finding: Hardened runtime entitlements Electron needs
**Confidence:** CONFIRMED

```xml
<!-- entitlements.mac.plist -->
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <!-- If network access needed: -->
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.network.server</key><true/>
  <!-- If file system access needed: -->
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
```

V8 requires `allow-jit`. Native modules (like `@parcel/watcher`) require `disable-library-validation`. All three are standard for Electron.

---

## Windows Code Signing

### Finding: EV certs no longer give "instant" SmartScreen trust (since March 2024)
**Confidence:** CONFIRMED

Historical (pre-March 2024): EV certs bypassed SmartScreen warnings immediately. OV certs required months of downloads to build reputation.

**Post-March 2024:** Microsoft removed EV "instant trust" mechanism. Both OV and EV now build reputation identically via downloads, install counts, and Defender telemetry. EV is now only strictly required for kernel-mode drivers and Windows Hardware Dev Center submissions.

**Implication:** Paying $700/yr for EV is NOT justified for a normal Electron app in 2025/2026.

### Finding: HSM mandatory since June 2023
**Confidence:** CONFIRMED
**Evidence:** CA/B Forum Code Signing Requirements

Since June 1, 2023: CA/B Forum requires FIPS 140-2 Level 2 (or CC EAL 4+) HSM storage for BOTH OV and EV private keys. No more `.pfx` files in CI secrets.

**Options:**
1. USB token (YubiKey/eToken) — ships with cert, but doesn't work with headless GitHub Actions runners
2. Cloud HSM (Azure Key Vault Premium, AWS CloudHSM) — works in CI
3. On-prem HSM — overkill for most teams

### Finding: Azure Trusted Signing is the cost/ergonomics winner at ~$120/yr
**Confidence:** CONFIRMED

| Tier | Price | Signatures |
|------|-------|-----------|
| Basic | **$9.99/month** (~$120/yr) | 5,000/month |
| Premium | $99.99/month | 100,000/month |

- Microsoft runs the HSM — no dongle, no hardware management
- Ships as a GitHub Action (`Azure/trusted-signing-action@v0.5.x`)
- Replaces EV functionally — SmartScreen reputation via Microsoft's CA chain
- **Eligibility:** US/Canada orgs with 3+ years business history, OR individual US/CA developer enrollment (public preview Oct 2025)

electron-builder support: `win.azureSignOptions` in recent versions.

### Finding: Unsigned Windows app = "Windows protected your PC" dialog
**Confidence:** CONFIRMED

1. Double-click installer → blue modal "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting." Primary button: "Don't run."
2. Click "More info" → reveals "Unknown publisher" + secondary button "Run anyway"
3. Click "Run anyway" → installer proceeds

**Enterprise-managed Windows with SmartScreen in Block mode: NO "Run anyway" button — app is fully blocked.** Affects 10-25% of corporate endpoints.

**For OK's UX, signing is mandatory for any non-personal audience.**

---

## Cost Summary (Annual)

| Item | Cost | Notes |
|------|------|-------|
| Apple Developer Program | $99 | Individual or Organization |
| Developer ID certs | $0 | Included |
| macOS notarization | $0 | Free Apple service |
| Azure Trusted Signing (Basic) | ~$120 | Primary recommendation |
| **Total recommended** | **~$219/yr** | |
| Fallback: Sectigo OV + Azure Key Vault HSM | ~$585 | If Trusted Signing ineligible |
| Bad pattern: EV cert + USB dongle | ~$700 + ops | Old-school, self-hosted runner required |

**UX-first decision:** $219/yr is trivial. Always sign. Always notarize. Never ship unsigned builds even to beta testers — macOS 15 Sequoia removed the bypass.
