# Evidence: Community Perception & Developer Sentiment

**Dimension:** Community Perception & Developer Sentiment
**Date:** 2026-04-11
**Sources:** HN threads, Reddit discussions, company blog posts, community forums

---

## Key sources referenced
- [HashiCorp BSL - HN](https://news.ycombinator.com/item?id=37081306)
- [Redis SSPL - HN](https://news.ycombinator.com/item?id=39772562)
- [Redis AGPL return - HN](https://news.ycombinator.com/item?id=43859446) (1,896 points, 789 comments)
- [Elasticsearch SSPL - HN](https://news.ycombinator.com/item?id=25776657) (298 points, 368 comments)
- ['Source available' is not open source - HN](https://news.ycombinator.com/item?id=46213709)
- [n8n "gaslighting" accusation - HN](https://news.ycombinator.com/item?id=32797853)
- [OpenTF fork announcement - HN](https://news.ycombinator.com/item?id=37262440)
- [PostHog OSS benefits](https://posthog.com/newsletter/open-source-benefits)
- [AGPL non-starter - OCV](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)
- [Anti-AGPL propaganda - Drew DeVault](https://drewdevault.com/2020/07/27/Anti-AGPL-propaganda.html)
- [Relicensing dynamics paper - arXiv](https://arxiv.org/abs/2411.04739)

---

## Findings

### Finding: License rug-pulls are irreversible reputational events
**Confidence:** CONFIRMED
**Evidence:** HashiCorp, Redis, Elastic HN threads

On Redis returning to AGPL: "They have lost my trust for good, and I will continue to use Redis forks." The phrase "fool me twice, shame on me" appeared repeatedly. Redis's AGPL return drew 1,896 HN points but dominant sentiment was skepticism, not celebration. Once trust breaks and a credible fork exists, relicensing back does not recover the community.

### Finding: The community enforces a hard line between "open source" and "source available"
**Confidence:** CONFIRMED
**Evidence:** HN threads on source availability, n8n criticism, NocoDB backlash

Developers tolerate honest proprietary licensing better than dishonest "open" branding. n8n's Sustainable Use License was immediately categorized by HN users as "proprietary." NocoDB's AGPL→SUL drew criticism on GitHub discussions and Cloudron forums. Key quote: "Source available licenses effectively prohibit borrowing code from the codebase for use in other projects, meaning the code doesn't become part of the shared open source ecosystem."

### Finding: AGPL creates a binary enterprise reaction — most ban it outright
**Confidence:** CONFIRMED
**Evidence:** Google AGPL policy, OCV blog, Heather Meeker analysis

Google has a company-wide AGPL prohibition. Many enterprises follow suit — "easier to ban AGPL entirely than to establish compliance frameworks." Counterpoint from Heather Meeker: corporate resistance may be declining for application-level software where compliance is simpler. Lago deliberately chose AGPL accepting the enterprise trade-off.

### Finding: Forks succeed when backed by foundation governance and hyperscaler sponsorship
**Confidence:** CONFIRMED
**Evidence:** OpenTofu, Valkey, OpenSearch, arXiv paper

Valkey: forked, released GA, accepted into Linux Foundation within 30 days. Nearly 50 contributing companies in year one. OpenTofu: donated to Linux Foundation under MPL 2.0 with neutral governance. Academic research: forks from relicensing "have more organizational diversity than the original projects, especially when created under a neutral foundation."

### Finding: Permissive licensing (MIT/Apache) is a measurable growth advantage
**Confidence:** CONFIRMED
**Evidence:** PostHog, choosealicense.com data, daily.dev survey

PostHog credits MIT as instrumental to first 1,000 users. MIT leads license adoption: 1.7M views on choosealicense.com vs 248K for Apache 2.0. Developers have a "strong BS detector" and open source is key to defusing it.

---

## Trust Hierarchy (confirmed by evidence)

1. **MIT/Apache/BSD** — Maximum trust, maximum adoption, zero extraction protection
2. **AGPL** — Respected as genuinely open source, but binary enterprise filter
3. **BSL/SSPL/Custom** — Universally rejected as "not open source"
4. **License switch (any direction)** — The act itself damages trust

---

## Gaps / follow-ups
* Quantitative contributor data by license type would strengthen the adoption velocity claim
* Long-term star growth rate comparison (AGPL vs MIT projects) not available
