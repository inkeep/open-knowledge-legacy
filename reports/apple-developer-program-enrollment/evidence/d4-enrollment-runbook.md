# Evidence: D4 — Organization Enrollment Step-by-Step

**Dimension:** Apple Developer Program Organization enrollment step-by-step
**Date:** 2026-04-17
**Sources:** Apple enrollment docs, Apple identity verification docs, community guides

---

## Key URLs referenced

- `https://developer.apple.com/programs/enroll/` — Start enrollment
- `https://developer.apple.com/help/account/membership/program-enrollment/` — Canonical enrollment help
- `https://developer.apple.com/help/account/membership/identity-verification/` — Identity verification
- `https://developer.apple.com/support/enrollment/` — Enrollment support
- `https://appleid.apple.com` — Apple ID management (2FA)

---

## Findings

### Finding: Prerequisites are Apple ID + 2FA + D-U-N-S + legal authority + credit card

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/programs/enroll/`

> "Apple Account with two-factor authentication enabled; First and last names must be your legal names; You must be the Account Holder with legal authority to bind your organization to agreements; Legal entity name and status (not DBA, fictitious name, trade name, or branch); D-U-N-S Number; Work email address associated with your organization's domain name; Phone number (no P.O. boxes); Publicly available, functional website with org-associated domain."

**Apple Account (Apple ID) requirements:**
- 2FA **must be enabled** — enrollment will reject non-2FA Apple IDs
- First and last names on the Apple ID must be legal names (change via appleid.apple.com before enrolling if an alias is set)
- Recommend a dedicated `developer@company.com` Apple ID (not a personal engineer's) — survives employee turnover

---

### Finding: The enrollment flow has a fixed sequence — sign in, select type, enter org info, verify, pay

**Confidence:** CONFIRMED
**Evidence:** Apple enroll landing page + help docs

Sequence:
1. Sign in at `https://developer.apple.com/programs/enroll/` with the intended Account Holder Apple ID
2. Select **"Organization"** as enrollment type (vs Individual)
3. Enter organization details: legal entity name, HQ address, phone, website URL, work email
4. Enter or look up D-U-N-S Number via integrated form
5. Attest to **legal binding authority** ("I am authorized to bind this organization to agreements with Apple")
6. Apple Developer Support reviews (may call the phone number on file to verify binding authority — see below)
7. After approval, accept the Apple Developer Program License Agreement (PLA)
8. Complete payment ($99 USD/yr, or local-currency equivalent)
9. Receive confirmation email; membership active within 24 hours of purchase

---

### Finding: Apple phones the listed org contact to verify binding authority (common but not universal)

**Confidence:** UNCERTAIN (community consensus; Apple docs don't confirm details)
**Evidence:** Forum reports across 2020-2025, including:
- `https://developer.apple.com/forums/thread/820213`
- `https://www.quora.com/How-long-does-it-take-to-get-an-Apple-developer-account-organization-enrollment-approved`

Community reports:
- Apple commonly calls the phone number on the enrollment form during business hours (local to the org) to confirm the Account Holder has authority to bind the company.
- If the applicant is NOT the owner/founder, Apple may require a secondary contact (executive/owner) to corroborate.
- Failing to answer the phone or return Apple's call within ~3 business days can delay enrollment by weeks.

**Implications:** Ensure the phone number on the enrollment form is one the Account Holder (or their executive assistant) actively answers during business hours, and that voicemail is set up.

---

### Finding: Typical enrollment timing is 1-4 weeks; can be <24 hours if D-U-N-S and verification are pre-resolved

**Confidence:** INFERRED (Apple docs say "up to 24 hours after purchase" but community says 1-4 weeks for full approval)
**Evidence:** 
- Apple: "Confirmation expected within 24 hours of purchase"
- Community: "Most business accounts are approved within 3–5 business days. If you need a D-U-N-S number or Apple requests additional verification, it may take 7–10 days" / "1 to 4 weeks"
- `https://twinr.dev/blogs/how-to-enroll-in-the-apple-developer-program/` (community guide, Jan 2025)

| Scenario | Typical timing |
|---|---|
| D-U-N-S pre-validated + phone call answered quickly + no issues | Same day to 2 days |
| Standard new enrollment, D-U-N-S already in D&B | 3-5 business days |
| New D-U-N-S required | +5-7 business days (D&B) before starting |
| Legal-authority verification needed | 1-2 weeks |
| Disputes or region-specific review | Up to 1 month |

**Implications:** Quote 2 weeks as the default planning horizon. If the team needs faster, have D-U-N-S, Apple ID w/ 2FA, and phone access ready *before* clicking Enroll.

---

### Finding: Fee waiver for nonprofits, accredited education, government entities

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/support/fee-waiver/`

Available to:
- 501(c)(3) or equivalent nonprofits
- Accredited educational institutions
- Government entities

Does not apply to for-profit companies.

---

### Finding: Post-approval, Account Holder invites team by Apple ID + role

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/access/roles`

Roles:

| Role | Purpose | Can create certs? |
|---|---|---|
| **Account Holder** | Primary owner; accepts agreements; manages billing | Yes (only one; transferable) |
| **Admin** | Full dev + distribution access | Yes (most certs) |
| **App Manager** | Manages app submissions + metadata | No (Dev certs yes) |
| **Developer** | Build + test apps | No |
| **Marketer** | Marketing surfaces only | No |
| **Finance** | Billing + financials | No |

**Invitation flow:** Account Holder or Admin goes to App Store Connect > Users and Access > "+" > enter invitee Apple ID + role. Invitee receives email, accepts via link, signs in with their Apple ID, and now sees the organization's team in addition to any personal team.

**Critical note for Developer ID:** Creating a Developer ID Application certificate requires **Account Holder role** (not Admin). See D5 evidence.

---

## Gaps / follow-ups

- Specific phone-verification process is not documented publicly; community reports are consistent but anecdotal.
- Regional differences (e.g., China, EU post-DMA) may introduce additional verification steps not captured here.
