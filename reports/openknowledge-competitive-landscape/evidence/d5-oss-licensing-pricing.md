---
title: "D5: OSS Status, Licensing & Pricing -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D5: OSS Status, Licensing & Pricing -- Cross-Competitor Evidence

## License Comparison

| Competitor | Core License | Self-Hosted? | OSS Classification |
|---|---|---|---|
| Notion | Proprietary SaaS | No | Closed source |
| Confluence | Proprietary SaaS + Data Center (EOL 2029) | DC only (EOL March 2029) | Closed source; Rovo MCP Server is Apache-2.0 |
| Obsidian | Proprietary (source closed) | Yes (local app) | Free to use, not open source; plugins are OSS (MIT/GPL) |
| Mintlify | Proprietary SaaS | No | Closed source; periphery (starter, components) are MIT |
| Outline | BSL 1.1 (source-available) | Yes (Docker) | NOT open source per OSI. Cannot offer as hosted "Document Service." Converts to Apache-2.0 on change date (2030-03-18 for v1.6.1). Pre-v0.40.0 was MIT. |
| AFFiNE | MIT | Yes (Docker) | Fully open source. BlockSuite reusable as standalone toolkit. |
| Chroma | Apache 2.0 | Yes (local/server) | Fully open source. 27.1K stars, 164 contributors. |

Sources: [Outline LICENSE](https://github.com/outline/outline/blob/main/LICENSE), [AFFiNE GitHub](https://github.com/toeverything/AFFiNE), [Chroma GitHub](https://github.com/chroma-core/chroma), [Obsidian License](https://obsidian.md/license)

## Pricing Comparison

### SaaS / Cloud Pricing (Per User/Month, Annual Billing)

| Competitor | Free Tier | Mid Tier | Business/Team Tier | Enterprise |
|---|---|---|---|---|
| Notion | $0 (limited blocks) | $10 (Plus) | $20 (Business, includes AI) | Custom |
| Confluence | $0 (10 users, 2 GB) | $6.05-6.40 (Standard) | $11.55-12.30 (Premium) | Custom |
| Obsidian | $0 (core app) | N/A | N/A | N/A |
| Mintlify | $0 (Hobby, no AI) | N/A ($0-to-$250 cliff) | $250/mo flat (Pro, 5 editors) | Custom (~$600-2,000+/mo) |
| Outline | $10 (Starter, 1-10 users) | $79 (Team, 11-100) | $249 (Business, 101-200) | Custom |
| AFFiNE | $0 (10 GB, 3 members) | $6.75/mo (Pro) | Coming soon (Team) | Custom |
| Chroma | $0 ($5 free credits) | $250/mo (Team, $100 credits) | N/A | Custom |

### Obsidian Paid Services

| Service | Price | What It Provides |
|---|---|---|
| Sync | $4-10/mo | Cross-device vault sync, E2E encrypted, 1-10 GB |
| Publish | $8-16/mo | Published website from vault notes |
| Catalyst | $25+ one-time | Early access, community badge |

~80% of Obsidian's ~$25M ARR comes from Sync.

Sources: [Notion Pricing](https://www.notion.com/pricing), [Confluence Cloud Pricing](https://www.e7solutions.com/news/what-you-need-to-know-about-atlassians-october-2025-cloud-pricing-changes), [Mintlify Pricing (inferred from report)](https://www.mintlify.com/pricing), [Outline Pricing](https://www.getoutline.com/pricing), [AFFiNE Pricing](https://affine.pro/pricing), [Chroma Pricing](https://www.trychroma.com/pricing), [fueler.io Obsidian stats](https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics)

## Funding and Valuation

| Competitor | Total Raised | Latest Valuation | Revenue | Status |
|---|---|---|---|---|
| Notion | Undisclosed (multiple rounds) | $11B | $600M ARR (2025), ~50% growth | Pre-IPO |
| Confluence/Atlassian | Public company | $50B+ market cap | Part of Atlassian's $4B+ revenue | Public (TEAM) |
| Obsidian | $0 (bootstrapped) | $300-350M est. | ~$25M ARR | Bootstrapped, profitable |
| Mintlify | $21M ($18M Series A, a16z) | $88.4M (Sept 2024) | 8-figures ARR (2025) | Venture-backed |
| Outline | $0 (bootstrapped) | N/A | Bootstrapped, profitable | Small team, founder splits time with Linear |
| AFFiNE | $18M (2 seed rounds) | ~$70M est. (post-money) | Not disclosed | Venture-backed, no new round since Oct 2023 |
| Chroma | ~$20.3M ($18M Series B) | $75M | Not disclosed | Venture-backed |

Sources: [SaaStr on Notion](https://www.saastr.com/notion-and-growing-into-your-10b-valuation-a-masterclass-in-patience/), [Mintlify Series A](https://www.mintlify.com/blog/series-a), [Tracxn AFFiNE](https://tracxn.com/d/companies/affine/__k9fQ8Sczs9UVA1RMH0G-kLi_ngEITpKcsWqtrpjU0VE), [getlatka.com Obsidian](https://getlatka.com/companies/obsidian.md), [SiliconANGLE Chroma](https://siliconangle.com/2023/04/06/chroma-bags-18m-speed-ai-models-embedding-database/), [Outline About](https://www.getoutline.com/about)

## Business Model Patterns

### Pattern 1: Proprietary SaaS with AI Upsell (Notion, Confluence)
Core product + AI features at higher tiers. Notion bundles AI at $20/user (Business), Confluence bundles Rovo free (after failed premium pricing).

### Pattern 2: OSS Core + Managed Cloud (Chroma, AFFiNE)
Open-source core with paid hosted service. Chroma Cloud serverless ~65% of projected ARR. AFFiNE offers free self-hosted + paid cloud.

### Pattern 3: Free Product + Paid Services (Obsidian)
Core app free for all use. Revenue from Sync ($4-10/mo) and Publish ($8-16/mo). ~80% revenue from single service (Sync). Vulnerability: alternatives to Sync (iCloud, git) erode the revenue model.

### Pattern 4: Source-Available + Hosted (Outline)
BSL 1.1 prevents competitors from hosting it as a service but allows self-hosting for internal use. Revenue from hosted cloud service at flat team tiers.

### Pattern 5: Closed SaaS with Managed AI (Mintlify)
No self-hosted option. Revenue from subscription tiers + AI overage ($0.15-0.25/message). Sharp pricing cliff ($0 to $250/month).

## Key Pricing Signals

1. **Rovo pricing reversal** (Confluence): From $20-24/user/month to free. AI-as-premium-addon may not be sustainable.
2. **Notion AI bundling**: AI moved from $10 add-on to included in $20 Business tier. AI becoming table-stakes, not differentiator.
3. **Mintlify's pricing cliff**: $0 to $250 with no mid-tier. Teams outgrowing free are stranded.
4. **Confluence DC end-of-life**: All DC licenses expire March 2029. Forced cloud migration creates customer anxiety and potential defection window.
5. **Obsidian commercial license removal** (Feb 2026): Previously required for companies with 2+ employees. Now free for all. Concentrates revenue dependence on Sync.

Sources: [Confluence DC EOL](https://www.atlassian.com/licensing/data-center-end-of-life), [Obsidian commercial license change](https://x.com/obsdmd/status/1892586092882276352), [userjot Notion pricing analysis](https://userjot.com/blog/notion-pricing-2025-plans-ai-costs-explained)
