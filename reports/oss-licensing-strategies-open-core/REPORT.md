---
title: "OSS Licensing Strategies for Open-Core Companies: License Selection, Community Dynamics, and Business Model Interplay"
description: "Comprehensive analysis of how open-core companies choose between MIT, Apache 2.0, AGPL, and source-available licenses. Covers 22 company case studies, community perception data from HN/Reddit, anti-commercialization strategies using OSI-approved licenses, the relicensing pattern and fork dynamics, and a decision framework for license selection."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - MIT License
  - Apache 2.0
  - AGPL-3.0
  - BSL
  - SSPL
  - Cal.com
  - Infisical
  - Supabase
  - PostHog
  - Lago
  - MinIO
  - GitLab
  - Sentry
  - Redis
  - Elastic
  - HashiCorp
  - MongoDB
  - n8n
  - Penpot
  - NocoDB
  - Twenty
  - Formbricks
  - CockroachDB
topics:
  - open source licensing
  - open core strategy
  - community perception
  - dual licensing
---

# OSS Licensing Strategies for Open-Core Companies

**Purpose:** Help Open Knowledge select the right OSI-approved license by understanding how license choice affects community adoption, developer perception, competitive moat, and business model flexibility — informed by the empirical record of 22+ companies that have already made this decision.

---

## Executive Summary

The open-core licensing landscape has converged on a clear pattern: **AGPL-3.0 with commercial dual licensing is the dominant strategy for server-side products that want genuine open-source credibility while maintaining a commercial moat.** This finding is supported by 22 company case studies, community sentiment data from HN/Reddit, and the cautionary tales of companies that chose differently and lived to regret it.

**Key Findings:**

- **MIT and Apache 2.0 maximize adoption velocity but provide zero protection against commercialization.** PostHog, Supabase, Infisical, and Medusa use permissive licenses as competitive weapons — but they accept the risk that cloud providers or competitors can freely wrap and resell their work.

- **AGPL-3.0 is the strongest OSI-approved anti-commercialization tool.** Its network clause (Section 13) forces competitors who modify and serve the software to release their entire codebase. In practice, this operates as a "poison pill" — enterprises avoid AGPL not because courts enforce it, but because corporate legal departments ban it preemptively. Google explicitly prohibits AGPL internally. This avoidance IS the dual-licensing revenue engine.

- **Companies that start with AGPL report no adoption problems.** Cal.com (~41K stars), Twenty (20K+ stars, 300+ contributors), Lago, and Formbricks all launched or switched to AGPL without measurable adoption damage. The key: AGPL is respected as genuinely open source by the developer community, unlike BSL or SSPL.

- **License changes are essentially irreversible reputational events.** Redis (BSD→SSPL→AGPL), Elastic (Apache→SSPL→AGPL), and HashiCorp (MPL→BSL) all suffered permanent community fractures. Successful forks (Valkey, OpenSearch, OpenTofu) formed within weeks. The act of switching itself damages trust — even when switching back. Starting right avoids this entirely.

- **MIT Expat is simply the MIT License.** The "Expat" qualifier is a disambiguation label, not a separate license. The SPDX identifier `MIT` refers to the Expat wording. Projects specifying "MIT Expat" (like Infisical) do so for historical clarity, with no practical difference.

---

## Research Rubric

**Report Type:** Comparative Analysis + Strategic Landscape
**Primary Question:** What license should an open-core company choose to maximize adoption and community trust while dissuading non-OSS competitors from commercializing the project — using a true OSI-approved license?
**Audience:** Founders/leadership making a licensing decision
**Stance:** Conclusions — includes a decision framework and recommendation

### Dimensions Investigated

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | License Mechanics & Legal Taxonomy | Deep | P0 |
| 2 | Company Case Studies (22 companies) | Deep | P0 |
| 3 | Community Perception & Developer Sentiment | Deep | P0 |
| 4 | Business Strategy & GTM Interplay | Deep | P0 |
| 5 | Anti-Commercialization via True OSS | Deep | P0 |
| 6 | The Relicensing Pattern | Deep | P0 |
| 7 | Source-Available Alternatives (context) | Moderate | P1 |
| 8 | CLA & Contributor Dynamics | Moderate | P1 |

