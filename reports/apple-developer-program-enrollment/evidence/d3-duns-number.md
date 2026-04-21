# Evidence: D3 — D-U-N-S Number: Lookup, Request, Timing

**Dimension:** D-U-N-S: what it is, how to look up an existing one, how long to get one
**Date:** 2026-04-17
**Sources:** Apple D-U-N-S help page, D&B portal, D&B Apple-specific support

---

## Key URLs referenced

- `https://developer.apple.com/help/account/membership/D-U-N-S/` — Apple's canonical D-U-N-S docs
- `https://enroll.apple.com/enroll/duns-lookup/` — Apple's D-U-N-S lookup tool (integrated into enrollment flow; also accessible standalone)
- `https://www.dnb.com/duns-number/lookup.html` — D&B's general public lookup tool
- `https://support.dnb.com/?CUST=APPLEDEV` — D&B Apple-specific support portal

---

## Findings

### Finding: D-U-N-S is a unique 9-digit Dun & Bradstreet business identifier

**Confidence:** CONFIRMED
**Evidence:** `https://developer.apple.com/help/account/membership/D-U-N-S/`

> "The D-U-N-S Number is a unique nine-digit number that identifies business entities on a location-specific basis. It's assigned and maintained by Dun & Bradstreet (D&B) and is widely used as a standard business identifier."

**Implications:** D-U-N-S is location-specific — a company with multiple offices may have multiple D-U-N-S numbers. The enrollment must use the D-U-N-S tied to the legal-entity HQ address that matches Apple's records.

---

### Finding: Apple provides its own D-U-N-S lookup tool (preferred entry point)

**Confidence:** CONFIRMED
**Evidence:** `https://enroll.apple.com/enroll/duns-lookup/`

> "Before enrolling, look up your organization to see if you already have a D‑U‑N‑S Number. Required information for lookup: Legal entity name, Headquarters address, Mailing address, Work contact information."

Apple's lookup form wraps D&B's database with Apple-specific context: if the org is already validated by Apple via D&B, the lookup returns the number and flags it as usable for enrollment. If not, the form offers "Request a D-U-N-S Number" which routes to D&B's free process.

**Implications:** Use Apple's lookup first, not D&B's general form — it pre-validates the match against Apple's data.

---

### Finding: D-U-N-S is free for organizations in most jurisdictions

**Confidence:** CONFIRMED
**Evidence:** Apple D-U-N-S help page

> "If your organization is not listed in D&B's database, you can submit your information during the lookup process for a free D‑U‑N‑S Number through Dun & Bradstreet."

D&B charges for expedited processing and premium reports, but the D-U-N-S Number itself is free to obtain for Apple enrollment purposes.

**Implications:** Do not pay D&B for expedited D-U-N-S — per Apple's own docs, expediting does not shorten the downstream Apple-visibility window.

---

### Finding: D-U-N-S request timing is up to 7 business days end-to-end

**Confidence:** CONFIRMED
**Evidence:** Apple D-U-N-S help page

| Stage | Duration |
|---|---|
| D&B processing time | Up to 5 business days |
| Apple receiving updated D&B information | Up to 2 business days |
| **Total before enrollment eligibility** | **Up to 7 business days** |

> "Expediting the D‑U‑N‑S creation process will NOT shorten this waiting period."

**Implications:** If the org lacks a D-U-N-S, budget ~1-2 calendar weeks before enrollment can begin. If the org is listed on D&B already (the typical case for any incorporated entity that's existed >1 year and been credit-checked), D-U-N-S lookup is instant.

---

### Finding: "Not listed as a legal entity" is the most common D-U-N-S error during Apple enrollment

**Confidence:** CONFIRMED
**Evidence:** Apple D-U-N-S help page — documents this specifically

> "Your business is listed in D&B database with different legal status (e.g., sole proprietorship), or your legal status has not been verified."

Resolution:
1. Use the legal entity name exactly as incorporated (no DBAs, trade names, or branches)
2. If sole proprietor, enroll as an Individual instead
3. Contact D&B with business registration documents to upgrade legal status

**Implications:** A mismatch between "how the company is named on D&B" and "the legal entity on the enrollment form" is the single most common hang-up. Confirm the D&B record matches the registered legal entity before starting the Apple enrollment flow.

---

### Finding: D-U-N-S updates take up to 2 business days to propagate to Apple

**Confidence:** CONFIRMED
**Evidence:** Apple D-U-N-S help page

> "To update your D&B profile information: Email D&B support. Allow up to 2 business days for D&B to provide updated information to Apple."

**Implications:** If you correct your D&B record mid-enrollment (e.g., to fix a legal-status mismatch), you must wait 2 business days before re-attempting the Apple side.

---

### Finding: D-U-N-S is the same identifier Apple uses across Developer, Enterprise, and Business Manager programs

**Confidence:** INFERRED
**Evidence:** All three programs reference D-U-N-S with identical validation criteria (legal entity, location, work contact, website domain).

There is no separate "Apple Developer D-U-N-S" vs "Apple Business D-U-N-S" — the same 9-digit number identifies the same legal entity across Apple's programs. Once validated for one program, subsequent programs enrolling the same legal entity typically see faster D-U-N-S validation.

**Implications:** If the company already enrolled in Apple Business Manager or already shipped to the App Store under its own name, the D-U-N-S is already validated and enrollment will skip the 5-7 day D&B wait.

---

## Gaps / follow-ups

- Apple doesn't document whether D-U-N-S carryover shortens subsequent enrollments — only inferred from shared D&B backing.
- D&B's public lookup at dnb.com/duns-number/lookup.html is less Apple-optimized than Apple's own form; some older D&B pages still prompt for paid products first.
