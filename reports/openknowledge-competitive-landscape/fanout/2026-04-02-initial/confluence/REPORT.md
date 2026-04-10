# Atlassian Confluence: Competitive Deep-Dive

**Research date**: 2026-04-02
**Purpose**: Map Confluence's current state and trajectory across 7 dimensions relevant to building an agent-native knowledge platform where AI agents co-create knowledge alongside humans via MCP, with markdown+git as the substrate.

---

## Executive Summary

Confluence is the market-incumbent enterprise knowledge platform with ~300,000+ customers, deeply integrated with Jira. Atlassian has made aggressive AI moves through Rovo (bundled free with all paid plans since April 2025) and a generally-available MCP server. However, Confluence's architecture is fundamentally **human-first with AI bolted on** — not agent-native. Its proprietary ADF storage format, persistent editor quality complaints, linear-only version history, and lack of markdown/git substrate create structural vulnerabilities for a purpose-built agent-native competitor.

---

## 1. Product Capabilities & Editing Experience

**Assessment: Persistent weakness despite heavy investment**

### Editor State (April 2026)

Confluence has two editor paradigms in transition:

- **New cloud editor** (ADF-based): Mandatory from April 2026, replacing the legacy HTML editor. Block-based editing with structured content types.
- **Live Docs** (beta from Team '25): Google Docs-like real-time editing without a publish step. Supports up to 100 simultaneous viewers.

Despite years of investment, **editor complaints remain endemic** in the community:
- "Why is the Confluence Cloud Editor so much worse?" is a representative community thread ([source](https://community.atlassian.com/forums/Confluence-questions/Why-is-the-Confluence-Cloud-Editor-so-much-worse/qaq-p/2242549))
- Cloud editor characterized as having "far fewer options compared to on-premises version"
- Complex documents with tables and diagrams are slow to edit
- PDF export produces "messy formatting" requiring manual fixes
- Concurrent editing can mix up changes between users ([source](https://www.peerspot.com/questions/what-needs-improvement-with-atlassian-confluence))

### Content Types

Confluence has expanded beyond pages to include:
- **Pages** (traditional, publish-based) and **Live Docs** (real-time, no publish)
- **Whiteboards** (visual collaboration with AI assist)
- **Databases** (structured data, GA August 2024) ([source](https://community.atlassian.com/forums/Confluence-Databases-articles/2024-Confluence-Databases-A-year-of-innovation-amp-what-s-next/ba-p/2948763))
- **Folders**, **Smart Links**, and 18+ templates

### Search Quality

Confluence search has been a **persistent, widely-acknowledged weakness**:
- Community threads with titles like "Confluence Search Sucks" and "Why is Confluence Wiki Search so bad?" ([HN](https://news.ycombinator.com/item?id=28597895))
- Requires exact keyword matches; limited wildcard support
- Metadata-poor content is nearly unfindable
- Jira Service Management searches can cause Confluence performance degradation ([source](https://support.atlassian.com/confluence/kb/searches-from-jira-service-management-can-lead-to-performance-problems-in-confluence/))
- Rovo AI search is the proposed answer, but it layers AI on top of the same underlying index

### Performance Improvements
Credit where due: Confluence space load performance improved 55%, typography and iconography were updated, and 6,000+ accessibility improvements were shipped ([source](https://www.forty8fiftylabs.com/blog/team-25-recap-part-1-key-atlassian-product-announcements-every-technical-leader-should-know/)).

**Competitive implication**: The editor is Confluence's Achilles' heel. A competitor with a best-in-class markdown editor that agents can also natively read/write has a genuine UX advantage with both human and AI users.

---

## 2. AI / Agent Story

**Assessment: Aggressive moves, but AI is bolted on — not native to the content model**

### Three-Layer Architecture

**Layer 1 — Atlassian Intelligence** (built-in, all paid plans):
Summarize pages/comments/changes, draft content, improve writing, adjust tone, translate, extract Jira tasks from text, natural language search (beta), automation via natural language ([source](https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-confluence/)).

**Layer 2 — Rovo** (AI teammate platform):
Chat, semantic search, custom agents, Rovo Studio (no-code agent builder). Powered by the Teamwork Graph connecting people, projects, goals, and content. Originally $20-24/user/month; reversed to bundled-free with paid subscriptions April 2025, suggesting adoption struggled at premium pricing ([source](https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles)).

**Layer 3 — Rovo MCP Server** (external agent integration, GA):
Cloud-hosted at `mcp.atlassian.com`, Apache-2.0 open source ([GitHub](https://github.com/atlassian/atlassian-mcp-server)), OAuth 2.1 auth, supports Claude/ChatGPT/VS Code/Cursor/Devin and more.

### Confluence MCP Tools (Exhaustive List)

| Tool | Capability |
|------|-----------|
| `createConfluencePage` | Create page/live doc with **Markdown body** |
| `updateConfluencePage` | Update existing page (title, body, location) |
| `getConfluencePage` | Get page by ID, body returned as **Markdown** |
| `getConfluencePageDescendants` | List child pages |
| `getConfluenceSpaces` | List/filter spaces |
| `getPagesInConfluenceSpace` | List pages in space |
| `searchConfluenceUsingCql` | Search via CQL |
| `createConfluenceFooterComment` | Create footer comment/reply |
| `createConfluenceInlineComment` | Create inline comment on text |
| `getConfluencePageFooterComments` | List footer comments as Markdown |
| `getConfluencePageInlineComments` | List inline comments |

([source](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/))

**Critical observation**: MCP tools accept and return content as **Markdown**, not ADF. Atlassian performs the conversion server-side. This is a pragmatic admission that ADF is unusable for agents — but the conversion is lossy in both directions.

### What Agents Cannot Do

- Modify ADF at the node level (only full-page read/write)
- Reorder page hierarchy programmatically via MCP
- Subscribe to real-time content change events
- Access structural metadata about document organization
- Operate as first-class identities in the permission model (agents masquerade as users)
- Bring their own LLM compute — all AI runs on Atlassian's infrastructure

**Competitive implication**: Atlassian has built AI *on top of* Confluence and MCP *as a bridge to* Confluence. An agent-native platform would build AI *into the content substrate itself* — where markdown is the native format, git provides version control, and agents are first-class participants, not guests speaking through a translator.

---

## 3. Storage & Format Model

**Assessment: Proprietary lock-in via ADF; markdown is structurally foreign**

### Atlassian Document Format (ADF)

ADF is a proprietary JSON tree with:
- ~26 block node types (paragraph, heading, table, panel, expand, codeBlock...)
- ~8 child node types (listItem, tableCell, tableHeader, media...)
- ~8 inline node types (text, emoji, mention, inlineCard, status...)
- 9 mark types (strong, em, code, link, strike, underline, textColor, subsup, border)

([specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/))

This is roughly **40x more complex than markdown** as a content representation. The complexity is necessary for rich features (panels, expands, macros) but creates:

### Data Portability Problem

- **No native markdown export** from Confluence
- Third-party tools exist ([confluence-markdown-exporter](https://github.com/Spenhouet/confluence-markdown-exporter), [Marketplace app](https://marketplace.atlassian.com/apps/1221351/markdown-exporter-for-confluence)) but conversion is **lossy**
- Built-in exports: PDF, Word, HTML — all with formatting fidelity issues
- XML space export for backup, not migration
- ADF macros, panels, custom extensions have no markdown equivalent
- Pandoc has an open issue for ADF support since 2024 ([#9898](https://github.com/jgm/pandoc/issues/9898)) — not yet implemented

### API Content Access

The REST API v2 can return page bodies in multiple formats:
- `storage` (raw ADF JSON)
- `atlas_doc_format` (ADF)
- `view` (rendered HTML)
- `export_view` (HTML optimized for export)

No native markdown endpoint in the REST API — only the MCP server performs markdown conversion.

**Competitive implication**: Confluence content is effectively locked in ADF. Migration away from Confluence requires lossy conversion through third-party tools. A markdown+git platform offers fundamentally better portability, agent-readability, and ecosystem interoperability. Every Confluence customer's content is trapped behind a format moat — but that moat also constrains what Confluence can offer agents.

---

## 4. Collaboration & Multiplayer

**Assessment: Mature for human collaboration; no concept of agent-as-collaborator**

### Real-Time Editing
- **Traditional pages**: Up to 12 simultaneous editors, near-real-time sync, requires publish
- **Live Docs**: Up to 100 simultaneous viewers, automatic save, no publish step
- **Whiteboards**: Real-time visual collaboration

### Comments
- Footer comments, inline comments tied to text selections, reactions, @mentions, resolution, and AI summarization of comment threads

### Permissions
- Space-level (admin/editor/viewer), page-level restrictions, group-based, anonymous access, guest access for external collaborators

### Version History
- Linear auto-incrementing versions (v.1, v.2, v.3...)
- Visual diff comparison between any two versions
- Restore previous version
- **No branching** — strictly linear
- **No structural diff** — comparison is visual, not semantic
- Cannot view per-contributor changes within a single version
- No git-like merge, rebase, or fork concepts

([source](https://confluence.atlassian.com/doc/page-history-and-page-comparison-views-139379.html))

**Competitive implication**: Confluence's linear version history is the anti-thesis of git. A markdown+git platform inherently offers branching, merging, structural diffs, and blame — capabilities that are foundational for agent collaboration (agents working on branches, humans reviewing and merging agent contributions).

---

## 5. OSS Status, Licensing & Pricing

**Assessment: Fully proprietary with escalating costs and forced migration pressure**

### OSS Status
**Completely proprietary.** The only open-source artifact is the Rovo MCP Server connector (Apache-2.0) — a thin bridge, not the product.

### Cloud Pricing (Post-October 2025)

| Plan | Price/user/month (annual) | Notable Gates |
|------|--------------------------|---------------|
| Free | $0 | 10 users, 2 GB, community support |
| Standard | ~$6.05-6.40 | 250 GB, 100 automations/month |
| Premium | ~$11.55-12.30 | Unlimited storage, analytics, 1000 automations/user/month |
| Enterprise | Custom | Guard, 99.95% SLA, 24/7 support |

### October 2025 Increases
- Standard: +5%
- Premium: +7.5%
- Enterprise: +7.5% to +10%

([source](https://www.e7solutions.com/news/what-you-need-to-know-about-atlassians-october-2025-cloud-pricing-changes))

**Clarification**: Some reports referenced "3x" — this referred to site user limits tripling to 150,000, not pricing. Actual increases were 5-10%.

### Data Center End of Life
- All DC licenses expire March 28, 2029
- New DC subscriptions close March 30, 2026
- February 2026 DC price increase: ~15% (legacy pricing: 18-40%)
- Post-expiration: read-only, no patches, no support

([source](https://www.atlassian.com/licensing/data-center-end-of-life))

This creates a **forced migration timeline** pushing all DC customers to Cloud, compressing decision windows and generating customer anxiety.

### Rovo Pricing Reversal
From $20-24/user/month standalone to bundled-free — a strong signal that Rovo wasn't reaching adoption targets at premium pricing. Atlassian chose distribution over direct AI monetization.

**Competitive implication**: Confluence's pricing is enterprise-mature but escalating. The forced DC-to-Cloud migration and steady price increases create customer resentment. An open-source or open-core competitor with transparent pricing and no format lock-in has a clear procurement narrative.

---

## 6. Positioning & Strategic Direction

**Assessment: "System of Work" positioning; doubling down on human-first + AI assistant, not agent-native**

### Strategic Thesis
Atlassian is building a **unified work platform** (Jira + Confluence + Loom + Rovo) bundled as "Collections." Confluence is positioned as the knowledge layer within this system, not as a standalone product.

### Key Team '25 / 2025-2026 Moves
1. **Rovo for All** — AI bundled free, signaling AI-as-table-stakes, not differentiator
2. **Collections model** — Bundling products to increase switching costs
3. **Live Docs** — Closing the Google Docs gap for real-time collaboration
4. **Databases** — Structured data within Confluence (Notion-like)
5. **MCP Server GA** — Opening Confluence to external agents
6. **Isolated Cloud** (2026) — Targeting regulated enterprises
7. **150K user sites** — Scaling for largest organizations

([Team '25 recap](https://www.forty8fiftylabs.com/blog/team-25-recap-part-1-key-atlassian-product-announcements-every-technical-leader-should-know/))

### Agent-Native vs. AI-Assisted: Where Is Confluence?

Confluence is firmly in the **AI-assisted** camp:
- AI summarizes human-written content
- AI drafts content that humans review and publish
- AI searches across human-organized knowledge
- Rovo agents assist within human workflows
- MCP provides agent access, but as a bridge, not native substrate

There is **no evidence** that Atlassian is moving toward:
- Agents as first-class knowledge authors in the content model
- Content formats designed for agent readability/writability
- Git-like version control where agents operate on branches
- Local-first or distributed knowledge that agents can work with offline
- Bring-your-own-model AI that customers control

### The Jira Moat
Confluence's deepest competitive advantage is **Jira coupling**, not knowledge management quality. Most Confluence customers are Jira customers first. The Collections model further deepens this dependency. Competing with Confluence on knowledge management alone is feasible; competing with the Jira+Confluence bundle requires addressing the workflow integration layer.

---

## 7. Developer Experience & Extensibility

**Assessment: Comprehensive but transitioning; Forge limitations frustrate developers**

### APIs
- **REST API v2**: 28 endpoint groups, cursor-based pagination, OAuth 2.0 + Basic Auth ([docs](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/))
- **GraphQL**: Beta since March 2022 — still not GA after 4+ years ([source](https://www.atlassian.com/blog/developer/bringing-you-new-confluence-graphql-apis-in-beta))
- **CQL**: Proprietary query language for content search
- **MCP Server**: GA, Apache-2.0, Markdown I/O for agent integration

### Extension Framework Transition
- **Forge** (current): Mandatory for new Marketplace apps since Sep 2025. Serverless on Atlassian infra, 25-second runtime limit, consumption-based pricing from Jan 2026.
- **Connect** (deprecated): End of support December 2026. No new listings, no updates after March 2026.

([source](https://www.atlassian.com/blog/developer/announcing-connect-end-of-support-timeline-and-next-steps))

### Forge Developer Pain Points
- 25-second execution limit constrains complex operations
- Performance lags vs self-hosted Connect apps for data-heavy workloads
- Basic error tracking; log access requires user permission grants
- Platform updates can cause intermittent app failures
- Storage options (KV, Entity, RDBMS) less flexible than self-managed databases

([source](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/))

### Marketplace
Large ecosystem of existing apps, but the forced Connect-to-Forge migration is creating disruption. App vendors face significant rewrite effort with potential capability regression due to Forge limitations.

**Competitive implication**: Confluence's API is comprehensive for CRUD but lacks modern patterns (GraphQL GA, streaming, webhooks for granular events). The Forge transition is creating developer churn. A platform with a clean, modern API surface (REST + real-time + native markdown) and no legacy migration burden has a developer experience advantage.

---

## Synthesis: Confluence's Structural Position

### Strengths an Agent-Native Competitor Must Respect
1. **Enterprise distribution**: 300K+ customers, deep IT procurement relationships
2. **Jira integration moat**: Most knowledge workers using Confluence are Jira users first
3. **MCP server**: Genuine, GA, open-source agent access — not vaporware
4. **Rovo bundling**: "AI included" is now table-stakes for procurement
5. **Content type breadth**: Pages, Live Docs, Whiteboards, Databases — broad surface area

### Structural Vulnerabilities an Agent-Native Competitor Can Exploit
1. **ADF is a proprietary dead-end for agents**: Not markdown, not git-compatible, ~40x more complex than needed for AI read/write
2. **Editor quality is a persistent sore point**: Years of investment haven't silenced complaints
3. **Search remains poor**: AI search overlays don't fix the underlying index quality
4. **Linear version history**: No branching, no structural diffs, no merge — the opposite of what agent collaboration requires
5. **AI is bolted on, not native**: Content format wasn't designed for agent consumption; MCP performs lossy markdown conversion
6. **Format lock-in**: Content entering Confluence is effectively trapped in ADF
7. **Pricing pressure + forced migration**: DC end-of-life + steady increases create customer unrest
8. **No local-first / git substrate**: Everything lives in Atlassian's cloud; no offline, no version control beyond linear history

### The Core Strategic Gap

Confluence treats knowledge as **human-authored content that AI can assist with**. An agent-native platform treats knowledge as **a shared substrate that humans and agents co-create**, where the content format (markdown), version control (git), and access model (MCP-native) are designed from the ground up for both human and agent participation.

This isn't a feature gap — it's an architectural gap. Confluence would need to replace ADF with a more agent-friendly format to close it, which would be a multi-year, backwards-compatibility-breaking undertaking.

---

## Evidence Files

| File | Dimensions Covered |
|------|-------------------|
| [evidence/editor-and-adf.md](evidence/editor-and-adf.md) | Product Capabilities, Storage & Format Model |
| [evidence/ai-agent-story.md](evidence/ai-agent-story.md) | AI / Agent Story |
| [evidence/pricing-licensing.md](evidence/pricing-licensing.md) | OSS Status, Licensing & Pricing |
| [evidence/strategic-direction.md](evidence/strategic-direction.md) | Positioning & Strategic Direction |
| [evidence/developer-experience.md](evidence/developer-experience.md) | Developer Experience & Extensibility |
| [evidence/collaboration-multiplayer.md](evidence/collaboration-multiplayer.md) | Collaboration & Multiplayer |
