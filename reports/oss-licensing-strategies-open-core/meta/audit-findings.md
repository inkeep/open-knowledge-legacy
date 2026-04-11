# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/oss-licensing-strategies-open-core/REPORT.md
**Audit date:** 2026-04-11
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: GitLab revenue figures are wrong -- report claims $491M FY2024 but actual was $580M; FY2023 figure of $369M is also inaccurate

**Category:** FACTUAL
**Source:** T4 (Web verification), T5 (External claims)
**Location:** Section 4 (Business Strategy & GTM), also in evidence/business-strategy-gtm.md
**Issue:** The report states GitLab revenue as "$369M->$491M FY2023->FY2024 (+33% YoY)." GitLab's actual FY2024 total revenue was $579.9M (fiscal year ending January 31, 2024). The +33% YoY figure appears to reference Q4 FY2024 quarterly growth, not full-year growth. The $491M figure does not correspond to any known GitLab annual or quarterly revenue number. FY2023 total revenue was approximately $424M, not $369M.
**Current text:** "GitLab: MIT CE + proprietary EE -> $491M FY2024 revenue (+33% YoY). Open-source contributors grew 34.6% over 3 years."
**Evidence:** GitLab Q4 FY2024 earnings report shows total FY2024 revenue of $579.9M. Q4 FY2024 revenue was $163.8M, up 33% YoY -- the 33% figure is a quarterly metric applied as if it were annual. The contributor growth figure (34.6% over 3 years, from 2,600 to 3,500) checks out from GitLab handbook data.
**Status:** CONTRADICTED
**Suggested resolution:** Correct to actual FY2024 revenue ($579.9M) and FY2023 ($424.3M). Replace "+33% YoY" with the actual full-year growth rate (~37% YoY), or explicitly qualify the 33% as a Q4 figure. The evidence file has the same error and needs the same correction.

---

### [H] Finding 2: Cal.com described as having "20K+ stars" -- significantly understates actual traction, potentially misleading comparison

**Category:** FACTUAL
**Source:** T5 (External claims)
**Location:** Executive Summary, Section 2 (Company Case Studies)
**Issue:** The report says Cal.com has "20K+ stars" as evidence that AGPL does not harm adoption. Cal.com actually has approximately 40.7K GitHub stars as of April 2026. While "20K+" is technically true (40K is more than 20K), it significantly undersells the project's traction and makes the AGPL adoption argument weaker than it actually is. Twenty is also cited at "20K+ stars" -- its GitHub page shows a similar or higher count. Understating these numbers weakens the report's own thesis.
**Current text:** "Cal.com (20K+ stars), Twenty (20K+ stars, 300+ contributors)"
**Evidence:** Cal.com GitHub repository shows ~40.7K stars (April 2026). Twenty GitHub shows the project has grown well beyond 20K. The report was written on 2026-04-11 and should reflect current data.
**Status:** STALE
**Suggested resolution:** Update star counts to current values. If the intent was to show a floor ("at least 20K"), make that explicit, but current data would strengthen the argument.

---

## Medium Severity

### [M] Finding 3: Elastic stock price claim ("$186 peak vs ~$48 in 2026") conflates all-time-high with relicensing causation

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** Section 4 (Business Strategy & GTM), evidence/business-strategy-gtm.md
**Issue:** The report states Elastic's stock "never recovered" and cites "$186 peak vs ~$48 in 2026" as evidence of relicensing damage. The $186 peak occurred in November 2021 during a broad tech bull market. The SSPL relicensing happened in January 2021 -- meaning the stock peaked 10 months AFTER the license change. The subsequent decline correlates with the broad tech sell-off of 2022-2023, not uniquely with the license change. The stock price around $48 in 2026 is confirmed, and the all-time high of ~$186-189 checks out, but the causal framing is misleading.
**Current text:** "Elastic returned to AGPL but stock never recovered ($186 peak vs ~$48 in 2026)."
**Evidence:** Elastic's all-time high closing price was $186.78 on November 16, 2021 -- ten months after the SSPL switch. The stock rose after relicensing, suggesting the decline was driven by macro factors (tech multiple compression), not the license change alone.
**Status:** INCOHERENT
**Suggested resolution:** Add conditionality: note that the stock decline coincided with broader tech market correction and cannot be attributed solely to the license change. The competitive damage from OpenSearch is real but the stock price comparison overstates the licensing-specific impact.

