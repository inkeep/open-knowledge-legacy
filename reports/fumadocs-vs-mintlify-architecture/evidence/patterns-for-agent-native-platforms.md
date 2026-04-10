# Evidence: Patterns for Agent-Native Knowledge Platforms

**Dimension:** Patterns for Agent-Native Knowledge Platforms
**Date:** 2026-04-02
**Sources:** Cross-cutting synthesis from all research dimensions

---

## Key files / pages referenced

- All evidence files in this report
- https://fumadocs.dev/blog/fumadocs-mdx-road-map — Fuma Content evolution
- https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant — ChromaFs
- https://www.mintlify.com/blog/context-for-agents — Content negotiation patterns
- https://www.mintlify.com/blog/skill-md — Agent skill specification

---

## Findings

### Finding: The git-backed filesystem-as-database pattern is validated by both frameworks
**Confidence:** CONFIRMED
**Evidence:** Both Fumadocs and Mintlify treat Git repos of MDX files as the canonical data layer

Pattern: MDX files in git = source of truth
- Fumadocs: files ARE the content, read at build time
- Mintlify: files ARE the content, synced bidirectionally with visual editor
- Both: no database for content storage (Mintlify uses DBs only for search indices and AI features)

**Implications:** Git-backed markdown is a proven substrate. The question is not whether it works, but what layer you build on top.

### Finding: Content negotiation (same URL, different formats based on Accept header) is the emerging agent-access pattern
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/context-for-agents, https://fumadocs.dev/docs/integrations/llms

Both implement:
- HTML for browsers (default)
- Markdown for agents (Accept: text/markdown)
- Fumadocs: `.mdx` URL suffix alternative
- Mintlify: HTTP headers for llms.txt discovery

Mintlify reports 30x token reduction vs serving HTML to agents.

**Implications:** A knowledge platform should serve content in multiple formats from the same source. The content negotiation middleware pattern is lightweight and powerful.

### Finding: The MCP server pattern makes documentation an API surface for AI agents
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/model-context-protocol

Mintlify's MCP server exposes two tools:
1. Search documentation
2. Get full page content

This turns documentation into a queryable service that AI agents can use at inference time. The pattern is: content in git -> index in vector DB -> MCP server exposes search+read tools -> any MCP client can query.

**Implications:** An MCP server over markdown content is a natural fit for the knowledge platform. Zero LLM compute (on the server side) — the MCP server just serves content, the client's LLM does the reasoning.

### Finding: skill.md as a meta-layer above llms.txt optimizes agent onboarding to a product's documentation
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/skill-md

skill.md contains:
- Decision tables (not lengthy descriptions)
- Explicit boundaries (what agents can/cannot do)
- Gotchas section (common agent mistakes)
- Links to full docs (llms.txt for deep context)

Auto-generated from documentation. Installable via skills CLI.

**Implications:** A knowledge platform should support multiple machine-readable entry points: llms.txt (index), llms-full.txt (all content), skill.md (agent-optimized guide), and MCP (real-time query).

### Finding: Fumadocs' Fuma Content evolution points toward a general-purpose content processing layer
**Confidence:** INFERRED
**Evidence:** https://fumadocs.dev/blog/fumadocs-mdx-road-map

Fuma Content is being designed as:
- Framework-agnostic content processor
- Multiple bundler support (Vite, Turbopack, Webpack)
- Plugin system for content transforms
- "Foundation for developing a CMS layer, such as plugins for MDX editing or remote databases"
- Git as version control backbone

**Implications:** Fuma Content's direction aligns closely with the knowledge platform concept. A content processing layer that reads from git, validates with schemas, transforms via plugins, and outputs to multiple targets.

### Finding: ChromaFs demonstrates that agents benefit from filesystem-like abstractions over content, not raw API access
**Confidence:** INFERRED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

ChromaFs gives agents `grep`, `cat`, `ls`, `find` over documentation stored in a vector database. The filesystem metaphor was chosen because:
- Agents already understand filesystem operations
- It's more natural than custom API endpoints
- Supports incremental exploration (ls -> cat -> grep)
- Chunk reassembly handles document splitting

**Implications:** For a knowledge platform, exposing content through familiar filesystem operations (real git filesystem or virtual) may be more effective than custom APIs. Agents already know how to navigate directories and read files.

---

## Gaps / follow-ups

- Whether the skill.md standard will be adopted beyond Mintlify's ecosystem
- How content negotiation performs at scale with complex MDX (custom components that need rendering)
- The optimal balance between filesystem-native access and API-mediated access for agents
