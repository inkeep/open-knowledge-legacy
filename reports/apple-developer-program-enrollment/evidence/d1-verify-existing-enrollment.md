# Evidence: D1 — Verifying Existing Apple Developer Program Enrollment

**Dimension:** How to verify existing Apple Developer Program enrollment
**Date:** 2026-04-17
**Sources:** developer.apple.com (account portal docs), Apple Developer Program roles docs, community forums

---

## Key URLs referenced

- `https://developer.apple.com/account/` — Canonical signed-in developer account landing page. Shows membership card if enrolled.
- `https://appstoreconnect.apple.com/` — App Store Connect. Only accessible with active Developer Program membership (or invited team access).
- `https://developer.apple.com/account/resources` — Certificates, Identifiers & Profiles. Gated behind membership.
- `https://developer.apple.com/help/account/get-started/about-your-developer-account/` — Describes "Apple Developer Account" (free) vs "Apple Developer Program membership" (paid).
- `https://developer.apple.com/help/account/access/roles` — Team role matrix (Account Holder, Admin, App Manager, Developer, Marketer, Finance).

---

## Findings

### Finding: An Apple Developer Account (free) is distinct from an Apple Developer Program membership (paid)

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/get-started/about-your-developer-account/`

> "An Apple Developer Account serves as the foundation for all Apple development. You can get started for free by signing in with your Apple Account on the Apple Developer website, which allows you to: Download beta software and tools, Test apps on your device, Access developer communications and events, Post on forums and report bugs.
> When you're ready to distribute apps on the App Store and access advanced capabilities, you can enroll in the Apple Developer Program."

**Implications:** Signing in at developer.apple.com with any Apple ID does not indicate enrollment. The presence of the membership card + enrollment ID is the verifier.

---

### Finding: Signed-in enrollment state is visible at developer.apple.com/account

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/membership/program-enrollment` — "Status check: Sign in at developer.apple.com/account/"

A valid membership shows:
- A **Membership card** with the organization's legal name (or individual's name), Team ID (10-char alphanumeric), Program (Apple Developer Program or Apple Developer Enterprise Program), and expiration date.
- Access to **Certificates, Identifiers & Profiles** sidebar.
- Access to **App Store Connect** (link in the top-right app switcher).

Without enrollment, the account portal shows an "Enroll Today" call-to-action and `/account/resources` paths redirect or display "membership required."

**Implications:** The signed-in dashboard is the fastest ground-truth check.

---

### Finding: Team ID is the canonical organization identifier and appears in multiple surfaces

**Confidence:** CONFIRMED
**Evidence:** Apple account portal + community documentation

- The 10-character alphanumeric Team ID appears in:
  - The membership card at developer.apple.com/account
  - The `OrganizationalUnit (OU)` field of every issued Developer ID certificate
  - App Store Connect > Users and Access
  - Keychain Access certificate metadata
  - `notarytool submit --team-id <TEAM_ID>` invocations

**Implications:** Any engineer with a prior-issued Developer ID cert on their laptop can recover the Team ID via Keychain Access > "Get Info" on the cert. This lets you verify which org a cert belongs to independently of any sign-in.

---

### Finding: Team invitation model — an org membership is shared; individual engineers join via their own Apple IDs

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/get-started/about-your-developer-account/`

> "For organization-enrolled developers, the program supports multiple team members with the following roles: Account Holder, Admin, Developer, App Manager, Finance, Marketer."

The Account Holder (one person) invites other team members by Apple ID. Invited engineers sign in with **their own Apple ID** and see the organization's team listed alongside any personal teams.

**Implications:** Asking "is anyone at the company already an Account Holder?" is necessary before concluding the company is unenrolled. A former employee who held the Account Holder seat may still be the contact of record; role transfer requires Apple Developer Support assistance when the prior holder is unreachable.

---

### Finding: $99/year billing trace

**Confidence:** INFERRED (Apple billing flows)
**Evidence:** `https://developer.apple.com/programs/enroll/` — "$99 USD per year"

Annual $99 charges appear on the **Account Holder's** payment method. The charge descriptor is typically "APPLE.COM/BILL" or "APPLE DEVELOPER PROGRAM." If the org used an Apple ID whose billing ties to a corporate card, the AP/finance team may have visibility.

**Implications:** If no one recalls enrolling but finance sees recurring APPLE.COM/BILL $99 or local-currency equivalent, there is likely an unidentified Account Holder. Apple Developer Support can transfer the role given proof of org authority.

---

### Finding: iOS/iPadOS/macOS/tvOS/watchOS enrollment is unified — one membership covers all platforms

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/programs/whats-included/` and program enrollment docs

There is no platform-specific Developer Program. A single $99/year Apple Developer Program membership grants Developer ID for macOS AND App Store signing for iOS/iPadOS/tvOS/watchOS/visionOS.

**Implications:** If the company has ever shipped an iOS app via the App Store under its own name, the Developer Program account already exists and can immediately issue macOS Developer ID certs. No additional purchase needed.

---

## Gaps / follow-ups

- Exact UI copy on the developer.apple.com/account page has shifted periodically; screenshots included in the runbook are descriptive, not literal.
- Apple does not expose a public "is this company enrolled?" lookup. Verification must be through a signed-in Apple ID that's a team member, or via App Store seller-name search (indirect).
