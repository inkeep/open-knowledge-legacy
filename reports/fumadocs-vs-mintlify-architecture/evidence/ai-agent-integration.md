# Evidence: AI/Agent Integration

**Dimension:** AI/Agent Integration
**Date:** 2026-04-02
**Sources:** fumadocs.dev, mintlify.com

---

## Key files / pages referenced

- https://fumadocs.dev/docs/integrations/llms — Fumadocs LLM integration
- https://www.mintlify.com/docs/ai/model-context-protocol — Mintlify MCP
- https://www.mintlify.com/blog/generate-mcp-servers-for-your-docs — MCP generation
- https://www.mintlify.com/blog/context-for-agents — Content negotiation
- https://www.mintlify.com/blog/skill-md — skill.md standard
- https://www.mintlify.com/blog/agent-analytics — Agent analytics

---

## Findings

### Finding: Fumadocs provides building blocks for AI integration — llms.txt, .mdx endpoints, content negotiation
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/integrations/llms

Fumadocs AI features:
- **llms.txt**: Auto-generated index at `/llms.txt` via Loader API, cached permanently
- **llms-full.txt**: Comprehensive all-pages-combined text file via `getLLMText()` function
- **MDX endpoints**: Append `.mdx` to any URL to get raw Markdown (Content-Type: text/markdown)
- **Content negotiation**: `isMarkdownPreferred(request)` middleware detects AI agents, redirects to markdown
- **Page Actions component**: Copy/view buttons for sharing markdown with AI (installable via CLI)
- **Chat integration**: OpenRouter (Vercel AI SDK) and Inkeep AI options with automatic `/search` tool
- Setup requires: `includeProcessedMarkdown: true` in source config

Implementation is DIY — Fumadocs provides the primitives, developer wires them up.

**Implications:** Fumadocs gives you the ingredients to make docs agent-accessible, but you must build the integration yourself. No managed MCP server, no agent analytics.

### Finding: Mintlify provides a full managed AI/agent stack — auto-generated MCP, agent analytics, skill.md, content negotiation
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/model-context-protocol, https://www.mintlify.com/blog/agent-analytics, https://www.mintlify.com/blog/skill-md

Mintlify AI/agent stack:
1. **Auto-generated MCP server**: Hosted at `/mcp` (public) and `/authed/mcp` (authenticated). Exposes search + get-page tools. Rate-limited (5,000 req/hr per user). OAuth for web-based tools. Supports Claude, Cursor, VS Code, Goose, ChatGPT.

2. **Agent analytics**: Identifies AI agents via user-agent matching. Tracks: which agents visit, most-accessed pages, MCP searches. Helps teams optimize agent experience.

3. **skill.md**: Open standard at `/.well-known/skills/default/skill.md`. Agent-optimized product reference. Contains decision tables, boundaries, gotchas. Auto-regenerated on doc updates. Installable via `npx skills add <docs-url>`.

4. **Content negotiation**: `Accept: text/markdown` header → clean Markdown response. HTTP headers (`Link: </llms.txt>; rel="llms-txt"`, `X-Llms-Txt: /llms.txt`) for discovery. Prepends llms.txt index to Markdown pages. 30x token reduction vs HTML.

5. **llms.txt**: Auto-hosted, always up-to-date, zero maintenance.

6. **AI Assistant**: Agentic retrieval via ChromaFs. Claude Sonnet 4.5 powered. Citation tracking. Topic categorization.

7. **Mintlify Agent (Autopilot)**: Monitors repos for code changes. Auto-generates doc drafts. Creates PRs. Configurable via AGENTS.md. Pro plan only.

**Implications:** Mintlify is building the most comprehensive docs-for-agents platform in the market. The MCP server, skill.md, content negotiation, and agent analytics form a complete agent-native stack.

---

## Gaps / follow-ups

- Fumadocs MCP support is mentioned but details are sparse — may be community-contributed
- Mintlify's MCP server customization (adding custom tools beyond search/get-page) is not documented
- Whether skill.md becomes a widely adopted standard is uncertain