---

### [M] Finding 4: HashiCorp "1.5% quarter-on-quarter customer growth" claim is unsourced and unverifiable

**Category:** FACTUAL
**Source:** T4 (Web verification), L7 (Inline source attribution)
**Location:** evidence/relicensing-patterns.md (feeds into Section 6)
**Issue:** The evidence file states "HashiCorp's new customer growth dropped to 1.5% quarter-on-quarter immediately after BSL." Web searches for this specific metric returned no results. HashiCorp's public filings discuss revenue growth but the "1.5% QoQ new customer growth" figure could not be verified from any accessible source. The claim is load-bearing -- it supports the argument that BSL directly harmed HashiCorp's business.
**Current text:** "HashiCorp's new customer growth dropped to 1.5% quarter-on-quarter immediately after BSL."
**Evidence:** No primary source found for this specific metric. HashiCorp's stock was already down 67% from IPO before BSL. The IBM acquisition at $6.4B (announced April 2024, closed February 2025) is confirmed, but the customer growth metric is not.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either cite the specific earnings call/filing where this metric appears, or soften to a hedged characterization ("HashiCorp's growth metrics declined in the quarters following BSL, culminating in IBM's $6.4B acquisition").

---

### [M] Finding 5: Report characterizes the Elastic license situation inconsistently across sections

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 2 (Archetype 4) vs Section 4 vs evidence/relicensing-patterns.md
**Issue:** In Section 2 (Archetype 4), Elastic's journey is described as "Apache -> SSPL/ELv2 -> +AGPL" and placed among "Relicensing Casualties." In Section 4, the claim is "stock never recovered." But the evidence file notes Elastic is now triple-licensed (SSPL, AGPL, ELv2), which is the most flexible licensing posture of any company in the dataset. The report treats Elastic uniformly as a cautionary tale but doesn't acknowledge that Elastic's current position -- offering AGPL as an option alongside proprietary licenses -- is arguably the most sophisticated licensing strategy in the dataset, not a failure.
**Current text:** "Elastic (Apache -> SSPL/ELv2 -> +AGPL) ... 496 contributors, 100M+ downloads Y1; stock never recovered"
**Evidence:** Elastic added AGPL as a third option (August 2024), not as a replacement. They maintain three license choices. The "stock never recovered" framing conflates stock price with business health and ignores that Elastic continues to operate at scale. The label "casualty" applied to a company that adapted its licensing strategy is an inconsistent characterization.
**Status:** INCOHERENT
**Suggested resolution:** Acknowledge Elastic's triple-license as an adaptation, not solely a failure. Separate "community trust was permanently damaged" (supported) from "the company failed" (not supported -- Elastic remains a major business).

---

## Low Severity

### [L] Finding 1: Sentry license journey described inconsistently -- "BSD -> BSL" in Section 2 header vs "BSD -> BSL -> FSL" in text

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions)
**Location:** Section 2 (Archetype 3)
**Issue:** The table entry for Sentry shows "Previous: BSD -> BSL" but the current license is FSL. The evidence file shows the full arc is BSD-3 -> BSL 1.1 (2019) -> FSL (2023). The table format compresses this into "BSD -> BSL" as "Previous," which is technically correct but loses the BSL intermediate step. The narrative text in the evidence file correctly covers all three stages. Minor inconsistency in presentation.
**Current text:** Table: "Sentry | FSL | BSD -> BSL | 'Funded businesses plagiarizing our work to directly compete'"
**Evidence:** Evidence file timeline shows BSD-3 -> BSL 1.1 (Nov 2019) -> FSL (Nov 2023).
**Status:** INCOHERENT
**Suggested resolution:** Change the "Previous" column to "BSD -> BSL -> FSL" or just note the full arc. Minor -- does not affect conclusions.

---

