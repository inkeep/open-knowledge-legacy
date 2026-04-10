---
title: "AFFiNE Open-Source Status, Licensing, Pricing, and Strategic Position"
type: market-analysis
sources:
  - url: https://github.com/toeverything/AFFiNE
    title: "AFFiNE GitHub Repository"
  - url: https://tracxn.com/d/companies/affine/__k9fQ8Sczs9UVA1RMH0G-kLi_ngEITpKcsWqtrpjU0VE
    title: "AFFiNE Tracxn Company Profile"
  - url: https://www.crunchbase.com/organization/affine-2627
    title: "AFFiNE Crunchbase Profile"
  - url: https://affine.pro/pricing
    title: "AFFiNE Pricing Page"
  - url: https://docs.affine.pro/self-host-affine
    title: "Self-Host AFFiNE Documentation"
  - url: https://github.com/toeverything/docker
    title: "AFFiNE Docker Deployment Repository"
  - url: https://affine.pro/what-is-new
    title: "AFFiNE What's New / Changelog"
  - url: https://affine.pro/blog/what-is-affine-interview-with-affine-ceo-1
    title: "Interview with AFFiNE CEO Jiachen He (Part 1)"
  - url: https://affine.pro/blog/what-is-affine-interview-with-affine-ceo-2
    title: "Interview with AFFiNE CEO Jiachen He (Part 2)"
date_collected: 2026-04-02
---

# AFFiNE Open-Source Status, Licensing, Pricing, and Strategic Position

## Open-Source Health

### GitHub Metrics (as of April 2026)
- **Stars**: ~66.9K
- **Forks**: ~4.7K
- **Total commits**: 11,162+ (on canary branch)
- **License**: MIT
- **Monorepo size**: 165+ packages

### Development Activity
- Very active: multiple releases per month
- Recent major versions: 0.23 (July 2025), 0.24 (late 2025), 0.25 (Feb 2026)
- Canary branch is primary development branch
- Server version 0.26+ only supports clients v0.25+

### Key Releases Timeline
- **v0.23.0** (July 2025): Enhanced AI, iOS/Android launch
- **v0.24.0** (late 2025): Section edit tool, AI workspace docs, access token support, basic MCP server
- **v0.25.0** (Feb 2026): "Major AI capability leap," multimodal AI knowledge base foundation, document icons, enhanced MCP
- **v0.25.5**: Electron fix, Word importer, Korean/Catalan translations

## Company Information

### Toeverything Pte. Ltd.
- **Founded**: 2020
- **HQ**: Singapore
- **Founders**: Jiachen He (CEO), Yifeng Wang, Yinan Long, Chi Zhang
- CEO background: Dropped out of Max Planck Institute; researcher at IGR and LIGO

### Funding
- **Total raised**: $18M over 2 seed rounds
- **Round 1** (2022): $8M seed - Redpoint Ventures, Sinovation Ventures
- **Round 2** (Oct 2023): $10M seed - Redpoint China Ventures, Sinovation Ventures, Continental Grain Company
- No publicly announced funding since October 2023

### Traction
- GitHub debut: August 2022
- 10,000 stars within 43 days of launch

## Pricing Model

### Free Plan
- Unlimited local workspaces
- 10 GB cloud storage
- Up to 3 team members
- 7-day file history

### Pro Plan ($6.75/month)
- Unlimited local workspaces
- Unlimited login devices
- Unlimited blocks
- 100 GB cloud storage
- 100 MB max file size
- Up to 10 members per workspace
- 30-day version history

### Team Plan
- **Coming soon** (as of early 2026)
- Team project management and automation
- Per-seat pricing

### Enterprise
- Custom pricing, contact sales

## Self-Hosted Deployment

### Architecture Requirements
- Docker Compose (recommended)
- PostgreSQL
- Redis
- Mailhog (email)
- S3-compatible storage (optional)

### Self-Host Features
- Full data ownership
- AI requires own API keys
- Same editor functionality as cloud
- Community support via GitHub Discussions

### Limitations
- No official managed self-hosted offering
- Team features still in development
- Some cloud features (AI model hosting) not available self-hosted

## Strategic Positioning

### CEO Vision (Jiachen He)
"People can organize the knowledge they want, rather than text in notes and graphics on whiteboards."
"Using AFFiNE's infrastructure to create a SaaS product is the most elegant and efficient way, and that is our strategy."

### Differentiation Claims
- **vs Notion**: Open source, local-first, privacy-focused, integrated whiteboard
- **vs Miro**: Document + whiteboard in one, with databases
- **vs Both**: "Hyper Fused Platform" combining docs, whiteboards, databases

### AI Knowledge Base Pivot
v0.25.0 described as "a crucial starting point for AFFiNE's transition to an AI knowledge base product" with "multimodal AI knowledge bases becoming the fundamental form of future knowledge base products."

### Agent Signals
- MCP support added in v0.24-0.25
- "AFFiNE Intelligence" launched for AI-assisted note creation
- No public statements about agent-native knowledge management
- AI features are assistive (writing, generation) rather than structural
