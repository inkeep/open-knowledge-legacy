---
title: "Outline Collaboration & Multiplayer Evidence"
type: evidence
subject: Outline
dimension: collaboration-multiplayer
collected: 2026-04-02
sources:
  - url: https://www.getoutline.com
    type: primary
    description: Homepage marketing claims
  - url: https://sascha-brockel.de/en/outline-the-real-time-collaborative-wiki/
    type: secondary
    description: Independent review of real-time collaboration
  - url: https://deepwiki.com/outline/outline/2.1-document-model-and-api
    type: secondary
    description: Technical architecture of collaboration layer
  - url: https://news.ycombinator.com/item?id=24806598
    type: secondary
    description: HN discussion about CRDT implementation
---

# Collaboration & Multiplayer Evidence

## Real-Time Editing

### Technology Stack:
- Y.js CRDT for conflict-free collaborative editing
- WebSocket connections for real-time sync
- Redis for pub/sub coordination between server instances
- Binary Y.js state stored in PostgreSQL BYTEA column

### How It Works:
- Multiple users edit same document simultaneously
- Changes visible immediately to all participants (no save button)
- Similar experience to Google Docs
- Cursor/caret positions visible for other editors (Y.js Awareness protocol)

### Maturity Assessment:
- CRDT engine announced ~2020 (HN post id:24806598)
- 5+ years of production use
- Generally considered mature and stable
- Some WebSocket connectivity issues reported in self-hosted setups (GitHub discussion #3842)

## Comments & Threads

- Document-level comments
- Text-selection comments (inline)
- Threading support
- @mentions for users
- Group mentions (added Oct 2025)
- Comment resolution workflow
- Comments accessible via API and MCP

## Permissions Model

### Hierarchy:
- Workspace > Collection > Document
- Roles: Admin, Member, Viewer (at workspace level)
- Collection-level: Read, ReadWrite, Admin
- Document-level: explicit UserMembership overrides

### Access Control Features:
- User groups for batch permission management
- Group descriptions (added Nov 2024)
- Private collections (explicit member access only)
- Public document sharing via unique tokens
- Public collection sharing (added Aug 2025)
- Hierarchical sharing: `includeChildDocuments` flag

## Team Management

- SSO-based user provisioning (no email/password)
- Group-based access control
- Workspace admin role
- Security audit log
- Collection subscriptions for notification management (added Apr 2025)
- Custom emoji for team communication (added Jan 2026)

## Sharing & Publishing

- Public document sharing without workspace membership
- Public collection sharing
- Custom domains (docs.yourteam.com)
- SEO metadata for public pages
- Read-only published view
- TOC display toggle
- "Last updated" timestamp display
