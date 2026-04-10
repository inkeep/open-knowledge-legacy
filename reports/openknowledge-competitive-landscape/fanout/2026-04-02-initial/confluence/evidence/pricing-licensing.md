---
title: "Confluence Pricing, Licensing & OSS Status"
source_type: primary
date_collected: 2026-04-02
dimension: "OSS Status, Licensing & Pricing"
sources:
  - url: https://www.atlassian.com/software/confluence/pricing
    title: "Confluence Pricing Page"
    type: product_page
  - url: https://www.e7solutions.com/news/what-you-need-to-know-about-atlassians-october-2025-cloud-pricing-changes
    title: "October 2025 Cloud Pricing Changes"
    type: blog
  - url: https://www.adaptavist.com/blog/atlassian-price-updates-effective-october-2025
    title: "Adaptavist: Atlassian Price Updates October 2025"
    type: blog
  - url: https://www.atlassian.com/licensing/data-center-end-of-life
    title: "Data Center End of Life"
    type: product_page
  - url: https://www.atlassian.com/licensing/rovo
    title: "Rovo Plans and Trial"
    type: product_page
  - url: https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles
    title: "Rovo pricing shifts amid AI adoption struggles"
    type: news
  - url: https://massivegrid.com/blog/confluence-per-user-pricing-true-cost/
    title: "True Cost of Confluence Per-User Pricing at Enterprise Scale"
    type: blog
  - url: https://www.onpointserv.com/post/atlassian-data-center-price-changes-effective-february-2026-what-you-need-to-know
    title: "Data Center Price Changes February 2026"
    type: blog
---

# Confluence Pricing, Licensing & OSS Status

## OSS Status
**Fully proprietary.** No open-source core. The only OSS component is the Rovo MCP Server (Apache-2.0), which is a client connector, not the product itself.

## Cloud Pricing (Post-October 2025 Increases)

| Plan | Price/user/month | Key Gates |
|------|-----------------|-----------|
| **Free** | $0 | 10 users max, 2 GB storage, community support only |
| **Standard** | ~$6.05-6.40 | 250 GB storage, 100 automation runs/month, advanced permissions |
| **Premium** | ~$11.55-12.30 | Unlimited storage, 1000 automation runs/user/month, analytics, AI features |
| **Enterprise** | Custom | Unlimited automation, Atlassian Guard, 99.95% SLA, 24/7 support |

Prices shown are annual billing. Monthly billing costs ~17% more.

## October 2025 Price Increases

| Plan | Increase |
|------|----------|
| Standard | +5% |
| Premium | +7.5% |
| Enterprise | +7.5% to +10% (varies by user tier) |

**Clarification on "3x" reports**: The "tripled" reference was about Confluence site user limits being increased to 150,000 users, not contract pricing tripling. The actual price increases were 5-10% per tier, which is significant but not 3x.

## Rovo AI Pricing Evolution

- **Oct 2024 (GA launch)**: $20-24/user/month as separate add-on
- **Apr 2025**: Bundled at no extra cost with all paid Cloud subscriptions
- **Non-Atlassian users**: $5/user/month standalone

This pricing reversal (from premium add-on to bundled) suggests Rovo adoption was struggling at standalone pricing. Atlassian chose distribution over monetization.

## Data Center Pricing & End of Life

- **DC license expiration**: All DC licenses expire March 28, 2029
- **New DC subscriptions close**: March 30, 2026
- **DC expansion for existing customers closes**: March 30, 2028
- **February 2026 DC price increase**: ~15% across the board
  - Legacy "Advantaged" pricing: 18-40% increase depending on tier
- **Post-expiration**: Read-only state, no security patches, no support

## Customer Sentiment on Pricing

- Partners report "cost pressure feels higher than ever"
- AI features gated behind Premium/Enterprise create perceived value squeeze on Standard
- Enterprise customers face compounding: base price increase + Rovo bundling raising effective per-user cost
- DC-to-Cloud migration creates forced migration timeline with price uncertainty
- Some customers rushing to lock in pre-increase pricing before October 2025 deadline

## Feature Gating by Tier

| Feature | Free | Standard | Premium | Enterprise |
|---------|------|----------|---------|------------|
| Basic pages & spaces | Yes | Yes | Yes | Yes |
| AI features (Rovo) | No | Yes | Yes | Yes |
| Unlimited storage | No | No | Yes | Yes |
| Analytics | No | No | Yes | Yes |
| Advanced admin controls | No | No | Partial | Yes |
| Atlassian Guard | No | No | No | Yes |
| 99.95% SLA | No | No | No | Yes |
