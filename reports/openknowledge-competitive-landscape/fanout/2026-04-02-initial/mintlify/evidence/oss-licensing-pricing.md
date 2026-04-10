---
title: "Mintlify OSS Status, Licensing & Pricing"
dimension: "OSS Status, Licensing & Pricing"
date_collected: "2026-04-02"
sources:
  - url: "https://www.mintlify.com/pricing"
    title: "Pricing - Mintlify"
  - url: "https://www.featurebase.app/blog/mintlify-pricing"
    title: "Mintlify Pricing 2026: Is It Worth It?"
  - url: "https://ferndesk.com/blog/mintlify-pricing"
    title: "Mintlify Pricing 2026 - Ferndesk"
  - url: "https://ferndesk.com/blog/mintlify-review"
    title: "Mintlify Review 2026 - Ferndesk"
  - url: "https://github.com/mintlify"
    title: "Mintlify GitHub Organization"
  - url: "https://www.mintlify.com/oss-program"
    title: "OSS Program - Mintlify"
  - url: "https://www.mintlify.com/blog/series-a"
    title: "Mintlify raises $18M Series A"
---

# OSS Status, Licensing & Pricing Evidence

## Pricing Tiers

### Hobby (Free, $0/month)
- Full platform access
- Custom domain
- Web editor
- API playground
- Custom components
- LLM optimizations (llms.txt, skill.md)
- MCP server auto-generation
- No AI tools (Assistant, Agent)

### Pro ($250-300/month)
Pricing appears to have shifted; some sources cite $250/mo, others $300/mo.
- Everything in Hobby
- 5 editors included (+$20/month per additional seat)
- AI Assistant (250 messages/month; overage $0.15-0.25/message)
- Mintlify Agent for auto-updating docs
- Preview deployments
- Password protection
- Styling checks

### Enterprise (Custom pricing)
Reports suggest starting at ~$600/month, scaling to $1,000-2,000+/month.
- Everything in Pro
- Custom authentication
- 99.99% uptime SLA
- User permissions
- Support SLA
- SSO login (SAML-based)
- SOC 2 compliance

### Effective Cost Example
5-person team consuming 500 AI messages/month: ~$417.50/month (~$5,000/year)

### Notable Pricing Dynamics
- $0 to $250-300/month cliff with no mid-tier
- 14-day free trial on Pro (no credit card)
- Annual billing up to 15% savings
- 1% of subscription supports carbon removal (Stripe Climate)

## Self-Hosted Option
No self-hosted option exists. Mintlify is exclusively a managed SaaS platform.

## OSS Status

Mintlify is a **proprietary SaaS platform**. The core rendering engine, build pipeline, and hosting infrastructure are closed-source.

### Open-Source Repositories (25 repos on GitHub)
Primarily MIT-licensed:
- `starter` (1,757 stars, MIT) - Docs starter kit
- `docs` (366 stars, MIT) - Official Mintlify documentation
- `components` (87 stars, MIT) - UI components (@mintlify/components npm package)
- `themes` (53 stars) - Theme starter examples
- `mintlify-claude-plugin` (MIT) - Claude Code/Cowork plugin
- `mintlify-astro-starter` (MIT) - Astro integration
- `install-md` (Apache-2.0) - Agent-readable installation standard
- `assistant-embed-example` (MIT) - Widget embedding example
- `multirepo-action` - GitHub Actions for multi-repo docs

### What's Open Source
- Documentation content and starter kits
- UI component library
- CLI tooling
- Integration examples
- Agent-readable standards (skill.md, install.md)

### What's Closed Source
- Build pipeline / rendering engine
- AI Assistant backend
- MCP server generation
- Search infrastructure (Trieve)
- Analytics
- Web editor
- Deployment infrastructure

## Funding & Valuation
- $18M Series A (Sept 2024), led by Andreessen Horowitz
- $21M total funding
- $88.4M valuation (Sept 2024 post-Series A)
- $250M valuation reported in later coverage (likely secondary/internal)
- 8-figures ARR as of end of 2025
- Investors: a16z, Bain Capital Ventures, Y Combinator, Twenty Two Ventures

## OSS Program for Customers
Mintlify offers a 90% discount to qualified open source projects with recognized licenses (MIT, Apache 2.0, GPL, etc.)