### [L] Finding 2: The "22 companies" count is stated but the evidence file lists exactly 22 -- Penpot is in the table but absent from the report's archetype groupings

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** Section 2 (Company Case Studies)
**Issue:** The report header says "22 Companies, 22 Licensing Decisions" and the evidence table lists exactly 22 companies. But Penpot (MPL-2.0) appears in the evidence table and is mentioned briefly in Section 1 ("Penpot uses MPL-2.0 effectively as a design tool") but is not included in any of the four archetype groupings in Section 2. Counting the companies listed across all four archetypes yields 21, not 22. Penpot does not fit neatly into any archetype (it is neither permissive maximalist, AGPL defender, source-available, nor relicensing casualty), which is why it was likely omitted -- but the 22-company count then overcounts by one for the archetype analysis.
**Current text:** "22 Companies, 22 Licensing Decisions"
**Evidence:** 9 companies in Archetype 1 + 5 in Archetype 2 + 6 in Archetype 3 + 5 in Archetype 4 = 25 entries, but some appear in multiple archetypes (e.g., CockroachDB in both 3 and 4, Redis/Elastic/NocoDB in both 3/4). Unique companies across archetypes = 21. Penpot is the 22nd but has no archetype.
**Status:** INCOHERENT
**Suggested resolution:** Either add Penpot to an archetype (possibly a fifth "weak copyleft" archetype, or a note under Archetype 1 since MPL is permissive-adjacent) or note it as an outlier that doesn't fit the four-archetype model.

---

## Confirmed Claims (summary)

**Factual claims verified (T4/T5):**
- MIT and MIT Expat are the same license (SPDX `MIT` = Expat variant) -- CONFIRMED via SPDX registry and Wikipedia
- AGPL Section 13 closes the SaaS loophole by treating network access as distribution -- CONFIRMED via FSF license text
- Google bans AGPL internally -- CONFIRMED via Google's published AGPL policy
- OpenTofu reached 9.8M downloads with 300% annual growth -- CONFIRMED via multiple sources
- IBM acquired HashiCorp for $6.4B (announced April 2024, closed February 2025) -- CONFIRMED
- Redis's BSD -> SSPL -> AGPL journey timeline is accurate -- CONFIRMED
- Valkey: ~50 contributing companies, Linux Foundation backed -- CONFIRMED
- 83% of large enterprises adopted/explored Valkey -- CONFIRMED via Percona survey
- OpenSearch: 496 contributors, 100M+ downloads in year one -- CONFIRMED via OpenSearch 2022 recap
- Formbricks uses AGPLv3 -- CONFIRMED
- Cal.com switched from MIT to AGPL in 2021 -- CONFIRMED
- Twenty uses AGPLv3 with 300+ contributors -- CONFIRMED
- Elastic's all-time high stock price ~$186 -- CONFIRMED ($186.78 closing, November 2021)
- Drew DeVault's "Anti-AGPL propaganda" post exists and argues corporate anti-AGPL stance is manufactured -- CONFIRMED
- GitLab open source contributors grew 34.6% over 3 years (2,600 -> 3,500) -- CONFIRMED via GitLab handbook

**Coherence claims verified (L1-L7):**
- The trust hierarchy (MIT/Apache > AGPL > BSL/SSPL > license change) is consistently applied throughout -- CONFIRMED
- The recommendation (AGPL for Open Knowledge) follows logically from the evidence presented -- CONFIRMED
- Confidence labels in evidence files are generally well-calibrated (CONFIRMED for sourced claims, INFERRED for the GTM-license alignment which is a synthesis) -- CONFIRMED
- The stance is consistently "conclusions" (analytical with recommendations), not purely factual -- CONFIRMED, with appropriate prescriptive tone in the Recommendation Framework
- The fork success formula is consistently described across sections -- CONFIRMED

## Unverifiable Claims

1. **HashiCorp 1.5% QoQ customer growth drop** -- No accessible primary source found. Likely from an earnings call transcript or DramaFund analysis behind a paywall.

2. **"No hyperscaler has yet offered a fully AGPL-compliant competing service"** -- This is stated as a negative universal claim. It is directionally correct based on available evidence, but proving a negative is inherently difficult. The claim is well-hedged in the report ("hasn't materialized") which is appropriate.

3. **Revenue attribution to license choice** -- The report correctly identifies this as a limitation: "Hard to isolate license choice from other factors." The GitLab revenue example is presented suggestively, which is appropriate given the caveat, though the actual numbers need correction per Finding H1.