---

## Detailed Findings

### 1. License Mechanics: What Each License Actually Does

**Finding:** The OSI-approved license spectrum for open-core companies has exactly three viable options, each with a distinct commercial profile.

**Evidence:** [evidence/license-mechanics-taxonomy.md](evidence/license-mechanics-taxonomy.md)

#### The Three Viable Options

| License | Copyleft Scope | Patent Grant | SaaS Clause | Anti-Commercialization |
|---------|---------------|-------------|-------------|----------------------|
| **MIT** | None | Implied only | No | None |
| **Apache 2.0** | None | Explicit + retaliation | No | None |
| **AGPL-3.0** | Full (network) | Yes (GPLv3 base) | Yes (Section 13) | Strong |

**MIT vs Apache 2.0:** The sole material difference is the patent grant. Apache 2.0 Section 3 provides explicit, perpetual, royalty-free patent rights from each contributor, plus a retaliation clause that terminates all rights if a licensee initiates patent litigation. MIT's "use, copy, modify" language may imply a patent grant but this is legally untested. For infrastructure software, Apache 2.0 is preferred for patent clarity.

**MIT Expat:** MIT and MIT Expat are the same license (CONFIRMED). The SPDX identifier `MIT` refers to the Expat variant. The "Expat" qualifier disambiguates from the older X11 License, which has slightly different wording. No strategic significance.

**AGPL-3.0:** Identical to GPLv3 with one addition — Section 13, the "Remote Network Interaction" clause. If you modify AGPL software and let users interact with it over a network, you must provide the corresponding source code. This closes the "ASP loophole" that makes GPL ineffective for SaaS: GPL defines copyleft as triggered by "distribution," and running software on a server is not distribution. AGPL makes network access equivalent to distribution.

**Why not GPL/LGPL:** GPL occupies a dead zone for SaaS businesses — it deters customers (copyleft scares enterprises) without deterring cloud competitors (no network clause). LGPL allows proprietary linking, removing the monetization lever entirely. Neither has a SaaS clause.

**Why not MPL 2.0:** File-level copyleft only. Modifications to existing files must be shared, but new files can be proprietary. A competitor can add proprietary features in new files and ship a closed product. HashiCorp used MPL for 9 years, then switched to BSL because MPL didn't prevent commercial competition. Penpot uses MPL-2.0 effectively as a design tool, but it's too weak for infrastructure anti-commercialization.

**Decision triggers:**
- If patent protection matters (infrastructure, AI/ML, databases) → Apache 2.0 or AGPL
- If anti-commercialization matters → AGPL is the only OSI-approved option
- If maximum adoption velocity is the sole priority → MIT

**Remaining uncertainty:**
- Zero case law on AGPL Section 13 scope in contested SaaS scenarios
- Whether "modification" includes configuration changes, plugin development, or only source code changes is legally ambiguous

---

### 2. Company Case Studies: 22 Companies, 22 Licensing Decisions

**Finding:** Companies cluster into four strategic archetypes based on their license choice, and the pattern is predictable from their product category and GTM motion.

**Evidence:** [evidence/company-case-studies.md](evidence/company-case-studies.md)

#### Archetype 1: Permissive Maximalists (MIT/Apache)

These companies use permissive licensing as a competitive weapon, accepting commercialization risk in exchange for maximum adoption velocity.

