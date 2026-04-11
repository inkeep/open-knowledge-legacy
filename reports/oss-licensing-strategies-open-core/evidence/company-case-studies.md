# Evidence: Company Case Studies — License Evolution

**Dimension:** Company Case Studies
**Date:** 2026-04-11
**Sources:** Company blogs, GitHub repos, HN threads, TechCrunch, community forums

---

## Key sources referenced
- [Cal.com AGPL announcement](https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition)
- [Lago AGPL blog post](https://getlago.com/blog/open-source-licensing-and-why-lago-chose-agplv3)
- [PostHog OSS benefits](https://posthog.com/newsletter/open-source-benefits)
- [PostHog business models](https://posthog.com/blog/open-source-business-models)
- [Supabase philosophy](https://paul.copplest.one/blog/why-open-source.html)
- [MinIO AGPL announcement](https://www.min.io/blog/from-open-source-to-free-and-open-source-minio-is-now-fully-licensed-under-gnu-agplv3)
- [Sentry BSL announcement](https://blog.sentry.io/relicensing-sentry/)
- [Sentry FSL announcement](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)
- [n8n SUL announcement](https://blog.n8n.io/announcing-new-sustainable-use-license/)
- [Directus BSL blog](https://directus.io/blog/why-we-are-relicensing-directus)
- [NocoDB license discussion](https://github.com/nocodb/nocodb/discussions/12891)
- [Twenty Launch HN](https://news.ycombinator.com/item?id=36791434)
- [Formbricks license docs](https://formbricks.com/docs/self-hosting/advanced/license)
- [Airbyte ELv2 blog](https://airbyte.com/blog/move-to-elv2)

---

## Company License Map (22 companies)

| Company | Category | Current License | Previous License | Year Changed | OSI? |
|---------|----------|----------------|-----------------|-------------|------|
| Cal.com | Scheduling | AGPLv3 | MIT | 2021 | Yes |
| Infisical | Secrets | MIT | — | — | Yes |
| Supabase | BaaS | Apache-2.0 | — | — | Yes |
| PostHog | Analytics | MIT | — | — | Yes |
| Lago | Billing | AGPLv3 | — | — | Yes |
| MinIO | Storage | AGPLv3 | Apache-2.0 | 2019-2021 | Yes |
| GitLab | DevOps | MIT (CE) | — | — | Yes |
| Sentry | Monitoring | FSL | BSD → BSL | 2019, 2023 | No |
| Airbyte | Data | ELv2 | MIT | 2021 | No |
| CockroachDB | Database | BSL → proprietary | Apache-2.0 | 2019, 2024 | No |
| n8n | Workflow | SUL (fair-code) | Apache+CC | 2022 | No |
| Penpot | Design | MPL-2.0 | — | — | Yes |
| NocoDB | Database | SUL | AGPLv3 | 2026 | No |
| Strapi | CMS | MIT | — | — | Yes |
| Directus | CMS | BSL 1.1 | GPL-3.0 | 2023 | No |
| Twenty | CRM | AGPLv3 | — | — | Yes |
| Hoppscotch | API Client | MIT | — | — | Yes |
| Formbricks | Surveys | AGPLv3 | — | — | Yes |
| Appsmith | Low-code | Apache-2.0 | — | — | Yes |
| OpenCode | AI Coding | MIT | — | — | Yes |
| Nango | Integrations | ELv2 | — | — | No |
| Medusa | Commerce | MIT | — | — | Yes |

---

## Findings by License Strategy

### Finding: AGPL-from-day-one companies report no adoption problems
**Confidence:** CONFIRMED
**Evidence:** Cal.com, Lago, Twenty, Formbricks case studies

Cal.com (AGPLv3 since 2021, post-MIT), Lago (AGPLv3 from launch), Twenty (AGPLv3 from launch, 20K+ stars, 300+ contributors), and Formbricks (AGPLv3 from launch) all demonstrate healthy adoption with AGPL. Key factor: AGPL is paired with clear enterprise licensing for features that matter to organizations (SSO, RBAC, audit logs).

### Finding: MIT/Apache companies use permissive licensing as a competitive wedge
**Confidence:** CONFIRMED
**Evidence:** Infisical, PostHog, Supabase, Medusa case studies

Infisical launched MIT specifically to contrast with HashiCorp Vault's BSL. PostHog chose MIT because "enterprises have rules against non-permissive licenses." Supabase's founder stated "if someone is building a competitor and doing a better job, they deserve to win." Medusa uses MIT as a weapon against Shopify's per-transaction fees.

### Finding: License changes universally damage trust, regardless of direction
**Confidence:** CONFIRMED
**Evidence:** MinIO (Apache→AGPL, polarized), Sentry (BSD→BSL→FSL, ongoing criticism), Airbyte (MIT→ELv2, largely understood), CockroachDB (Apache→BSL→proprietary, fork), n8n (Apache+CC→SUL, "gaslighting" accusation), NocoDB (AGPL→SUL, backlash), Directus (GPL→BSL, criticism)

Every license change in the dataset generated some community friction. The severity varies: Airbyte's was mild (early-stage, clear rationale), CockroachDB's was severe (complete arc to proprietary). But no company changed license without cost.

### Finding: The "buyer-based" open core boundary is the industry standard
**Confidence:** CONFIRMED
**Evidence:** GitLab, Infisical, Strapi, Hoppscotch, Formbricks, Appsmith case studies

GitLab systematized it: IC features open, manager/executive features paid. Every open-core company in this dataset follows the same pattern: core product functionality is free/open; SSO, RBAC, audit logs, advanced access controls are paid.

### Finding: Sentry's three-license evolution (BSD→BSL→FSL) is the most instructive arc
**Confidence:** CONFIRMED
**Evidence:** [Sentry BSL blog](https://blog.sentry.io/relicensing-sentry/), [Sentry FSL blog](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)

Each change responded to a specific failure mode: BSD allowed freeloading competitors; BSL was too broad and brand-damaging; FSL refined to a 2-year conversion with clearer non-compete scope. FSL is source-available, not OSS, but the shorter conversion window (2 years vs BSL's 3) was received somewhat more warmly.

---

## Gaps / follow-ups
* Revenue data for AGPL companies vs MIT companies would strengthen the analysis
* Contributor count comparison by license type would be valuable
* Grafana (AGPLv3) and Plausible Analytics (AGPLv3) not covered but worth investigating
