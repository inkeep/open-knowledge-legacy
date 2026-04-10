---
title: "Outline OSS Status, Licensing & Pricing Evidence"
type: evidence
subject: Outline
dimension: licensing-pricing-oss
collected: 2026-04-02
sources:
  - url: https://github.com/outline/outline/blob/main/LICENSE
    type: primary
    description: BSL 1.1 license file with specific terms
  - url: https://github.com/outline/outline/discussions/3301
    type: primary
    description: Community discussion on license with maintainer responses
  - url: https://www.getoutline.com/pricing
    type: primary
    description: Official pricing page
  - url: https://www.getoutline.com/about
    type: primary
    description: Company information
  - url: https://github.com/outline/outline
    type: primary
    description: Repository metrics
  - url: https://en.wikipedia.org/wiki/Business_Source_License
    type: secondary
    description: BSL Wikipedia article
  - url: https://fossa.com/blog/business-source-license-requirements-provisions-history/
    type: secondary
    description: FOSSA BSL analysis
---

# OSS Status, Licensing & Pricing Evidence

## License: BSL 1.1 (NOT Open Source)

### Specific BSL Parameters (from LICENSE file):
- **Licensor**: General Outline, Inc.
- **Licensed Work**: Outline 1.6.1 (latest)
- **Change Date**: 2030-03-18 (4 years from release)
- **Change License**: Apache License, Version 2.0
- **Additional Use Grant**: May NOT use as a "Document Service" (commercial offering allowing third parties to create teams and documents)

### What This Means:
- Source code is publicly available (source-available, not open source)
- Self-hosting for internal company use: PERMITTED
- Running as a competing SaaS: PROHIBITED until Change Date
- Non-production use: always free
- After 4 years: becomes Apache 2.0 (true open source)
- Earlier versions (pre-v0.40.0) were MIT licensed
- v0.40.2 converted to Apache on March 1, 2023

### OSI Position:
- Open Source Initiative does NOT consider BSL an open source license
- The commercial use restriction violates OSD (Open Source Definition)

### Community Reaction:
- HN commenter: "advertising as 'open-source' is misleading" under BSL
- GitHub discussion #3301: users sought clarity on self-hosting for commercial use
- Maintainer defense: "the intent of the license is to allow companies to self host the software for internal use"
- No known forks motivated by licensing (unlike HashiCorp/OpenTofu)

## Pricing (Cloud)

### Tiers (as of April 2026):
| Tier | Price | Team Size |
|------|-------|-----------|
| Starter | $10/month | 1-10 members |
| Team | $79/month | 11-100 members |
| Business | $249/month | 101-200 members |
| Enterprise | Contact sales | 200+ members |

### All Tiers Include:
- Unlimited docs + version history
- Real-time collaborative editing
- Commenting + @mentions
- AI question answering
- Multi-language translation
- SSO authentication
- 20+ integrations (inc Zapier)
- Templating
- Groups + user permissions
- API + webhooks
- Security audit log
- Email support
- 30-day free trial

### Self-Hosted:
- Free (community edition, limited features)
- Business + Enterprise editions available (pricing not public)
- Requires PostgreSQL, Redis, S3-compatible storage
- Typical infrastructure cost: $5-10/month on Railway

## GitHub Metrics (as of April 2026):
- **Stars**: 37,900+
- **Forks**: 3,200+
- **Commits**: 9,247+
- **Language**: TypeScript (96.5%)
- **Latest Release**: v1.6.1 (March 18, 2026)
- **Release cadence**: 2-4 weeks between major versions
- **Active development**: consistent monthly releases since 2020

## Company:
- **Legal entity**: General Outline, Inc.
- **Founded**: 2020 (building on 3 years of open source work)
- **Location**: New York City
- **Funding**: Bootstrapped and profitable (no VC)
- **Founder**: Tom Moor (also Head of Engineering at Linear)
- **Team size**: Small (appears to be primarily Tom Moor + contributors)
- **Note**: Tom Moor co-founded Buffer and Sqwiggle previously
