---
title: "Obsidian OSS Status, Licensing & Pricing - Evidence"
type: evidence
dimension: "D5 - OSS Status, Licensing & Pricing"
collected: 2026-04-02
sources:
  - https://obsidian.md/license
  - https://obsidian.md/about
  - https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics
  - https://getlatka.com/companies/obsidian.md
  - https://costbench.com/software/note-taking/obsidian/
  - https://www.creativerly.com/obsidian-is-now-free-for-work-commercial-license-becomes-optional/
  - https://x.com/obsdmd/status/1892586092882276352
  - https://preslav.me/2024/08/23/obsidian-license/
  - https://forum.obsidian.md/t/is-it-true-that-obsidian-is-already-open-source/46413
  - https://www.smartt.com/insights/obsidian-is-now-free-for-commercial-use-why-it-matters-for-your-business-and-security
---

# D5: OSS Status, Licensing & Pricing - Evidence

## Licensing Model

**Obsidian is proprietary software, free to use.** It is NOT open source.

- Source code is NOT publicly available
- The app is free for all purposes: personal, commercial, nonprofit, educational, government
- No account required to download and use
- You retain ownership of all content you create
- Data is saved locally, not sent to Obsidian's servers (except Sync/Publish)

**Key change (February 2026):** Commercial license became optional. Previously, companies with 2+ employees needed a paid Commercial license. Now anyone can use Obsidian for work, for free. The Commercial license remains as an optional way to support development (organizations purchasing 25+ licenses get featured on the Enterprise page).

## What IS Open

- **Plugin API** — TypeScript type definitions publicly available (github.com/obsidianmd/obsidian-api)
- **Community plugins** — OSS, published via community plugin directory
- **Themes** — OSS, published via theme directory
- **Developer documentation** — docs.obsidian.md
- **obsidian-skills** (kepano) — MIT licensed
- **JSON Canvas spec** — Open format specification
- **Sample plugin** — Template repository for plugin development

## What Is NOT Open

- **Core application source code** — proprietary
- **Obsidian Sync service** — proprietary, closed
- **Obsidian Publish service** — proprietary, closed
- **Desktop/mobile apps** — Electron + proprietary code
- **Editor internals** — Built on CodeMirror 6 (open) but Obsidian's extensions and rendering are proprietary

## Pricing (as of April 2026)

| Product | Price | What You Get |
|---------|-------|-------------|
| Obsidian App | Free | Full app, unlimited notes, all core plugins, community plugins |
| Obsidian Sync (Standard) | $4/mo (annual) | 1 GB storage, 5 MB max file, 1 vault, version history, E2E encryption |
| Obsidian Sync (Plus) | $8/mo (annual) | 10 GB storage, 10 vaults, larger files |
| Obsidian Publish | $8/mo (annual) or $16/mo | Publish vault as website, custom domain, SEO, password protection |
| Catalyst License | $25+ one-time | Early access to insider builds, community badge |
| Commercial License | Optional, annual | Featured on Enterprise page (25+ licenses) |

## Revenue & Business Model

- **$25M ARR** (2026, per fueler.io analysis)
- **28% YoY ARR growth** driven by Sync and Publish subscriptions
- **Sync is ~80% of revenue** — the primary monetization lever
- **1.5M+ active users** with 22% YoY growth
- **~18 employees** (per getlatka.com, September 2025 data)
- **Valuation: $300-350M** (estimated)
- **Churn below 10% annually** — exceptionally low for SaaS
- **90%+ subscription renewal rate**
- **Average daily usage: 43 minutes per active user**
- **100% user-funded — no investors.** The about page explicitly states "100% supported by our users, not investors."

## Business Model Analysis

Obsidian's model is unusual: give away the core product entirely for free (including for commercial use), monetize only sync and publishing as optional services. This is closer to the Postgres model (free core + paid hosting) than the typical freemium SaaS model.

**Strengths:**
- Extremely low customer acquisition cost — the free product IS the growth engine
- Strong retention (10% churn, 43 min daily usage) creates reliable recurring revenue
- No investor pressure to optimize for revenue over user experience
- The "file over app" philosophy creates trust that enables paid service adoption

**Vulnerabilities:**
- Revenue concentration: ~80% from Sync. If users switch to iCloud/git/Relay for sync, the business model is at risk
- No enterprise sales motion despite making commercial use free — unclear how to monetize large organizations
- Small team (18 people) limits execution velocity on new features
