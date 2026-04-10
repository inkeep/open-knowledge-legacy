# AFFiNE Deep Dive: Technical Architecture and Agent-Native Potential

**Date**: 2026-04-02
**Analyst context**: Evaluating AFFiNE as the most technically relevant competitor for an agent-native knowledge platform built on markdown+git with Yjs CRDTs and MCP.

---

## Executive Summary

AFFiNE is a ~67K-star MIT-licensed knowledge base combining documents, whiteboards, and databases on a CRDT-native editor (BlockSuite/Yjs). It has raised $18M across two seed rounds and employs a sophisticated Rust+TypeScript stack with the y-octo CRDT engine. While AFFiNE has added AI features and basic MCP support (v0.24+), its architecture reveals a fundamental tension relevant to our analysis: **the CRDT is the canonical format, not markdown**. Markdown is a lossy derived export. This is the opposite of a "markdown files in git" substrate. AFFiNE is solving for real-time collaborative editing excellence, not for agent-native knowledge management where AI agents co-create alongside humans as first-class participants.

---

## 1. Product Capabilities & Editing Experience

### What AFFiNE Offers
AFFiNE combines three surface areas in one application:
- **Documents**: Block-based editor with slash commands, rich text, code blocks, embeds
- **Whiteboards** ("Edgeless mode"): Infinite canvas for visual thinking, mind maps, flowcharts
- **Databases**: Tables, kanban boards, calendars, galleries (Notion-like, but less mature)

The "Hyper Fused Platform" concept means a single page can mix document blocks with embedded whiteboard fragments and database views.

### BlockSuite's Approach vs. Notion

BlockSuite takes a fundamentally different architectural approach from Notion's editor:

| Dimension | BlockSuite (AFFiNE) | Notion |
|-----------|-------------------|--------|
| Architecture | Document-centric: CRDT is the data layer, editors attach/detach | Editor-centric: proprietary block model |
| Collaboration | Built into data layer (Yjs CRDT) | Bolt-on OT/server-reconciled |
| Rendering | Web components (Lit), canvas hybrid | React, DOM-only |
| Offline | Local-first (IndexedDB + CRDT) | Limited offline support |
| Open source | MIT, reusable toolkit | Proprietary |

