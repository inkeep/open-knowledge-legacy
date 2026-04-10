---
title: "TipTap in 2026: Product Direction, Platform Ambitions, and Overlap with Agent-Native Knowledge Platforms"
description: "Deep analysis of TipTap's evolution from open-source editor library to document infrastructure platform in 2026. Covers product surface, business model, AI features, collaboration, roadmap, and assesses overlap risk with an agent-native knowledge platform that uses TipTap as its editor engine."
createdAt: 2026-04-04
updatedAt: 2026-04-04
subjects:
  - TipTap
  - Hocuspocus
  - ProseMirror
  - Ueberdosis GmbH
  - Yjs
topics:
  - editor infrastructure
  - document platforms
  - AI document editing
  - CRDT collaboration
  - competitive overlap
---

# TipTap in 2026: Product Direction, Platform Ambitions, and Overlap with Agent-Native Knowledge Platforms

**Purpose:** Determine whether TipTap is evolving from a dependency into a competitor for an agent-native knowledge platform. Assess what TipTap provides, where it's heading, and where the boundary between "their infrastructure" and "our product" lies.

---

## Executive Summary

TipTap in 2026 is a document infrastructure platform, not a knowledge platform. Their stated mission -- "the document layer around the database" -- positions them as embedded infrastructure that product teams use to add editing, collaboration, and AI-powered document manipulation to their own applications. They sell managed cloud documents, AI editing tools, and conversion pipelines. They do not sell knowledge management, agent orchestration, content organization, or publishing workflows.

The competitive overlap risk is **low**. TipTap's roadmap (AI Toolkit, document conversion, tracked changes) deepens their value as a dependency rather than moving them toward the knowledge layer. Their Server AI Toolkit -- headless document editing via REST API -- is the closest feature to what an agent-native platform needs, but it solves "how does an AI edit a document?" not "how do agents collaboratively build and navigate a knowledge base?"

The strategic picture: TipTap is becoming a better version of what we'd use them for. Their open-source core (editor, Hocuspocus, markdown extension) remains MIT-licensed and self-hostable. Their paid features (AI Toolkit, conversion, tracked changes) are add-ons that could accelerate development but are not required for the knowledge platform's core architecture, which depends on git persistence and MCP-based agent integration -- two domains TipTap does not touch.

**Key Findings:**

- **TipTap is a five-product platform** generating $2.3M revenue with ~15 people. Products: Editor (MIT), Collaboration (Cloud/self-hosted), Documents (Cloud), Content AI (paid add-on), Conversion (paid). Their revenue comes from cloud document quotas and paid add-ons, not the editor itself.
- **Their AI story is BYOLLM** (bring your own LLM). The AI Toolkit provides document-editing tools for external AI agents, not bundled intelligence. Shorthand compression format reduces token costs by 80%. The Server AI Toolkit enables headless agent-to-document editing without a browser.
- **No knowledge management signals anywhere in their roadmap.** Zero mentions of wiki-links, knowledge graphs, backlinks, search, navigation, content hierarchy, publishing, or agent identity. Their "Flex" experiment is a single-user AI writing app, not a knowledge platform.
- **TipTap alternatives are weaker in 2026.** Milkdown (solo maintainer risk), Lexical (no collab story), Plate (different paradigm), BlockNote (built on TipTap). TipTap + Hocuspocus remains the strongest ProseMirror-based editor + collaboration stack.

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|-----------|----------|-------|
| D1 | TipTap product & business in 2026 | P0 | Deep |
| D2 | 2026 roadmap & recent releases | P0 | Deep |
| D3 | TipTap AI features | P0 | Deep |
| D4 | Collaboration features | P0 | Deep |
| D5 | TipTap as platform -- templates, content management | P0 | Deep |
| D6 | Overlap analysis with agent-native knowledge platform | P0 | Synthesis |
| D7 | Alternatives to TipTap in 2026 | P1 | Moderate |

**Stance:** Factual with synthesis. D6 provides analytical framing grounded in D1-D5 evidence.

**Non-goals:** Implementation guidance, migration planning, cost modeling, TipTap internal codebase analysis.

---

## Detailed Findings

### D1: TipTap's Product and Business in 2026

**Finding:** TipTap has evolved from an editor library into a five-product document infrastructure platform with a clear freemium model.

