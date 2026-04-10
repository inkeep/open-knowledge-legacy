# Outline: Competitive Deep Dive

**Subject**: Outline (getoutline.com)
**Date**: 2026-04-02
**Purpose**: Map Outline's current capabilities, AI/agent story, and strategic trajectory for someone building an OSS agent-native knowledge platform with markdown+git substrate, rich editor, and zero LLM compute.

---

## Executive Summary

Outline is the most established source-available team wiki with real-time collaboration, occupying the space between Notion's all-in-one complexity and bare-bones markdown tools like BookStack. At 37.9k GitHub stars and a bootstrapped profitable business, it has strong community traction. However, three structural properties make it vulnerable to a well-positioned agent-native competitor:

1. **ProseMirror JSON is the canonical format, not markdown.** Markdown export is explicitly lossy. A markdown+git native product has a fundamental portability and developer-trust advantage.
2. **AI is bolted on, not foundational.** AI Answers is standard RAG via OpenAI. MCP (shipped Feb 2026) enables agent read/write but not agent co-creation. LLM compute is embedded in the product (the opposite of the "zero LLM compute" thesis).
3. **No extensibility model.** No plugin system, no custom blocks, no extension API. Every feature must ship from a one-person core team. This is the deepest structural constraint.

---

## 1. Product Capabilities & Editing Experience

### Editor Architecture
Outline's editor is built on [ProseMirror](https://prosemirror.net/) wrapped in React, with [Y.js](https://github.com/yjs/yjs) CRDT providing real-time collaboration. The codebase is 96.5% TypeScript ([GitHub](https://github.com/outline/outline)).

