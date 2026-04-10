---
title: "Chroma Collaboration & Multiplayer Evidence"
source_type: primary
collection_date: 2026-04-02
sources:
  - url: https://cookbook.chromadb.dev/strategies/multi-tenancy/
    type: documentation
  - url: https://cookbook.chromadb.dev/strategies/multi-tenancy/naive-multi-tenancy/
    type: documentation
  - url: https://cookbook.chromadb.dev/strategies/multi-tenancy/multi-user-basic-auth/
    type: documentation
  - url: https://www.trychroma.com/pricing
    type: pricing
---

# Chroma Collaboration & Multiplayer Evidence

## Multi-Tenancy Architecture
Chroma's architecture has a three-level hierarchy:
1. **Tenant** - Represents a user, team, or account. Provides complete isolation. Access control, quota enforcement, and billing scoped to tenant level.
2. **Database** - Logical namespace for environments or applications within a tenant.
3. **Collection** - Named groups of documents/embeddings within a database.

## Multi-Tenancy Strategies (from Chroma Cookbook)

### Naive Multi-Tenancy
- Application-level enforcement only
- "Not very well suited for production environments"
- Simple metadata-based filtering

### User-Per-Doc
- Multiple collections, each document associated with a single user
- Metadata-based access control

### User-Per-Collection
- Each collection owned by a single user
- Collection-level isolation

### User-Per-Database
- Each user gets a separate database within a single tenant
- Database-level isolation

### User-Per-Tenant
- Each user gets a fully separate tenant
- Maximum isolation

## Authentication
- Multi-User Basic Auth: Multiple users access same instance with own credentials
- Advanced authorization via OpenFGA integration

## Team Sizes (from Cloud Pricing)
- Starter: 10 team members
- Team: 30 team members
- Enterprise: Unlimited team members

## Database Limits
- Starter: 10 databases
- Team: 100 databases
- Enterprise: Unlimited

## What "Collaboration" Means in Chroma's Context
Chroma's collaboration story is entirely about **data isolation and access control for programmatic clients** -- not about human collaboration on knowledge:
- No shared editing
- No comments or annotations
- No real-time co-editing
- No review workflows
- No notification system
- No change tracking for human review
- No knowledge curation workflows

The "team members" in pricing plans refer to developers/API users who can access the cloud dashboard, not collaborative knowledge workers.

## Private Networking (January 2026)
Network-level isolation for enterprise deployments. This is infrastructure security, not collaboration.

## BYOC (Enterprise)
Bring Your Own Cloud: deploy Chroma within customer's cloud account. This is deployment flexibility, not collaboration.
