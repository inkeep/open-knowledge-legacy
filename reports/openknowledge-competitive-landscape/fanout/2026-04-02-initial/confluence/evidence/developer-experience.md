---
title: "Confluence Developer Experience & Extensibility"
source_type: primary
date_collected: 2026-04-02
dimension: "Developer Experience & Extensibility"
sources:
  - url: https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
    title: "Confluence Cloud REST API v2 Introduction"
    type: documentation
  - url: https://www.atlassian.com/blog/developer/bringing-you-new-confluence-graphql-apis-in-beta
    title: "Confluence GraphQL APIs in Beta"
    type: announcement
  - url: https://developer.atlassian.com/cloud/confluence/forge/
    title: "Forge for Confluence"
    type: documentation
  - url: https://www.atlassian.com/blog/developer/announcing-connect-end-of-support-timeline-and-next-steps
    title: "Connect End of Support Timeline"
    type: announcement
  - url: https://www.atlassian.com/blog/developer/connect-end-of-support-what-it-means-for-custom-apps-and-how-to-migrate-to-forge
    title: "Connect End of Support: Migration to Forge"
    type: blog
  - url: https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/
    title: "Forge Platform Quotas and Limits"
    type: documentation
  - url: https://community.developer.atlassian.com/t/deprecation-of-v1-api-confluence-major-concerns/72331
    title: "Community: V1 API Deprecation Concerns"
    type: community
---

# Confluence Developer Experience & Extensibility

## API Landscape

### REST API v2 (Current)
- **Base URL**: `https://your-domain.atlassian.net/wiki/api/v2/`
- **Authentication**: Basic Auth (username + API token) or OAuth 2.0 (3LO)
- **Pagination**: Cursor-based (improvement over v1's offset-based)
- **Rate limits**: Documented but exact thresholds not publicly enumerated
- **28 endpoint groups**: Pages, Blog Posts, Comments, Attachments, Spaces, Users, Tasks, Labels, Smart Links, Whiteboards, Admin, etc.
- **Content format**: Bodies can be requested/submitted as ADF (storage format), HTML (view/export), or "atlas_doc_format" (raw ADF JSON)

### REST API v1 (Deprecated)
- Still operational but no longer receiving improvements
- Many existing integrations and marketplace apps still depend on v1
- Community concerns about deprecation timeline and missing v2 equivalents

### GraphQL API (Beta since March 2022)
- Available at `https://api.atlassian.com/graphql`
- Primarily designed for Forge app consumption
- Allows querying exact needed data, reducing over-fetching
- Still in beta after 4+ years — unclear GA timeline

### CQL (Confluence Query Language)
- Proprietary query language for content search
- Exposed via REST API and MCP tools
- Powerful for structured queries but limited for full-text/semantic search

## Extension Frameworks

### Forge (Current Platform — Mandatory from Sep 2025)
- **Status**: Only framework for new Marketplace submissions since Sep 17, 2025
- **Architecture**: Serverless functions running on Atlassian infrastructure
- **Runtime**: Node.js-based with 25-second execution limit (15 min for async)
- **UI**: Forge UI Kit (React-like components) or Custom UI (iframe-based)
- **Storage**: Key-Value store, Entity store, or RDBMS (all Atlassian-managed)
- **Pricing**: Consumption-based from Jan 1, 2026 (free tier included)

**Developer Pain Points:**
- 25-second runtime limit constrains complex operations
- Performance lags compared to self-hosted Connect apps
- Basic error tracking / debugging tools
- Data stored on Atlassian infrastructure — developer liable for integrity but can't control infra
- Frequent platform updates can cause intermittent failures
- Storage options less flexible than self-managed databases

### Connect (Deprecated — End of Support Dec 2026)
- **Phase 1** (Sep 2025): No new Marketplace listings
- **Phase 2** (Mar 2026): No more app updates
- **Phase 3** (Dec 2026): End of support — apps run at own risk
- **Connect Inspector** service discontinued Feb 2026

### Marketplace
- Thousands of existing apps (many still Connect-based, facing forced Forge migration)
- Revenue-sharing model for paid apps
- Approval process for new listings

## Developer Sentiment

- V1-to-V2 API migration creating friction for existing integrations
- GraphQL beta stagnation (4+ years) frustrates developers wanting modern API patterns
- Forced Connect-to-Forge migration is significant effort for app vendors
- Forge runtime limitations mean some app categories cannot be fully replicated
- Community threads show concern about "major concerns" with V1 deprecation

## Assessment for Agent Integration

**What's available:**
- REST API v2 provides comprehensive CRUD on pages, spaces, comments
- MCP server provides agent-friendly Markdown I/O
- Forge provides a way to build extensions that live inside Confluence

**What's missing:**
- No streaming/realtime API (no WebSocket, no Server-Sent Events for content changes)
- No native webhook for granular content events (page section changed, inline comment resolved)
- GraphQL still beta after 4 years — no modern query flexibility for agents
- ADF manipulation requires understanding a complex proprietary tree format
- Rate limits can constrain high-frequency agent operations
- No concept of "agent identity" in the permission model — agents act as users