### Block Types
The editor supports: headings, paragraphs, blockquotes, ordered/unordered lists, task lists, tables (with cell merging, column reordering, background colors, sticky headers), code blocks with syntax highlighting, math via KaTeX, notices (4 types), images with resize/caption, videos, file attachments, toggle blocks (collapsible), PDF embeds, Draw.io diagrams, Mermaid diagrams, and 20+ embed types (YouTube, Figma, GitHub, etc.) ([Blocks docs](https://docs.getoutline.com/s/guide/doc/blocks-iwAQVA8kAf), [Changelog](https://www.getoutline.com/changelog)).

### Markdown Support
Full support for standard markdown syntax as input shortcuts. But critical gaps exist: no footnotes, no definition lists, no subscript/superscript, no HTML support. Tables cannot be typed in markdown syntax (must use `/table` command). The maintainer explicitly declined a raw markdown editing mode, stating the team is "doubling down on making the editor collaborative" with features that markdown cannot represent ([Discussion #3326](https://github.com/outline/outline/discussions/3326)).

### Comparison to Notion and Obsidian

| Dimension | Outline | Notion | Obsidian |
|-----------|---------|--------|----------|
| Editor type | WYSIWYG (ProseMirror) | WYSIWYG (proprietary blocks) | Markdown source + preview |
| Block richness | ~20 types | 50+ types + databases | Markdown + plugins (1000+) |
| Databases/views | None | Kanban, timeline, gallery, calendar | Via plugins (Dataview) |
| Slash commands | Yes | Yes (more extensive) | Via plugins |
| Real-time collab | Yes (Y.js CRDT) | Yes (proprietary) | None (single-user) |
| Search | PostgreSQL full-text | Proprietary + AI | Local file search |
| Self-hosted | Yes (Docker) | No | Yes (local files) |

Community perception consistently describes Outline's editor as feeling "very basic" compared to Notion ([Featurebase](https://www.featurebase.app/blog/outline-alternatives)). Outline deliberately stays focused on documents rather than expanding into databases and project management.

### Search
PostgreSQL-native full-text search using tsvector ranking with popularity boost. Fast for keyword queries. AI Answers provides semantic search overlay for cloud/licensed editions ([Search docs](https://docs.getoutline.com/s/guide/doc/search-ai-answers-NIKPvYrx06)).

---

## 2. AI / Agent Story

### Current AI Features

**AI Answers** (shipped pre-2025): Standard RAG implementation. Semantically indexes workspace content, retrieves relevant documents, generates answers using OpenAI (`gpt-4o-mini` + `text-embedding-ada-002`). Requires pgvector PostgreSQL extension for self-hosted. Available in Business/Enterprise self-hosted editions or all cloud tiers ([OpenAI docs](https://docs.getoutline.com/s/hosting/doc/openai-iiTYCN9Nct), [Pricing](https://www.getoutline.com/pricing)).

**MCP Server** (shipped Feb 18, 2026): First-party built-in MCP server per workspace. Enables AI assistants (Claude, Cursor, ChatGPT) to search, read, create, edit documents, and manage comments ([MCP announcement](https://www.getoutline.com/changelog/mcp)). This is Outline's most significant AI move to date.

### What MCP Enables
- Search across workspace
- Read document content
- Create new documents
- Edit existing documents
- Create/resolve comments

### What MCP Does NOT Enable
- Agent identity or attribution (edits appear as API key owner)
- Approval workflows for agent-generated content
- Structured agent co-creation patterns
- Knowledge graph generation or auto-linking
- AI-powered organization, tagging, or categorization

### Critical Assessment for Agent-Native Competitor

Outline's AI story has two fundamental issues from an agent-native perspective:

1. **LLM compute is IN the product.** AI Answers requires OpenAI API calls processed server-side. This is architecturally opposite to "zero LLM compute in the product." If your thesis is that AI processing happens in the agent layer (via MCP) and the knowledge platform is compute-free, Outline has made the opposite bet.

2. **MCP is access, not co-creation.** The MCP server provides CRUD operations on documents. It does not provide structured collaboration patterns where agents and humans co-create knowledge with attribution, review workflows, or semantic awareness. An agent writing to Outline via MCP is indistinguishable from a human using the API.

Third-party MCP servers also exist ([Glama](https://glama.ai/mcp/servers/@huiseo/outline-smart-mcp), [MCPServers](https://mcpservers.org/servers/HelicopterHelicopter/outline-mcp-server)) offering extended capabilities like batch operations.

### Roadmap Signals
No public roadmap. MCP shipped very recently (Feb 2026), suggesting AI/agent integration is a current priority, but the company is bootstrapped with a small team, limiting the pace of AI investment. No signals of building an AI engineering team or pursuing agent-native workflows.

---

## 3. Storage & Format Model

### Internal Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Primary DB | PostgreSQL | All structured data |
| Document content | JSONB column (ProseMirror tree) | Canonical document storage |
| Legacy text | Text column (markdown) | Backward compatibility |
| Collaboration state | BYTEA column (Y.js binary) | Real-time CRDT state |
| Search index | TSVECTOR column | Full-text search |
| File storage | S3-compatible | Attachments, images |
| Cache/pubsub | Redis | Real-time coordination |

([DeepWiki analysis](https://deepwiki.com/outline/outline/2.1-document-model-and-api))

### The Markdown Truth

Outline markets itself as "markdown compatible" but the canonical storage format is **ProseMirror JSON, not markdown**. The maintainer stated explicitly: "Markdown cannot represent all the many things that a modern text editor must achieve" ([Discussion #7396](https://github.com/outline/outline/discussions/7396)).

Using `x-api-version: 3` with the API returns JSON, not markdown. Markdown export is available but acknowledged as lossy.

### Portability Assessment

**Export formats**: Markdown, HTML, JSON (per-document, per-collection, or workspace-wide)

**Git backup**: No native git sync. The maintainer recommends webhook-driven sync: "listen for `revisions.create` event and write the data to git every time it's received" ([Discussion #6790](https://github.com/outline/outline/discussions/6790)). Community tools exist (`outline-export`, `FeralMib/outline-backup`) but are DIY.

**Import formats**: Confluence, Notion, Word, Markdown, JSON, drag-and-drop HTML/text.

**Competitive implication**: A markdown+git native product where the source file IS the canonical format (not a lossy export) has a structural trust advantage with developer-oriented teams. Outline's rich editor creates format lock-in because ProseMirror JSON captures features that markdown cannot express.

---

## 4. Collaboration & Multiplayer

### Real-Time Editing
Y.js CRDT with WebSocket transport, mature after 5+ years of production use. Similar experience to Google Docs: no save button, instant visibility of other users' edits, cursor presence indicators. Redis handles pub/sub for multi-instance deployments ([getoutline.com](https://www.getoutline.com/)).

### Permissions
Hierarchical model: Workspace > Collection > Document. Roles at each level (Admin, ReadWrite, Read). Group-based access control. Private collections with explicit membership. Public sharing via unique tokens (documents and collections). No email/password auth -- SSO required.

### Comments
Document-level and text-selection comments with threading, @mentions (users and groups), resolution workflow. Accessible via API and MCP.

### Assessment
Collaboration is Outline's strongest dimension. The Y.js CRDT implementation is technically sophisticated and battle-tested. This is the hardest thing to replicate in a competing product and represents Outline's deepest moat.

---

## 5. OSS Status, Licensing & Pricing

### License: BSL 1.1 (Source-Available, NOT Open Source)

Specific terms from the [LICENSE file](https://github.com/outline/outline/blob/main/LICENSE):
- **Licensor**: General Outline, Inc.
- **Change Date**: 2030-03-18 (for v1.6.1)
- **Change License**: Apache License 2.0
- **Restriction**: May not use as a "Document Service" (hosted service for third parties)
- Pre-v0.40.0 versions were MIT; v0.40.2 converted to Apache on March 1, 2023

The [Open Source Initiative does not consider BSL an open source license](https://en.wikipedia.org/wiki/Business_Source_License). Community members have noted that marketing as "open source" is misleading ([HN discussion](https://news.ycombinator.com/item?id=24806598)). However, unlike HashiCorp's BSL switch (which spawned OpenTofu), no notable fork of Outline has emerged.

The maintainer's position: "The intent of the license is to allow companies to self host the software for internal use" ([Discussion #3301](https://github.com/outline/outline/discussions/3301)).

### Pricing

| Tier | Monthly Price | Team Size |
|------|--------------|-----------|
| Starter | $10 | 1-10 |
| Team | $79 | 11-100 |
| Business | $249 | 101-200 |
| Enterprise | Custom | 200+ |

All tiers include: unlimited docs, real-time collaboration, AI answers, SSO, API, webhooks, 20+ integrations, audit log. Self-hosted community edition is free with limited features; Business/Enterprise self-hosted licenses available at undisclosed pricing ([Pricing](https://www.getoutline.com/pricing)).

### GitHub Metrics
37.9k stars, 3.2k forks, 9,247 commits, 2-4 week release cadence. Latest: v1.6.1 (March 18, 2026). Active and consistent development ([GitHub](https://github.com/outline/outline)).

### Company
General Outline, Inc., founded 2020 in NYC. Bootstrapped and profitable. Founded by Tom Moor (who also serves as Head of Engineering at Linear). Small team. No VC funding ([About](https://www.getoutline.com/about)).

### Competitive Implication
BSL means a competitor cannot fork Outline and offer it as a hosted service. But it also means the community cannot organically build extensions or competing distributions. A truly open-source (MIT/Apache) competitor would have a governance and community-building advantage, especially with developers who care about license purity.

---

## 6. Positioning & Strategic Direction

### Current Positioning
"Your team's knowledge base" / "The fastest knowledge base for growing teams." Speed and simplicity are the primary differentiators. Positioned against Confluence (modern alternative for teams leaving Atlassian) and implicitly against Notion (focused wiki vs. all-in-one workspace) ([getoutline.com](https://www.getoutline.com/)).

### Product Trajectory (Changelog Analysis)

| Period | Focus | Key Releases |
|--------|-------|-------------|
| Late 2024 | Editor maturity | v1.0.0, image lightbox, table improvements |
| 2025 | Integrations & collaboration | GitHub/Linear embeds, public collections, group mentions, PDF embeds, Draw.io |
| Early 2026 | AI/agent integration | MCP server, GitLab integration, toggle blocks, passkeys |

### Strategic Vulnerabilities

1. **One-person bottleneck**: Tom Moor is both Outline founder and Linear Head of Eng. Development velocity is structurally limited.
2. **No extensibility story**: Without a plugin system, feature breadth is permanently constrained by core team capacity.
3. **BSL limits community leverage**: Cannot benefit from community-driven feature development the way true OSS projects can.
4. **AI is additive, not transformative**: AI Answers and MCP are features added to an existing product, not a fundamental rethinking of how knowledge is created and managed with AI.
5. **Editor gap vs. Notion**: Missing databases, views, and advanced blocks limits TAM to pure documentation use cases.
6. **Format lock-in risk**: ProseMirror JSON canonical format creates portability concerns for technically sophisticated users.

### Where Outline Is NOT Going
Based on available evidence, Outline is not moving toward:
- Agent-native knowledge management (agents as first-class knowledge contributors)
- Markdown+git as substrate (explicitly moved away from markdown internally)
- Plugin/extension ecosystem (no signals)
- Zero LLM compute architecture (embedded OpenAI dependency)

---

## 7. Developer Experience & Extensibility

### API
RPC-style API (POST-only, `resource.action` endpoints) covering 16 resource types. Well-documented at [getoutline.com/developers](https://www.getoutline.com/developers). The application is built on its own API (dogfooding). Authentication via API keys or OAuth 2.0 with scoped permissions.

### Webhooks
Event-driven notifications for document, user, comment, and collection events. HMAC SHA-256 signed payloads. Configurable per-event or per-category.

### Authentication
SSO-only (no email/password). Supports Google, Microsoft, Slack as providers. OIDC from any compliant provider. SAML for Business/Enterprise. Passkey/biometric support added Jan 2026 ([Auth docs](https://docs.getoutline.com/s/hosting/doc/authentication-7ViKRmRY5o)).

### Integrations
25+ native integrations across design (Figma, Framer), collaboration (Airtable, Miro, Google Docs), developer (GitHub, Linear, GitLab, Zapier), and media (YouTube, Vimeo) categories. Most are embed-based (paste URL, get rich preview). Slack has the deepest integration with slash commands and notifications ([Integrations](https://www.getoutline.com/integrations)).

### Plugin System: Does Not Exist
This is the most significant extensibility gap. No plugin architecture, no extension API, no custom block development, no marketplace. A developer attempting to extend Outline must fork the codebase ([Discussion #6467](https://github.com/outline/outline/discussions/6467)). The maintainer has not signaled interest in building an extension system.

---

## Synthesis: Implications for an Agent-Native Competitor

### Where Outline is Strong (Respect)
- **Real-time collaboration**: 5+ years of Y.js CRDT maturity. Hard to replicate quickly.
- **Editor quality**: ProseMirror-based editor is polished and fast, even if less feature-rich than Notion.
- **Community traction**: 37.9k GitHub stars, active development, bootstrapped profitability.
- **Self-hosting story**: Docker deployment with PostgreSQL/Redis/S3, appeals to privacy-conscious teams.

### Where Outline is Structurally Weak (Opportunity)

| Gap | Why It Matters | Agent-Native Advantage |
|-----|---------------|----------------------|
| ProseMirror JSON is canonical, not markdown | Format lock-in, lossy exports | Markdown+git native = true portability |
| LLM compute embedded (OpenAI dependency) | Vendor lock-in, privacy concerns | Zero LLM compute = agents bring their own intelligence |
| No plugin/extension system | Feature breadth limited to one-person team | Open extension model = community-driven innovation |
| BSL license | Not true OSS, limits community forks | MIT/Apache = authentic open source community |
| MCP is CRUD, not co-creation | Agents can read/write but can't truly collaborate | Agent-native primitives: attribution, review, semantic awareness |
| No agent identity/attribution | AI edits indistinguishable from human API calls | First-class agent identity in the knowledge graph |
| No approval workflows for agent content | No quality gate for AI-generated knowledge | Human-in-the-loop review for agent contributions |

### The Strategic Wedge

Outline proves there is demand for a fast, self-hostable, real-time collaborative wiki. But it has made architectural choices (ProseMirror JSON over markdown, embedded LLM compute, no extensibility) that are structurally incompatible with the agent-native knowledge platform thesis. The opportunity is not to out-feature Outline on its terms, but to build on a fundamentally different substrate (markdown+git) with a fundamentally different AI architecture (zero LLM compute, agent-native primitives) that Outline cannot retrofit without rewriting its core.

---

## Evidence Files

- [evidence/product-capabilities.md](evidence/product-capabilities.md) - Editor, blocks, markdown, search details
- [evidence/ai-agent-story.md](evidence/ai-agent-story.md) - AI Answers, MCP, agent gaps
- [evidence/storage-format-model.md](evidence/storage-format-model.md) - PostgreSQL, ProseMirror JSON, export/import
- [evidence/collaboration-multiplayer.md](evidence/collaboration-multiplayer.md) - Y.js CRDT, permissions, comments
- [evidence/licensing-pricing-oss.md](evidence/licensing-pricing-oss.md) - BSL terms, pricing tiers, GitHub metrics
- [evidence/positioning-strategy.md](evidence/positioning-strategy.md) - Marketing, trajectory, vulnerabilities
- [evidence/developer-experience.md](evidence/developer-experience.md) - API, webhooks, auth, integrations, no plugins
