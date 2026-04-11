# Evidence: Business Strategy & GTM Interplay

**Dimension:** Business Strategy & GTM Interplay
**Date:** 2026-04-11
**Sources:** a16z, Open Core Ventures, VC blogs, company revenue data, industry surveys

---

## Key sources referenced
- [MIT/Apache lead OSS licensing 2025](https://linuxiac.com/mit-and-apache-2-0-lead-open-source-licensing-in-2025/)
- [Google AGPL Policy](https://opensource.google/documentation/reference/using/agpl-policy)
- [AGPL non-starter - OCV](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)
- [Redis vs Valkey 2026](https://dev.to/synsun/redis-vs-valkey-in-2026-what-the-license-fork-actually-changed-1kni)
- [Elastic revenue data](https://www.infoq.com/news/2024/09/elastic-open-source-agpl/)
- [GitLab revenue](https://www.macrotrends.net/stocks/charts/GTLB/gitlab/revenue)
- [MinIO commercial license](https://www.min.io/commercial-license)
- [Growth+Sales era of GTM - a16z](https://a16z.com/growthsales-the-new-era-of-enterprise-go-to-market/)
- [Open Core business model - OCV handbook](https://handbook.opencoreventures.com/open-core-business-model/)
- [Dual licensing explained - TermsFeed](https://www.termsfeed.com/blog/dual-license-open-source-commercial/)

---

## Findings

### Finding: MIT/Apache account for 60%+ of all OSS projects; AGPL is growing in commercial segments
**Confidence:** CONFIRMED
**Evidence:** [Linuxiac 2025 survey](https://linuxiac.com/mit-and-apache-2-0-lead-open-source-licensing-in-2025/), [OSI 2025 report](https://opensource.org/blog/top-open-source-licenses-in-2025)

Permissive licenses dominate volume. But several infrastructure companies have migrated TO AGPL: OpenObserve (2023), ZITADEL, MinIO (2019-2021), Grafana, Plausible. ~35% of AI startups now use some open-core variation, up from 18% in 2019.

### Finding: AGPL banned at Google creates natural commercial licensing funnel
**Confidence:** CONFIRMED
**Evidence:** [Google AGPL policy](https://opensource.google/documentation/reference/using/agpl-policy), [Vaultinum compliance guide](https://vaultinum.com/blog/essential-guide-to-agpl-compliance-for-tech-companies)

Google bans AGPL internally. Many enterprises follow. One documented case: mid-size SaaS company spent $300K and 3 months rewriting code after discovering AGPL library usage. OCV (Sid Sijbrandij's fund) officially prefers MIT-licensed projects. AGPL as open-source tier IS the commercial sales funnel — enterprises who need the software buy commercial licenses to avoid compliance.

### Finding: AGPL is necessary but insufficient against cloud providers
**Confidence:** CONFIRMED
**Evidence:** Redis/Valkey, Elastic/OpenSearch, AWS DocumentDB

83% of large Redis users adopted or tested Valkey after SSPL switch. Elastic returned to AGPL but stock never recovered ($186 peak vs ~$48 in 2026). AWS pattern: fork under permissive license, offer as managed service. Real moat is innovation velocity and brand, not license text. However: no hyperscaler has yet offered a fully AGPL-compliant competing service — the theoretical risk hasn't materialized.

### Finding: AGPL + commercial dual licensing is dominant for infrastructure companies
**Confidence:** CONFIRMED
**Evidence:** MinIO, GitLab, MySQL/Oracle examples

GitLab: MIT CE + proprietary EE, revenue ~$424M→~$580M FY2023→FY2024 (~37% YoY). MinIO: AGPL + commercial, raised Series B while AGPL-licensed. MySQL: GPL + commercial (Oracle). Critical prerequisite: company must own copyright to all code (CLA required).

### Finding: CLAs enable relicensing but destroy community trust
**Confidence:** CONFIRMED
**Evidence:** HashiCorp, Elastic, Redis relicensing events

HashiCorp required CLAs from all Terraform contributors, then used those rights to relicense to BSL. OpenTofu fork followed within weeks. Pattern: CLA → relicensing → community fork. Middle path: DCO (Developer Certificate of Origin) provides legal clarity without granting relicensing rights.

### Finding: Buyer-based open core boundary is the industry standard
**Confidence:** CONFIRMED
**Evidence:** [OCV handbook](https://handbook.opencoreventures.com/open-core-business-model/), GitLab stewardship model

IC-facing features stay open; management-facing features (audit logs, SSO, RBAC, compliance) go proprietary. Sarah Novotny: "If you put too much in the core, you risk undermining your monetization strategy. Too little, and you fail to attract a community." "Crippled core" antipattern destroys community trust and adoption.

### Finding: License choice should match GTM motion
**Confidence:** INFERRED
**Evidence:** [a16z GTM analysis](https://a16z.com/growthsales-the-new-era-of-enterprise-go-to-market/), company case studies

Bottom-up PLG (developer tools, libraries) favors permissive (MIT/Apache) — maximize funnel. Top-down enterprise sales (infrastructure, databases) can tolerate or benefit from AGPL — copyleft creates conversion trigger. Product quality and positioning may matter more than license text (Grafana, MinIO, Plausible built strong communities despite AGPL).

---

## Gaps / follow-ups
* Hard conversion rate data (OSS user → paid customer) by license type not available
* Long-term revenue comparison of AGPL vs MIT open-core companies would be valuable