| Company | License | Strategy | Key Quote |
|---------|---------|----------|-----------|
| **PostHog** | MIT | Radical openness as GTM | "None of the multi-billion dollar OSS companies monetized in the first five years" |
| **Supabase** | Apache-2.0 | Philosophical commitment | "If someone is building a competitor and doing a better job, they deserve to win" |
| **Infisical** | MIT | Competitive wedge vs Vault BSL | MIT contrasts with HashiCorp's BSL; maximum trust in security-sensitive domain |
| **Medusa** | MIT | Anti-Shopify positioning | "No license fees, no per-transaction charges, no strings attached" |
| **Strapi** | MIT | Developer-first CMS | Textbook open-core: MIT core, proprietary enterprise features |
| **Hoppscotch** | MIT | Developer tool playbook | MIT for maximum adoption, enterprise behind paywall |
| **Appsmith** | Apache-2.0 | Maximum permissiveness | Platform adoption matters more than preventing forks |
| **OpenCode** | MIT | Pure positioning play | MIT + no subscription IS the product vs Claude Code/Cursor |
| **GitLab** | MIT (CE) | Buyer-based open core | Systematized: IC features open, management features paid |

**Pattern:** Permissive licenses dominate in developer tools, libraries, and platforms where bottom-up PLG adoption is the primary growth lever. These companies monetize through cloud hosting (Supabase, Medusa), enterprise features (GitLab, Strapi, Infisical), or ecosystem influence (OpenCode).

#### Archetype 2: AGPL Defenders

These companies use AGPL specifically to prevent SaaS commercialization while maintaining genuine open-source credibility.

| Company | License | Strategy | Key Quote |
|---------|---------|----------|-----------|
| **Cal.com** | AGPLv3 | Anti-big-tech protection | "Protect the community from open source projects being devoured by big tech" |
| **Lago** | AGPLv3 | Prevent SaaS cloning | Cited Airbyte's experience with competitors cloning MIT code |
| **Twenty** | AGPLv3 | Anti-lock-in narrative | "You own, not rent, the software" — counter-Salesforce |
| **Formbricks** | AGPLv3 | SaaS competition defense | AGPL ensures competitors can't offer closed-source managed version |
| **MinIO** | AGPLv3 | Cloud provider defense | Moved from Apache when cloud providers commoditized storage |

**Also notable:** **Penpot** uses MPL-2.0 — a weaker copyleft that provides file-level protection while maintaining genuine open-source credibility as the "truly open Figma alternative." MPL works for Penpot because their primary threat isn't SaaS wrapping but rather wholesale code absorption.

**Pattern:** AGPL is chosen by server-side products where the primary competitive threat is a cloud provider or competitor wrapping the code as a managed service. All AGPL companies in this dataset pair it with commercial licensing for enterprises that need copyleft exemption.

#### Archetype 3: Source-Available Pragmatists

These companies concluded that OSI-approved licenses were insufficient and adopted source-available (non-OSS) licenses.

| Company | License | Previous | Why They Switched |
|---------|---------|----------|-------------------|
| **Sentry** | FSL | BSD → BSL | "Funded businesses plagiarizing our work to directly compete" |
| **Airbyte** | ELv2 | MIT | "Competitors taking community work and reselling as managed service" |
| **CockroachDB** | BSL → proprietary | Apache-2.0 | "The norm that companies could build on strong OSS no longer holds" |
| **n8n** | SUL (fair-code) | Apache+CC | "Created ambiguity and confusion" — clarified restrictions |
| **Directus** | BSL 1.1 | GPL-3.0 | "GitHub Sponsors provided only ~1% of maintenance costs" |
| **Nango** | ELv2 | — | Prevents managed service competition |

**Pattern:** Source-available licenses are adopted by companies that experienced or anticipated direct commercial competition from cloud providers or funded competitors. Every one of these changes generated community criticism, ranging from mild (Airbyte) to severe (CockroachDB).

#### Archetype 4: The Relicensing Casualties

Companies that changed licenses and suffered community fracture.

