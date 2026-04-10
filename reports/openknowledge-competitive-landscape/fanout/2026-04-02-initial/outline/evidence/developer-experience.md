---
title: "Outline Developer Experience & Extensibility Evidence"
type: evidence
subject: Outline
dimension: developer-experience
collected: 2026-04-02
sources:
  - url: https://www.getoutline.com/developers
    type: primary
    description: API documentation portal
  - url: https://docs.getoutline.com/s/guide/doc/webhooks-gB7HYhS6yq
    type: primary
    description: Webhooks documentation
  - url: https://www.getoutline.com/integrations
    type: primary
    description: Integrations page
  - url: https://docs.getoutline.com/s/hosting/doc/authentication-7ViKRmRY5o
    type: primary
    description: Authentication documentation
  - url: https://github.com/outline/outline/discussions/6467
    type: primary
    description: Plugin development discussion
---

# Developer Experience & Extensibility Evidence

## REST API

### Structure: RPC-style (not REST, despite being called REST)
- All endpoints use POST method
- Endpoint naming: `resource.action` (e.g., `documents.info`, `documents.create`)
- The main application is built on the same API (dogfooding)

### Authentication:
- API keys: `ol_api_` prefix + 38 random characters
- Bearer token format: `Authorization: Bearer YOUR_API_KEY`
- OAuth 2.0 for third-party applications
- Scoped access: global (`read`, `write`) and namespaced (`documents:read`, `collections:write`)

### API Categories (16 resource types):
1. Documents (CRUD, search, archive, restore, duplicate, export)
2. Collections (hierarchical grouping)
3. Users & Groups
4. Comments (document + text-selection)
5. Attachments
6. Shares (public access)
7. Revisions (version history)
8. Events (audit trail)
9. Templates
10. Views (engagement tracking)
11. Data Attributes (custom metadata, Business/Enterprise)
12. File Operations (import/export jobs)
13. OAuth Clients & Authentications
14. Stars (favorites)

### Rate Limiting:
- Mutation endpoints more restrictive than read-only
- 429 status with Retry-After header
- Specific limits not publicly documented

## Webhooks

### Setup: Settings > Webhooks (admin only)
### Payload:
```json
{
  "id": "UUID (delivery attempt)",
  "actorId": "UUID (user who triggered)",
  "webhookSubscriptionId": "UUID",
  "createdAt": "ISO 8601",
  "event": "resource.action",
  "payload": {
    "id": "UUID (mutated model)",
    "model": { /* object properties */ }
  }
}
```

### Security: HMAC SHA-256 signature in `Outline-Signature` header

### Event Categories:
- Documents (create, update, publish, archive, etc.)
- Users (create, etc.)
- Comments
- Collections
- Specific events selectable or entire categories

## Authentication (Self-Hosted)

- SSO required (no email/password natively)
- Supported SSO providers: Google, Microsoft, Slack
- OIDC (OpenID Connect) from any compliant provider
- SAML (Business/Enterprise editions)
- Passkey/biometric support (added Jan 2026)

## Integrations (25+)

### Native:
- **Auth**: Google, Microsoft, Slack
- **Design**: Figma, Abstract, Framer, InVision, Marvel
- **Collaboration**: Airtable, Diagrams.net, Google Docs, Lucidchart, Mindmeister, Miro, Trello, Typeform, Pitch, Prezi, Whimsical
- **Developer**: Codepen, GitHub, Linear, GitLab, Make, Mode, Zapier
- **Media**: Descript, Spotify, YouTube, Vimeo
- **Utilities**: Alfred

### Integration Pattern:
- Most integrations are embed-based (paste URL, get rich preview)
- Slack has deeper integration (slash commands, notifications)
- Zapier/Make for automation workflows
- No native webhook-to-action integrations

## Plugin/Extension System: NONE

### Critical Finding:
- **No formal plugin architecture exists**
- **No extension API, no plugin marketplace, no custom block development**
- Community developer in discussion #6467 had to discover Sequelize model registration workaround independently
- No maintainer engagement on extensibility questions
- All features must come from core team or be forked

### Workarounds:
- API + webhooks for external automation
- MCP for AI assistant integration
- Zapier/Make for no-code workflows
- Fork the codebase (BSL permits modification for internal use)

## Developer Onboarding (Self-Hosted)

Requirements:
- PostgreSQL database
- Redis server
- S3-compatible object storage
- SSO provider configuration
- Docker recommended deployment method
- "Requires dev-ops experience to successfully install and run in production"