**Evidence:** [evidence/d1-product-business.md](evidence/d1-product-business.md)

The product surface in 2026:

| Product | License | Role |
|---------|---------|------|
| **Editor** | MIT (OSS) | Headless rich-text editor on ProseMirror |
| **Collaboration** | Cloud or self-hosted | Real-time editing via Hocuspocus/Yjs |
| **Documents** | Cloud or self-hosted | Document storage, REST API, version history |
| **Content AI** | Paid add-on | AI Toolkit, AI Generation, Server AI Toolkit |
| **Conversion** | Paid | DOCX import/export, PDF export, page layouts |

Plus emerging products: Pages (page-based layout), Flex (AI writing prototype), Shorthand (token compression format).

The business model is document-based, not per-seat. [TipTap](https://tiptap.dev/pricing) charges for cloud document storage quotas: Start (500 docs, free), Team (5,000 docs), Business (50,000 docs), Enterprise (custom). Revenue in 2024 was $2.3M with approximately 15 employees. The company is headquartered in Berlin, founded 2023 by Philip Isik et al.

Notable customers include Substack, Coda, Productboard, BCG, KPMG, Axios, Beehiiv, Hebbia, and Jenni AI. Integration partners include Anthropic, LinkedIn, and GitLab. The customer base skews toward apps that embed TipTap as their editing layer -- they are infrastructure customers, not end-user knowledge management customers.

In June 2025, TipTap [open-sourced 8 formerly-Pro extensions](https://tiptap.dev/blog/release-notes/were-open-sourcing-more-of-tiptap) (Details, Emoji, DragHandle, FileHandler, InvisibleCharacters, Mathematics, TableOfContents, UniqueID) under MIT, signaling a strategic shift from selling individual extensions to selling platform features.

**Decision triggers:**
- If TipTap's cloud document pricing grows prohibitive at scale, the self-hosted Hocuspocus path becomes the clear choice.
- If TipTap's customer base shifts toward knowledge-management use cases, re-evaluate competitive positioning.

**Remaining uncertainty:**
- Exact funding amount unclear (sources report $2.6M to $8.75M -- discrepancy across databases).

---

### D2: 2026 Roadmap and Recent Releases

**Finding:** TipTap's 2026 mission is "the document layer around the database," with three strategic bets: AI in documents, document conversion, and Flex (AI-native writing UI).

**Evidence:** [evidence/d2-roadmap-releases.md](evidence/d2-roadmap-releases.md)

The [2026 roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026) articulates a vision where product teams treat documents as "first-class objects in their product's data model, queryable, versioned, permissioned, and validated server-side." This is infrastructure positioning, not application positioning.

**Editor v3** shipped stable in July 2025 with meaningful upgrades: Floating UI (replacing tippy.js), MarkViews for React/Vue, y-tiptap package (TipTap-specific fork of y-prosemirror), consolidated extension packages, static renderer (HTML/markdown output without DOM), and server-side rendering support.

The **public roadmap** at [tiptap.dev/roadmap](https://tiptap.dev/roadmap) shows:

| Status | Feature |
|--------|---------|
| Available | Shorthand, Server AI Toolkit, Pages, AI Toolkit |
| Next | AI Toolkit + Version History, Decorations API, Redlining/Tracked Changes |
| Future | Unified Authentication, Dashboard, Page-Aware AI Agents |

**@tiptap/markdown** launched in October 2025 as an [open-source bidirectional markdown extension](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap). It uses MarkedJS for CommonMark-compliant parsing, supports round-trip conversion (Markdown -> TipTap JSON -> Markdown), and has a modular MarkdownManager architecture with custom tokenizer support.

**Hocuspocus** continues at v3.4.4 (published February 2026), with multiplexing (multiple documents over a single WebSocket) as the major recent feature.

The 2025 blog post timeline reveals rapid product expansion: AI Suggestion (March), UI Components (April), v3 beta (May), AI Agent + open-sourcing + new pricing (June), v3 stable (July), Notion template (July), Pages (September), AI Toolkit (October-November), Markdown (October).

**Decision triggers:**
- The y-tiptap fork of y-prosemirror means TipTap-specific collaboration enhancements may not flow back to y-prosemirror. If using TipTap for editing, y-tiptap is the recommended binding.
- Tracked Changes (redlining) is on the "Next" roadmap -- if our platform needs suggestion mode, waiting for TipTap's implementation could save significant effort.

---

### D3: TipTap AI Features

**Finding:** TipTap's AI is a BYOLLM toolkit for document editing -- it provides the integration surface for AI agents to manipulate structured documents, not bundled intelligence.

**Evidence:** [evidence/d3-ai-features.md](evidence/d3-ai-features.md)

The [AI Toolkit](https://tiptap.dev/docs/content-ai/capabilities/ai-toolkit/overview) uses a "Brain-Hands-Eyes" model: the LLM (any provider) is the "brain," and TipTap is the "hands and eyes" that execute document operations and read content. It works with OpenAI, Anthropic, Vercel AI SDK, LangChain.js, Mastra, and custom providers.

Capabilities in the current AI Toolkit:
- Document reading (schema-aware, selection-aware)
- Content rewriting and insertion
- Streaming tool calls rendered in real-time
- Multi-document operations with switching
- Comment and annotation insertion
- Pre-built workflows (proofreading, insertion, editing)

The [Server AI Toolkit](https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/overview) is the most architecturally significant piece: it enables headless document editing via REST API (POST /v3/ai/toolkit/tools, /execute-tool, /schema-awareness-prompt) with no browser required. It supports both cloud-managed documents (by ID) and direct JSON input/output. This is essentially "MCP-like tool calling for TipTap documents" -- but proprietary, not MCP-compatible.

[Tiptap Shorthand](https://tiptap.dev/roadmap) is a compression format that encodes TipTap document structure efficiently, reducing AI token costs by 80-90% compared to standard JSON. Available in both the client-side AI Toolkit and the Server AI Toolkit REST API.

The AI product is a paid add-on across all tiers. AI Generation (basic commands: summarize, rephrase, translate) is available from the Start tier. Custom LLM backends require the Business tier. The AI Toolkit requires a separate subscription and access to TipTap's private npm registry.

**Implications:** TipTap's AI approach is philosophically aligned with a "zero LLM compute" platform -- they provide tools, not intelligence. However, their Server AI Toolkit is a proprietary REST API, not an open standard like MCP. A knowledge platform using MCP for agent-document interaction would build a different integration surface. The Shorthand compression format is interesting but TipTap-specific -- it cannot be used outside TipTap's ecosystem.

**Decision triggers:**
- If the cost of building a custom MCP-to-CRDT bridge exceeds the cost of the AI Toolkit add-on, consider using TipTap's Server AI Toolkit as the agent-document interface.
- If token cost reduction is critical, evaluate whether Shorthand's compression is worth the platform coupling.

**Remaining uncertainty:**
- Server AI Toolkit stability (alpha-quality, API may change).
- Shorthand format specification is not public -- cannot assess compatibility.
- Pricing for AI Toolkit add-on is not publicly disclosed.

---

### D4: Collaboration Features

**Finding:** TipTap Collaboration is a complete real-time editing solution built on Yjs/CRDT, with the critical distinction that self-hosted Hocuspocus gives full feature access without cloud dependency.

**Evidence:** [evidence/d4-collaboration.md](evidence/d4-collaboration.md)

The collaboration feature matrix:

| Feature | Availability | Tier |
|---------|-------------|------|
| Real-time CRDT editing | Self-hosted or Cloud | All |
| Presence / awareness (cursors) | Cloud | Team+ |
| Comments (threaded) | Cloud | Start+ |
| Version history (snapshots) | Cloud | Start+ |
| Snapshot comparison | Cloud | Team+ |
| Tracked Changes | Cloud (add-on, unstable) | Business+ |
| Webhooks | Cloud | Team+ |
| Document REST API | Cloud | Start+ |
| Offline editing + sync | Self-hosted or Cloud | All |

The critical architectural point: **self-hosted Hocuspocus provides the core CRDT collaboration without TipTap Cloud**. Switching between self-hosted and cloud is a provider swap (HocuspocusProvider vs TiptapCollabProvider) with no API changes.

y-tiptap is a TipTap-specific fork of y-prosemirror that adds conversion utilities (prosemirrorJSONToYDoc, yDocToProsemirror) and scoped undo/redo. Improvements are contributed back to y-prosemirror where feasible.

TipTap does **not** have agent/bot collaboration concepts. The AI Toolkit edits documents through tools, not as a named participant in the CRDT session. There is no "AI cursor" or "agent presence" in the collaboration layer.

**Decision triggers:**
- If agent presence (showing an AI cursor to human users) is a requirement, this must be built on top of Hocuspocus -- TipTap does not provide it.
- Tracked Changes is pre-1.0 and unstable. If suggestion-mode editing is needed soon, budget for custom implementation.

---

### D5: TipTap as Platform -- Templates, Content Management

**Finding:** TipTap provides editor templates and document storage but is not building a content management system or knowledge platform.

**Evidence:** [evidence/d5-platform-content.md](evidence/d5-platform-content.md)

The [Notion-like editor template](https://tiptap.dev/templates/notion-like-template) is a pre-built reference implementation with block-based editing, slash commands, drag-and-drop, collaboration, AI writing, and dark mode. It requires the Start plan and is a template, not a product -- developers use it as a starting point for their own editor UI.

[TipTap Documents](https://tiptap.dev/product/documents) is a specialized document database: JSON/HTML storage, REST API, version history, webhooks, content injection, encryption at rest. It is not a CMS -- there is no content modeling, schema definition, publishing pipeline, content hierarchy, or content delivery API beyond raw document fetch.

[TipTap Flex](https://tiptap.dev/flex) is a prototype AI-native writing app built by two people in under 10 weeks. It targets individual writers (blogs, memos, newsletters) and is a platform dogfooding vehicle. The 2026 plan is to productize Flex as an embeddable writing experience, not a standalone knowledge product.

What TipTap explicitly does NOT have or plan:
- Content modeling / schema design tools
- Publishing workflows or static site generation
- Knowledge graphs, wiki-links, or backlinks
- Multi-document organization or hierarchy
- Navigation or information architecture
- Search / retrieval capabilities
- Content delivery APIs (beyond document CRUD)
- MDX support or llms.txt output

**Decision triggers:**
- If TipTap's Flex experiment evolves into a knowledge management tool (no evidence of this), re-evaluate overlap.
- The Notion-like template could accelerate UI development for the editor layer of a knowledge platform.

---

### D6: Overlap Analysis

**Finding:** TipTap is infrastructure that sits below the knowledge platform layer. The overlap is in collaboration and AI editing capabilities, but at different architectural layers with different integration models.

**Evidence:** [evidence/d6-overlap-analysis.md](evidence/d6-overlap-analysis.md)

**Layer diagram:**

```
+-----------------------------------------------------------+
|                    KNOWLEDGE PLATFORM                      |
|  (Knowledge graph, MCP server, agent orchestration,       |
|   git persistence, drafts/branches, skills ecosystem,     |
|   wiki-links, search, navigation, publishing, llms.txt)   |
+-----------------------------------------------------------+
|                    EDITOR INFRASTRUCTURE                   |
|  (TipTap Editor, Hocuspocus, y-tiptap, @tiptap/markdown, |
|   static renderer, extensions)                            |
+-----------------------------------------------------------+
|                    FOUNDATION                              |
|  (ProseMirror, Yjs, MarkedJS)                             |
+-----------------------------------------------------------+
```

**What we use from TipTap (all MIT, no cloud dependency):**

| Component | Purpose | Risk |
|-----------|---------|------|
| Tiptap Editor | Rich-text editing engine | Low -- MIT, massive community |
| y-tiptap | CRDT binding for collaboration | Low -- MIT fork of y-prosemirror |
| Hocuspocus | Collaboration server | Low -- MIT, self-hostable |
| @tiptap/markdown | Bidirectional markdown | Low -- MIT, open-source |
| @tiptap/static-renderer | Server-side rendering | Low -- MIT |

**Where overlap exists:**

| Domain | TipTap's approach | Knowledge platform approach | Overlap risk |
|--------|------------------|---------------------------|-------------|
| Real-time collaboration | Managed Cloud or self-hosted Hocuspocus | Self-hosted Hocuspocus | **None** -- same foundation |
| AI document editing | AI Toolkit (proprietary REST API, BYOLLM) | MCP server + agent tools | **Low** -- different protocols |
| Server-side editing | Server AI Toolkit (REST, JWT, Cloud) | MCP tool -> CRDT bridge | **Low** -- different architectures |
| Document storage | Cloud document database | Git-based persistence | **None** -- fundamentally different |
| Version history | Cloud snapshots | Git commits and branches | **None** -- fundamentally different |
| Comments | Cloud threaded comments | Custom or TipTap's | **Low** -- optional to use theirs |

**What the knowledge platform builds that TipTap does NOT provide:**

- MCP server for agent tool interaction
- Git-based persistence (WIP refs, draft branches, merge-squash checkpoints)
- Knowledge graph with wiki-links and backlinks
- Agent identity in collaboration (named AI collaborators with cursors)
- Skills ecosystem for agent capabilities
- Draft isolation via git branches
- Multi-document knowledge organization (hierarchy, navigation, tags)
- Content compilation and publishing (MDX, llms.txt, static output)
- Search and retrieval across the knowledge base

**Risk assessment: Could TipTap build what we're building?**

The answer is almost certainly no, for structural reasons:

1. **Mission mismatch.** "Document layer around the database" is horizontal infrastructure. A knowledge platform is a vertical application. TipTap's incentive is to be embedded in thousands of apps, not to be the app.

2. **Revenue model prevents it.** TipTap charges per cloud document. A knowledge platform charges per user, per workspace, or per agent. Building a vertical product would cannibalize their infrastructure revenue stream.

3. **Team size constrains it.** With ~15 people and $2.3M revenue, TipTap is fully occupied building and maintaining their current product surface across editor, collaboration, AI, and conversion.

4. **Customer relationships prevent it.** Their customers (Substack, Coda, Productboard) are apps that embed TipTap. Building a competing application would threaten those relationships.

5. **No signals anywhere.** Zero mentions of knowledge management, wiki-links, agent orchestration, git persistence, or content hierarchy in roadmap, blog, docs, or product pages.

The highest-value risk is actually the opposite: TipTap becoming a *better* dependency than expected, making us dependent on their paid features (AI Toolkit, tracked changes) rather than building our own. This is a vendor lock-in risk, not a competitive risk.

---

### D7: Alternatives to TipTap in 2026

**Finding:** TipTap + Hocuspocus remains the strongest ProseMirror-based editor + collaboration stack. No alternative offers equivalent breadth.

**Evidence:** [evidence/d7-alternatives.md](evidence/d7-alternatives.md)

| Editor | Foundation | Collaboration | Markdown | Maturity | Viability |
|--------|-----------|---------------|----------|----------|-----------|
| **TipTap** | ProseMirror | Hocuspocus (built-in) | @tiptap/markdown | High | Best overall |
| **Milkdown** | ProseMirror | Via Y.js plugin | Native (markdown-first) | Medium | Viable but solo-maintainer risk |
| **Lexical** | Custom (Meta) | None built-in | None | High | Missing collab story |
| **BlockNote** | TipTap (!) | Via Liveblocks | None | Medium | TipTap dependency |
| **Plate** | Slate.js | Via slate-yjs | None | Medium | Different paradigm entirely |
| **BlockSuite** | Custom (AFFiNE) | Native Yjs | None | Medium | Not designed as embeddable |
| **ProseMirror** | (itself) | Via y-prosemirror | None | Highest | Maximum control, maximum effort |

**Milkdown** (v7.18.0, January 2026) remains a viable markdown-centric alternative with native ProseMirror + Remark + Y.js. The risk is single-maintainer dependency and a smaller ecosystem. Its React integration requires manual UI construction.

**Lexical** (Meta) is stable and actively maintained with a growing ecosystem (LexKit launched September 2025), but has no built-in collaboration, no Hocuspocus equivalent, and no markdown extension. Switching to Lexical would mean building the entire collaboration layer independently.

**BlockNote** is built *on top of* TipTap -- using it means depending on TipTap anyway. It adds a Notion-style block abstraction layer and has early AI features (@blocknote/xl-ai).

**Plate** uses Slate.js (a different paradigm from ProseMirror). Its CRDT story via slate-yjs is less mature than y-prosemirror/y-tiptap.

**ProseMirror** itself continues incremental maintenance under Marijn Haverbeke (Transform v1.11.0, January 2026). Going raw ProseMirror is always possible but significantly more development effort.

**Decision triggers:**
- If markdown-first editing is the dominant use case and TipTap's overhead is unnecessary, Milkdown is viable.
- If TipTap's business trajectory raises concerns (unlikely given current signals), Milkdown or raw ProseMirror are fallback paths.
- Lexical is only viable if collaboration is not a core requirement.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **TipTap's exact funding:** Conflicting reports ($2.6M vs $8.75M) across tracking databases.
- **Server AI Toolkit stability:** Alpha product with potential API changes. Production readiness unconfirmed.
- **Shorthand format specification:** Not publicly documented. Cannot assess compatibility or portability.
- **AI Toolkit pricing:** Specific add-on pricing not publicly disclosed.
- **Q1 2026 Recap blog post:** Content not fully extracted from the March 10, 2026 post.

### Out of Scope (per Rubric)
- Implementation guidance for integrating TipTap
- Cost modeling for TipTap's paid tiers
- TipTap internal codebase analysis
- Migration planning from Milkdown to TipTap or vice versa
- First-party codebase analysis of our knowledge platform

---

## References

### Evidence Files
- [evidence/d1-product-business.md](evidence/d1-product-business.md) - TipTap product surface, pricing, team, customers, business model
- [evidence/d2-roadmap-releases.md](evidence/d2-roadmap-releases.md) - 2026 roadmap, v3 features, blog timeline, Hocuspocus status
- [evidence/d3-ai-features.md](evidence/d3-ai-features.md) - AI Toolkit, Server AI Toolkit, Shorthand, BYOLLM model
- [evidence/d4-collaboration.md](evidence/d4-collaboration.md) - Collaboration features, Hocuspocus, y-tiptap, tracked changes
- [evidence/d5-platform-content.md](evidence/d5-platform-content.md) - Templates, Documents product, Flex, CMS non-aspirations
- [evidence/d6-overlap-analysis.md](evidence/d6-overlap-analysis.md) - Layer analysis, overlap matrix, risk assessment
- [evidence/d7-alternatives.md](evidence/d7-alternatives.md) - Milkdown, Lexical, BlockNote, Plate, BlockSuite, ProseMirror

### External Sources
- [TipTap 2026 Roadmap](https://tiptap.dev/blog/release-notes/our-roadmap-for-2026) - Official 2026 strategic direction
- [TipTap Pricing](https://tiptap.dev/pricing) - Current pricing tiers and feature comparison
- [TipTap Feature Comparison](https://tiptap.dev/feature-comparison) - Tier-by-tier feature matrix
- [TipTap Open Source to Platform](https://tiptap.dev/open-source-to-platform) - OSS vs platform strategy narrative
- [TipTap Editor v3](https://tiptap.dev/tiptap-editor-v3) - v3 feature list and changes
- [TipTap AI Toolkit](https://tiptap.dev/docs/content-ai/capabilities/ai-toolkit/overview) - AI Toolkit documentation
- [TipTap Server AI Toolkit](https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/overview) - Headless document editing
- [TipTap Server AI REST API](https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/api-reference/rest-api) - REST API endpoints
- [TipTap Customers](https://tiptap.dev/customers) - Customer list
- [TipTap Public Roadmap](https://tiptap.dev/roadmap) - Feature status and timeline
- [TipTap Open-Sourcing Extensions](https://tiptap.dev/blog/release-notes/were-open-sourcing-more-of-tiptap) - Pro extension open-sourcing
- [TipTap Markdown](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap) - Bidirectional markdown support
- [TipTap Flex](https://tiptap.dev/flex) - AI writing experiment
- [TipTap Documents](https://tiptap.dev/product/documents) - Document storage product
- [Hocuspocus GitHub](https://github.com/ueberdosis/hocuspocus) - Collaboration server repository
- [y-tiptap GitHub](https://github.com/ueberdosis/y-tiptap) - TipTap Yjs binding
- [Milkdown GitHub](https://github.com/Milkdown/milkdown) - Alternative editor
- [BlockNote GitHub](https://github.com/TypeCellOS/BlockNote) - Block-based editor (built on TipTap)
- [Lexical GitHub](https://github.com/facebook/lexical) - Meta's editor framework
- [ProseMirror Changelog](https://prosemirror.net/docs/changelog/) - ProseMirror updates
- [Liveblocks Editor Comparison](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) - Third-party framework comparison