| Company | Journey | Fork | Outcome |
|---------|---------|------|---------|
| **HashiCorp** | MPL → BSL | OpenTofu (Linux Foundation) | 9.8M downloads, 300% annual growth; IBM acquired HashiCorp |
| **Redis** | BSD → SSPL → +AGPL | Valkey (Linux Foundation) | 83% of large users adopted/explored Valkey; damage permanent |
| **Elastic** | Apache → SSPL/ELv2 → +AGPL | OpenSearch (Linux Foundation) | 496 contributors, 100M+ downloads Y1; community trust not recovered |
| **MongoDB** | AGPL → SSPL | No major fork | Commercially successful; no fork because mostly internal dev |
| **NocoDB** | AGPL → SUL | TBD | Backlash ongoing; community flagging "no longer open source" |

**Pattern:** The fork success formula is predictable: (1) neutral foundation governance, (2) organizational diversity, (3) hyperscaler sponsorship, (4) pre-existing external contributor base. MongoDB survived without a fork because development was primarily internal. Every other major relicensing with external contributors triggered a fork.

---

### 3. Community Perception: The Trust Hierarchy

**Finding:** Developer communities enforce a clear, consistent hierarchy of license credibility, and license changes are a one-way reputational door.

**Evidence:** [evidence/community-perception.md](evidence/community-perception.md)

#### The Trust Hierarchy

```
MIT / Apache / BSD          ████████████████████████  Maximum trust
                            "Truly open source"       Maximum adoption
                            Zero extraction protection

AGPL-3.0                    ██████████████████        Respected as genuine OSS
                            Enterprise friction        Anti-extraction tool
                            (banned at Google)         Dual licensing engine

BSL / SSPL / SUL / FSL      ████████                  "Source available, NOT open source"
                            Community pushback         Fork risk
                            Mislabeling causes anger   Commercial control

License change (any dir.)   ████                      Trust damage
                            One-way door               Irreversible
```

**Key community dynamics:**

1. **The labeling matters more than the terms.** Developers tolerate honest proprietary licensing better than dishonest "open" branding. n8n calling fair-code "open source" triggered more anger than the license terms themselves. NocoDB's SUL drew criticism specifically for marketing as open source.

2. **AGPL is respected, not loved.** The developer community consistently treats AGPL as genuine open source (unlike BSL/SSPL), but acknowledges the enterprise friction. Drew DeVault's influential "Anti-AGPL propaganda" post argues the anti-AGPL stance is manufactured by corporate interests, not by developers.

3. **Relicensing back doesn't recover trust.** Redis's return to AGPL drew 1,896 HN upvotes but the dominant sentiment was "too late, using Valkey now." Elastic's AGPL addition got the response: "Developers burned by Elasticsearch's license change aren't going back."

4. **Forks are the community's enforcement mechanism.** OpenTofu, Valkey, and OpenSearch all reached significant traction within months. Foundation governance accelerates fork legitimacy. The fork threat is now credible and fast enough to be existential for any project with a large contributor base.

**Decision triggers:**
- If developer trust and "open source" branding matter → MIT, Apache, or AGPL only
- If you might need to change licenses later → start with AGPL (stricter is easier to relax than to tighten)
- If your community already exists and you're considering a license change → extreme caution; the act itself causes damage

---

### 4. Business Strategy & GTM: License as Growth Lever

**Finding:** License choice should match the GTM motion — bottom-up PLG favors permissive; enterprise/infrastructure sales can tolerate or benefit from AGPL.

**Evidence:** [evidence/business-strategy-gtm.md](evidence/business-strategy-gtm.md)

#### License → GTM Alignment Matrix

| GTM Motion | Best License | Why | Examples |
|------------|-------------|-----|----------|
| **Bottom-up PLG** (developer tool, library) | MIT or Apache 2.0 | Maximum adoption velocity; developers recommend freely; zero procurement friction | PostHog, Supabase, OpenCode |
| **Developer-led, enterprise-sold** (platform, infrastructure) | AGPL + commercial | AGPL creates natural conversion trigger; enterprise legal teams force commercial license purchase | MinIO, Cal.com, Lago |
| **Top-down enterprise** (database, security) | AGPL + commercial or BSL | Enterprise buyers expect to pay; license friction is acceptable because the buyer is ops/platform teams | CockroachDB (BSL), Infisical (MIT as wedge) |