**What's unique about BlockSuite's approach:**
1. **Document outlives editor**: The Y.Doc persists independently of any editor instance. Multiple editors can attach to the same document. Undo/redo history survives editor unmounting. ([BlockSuite Blog: Document-Centric Editors](https://block-suite.com/blog/document-centric.html))
2. **Unified update path**: Local edits, undo/redo, and remote collaboration all traverse identical code paths through the CRDT layer. There is no separate "collaboration mode." ([BlockSuite Blog: CRDT-Native Data Flow](https://block-suite.com/blog/crdt-native-data-flow.html))
3. **Canvas + DOM hybrid**: EdgelessEditor mixes canvas-rendered and DOM-rendered content, enabling whiteboard-style free-form layout alongside rich text editing within the same document model.

### Current Limitations vs. Notion
- Databases are less mature than Notion's (fewer views, less formula support)
- Team features still "coming soon" as of early 2026
- Plugin/integration ecosystem is nascent compared to Notion's
- Search capabilities are functional but not as refined

**Sources**: [BlockSuite GitHub](https://github.com/toeverything/blocksuite), [BlockSuite Framework Overview](https://block-suite.com/guide/overview.html), [AFFiNE vs Notion - XDA](https://www.xda-developers.com/open-source-app-like-notion-but-better/)

---

## 2. AI / Agent Story

### Current AI Features
AFFiNE AI is a **cloud-hosted, LLM-powered assistant** integrated into the editor:
- Writing assistance (generate, rewrite, tone adjustment, grammar)
- Inline AI contextual suggestions
- Chat-with-AI interface
- Mind map and presentation generation
- Image generation (DALL-E)
- Multi-model: OpenAI GPT, Claude Sonnet 4.5, Gemini 2.5 Pro (as of Dec 2025)

Self-hosted instances require users to bring their own API keys. ([AFFiNE AI Docs](https://docs.affine.pro/self-host-affine/administer/ai))

### MCP Support

**Official**: v0.24 introduced personal access tokens; v0.25 added native MCP configuration (Settings -> Integrations -> MCP Server, generates JSON for Cursor/Claude Desktop). ([AFFiNE December Update](https://affine.pro/blog/whats-new-dec-update))

**Community MCP Server** ([DAWNCR0W/affine-mcp-server](https://github.com/DAWNCR0W/affine-mcp-server)): Comprehensive implementation with 76 tools exposing AFFiNE's GraphQL API over MCP. Supports workspace management, document CRUD, search, database operations, comments, version history, and blob management. Operates via stdio or HTTP transport.

### Can External Agents Interact with AFFiNE?

**Yes, but with significant constraints:**
1. Agents interact via **GraphQL API** (not directly with the CRDT layer)
2. Document content is accessed as **markdown or HTML** (derived from CRDT, not the canonical format)
3. Edits via the MCP server go through WebSocket -> CRDT, so they do integrate into the collaboration model
4. No block-level surgical API: agents work with document-level content
5. No event/webhook system for agents to subscribe to changes
6. No agent identity or attribution model

### Adversarial Assessment: How Suited is BlockSuite for Agent Interaction?

**The architecture is actually well-suited in theory but unexploited in practice.**

BlockSuite's document-centric model, where the CRDT is the single source of truth and editors are just views, is conceptually perfect for agent interaction. An agent could be "just another editor" that attaches to the Y.Doc and makes changes through the same CRDT operations as human users. The unified update path means agent changes would automatically propagate to all connected clients with full conflict resolution.

**However, AFFiNE has not built this path.** Instead, agents interact through the GraphQL API layer, which:
- Serializes CRDT state to markdown/text for reading
- Deserializes markdown/text back to CRDT for writing
- Loses structural information in the round-trip
- Adds latency and complexity versus direct CRDT manipulation

The gap between "what the architecture could support" and "what's actually exposed" is AFFiNE's biggest agent-native weakness.

**Sources**: [GitHub Issue #13262: API/MCP Support](https://github.com/toeverything/AFFiNE/issues/13262), [AFFiNE MCP Server](https://github.com/DAWNCR0W/affine-mcp-server)

---

## 3. Storage & Format Model

**This is the key dimension for our analysis.**

### The Canonical Format is CRDT Binary, Not Markdown

In AFFiNE/BlockSuite, the canonical document format is a **Yjs binary-encoded CRDT document** (Y.Doc). This is unambiguous from the documentation:

> "The document data stored on the server is no longer JSON, but always a binary representation of CRDT (similar to protobuf or RSC payload)." ([BlockSuite Data Synchronization](https://block-suite.com/guide/data-synchronization.html))

### How Content Persists

```
User edit -> Y.Doc (CRDT) mutation -> Y.Event -> Block model update -> UI refresh
                |
                v
        Binary Yjs update (Uint8Array)
                |
        +-------+-------+
        |               |
    IndexedDB       WebSocket -> Server
    (client)           |
                +------+------+
                |             |
            PostgreSQL     Redis (pub/sub)
            (snapshots +    (broadcast)
             updates tables)
```

**Server-side storage**:
- `snapshots` table: Merged document state (binary CRDT)
- `updates` table: Incremental binary diffs
- `snapshot_histories` table: Point-in-time recovery with TTL cleanup
- All stored as binary Yjs encoding, not JSON or markdown

**Client-side storage**: IndexedDB stores CRDT binary for offline-first access.

### Markdown: Derived, Not Canonical

Markdown in AFFiNE is handled through the **Adapter pattern**:
- A `Snapshot` (JSON representation of the block tree) is derived from the CRDT state
- An `Adapter` converts Snapshots to external formats (Markdown, HTML, plain text)
- The documentation explicitly warns: "Unlike transformers, adapters may result in data loss during the conversion process, as the target format might not support all the structures present in the original data." ([BlockSuite Transformer and Adapter](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter))

The [affine-reader](https://github.com/toeverything/affine-reader) utility exists specifically to read AFFiNE cloud workspaces and convert them to markdown, confirming markdown is a derived output.

### y-octo: The Rust CRDT Engine

[y-octo](https://github.com/y-crdt/y-octo) is a Rust implementation of Yjs with:
- Binary compatibility with Yjs wire format
- Thread-safe, high-performance
- Used in production by AFFiNE (Electron + Node.js server)
- Exposed via NAPI bindings (`@affine/server-native`)
- Published on [crates.io](https://crates.io/crates/y-octo)

### Comparison: CRDT Binary vs. "Markdown Files in Git"

| Property | AFFiNE (CRDT Binary) | Markdown + Git |
|----------|---------------------|---------------|
| Canonical format | Opaque binary (Yjs encoding) | Human-readable text |
| Version history | CRDT operation log + snapshots | Git commits |
| Diffing | CRDT state vector comparison | Line-based text diff |
| Human inspectable | No (requires decoder) | Yes (any text editor) |
| Agent readability | Requires serialization layer | Direct file read/write |
| Merge strategy | Automatic CRDT convergence | Git merge (may conflict) |
| Rich content | Native (images, databases, embeds) | Requires extensions/frontmatter |
| Collaboration | Real-time, conflict-free | Async, merge-conflict-prone |
| Portability | Locked to Yjs ecosystem | Universal |
| Tool compatibility | BlockSuite/AFFiNE only | Any editor, any tool |

**Key insight**: AFFiNE optimizes for real-time collaborative editing correctness (CRDTs guarantee convergence). Markdown+git optimizes for universality, inspectability, and tool interoperability. These are genuinely different design choices with different tradeoff surfaces.

**Sources**: [BlockSuite Store](https://blocksuite.io/guide/store.html), [AFFiNE Architecture - DeepWiki](https://deepwiki.com/toeverything/AFFiNE/1-introduction-to-affine), [y-octo on crates.io](https://crates.io/crates/y-octo)

---

## 4. Collaboration & Multiplayer

### Architecture

AFFiNE implements a mature real-time collaboration system:

1. **Client**: Yjs Y.Doc in browser/Electron, synced via Socket.IO
2. **Server**: NestJS WebSocket gateway (`SpaceSyncGateway`)
3. **Scaling**: Redis pub/sub adapter for horizontal scaling across multiple server instances
4. **Persistence**: PostgreSQL for CRDT snapshots and update logs
5. **CRDT Engine**: y-octo (Rust) handles diff computation, merge, and binary encoding

### Sync Protocol Details

Uses **state vector-based synchronization** (standard CRDT technique):
- Client sends state vector (map of `client_id -> clock`)
- Server computes diff (only missing updates)
- Binary-encoded incremental updates transmitted
- Bidirectional: client pushes updates, server broadcasts to peers

Awareness protocol handles ephemeral state (cursors, presence) separately.

### Maturity Assessment

**Strengths:**
- Battle-tested CRDT foundation (Yjs is the most widely deployed CRDT library)
- Proper horizontal scaling architecture (Redis pub/sub)
- Offline-first with automatic reconnection and merge
- Multi-platform (web, desktop, mobile) sharing same sync infrastructure

**Weaknesses:**
- Collaboration features still maturing (team plan "coming soon")
- Permission model is basic compared to Notion/Google Docs
- No fine-grained access control at block level
- Awareness features (cursors, presence) are functional but not as polished as Google Docs

### Self-Hosted Collaboration

Fully functional self-hosted collaboration via Docker Compose:
- Requires PostgreSQL, Redis, S3-compatible storage
- Same real-time sync capabilities as cloud
- No managed self-hosted offering (DIY deployment)

**Sources**: [AFFiNE Real-Time Sync - DeepWiki](https://deepwiki.com/toeverything/AFFiNE/3.5-real-time-synchronization), [AFFiNE Self-Host Docs](https://docs.affine.pro/self-host-affine), [What Happens After You Press A](https://affine.pro/blog/what-happens-after-you-press-a-in-a-collaborative-editor-data-model)

---

## 5. OSS Status, Licensing & Pricing

### Open Source

- **License**: MIT (permissive, allows commercial use)
- **GitHub Stars**: ~66.9K (as of April 2026)
- **Forks**: ~4.7K
- **Commits**: 11,162+ on canary branch
- **Activity**: Very active -- multiple releases per month; latest major release v0.25.0 in February 2026
- **Monorepo**: 165+ packages across frontend, backend, BlockSuite, tools

BlockSuite is explicitly designed to be reusable outside AFFiNE. The [BlockSuite overview](https://block-suite.com/guide/overview.html) states: "people building serious editors should make their own framework" and emphasizes that external projects access identical capabilities without privileged access.

### Pricing

| Plan | Price | Storage | Members | History |
|------|-------|---------|---------|---------|
| Free | $0 | 10 GB cloud | 3 | 7 days |
| Pro | $6.75/mo | 100 GB | 10 | 30 days |
| Team | Coming soon | TBD | Per-seat | TBD |
| Enterprise | Custom | Custom | Custom | Custom |

Self-hosted: Free (MIT license), bring your own infrastructure.

### Company

**Toeverything Pte. Ltd.** (Singapore, founded 2020)
- $18M raised across 2 seed rounds (last: Oct 2023, $10M)
- Led by Redpoint Ventures and Sinovation Ventures
- No publicly announced funding since late 2023
- CEO: Jiachen He (ex-Max Planck Institute researcher)

**Sources**: [AFFiNE GitHub](https://github.com/toeverything/AFFiNE), [AFFiNE Pricing](https://affine.pro/pricing), [Tracxn Profile](https://tracxn.com/d/companies/affine/__k9fQ8Sczs9UVA1RMH0G-kLi_ngEITpKcsWqtrpjU0VE)

---

## 6. Positioning & Strategic Direction

### Current Positioning

AFFiNE positions as "the next-gen knowledge base" and "a privacy-focused, local-first, open-source alternative for Notion & Miro." The value proposition is the fusion: documents + whiteboards + databases in one open-source, local-first platform.

CEO quote: "People can organize the knowledge they want, rather than text in notes and graphics on whiteboards."

### AI Knowledge Base Pivot (2025-2026)

v0.25.0 is explicitly described as **"a crucial starting point for AFFiNE's transition to an AI knowledge base product"** with the claim that "multimodal AI knowledge bases will become the fundamental form of future knowledge base products."

This signals a strategic shift from "open-source Notion alternative" toward "AI-native knowledge base" -- but the execution so far is:
- **LLM-assisted editing**: Writing generation, rewriting, mind map creation
- **Multi-model support**: OpenAI, Claude, Gemini
- **MCP integration**: Allowing external AI tools (Cursor, Claude Desktop) to read/write AFFiNE content
- **"AFFiNE Intelligence"**: AI assistance from the initial stage of note creation

### Agent-Native Signals

**Present:**
- MCP support (basic, recent)
- Personal access tokens for programmatic access
- GraphQL API (underdocumented)
- Multi-model AI support

**Absent:**
- No public statements about agent-native knowledge management
- No concept of agents as document co-authors
- No agent identity/attribution system
- No CRDT-level agent API
- No event/webhook infrastructure for agent reactions
- Blog content focuses on individual productivity AI, not multi-agent workflows

### Adversarial Assessment

AFFiNE is pursuing an **"AI-assisted human workspace"** strategy, not an **"agent-native knowledge platform"** strategy. The AI features are tooling overlaid on a human-centric editor. This is a meaningful distinction:

- **AFFiNE's approach**: Human writes, AI assists. AI is a feature of the editor.
- **Agent-native approach**: Humans and agents both create and modify knowledge. Agents are first-class participants in the knowledge graph.

AFFiNE's CRDT architecture *could* support agent-native patterns (agents as Yjs peers), but nothing in the product, roadmap, or public communications suggests this direction.

### Competitive Threats to an Agent-Native Platform

If AFFiNE pivoted to agent-native:
1. They have the CRDT infrastructure already built
2. BlockSuite's document-centric model is architecturally suited
3. y-octo provides a Rust CRDT engine for server-side agent integration
4. The MIT license means anyone can build on BlockSuite

However, markdown+git as substrate has advantages AFFiNE cannot easily replicate:
1. Universal readability without specialized tooling
2. Git-native version control with rich diff/merge semantics
3. Existing ecosystem (GitHub, VS Code, any text editor)
4. Zero vendor lock-in at the data layer

**Sources**: [AFFiNE CEO Interview Part 1](https://affine.pro/blog/what-is-affine-interview-with-affine-ceo-1), [AFFiNE What's New](https://affine.pro/what-is-new), [AFFiNE December Update](https://affine.pro/blog/whats-new-dec-update)

---

## 7. Developer Experience & Extensibility

### BlockSuite as a Reusable Toolkit

BlockSuite is explicitly positioned as a standalone toolkit, not just AFFiNE's internal editor:

**NPM packages:**
- `@blocksuite/store` (v0.22.4): Data layer on Yjs -- 71 dependents in npm registry
- `@blocksuite/presets` (v0.19.5): Plug-and-play editors
- `@blocksuite/inline`: Rich text components
- `@blocksuite/block-std`: Framework-agnostic block modeling
- `@blocksuite/blocks`: Default block implementations

All components are **web components** (Lit-based), making them framework-agnostic. They can be used in React, Vue, Angular, or vanilla JS contexts.

### Custom Block Development

Developers can define custom blocks via `defineBlockSchema`:
- Specify flavour (type identifier), props (data attributes), nesting rules
- Extend `BlockModel` for custom methods
- Implement views in Lit (default) or any other framework
- Register custom inline embeds

The extension system supports:
- Custom blocks with rich editing capabilities
- Dependency injection for services
- Command mechanisms (similar to React hooks) for editing logic
- Data persistence, schemas, and adapters

### Plugin Model

BlockSuite uses a "Block Spec" pattern:
- **Schema**: Data structure definition
- **Service**: Business logic and event handling
- **View**: UI rendering (framework-specific)

The `@blocksuite/block-std` package provides framework-agnostic infrastructure, while `@blocksuite/lit` helpers assist with Lit-based views. Other UI frameworks can be used by implementing the view layer differently.

### API & Self-Hosting

**GraphQL API**: Available but poorly documented. Schema discoverable at `/graphql` endpoint. The community has been vocal about wanting better API documentation ([GitHub Discussion #6052](https://github.com/toeverything/AFFiNE/discussions/6052)).

**Self-hosting guide quality**: Docker Compose is the recommended approach. Documentation covers basic setup but lacks depth on scaling, monitoring, backup, and production hardening. Community feedback suggests self-hosting is functional but requires significant Linux/Docker expertise.

### How Easy to Build On?

**For using BlockSuite as an editor toolkit**: Moderate difficulty. The documentation is improving but still has gaps. The framework is powerful but complex. The dependency on Yjs means understanding CRDT concepts helps but isn't strictly required (the reactive layer abstracts it).

**For building on AFFiNE as a platform**: Hard. No official plugin API, limited API documentation, rapidly evolving codebase with 165+ packages. The monorepo structure is complex. Contributing requires understanding React, NestJS, Yjs, Lit, and Rust.

**For extracting BlockSuite components**: Feasible. The package separation is real (not just nominal). `@blocksuite/store` can be used independently of AFFiNE's application layer.

**Sources**: [BlockSuite Block Schema](https://block-suite.com/guide/block-schema.html), [BlockSuite Store](https://blocksuite.io/guide/store.html), [BlockSuite Component Types](https://blocksuite.io/guide/component-types.html), [@blocksuite/store on npm](https://www.npmjs.com/package/@blocksuite/store)

---

## Synthesis: Implications for an Agent-Native Knowledge Platform

### What AFFiNE Has Proven

1. **Yjs-based collaborative editing works at scale**: AFFiNE demonstrates that building a full-featured editor on Yjs CRDTs is viable and can deliver a competitive editing experience.
2. **CRDT-native architecture pays off**: The document-centric approach (data layer independent of editor) enables genuine local-first, offline-capable, real-time collaboration.
3. **y-octo shows Rust+Yjs is production-ready**: A Rust CRDT engine compatible with Yjs wire format is feasible and performant enough for production use.
4. **BlockSuite demonstrates reusable CRDT-editor infrastructure**: The package separation and web component approach make it technically possible to build different editors on the same CRDT foundation.

### Where AFFiNE's Architecture Diverges from Agent-Native

1. **Opaque canonical format**: The CRDT binary is not human-inspectable. For an agent-native platform where transparency and auditability matter, markdown-as-canonical provides a fundamentally different value proposition.
2. **No agent primitives**: AFFiNE treats AI as a feature (generate, rewrite, assist) rather than agents as participants (co-create, review, maintain).
3. **Markdown is lossy export**: Any system that needs to interoperate with AFFiNE content must go through a lossy conversion layer. Markdown+git systems have native interoperability.
4. **Git is absent**: No version control integration. CRDT history is internal and opaque vs. git's rich, tool-supported, branch-and-merge model.

### Lessons to Take

1. **The CRDT reactive layer is valuable**: BlockSuite's approach of wrapping Yjs in a developer-friendly reactive layer (so developers don't need deep Yjs knowledge) is a pattern worth studying.
2. **Document-centric > editor-centric**: The principle that documents should outlive editors and support multiple concurrent views is directly applicable.
3. **Block schema system**: The typed, validated block model with nesting rules provides a good template for structured content.
4. **The adapter pattern for format conversion**: BlockSuite's Snapshot -> Adapter -> Markdown/HTML pipeline is the right abstraction for format interop, even if the directionality is inverted in a markdown-canonical system.

### Competitive Assessment

AFFiNE is **not building toward agent-native knowledge management** in any direct sense. Its AI features are human-assistive. Its CRDT architecture is optimized for human-to-human real-time collaboration. The MCP integration is a recent addition for AI tool interop, not a foundational design principle.

For a product betting on markdown+git+MCP as the substrate for agent-native knowledge, AFFiNE represents:
- **Technical validation** of the CRDT approach to collaborative editing
- **Not a direct competitor** in the agent-native space (different canonical format, different AI philosophy)
- **A potential component supplier** (BlockSuite/y-octo are MIT-licensed and reusable)
- **An indirect competitor** in the "next-gen knowledge base" market, where users might choose AFFiNE's real-time collaboration over markdown+git's universality

---

## Evidence Files

- [evidence/blocksuite-architecture.md](evidence/blocksuite-architecture.md) -- BlockSuite CRDT-native document model technical details
- [evidence/sync-and-storage.md](evidence/sync-and-storage.md) -- AFFiNE sync protocol, storage model, and y-octo details
- [evidence/ai-and-mcp.md](evidence/ai-and-mcp.md) -- AI features and MCP/agent integration analysis
- [evidence/oss-and-business.md](evidence/oss-and-business.md) -- Open-source health, company, funding, and pricing details
