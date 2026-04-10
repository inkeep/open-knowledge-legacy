---
title: "AFFiNE Sync Architecture, Storage, and y-octo"
type: technical-analysis
sources:
  - url: https://deepwiki.com/toeverything/AFFiNE/3.5-real-time-synchronization
    title: "AFFiNE Real-Time Synchronization - DeepWiki"
  - url: https://deepwiki.com/toeverything/AFFiNE/1-introduction-to-affine
    title: "AFFiNE Introduction and Architecture - DeepWiki"
  - url: https://github.com/y-crdt/y-octo
    title: "y-octo GitHub Repository"
  - url: https://crates.io/crates/y-octo
    title: "y-octo on crates.io"
  - url: https://github.com/toeverything/OctoBase
    title: "OctoBase GitHub Repository"
  - url: https://octobase.dev/docs/overview/project_overview
    title: "OctoBase Project Overview"
  - url: https://affine.pro/blog/what-happens-after-you-press-a-in-a-collaborative-editor-data-model
    title: "What Happens After You Press A"
date_collected: 2026-04-02
---

# AFFiNE Sync Architecture, Storage, and y-octo

## System Architecture (3-Tier)

1. **Client Layer**: Web, desktop (Electron), iOS, Android sharing `@affine/core` business logic
2. **Backend Layer**: NestJS microservices with GraphQL APIs, Socket.IO gateway, AI services
3. **Native Layer**: Rust modules compiled to NAPI bindings for performance-critical CRDT operations

## Real-Time Synchronization Protocol

### Transport Layer
- Socket.IO over WebSocket
- Redis pub/sub via `@socket.io/redis-adapter` for horizontal scaling
- Room pattern: `${spaceType}:${spaceId}:${roomType}`

### Message Types
**Client -> Server:** `space:join`, `space:leave`, `space:load-doc`, `space:push-doc-update`, `space:load-doc-timestamps`, `space:delete-doc`

**Server -> Client:** `space:broadcast-doc-update`, `space:load-doc-timestamps`

**Awareness:** `space:join-awareness`, `space:leave-awareness`, `space:update-awareness`, `space:load-awarenesses`

### State Vector Synchronization

Uses state vectors (maps of `client_id -> clock` pairs representing "last seen update from each client"):
1. Client joins, sends base64-encoded state vector
2. Server computes diff via `adapter.diff()` -> y-octo native diff calculation
3. Server responds with `{missing, state, timestamp}` all base64-encoded
4. Only updates newer than client's known state transmit

### Update Flow

When client pushes update via `space:push-doc-update`:
1. Gateway validates room membership
2. `adapter.push()` persists update
3. Persists to PostgreSQL via `PgWorkspaceDocStorageAdapter.pushDocUpdates()`
4. Broadcasts to all connected clients in room

## Data Persistence Model

### Multi-Store Approach
- **PostgreSQL**: Structured data, document storage, CRDT snapshots (via Prisma ORM)
  - `snapshots` table: merged document state
  - `updates` table: incremental binary diffs for version history
  - `snapshot_histories`: point-in-time recovery with TTL-based cleanup
- **Redis**: Caching, pub/sub for WebSocket coordination, job queue (BullMQ)
- **S3-Compatible Storage**: Binary blob storage for attachments
- **Elasticsearch**: Full-text search indexing
- **IndexedDB** (client): Local CRDT format for offline capability

### Local-First Architecture
- Documents stored in IndexedDB in Y.js CRDT format on client
- Offline edits sync seamlessly when reconnected (CRDT guarantees convergence)
- No central authority required for merging

## y-octo: Rust CRDT Engine

y-octo is a "tiny, ultra-fast CRDT collaboration library" with:
- **Binary compatibility** with Yjs (can decode/encode Yjs wire format)
- **Thread-safe** implementation in Rust
- Used in production by AFFiNE in Electron and Node.js server
- Exposed via NAPI bindings (`@affine/server-native`)

Key operations: state vector computation, diff calculation, binary encoding/decoding, document merging.

Binary update format uses v1 encoding with:
- Client ID compression
- State vector encoding
- Delete set encoding
- Block-level granularity

## OctoBase

OctoBase is the Rust collaborative database originally designed for AFFiNE:
- CRDT-native (built on y-octo)
- Supports binary storage with deduplication
- SQLite or PostgreSQL backends
- S3 for blob storage
- Keck: sync server prototype (Node.js ported to Rust)
- Cloud: full server with login, user management, collaboration
- Native bindings for Kotlin (Android) and Swift (iOS)

## Key Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React, TypeScript | 19.2.1, 5.9.3 |
| State | Jotai, Yjs | 2.10.3, 13.6.27 |
| Backend | NestJS, Apollo Server | 11.1.14, 4.13.0 |
| Database | Prisma, PostgreSQL | 6.6.0 |
| Jobs | BullMQ, Redis | 5.40.2 |
| Desktop | Electron | 39.0.0 |
| Mobile | Capacitor | 7.0.0 |
| Build | Rspack, SWC | 1.7.6, 1.10.1 |

## Monorepo Scale

165+ packages organized via Yarn Berry workspaces:
- 9 frontend packages
- 2 backend packages
- 7 common packages
- 77+ BlockSuite sub-packages
- 10+ tools
- 7 test packages
