# Evidence: D7 — Business and community signals

**Dimension:** D7 (P2 Quick)
**Date:** 2026-04-11
**Sources:** PitchBook, Tracxn, Crunchbase, LinkedIn, GitHub contributor graph, pricing pages, layoff trackers

---

## Key sources

- [PitchBook AFFiNE profile](https://pitchbook.com/profiles/company/520468-75) — funding rounds + investor list
- [Tracxn AFFiNE funding](https://tracxn.com/d/companies/affine/__k9fQ8Sczs9UVA1RMH0G-kLi_ngEITpKcsWqtrpjU0VE/funding-and-investors) — corroborating source + team count
- [Crunchbase AFFiNE](https://www.crunchbase.com/organization/affine-2627) — third corroborating source
- [AFFiNE LinkedIn (toeverything)](https://www.linkedin.com/company/toeverything) — "11–50 employees" band
- [AFFiNE pricing](https://affine.pro/pricing) — Free / Pro / Team / Enterprise tier structure
- [Docs: self-host](https://docs.affine.pro/self-host-affine) — Enterprise Edition status ("yet to be published")

---

## Findings

### Finding: No funding rounds post-October 2023

**Confidence:** CONFIRMED (three independent sources: PitchBook, Tracxn, Crunchbase)
**Evidence:** Last disclosed round is $10M Series Seed from Redpoint Ventures + Sinovation Ventures (Oct 16, 2023). Prior round: $8M seed (Feb 2023). Total: $18M across 2 seed rounds. No Series A, no debt, no 2024–2026 financings listed.

```text
Round timeline:
  Feb 2023  — $8M seed
  Oct 2023  — $10M seed (Redpoint, Sinovation)
  --- 17+ months with no new capital through April 2026 ---
```

**Implication:** This is a sharper signal in April 2026 than when the landscape report cited it (April 2026 was already 17+ months without a round). Three plausible readings:
1. Runway remains — bootstrapped discipline, revenue-plus-seed covering burn.
2. Investor appetite cooled post-pivot announcement; Series A didn't land.
3. Quiet acquisition discussions pending.

**For threat calibration:** Absence of Series A for a $18M-funded OSS knowledge platform competing in a space with Notion ($11B), Mintlify ($21M Series A), and Chroma (~$20M) is notable. Constrains AFFiNE's ability to fund parallel AI-KB development + platform maintenance + enterprise GTM.

---

### Finding: Small team (~21 employees), founder-led, Singapore-based

**Confidence:** INFERRED (multiple sources, LinkedIn band vs Tracxn specific)
**Evidence:** LinkedIn reports "11–50 employees" (company-provided band). Tracxn reports "21 employees" specifically. Founders: Jiachen He (CEO), Chi Zhang (CTO), plus Yipei Wei, Yifeng Wang, Yinan Long. HQ: Singapore. Founded 2020.

**Implication:** Team scale is insufficient to run AI-KB innovation + BlockSuite maintenance + y-octo maintenance + Cloud ops + Enterprise GTM simultaneously. Infrastructure-heavy roadmap in v0.26.x is consistent with a small team prioritizing "keep the product shippable" over "invent the AI future." Similar dynamic to Obsidian's 18-person team choosing philosophy over ambition, but AFFiNE lacks Obsidian's $25M ARR revenue base.

---

### Finding: No layoffs, hiring freezes, or public distress signals (2024–2026)

**Confidence:** CONFIRMED (absence-based)
**Evidence:** Tech layoff trackers (skillsyncer, layoffs.fyi) do not list AFFiNE / toeverything for 2024, 2025, or Q1 2026. Industry context: 127K+ tech layoffs in 2025, 52K+ in Q1 2026 alone.

**Negative search:** Searched layoff trackers + news for "AFFiNE layoffs", "toeverything hiring freeze", "AFFiNE shutdown" → no results.

**Implication:** No public distress. But also no public hiring announcements or aggressive expansion signals. Consistent with "quiet runway-preserving posture."

---

### Finding: Cloud pricing exists; Enterprise Edition status "yet to be published"

**Confidence:** CONFIRMED
**Evidence:** affine.pro/pricing lists Free (local), Pro (cloud sync), Team/Enterprise tiers. docs.affine.pro/self-host-affine lists SSO and rebranding as promised but "yet to be published."

**Implication:** Enterprise monetization is still roadmap, not shipped. Combined with v0.26.3's admin panel redesign + S3 compat (both enterprise-oriented infrastructure), this suggests enterprise tier is the current priority — explaining where engineering effort is going instead of AI-KB. Enterprise-first is a defensible GTM (and consistent with Singapore HQ + small team revenue focus), but it's a different strategy than "agent-native knowledge platform."

**Decision trigger for open-knowledge:** If AFFiNE's revenue strategy is enterprise self-host (not AI-KB), they compete on different axes than open-knowledge's bet. Less direct threat than the Tier-1 ranking implies.

---

### Finding: No named enterprise customers public

**Confidence:** NOT FOUND
**Evidence:** Pricing page, About page, blog, case studies — no customer logos, no named references. Funding announcements silent on customer traction.

**Negative search:** Searched "affine case study", "affine customer story", "companies using affine" → no results as of 2026-04-11.

**Implication:** Absent customer proof points at 3+ years of product. Either (a) enterprise GTM isn't landing yet, (b) customers prefer confidentiality, or (c) revenue is SMB/prosumer via Cloud Pro not enterprise. Any of these weakens the "most technically capable Tier-1 threat" framing of the landscape report.

---

### Finding: Development velocity adequate; external contributor base thin

**Confidence:** UNCERTAIN (direct GitHub contributor graph not fetched; indirect signals)
**Evidence:** Daily canary releases + 2–3 week stable cadence (see D1). v0.25.5 release notes credit 4 new external contributors (@moogle19, @arksky1, @rogerclotet, @maunguyengit) — episodic, not sustained. No public leaderboard/scoreboard of recurring community contributors identified.

**Implication:** Development is core-team-driven. OSS contribution rate is low relative to a 67K-star project. Consistent with a small core team that ships fast but doesn't scale a contributor ecosystem. Contrast: Obsidian's plugin ecosystem (2,736 community plugins) is the deep moat; AFFiNE's equivalent moat (BlockSuite as reusable toolkit — see D2) has not yet attracted comparable community mass. (Detailed BlockSuite ecosystem adoption is Subagent B's territory.)

---

## Gaps / follow-ups

- GitHub contributor graph not directly inspected; commit velocity per-developer not quantified.
- Customer traction via signals like logos, testimonials, or G2/Capterra reviews not surveyed.
- Revenue estimates (ARR) not available; no third-party estimate for AFFiNE Cloud revenue detected.
- Acquisition-rumor signals not specifically checked (M&A trackers).
- Discord / Twitter community size not measured — could change the "thin contributor base" reading.