#### The AWS Problem

Cloud providers (AWS, GCP, Azure) create managed versions of OSS with minimal author contribution. This is the single most cited reason for restrictive relicensing:

- **Amazon ElastiCache** commoditized Redis → Redis switched to SSPL → Valkey fork
- **Amazon OpenSearch** forked Elasticsearch → Elastic switched to SSPL/ELv2
- **Amazon DocumentDB** competed with MongoDB → MongoDB created SSPL

**AGPL's effectiveness against cloud providers:** No hyperscaler has yet offered a fully AGPL-compliant competing service. The theoretical risk (AWS could open-source its stack and comply) hasn't materialized because open-sourcing proprietary infrastructure is unacceptable to cloud providers. AGPL is necessary but not absolute protection — the real moat is innovation velocity, brand, and ecosystem, not the license text alone.

#### Dual Licensing Economics

AGPL + commercial dual licensing is the dominant monetization pattern for infrastructure-layer open-core:

- **GitLab:** MIT CE + proprietary EE → ~$580M FY2024 revenue (~37% YoY growth). Open-source contributors grew 34.6% over 3 years.
- **MinIO:** AGPL + commercial → raised Series B while AGPL-licensed.
- **MySQL:** GPL + commercial → Oracle maintains this model for proprietary embedding.

The dual-license model works when the product is infrastructure that gets embedded: AGPL's network clause forces commercial license purchases from SaaS deployers.

#### Open Core Boundary: The Buyer-Based Model

The industry standard for open-core boundary definition, systematized by GitLab CEO Sid Sijbrandij:

- **Open (AGPL/MIT):** Individual contributor features — the core product that developers evaluate and advocate for
- **Paid (proprietary):** Management/executive features — SSO, RBAC, audit logs, compliance, advanced access controls

GitLab's explicit commitment: features only move down tiers (from paid to free), never up. This builds lasting community trust in the open-core boundary.

**The "crippled core" antipattern:** Making the free version deliberately bad to force upgrades destroys community trust and adoption. The free tier must be genuinely useful.

---

### 5. Anti-Commercialization: AGPL as the OSI-Approved Moat

**Finding:** AGPL-3.0 with commercial dual licensing is the optimal strategy for companies that want genuine open-source credibility while preventing competitor commercialization.

**Evidence:** [evidence/anti-commercialization.md](evidence/anti-commercialization.md)

#### How AGPL Works as a Commercial Moat

```
Competitor wants to offer your software as a SaaS
                    │
                    ▼
        ┌─── Is the code AGPL? ───┐
        │                         │
       Yes                        No (MIT/Apache)
        │                         │
        ▼                         ▼
  Must they release              Free to wrap and
  their entire source?           resell, no obligations
        │
        ▼
  ┌── Will they? ──┐
  │                │
  No               Yes (unlikely)
  │                │
  ▼                ▼
  Must buy         Fully open
  commercial       competitor
  license          (acceptable)
  │
  ▼
  Revenue for you
```

The mechanism: AGPL's commercial value comes from being *avoided*, not *enforced*. Google and many enterprises ban AGPL internally. Companies that need the software but cannot comply with AGPL's copyleft obligations purchase a commercial license. This is the dual-licensing revenue engine.

#### AGPL vs BSL: The Scope Gap

| Attribute | AGPL | BSL |
|-----------|------|-----|
| OSI-approved | Yes | No |
| Community perception | "Genuine open source" | "Not open source" |
| Protection mechanism | "Compete, but open your source too" | "Don't compete at all" |
| Fork risk | Low (OSI-approved) | High (community fracture) |
| Enforcement history | Minimal case law | Untested |
| Practical effect | Deterrent via corporate avoidance | Prohibition via license terms |

