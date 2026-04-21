# Evidence: D2 — Distinguishing Apple Programs (Business Manager / Apple at Work / Developer / Enterprise)

**Dimension:** Distinguishing Apple program memberships
**Date:** 2026-04-17
**Sources:** Apple Business Manager user guide, Apple Developer Program enroll page, Enterprise Program page, MDM vendor explainers (Jamf, Microsoft Intune)

---

## Key URLs referenced

- `https://developer.apple.com/programs/enroll/` — Developer Program (Org/Individual)
- `https://developer.apple.com/programs/enterprise/` — Developer Enterprise Program
- `https://support.apple.com/guide/apple-business-manager/welcome/web` — Apple Business Manager (being rebranded to "Apple Business" per 2025+ consolidation)
- `https://business.apple.com/` — Apple Business Manager portal
- `https://www.apple.com/shop/business` — Apple at Work / business purchasing
- `https://developer.apple.com/custom-apps/` — Custom App distribution

---

## Findings

### Finding: Apple runs five distinct business-facing programs commonly confused with each other

**Confidence:** CONFIRMED
**Evidence:** Individual program pages linked above

| Program | URL | Cost | Purpose | D-U-N-S | Apple ID type |
|---|---|---|---|---|---|
| **Apple Developer Program** | developer.apple.com/programs/enroll | $99/yr | App development + distribution (App Store, Developer ID, TestFlight) | Required (Org) | Any Apple ID w/ 2FA |
| **Apple Developer Enterprise Program** | developer.apple.com/programs/enterprise | $299/yr | **In-house only** distribution to own employees; NOT external customers | Required | Separate Apple ID from standard Developer Program |
| **Apple Business Manager (ABM)** | business.apple.com | Free | MDM / device deployment / Managed Apple IDs / app licenses | Required | Managed Apple IDs |
| **Apple at Work / Apple Business** | apple.com/shop/business | Free (purchasing) | B2B purchasing portal for hardware/software | Required for volume | Business Apple ID |
| **Apple Developer Account (free tier)** | developer.apple.com/account | Free | Beta software, forums, limited testing | None | Any Apple ID |

**Implications:** A company that has "signed up with Apple before" may be in any of these — only the Developer Program issues Developer ID certificates + notary access for macOS direct distribution.

---

### Finding: Apple Developer Enterprise Program is NOT the right path for external-customer macOS apps

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/programs/enterprise/`

> "Internal-use apps only for proprietary app distribution. Not for external customers — strictly for employee distribution within the organization."

Eligibility requires:
- 100+ employees
- Legal entity (no DBAs)
- Proprietary in-house apps only
- Systems in place to ensure only employees can access
- Public website with organization-associated domain
- **Pass Apple's verification interview and continuous evaluation process**

**Community consensus (UNCERTAIN on rejection rates):** Multiple forum threads and vendor blogs through 2023-2025 report that Apple rejects most Enterprise Program applications, steering applicants toward Apple Business Manager + Custom Apps, TestFlight, or regular Developer Program. This is not an officially-published statistic.

**Implications:** For a company shipping an Electron desktop app **to external customers** via direct DMG download, Enterprise Program is explicitly disallowed by Apple's terms. The standard Apple Developer Program ($99/yr) is the correct path.

---

### Finding: Apple Business Manager and Apple Developer Program both require D-U-N-S, but validation is not automatically shared

**Confidence:** INFERRED (from program docs + community reports)
**Evidence:** 
- `https://developer.apple.com/help/account/membership/D-U-N-S/`
- `https://support.apple.com/guide/apple-business-manager/sign-up-axm402206497/web`
- Community reports (Jamf, TUCU setup guides) confirm both programs reference the same Dun & Bradstreet D-U-N-S.

Apple's D&B integration means a D-U-N-S Number already validated for one Apple business program is typically recognized when entering it in another program's enrollment — reducing repeated delays. However, the organization still completes separate enrollment flows with separate legal-authority attestations per program.

**Nuance:** Apple does not publicly document D-U-N-S carryover between programs, but community consensus (and the shared D&B backing) supports the claim that a D-U-N-S already in D&B's database + already validated by Apple for ABM will validate faster in a subsequent Developer Program enrollment.

**Implications:** If the company already enrolled in Apple Business Manager, the D-U-N-S portion of Developer Program enrollment is already done. The legal-authority attestation, payment, and identity verification are still required.

---

### Finding: Apple Business Manager rebranded to "Apple Business" in 2025+ consolidation

**Confidence:** CONFIRMED
**Evidence:** `https://support.apple.com/guide/apple-business-manager/welcome/web`

> "Apple Business Manager is now Apple Business" — a consolidated platform combining capabilities from three previous products: Apple Business Manager, Apple Essentials, and Apple Business Connect.

**Implications:** Marketing names shift but the underlying product (ABM-for-MDM) still issues device enrollment tokens; it still does not confer Developer ID signing ability.

---

### Finding: Managed Apple IDs (from ABM) are NOT usable for Developer Program enrollment

**Confidence:** INFERRED
**Evidence:** Apple Business Manager user guide + Developer Program enrollment requirements

Managed Apple IDs are issued by ABM for employee device management. They are distinct from standard (consumer) Apple IDs. Developer Program enrollment requires an Apple Account with 2FA enabled and legal-name attributes — and historically, Managed Apple IDs lack full consumer-account capabilities (e.g., app purchasing, consumer 2FA flows).

**Implications:** Don't try to reuse a Managed Apple ID from ABM as the Developer Program Account Holder. Create a dedicated consumer Apple ID (recommended: `developer@company.com` or similar) for the Account Holder role.

---

## Gaps / follow-ups

- No official Apple page publishes D-U-N-S carryover guarantees between programs — claim is inferred.
- Enterprise Program rejection rates are community-reported, not Apple-disclosed.