The gap: a well-resourced competitor could theoretically comply with AGPL and still compete by releasing their source. In practice, this hasn't happened — no hyperscaler has offered a fully AGPL-compliant competing service, because open-sourcing their proprietary stack is unacceptable to them.

**BSL is only necessary if you believe a well-resourced competitor would comply with AGPL and still compete.** This theoretical risk has not materialized in any documented case.

#### The CLA Requirement

Dual licensing requires consolidated copyright ownership — only the copyright holder can offer alternative license terms. This means CLAs from all contributors. The community often views CLAs with suspicion because they enable unilateral relicensing (HashiCorp used CLA-granted rights to relicense from MPL to BSL).

**Alternatives:**
- **DCO (Developer Certificate of Origin):** Provides legal clarity without granting relicensing rights. Cannot enable dual licensing.
- **CLA with relicensing restrictions:** Some CLAs explicitly limit what the company can do with contributed code. Less common but more community-friendly.
- **Foundation-held copyright:** Copyright held by a neutral foundation (Linux Foundation, Apache Foundation) prevents unilateral relicensing. Limits commercial flexibility.

---

### 6. The Relicensing Pattern: Cautionary Tales

**Finding:** Every major relicensing from permissive to restrictive has caused community damage. Starting with the right license avoids this entirely.

**Evidence:** [evidence/relicensing-patterns.md](evidence/relicensing-patterns.md)

#### The Predictable Sequence

```
1. Company launches with permissive license (MIT/Apache/BSD)
2. Product gains traction; cloud providers notice
3. AWS/GCP/Azure offer managed version; competitors clone
4. Company relicenses to BSL/SSPL
5. Community backlash + foundation-backed fork
6. Company may reverse to AGPL — but damage is done
```

This exact sequence played out for Redis (2024-2025), Elastic (2021-2024), and HashiCorp (2023-2024). The only company that avoided a fork was MongoDB (2018), because most development was internal — there was no external contributor base to walk.

#### Fork Success Prediction

| Factor | Fork Succeeds | Fork Fails |
|--------|--------------|------------|
| Foundation governance | Linux Foundation from day 1 | Single company stewardship |
| Contributor diversity | 10+ contributing organizations | Mostly internal development |
| Hyperscaler backing | AWS/Google/Oracle sponsor | No major backer |
| External contributors | Large external contributor base | Primarily internal development |

**The lesson:** If your project has significant external contributors and you relicense restrictively, expect a fork. If development is mostly internal, you have more licensing flexibility — but less community goodwill.

#### Starting Right vs. Changing Later

| Strategy | Risk Profile |
|----------|-------------|
| Start AGPL, relax later | Low risk — community welcomes loosening |
| Start MIT/Apache, tighten later | High risk — community treats as betrayal |
| Start AGPL, stay AGPL | Lowest risk — no change, no drama |
| Start MIT, stay MIT | Commercially risky but community-safe |

Redis, Elastic, and HashiCorp all demonstrate that **starting with AGPL would have avoided their crises entirely.** Cal.com, which switched from MIT to AGPL early (2021), experienced no significant backlash because the project was young and the rationale was clear.

---

### 7. Source-Available Alternatives (Context)

**Finding:** BSL, SSPL, ELv2, SUL/fair-code, and FSL provide stronger commercial protection than AGPL but sacrifice OSI "open source" status, which carries real brand and adoption costs.

**Evidence:** [evidence/license-mechanics-taxonomy.md](evidence/license-mechanics-taxonomy.md), company case studies

| License | Creator | Mechanism | OSI? | Converts to OSS? |
|---------|---------|-----------|------|-------------------|
| **BSL 1.1** | MariaDB | Restricts production use; converts to permissive after 3-4 years | No | Yes (Apache/GPL after N years) |
| **SSPL** | MongoDB | Requires releasing entire service stack source | No | No |
| **ELv2** | Elastic | Restricts offering as managed service | No | No |
| **SUL** | n8n | Restricts to "internal business purposes" | No | No |
| **FSL** | Sentry | Non-compete + converts to MIT/Apache after 2 years | No | Yes (after 2 years) |

These are ruled out for Open Knowledge per the stated requirement for a "proper OSS license." They are documented here for context — understanding why companies move to source-available helps explain why AGPL is the optimal true-OSS alternative.

---

### 8. CLA & Contributor Dynamics

**Finding:** CLAs are the legal prerequisite for dual licensing but create community trust deficits. The choice is a strategic tradeoff, not a best practice.

**Evidence:** [evidence/business-strategy-gtm.md](evidence/business-strategy-gtm.md), [evidence/relicensing-patterns.md](evidence/relicensing-patterns.md)

**The CLA paradox:**
- Dual licensing (AGPL + commercial) requires consolidated copyright → requires CLAs
- CLAs enable unilateral relicensing → community views with suspicion
- HashiCorp used CLA-granted rights to relicense from MPL to BSL → OpenTofu fork

**Practical recommendation:** If choosing AGPL + commercial dual licensing, a CLA is required. Mitigate community concern by:
1. Being transparent about why the CLA exists (dual licensing, not future relicensing)
2. Limiting CLA scope if possible (no broader than needed for dual licensing)
3. Publishing a public commitment about license stability (GitLab's stewardship model)
4. Considering a "promise not to relicense" alongside the CLA

---

## Recommendation Framework

### For Open Knowledge Specifically

Given Open Knowledge's position — a CRDT collaboration server + editor, open-core model, wanting genuine OSS status while dissuading non-OSS commercialization:

**Recommended: AGPLv3 with commercial dual licensing**

| Factor | Assessment |
|--------|-----------|
| **Product type** | Server-side infrastructure (CRDT server) — AGPL's network clause directly applies |
| **Competitor threat** | Cloud providers or SaaS competitors could wrap and resell — AGPL prevents this |
| **GTM motion** | Developer-led adoption → enterprise conversion — AGPL creates natural conversion trigger |
| **Community credibility** | "Truly open source" claim is defensible and valued by HN/Reddit audience |
| **Precedent** | Cal.com, Lago, Twenty, Formbricks all use AGPL successfully in similar categories |
| **CLA required** | Yes — for dual licensing. Mitigate with transparency and stewardship commitment |

**Open core boundary (buyer-based model):**
- **AGPL (free):** Core CRDT server, editor, MCP integration, single-user features
- **Commercial license:** SSO/SAML, RBAC, audit logs, team management, enterprise compliance

**Why not MIT/Apache:** Open Knowledge is server-side infrastructure that could be trivially wrapped as a managed service. Permissive licensing provides zero protection against this. Supabase and PostHog can afford MIT because they have massive funding and brand moats; for a smaller company, the risk is higher.

**Why not BSL/SSPL:** The user explicitly wants a "proper OSS license." Source-available licenses sacrifice the "open source" brand signal that matters for developer adoption and HN/Reddit credibility. The evidence shows AGPL provides sufficient anti-commercialization for practical purposes.

### General Decision Tree

```
Q1: Is your product primarily server-side (SaaS, API, infrastructure)?
├── Yes → Q2
└── No (library, CLI, SDK) → MIT or Apache 2.0

Q2: Do you need protection against SaaS commercialization?
├── Yes → Q3
└── No → Apache 2.0 (patent grant is valuable for infrastructure)

Q3: Must the license be OSI-approved?
├── Yes → AGPL-3.0 + commercial dual license
└── No → BSL or FSL (but accept community perception cost)

Q4: Will you require a CLA from contributors?
├── Yes (needed for dual licensing) → Be transparent; publish stewardship commitment
└── No → AGPL without dual licensing (copyleft protection, no commercial tier)
```

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Quantitative adoption data by license type:** No comprehensive dataset exists comparing GitHub star growth rates, npm download velocity, or contributor counts by license type. Evidence is anecdotal from individual companies.
- **AGPL enforcement case law:** Zero contested court rulings on Section 13 scope in SaaS contexts. The legal landscape is theoretical.
- **Revenue impact of license choice:** Hard to isolate license choice from other factors (product quality, timing, funding, market). GitLab's revenue data is suggestive but not conclusive.
- **Grafana and Plausible Analytics:** Both use AGPL successfully but were not deeply researched in this pass.

### Out of Scope (per Rubric)

- Legal advice or license text drafting
- Tax or corporate structure implications
- License compliance tooling
- First-party analysis of Open Knowledge's codebase

---

## References

### Evidence Files
- [evidence/license-mechanics-taxonomy.md](evidence/license-mechanics-taxonomy.md) — License mechanics, OSI criteria, ASP loophole, patent grants
- [evidence/company-case-studies.md](evidence/company-case-studies.md) — 22 company profiles with license evolution timelines
- [evidence/community-perception.md](evidence/community-perception.md) — HN/Reddit sentiment data, trust hierarchy, fork dynamics
- [evidence/business-strategy-gtm.md](evidence/business-strategy-gtm.md) — Adoption velocity, dual licensing economics, open core boundaries
- [evidence/anti-commercialization.md](evidence/anti-commercialization.md) — AGPL enforcement, dual licensing mechanics, MPL inadequacy
- [evidence/relicensing-patterns.md](evidence/relicensing-patterns.md) — Major relicensing events timeline, fork success formula

### External Sources
- [Open Source Definition — OSI](https://opensource.org/osd)
- [AGPL-3.0 full text — FSF](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [Apache License 2.0 full text](https://www.apache.org/licenses/LICENSE-2.0)
- [Cal.com AGPL announcement](https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition)
- [Lago: Why we chose AGPLv3](https://getlago.com/blog/open-source-licensing-and-why-lago-chose-agplv3)
- [PostHog: Open source business models](https://posthog.com/blog/open-source-business-models)
- [Supabase: Why open source](https://paul.copplest.one/blog/why-open-source.html)
- [Sentry: Introducing the FSL](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)
- [n8n: Sustainable Use License](https://blog.n8n.io/announcing-new-sustainable-use-license/)
- [Redis: AGPLv3 announcement](https://redis.io/blog/agplv3/)
- [Elastic: AGPL announcement](https://ir.elastic.co/news/news-details/2024/Elastic-Announces-Open-Source-License-for-Elasticsearch-and-Kibana-Source-Code/default.aspx)
- [HashiCorp licensing FAQ](https://www.hashicorp.com/en/license-faq)
- [MongoDB SSPL FAQ](https://www.mongodb.com/legal/licensing/server-side-public-license/faq)
- [Google AGPL Policy](https://opensource.google/documentation/reference/using/agpl-policy)
- [Open Core Ventures: AGPL non-starter](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)
- [Drew DeVault: Anti-AGPL propaganda](https://drewdevault.com/2020/07/27/Anti-AGPL-propaganda.html)
- [ParadeDB: Why we picked AGPL](https://www.paradedb.com/blog/agpl)
- [Relicensing dynamics — arXiv](https://arxiv.org/abs/2411.04739)
- [CHAOSS: What happens to relicensed projects](https://chaoss.community/what-happens-to-relicensed-open-source-projects-and-their-forks/)
- [MinIO AGPL announcement](https://www.min.io/blog/from-open-source-to-free-and-open-source-minio-is-now-fully-licensed-under-gnu-agplv3)
- [OCV open-core handbook](https://handbook.opencoreventures.com/open-core-business-model/)
- [a16z: Growth+Sales GTM](https://a16z.com/growthsales-the-new-era-of-enterprise-go-to-market/)
- [Directus: Why we are relicensing](https://directus.io/blog/why-we-are-relicensing-directus)
- [NocoDB license discussion](https://github.com/nocodb/nocodb/discussions/12891)
- [Formbricks license docs](https://formbricks.com/docs/self-hosting/advanced/license)
- [Twenty Launch HN](https://news.ycombinator.com/item?id=36791434)
