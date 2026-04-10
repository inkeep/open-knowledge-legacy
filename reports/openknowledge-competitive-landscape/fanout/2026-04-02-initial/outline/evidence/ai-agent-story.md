---
title: "Outline AI & Agent Story Evidence"
type: evidence
subject: Outline
dimension: ai-agent-story
collected: 2026-04-02
sources:
  - url: https://www.getoutline.com/changelog/mcp
    type: primary
    description: Official MCP announcement (Feb 18, 2026)
  - url: https://docs.getoutline.com/s/guide/doc/search-ai-answers-NIKPvYrx06
    type: primary
    description: AI Answers documentation
  - url: https://docs.getoutline.com/s/hosting/doc/openai-iiTYCN9Nct
    type: primary
    description: OpenAI integration for self-hosted
  - url: https://www.getoutline.com/pricing
    type: primary
    description: Pricing page confirming "AI question answering" in all tiers
  - url: https://glama.ai/mcp/servers/@huiseo/outline-smart-mcp
    type: secondary
    description: Third-party Outline MCP server
  - url: https://mcpservers.org/servers/HelicopterHelicopter/outline-mcp-server
    type: secondary
    description: Another third-party Outline MCP server
---

# AI & Agent Story Evidence

## Built-in AI Features

### AI Answers (Cloud + Licensed Self-Hosted)
- Semantic indexing of workspace content
- Generates direct answers to questions using document content
- Appears at top of search results and in Slack integration
- Requires OpenAI API key (self-hosted) or included (cloud)
- Self-hosted requires: OpenAI API key + pgvector PostgreSQL extension
- Uses `gpt-4o-mini` and `text-embedding-ada-002` models (Azure config reveals this)
- Available in Business + Enterprise editions from v0.75.1+
- Respects user permissions - only surfaces content user can access
- Drafts NOT included in AI index (may change)
- Workspace data explicitly NOT used for AI training

### AI Question Answering in All Cloud Tiers
- Listed as feature in Starter ($10/mo), Team ($79/mo), Business ($249/mo)
- "Multi-language translation" also listed across all tiers

## MCP Integration (First-Party)

### Released February 18, 2026
- Built-in MCP server per workspace
- No separate setup required beyond connecting AI client
- Supports: Claude, Cursor, ChatGPT, and other MCP-compatible assistants

### Capabilities:
- Search across entire workspace
- Read documents
- Create documents
- Edit documents
- Find, create, and resolve comments

### Architecture:
- First-party integration (not a third-party plugin)
- Each workspace gets its own MCP server endpoint
- "Connect your AI assistants in just a minute of setup"

## Third-Party MCP Servers (Community)

Multiple community-built MCP servers exist:
1. `huiseo/outline-wiki-mcp` - Extended operations including batch operations, collection management
2. `HelicopterHelicopter/outline-mcp-server` - Alternative implementation

These offer potentially richer feature sets than the built-in MCP.

## What's Missing in the AI Story

1. **No AI writing assistance** - No inline AI completion, rewriting, or generation
2. **No AI-powered organization** - No automatic categorization, tagging, or linking
3. **No agent-native workflows** - MCP is read/write access, not co-creation
4. **No custom AI models** - Hardcoded to OpenAI (GPT-4o-mini + ada-002)
5. **No local/private LLM support** - Must use OpenAI or Azure OpenAI
6. **LLM compute is IN the product** - AI Answers requires OpenAI API calls; this is the opposite of "zero LLM compute in the product"
7. **No AI-enhanced collaboration** - No AI summaries, auto-linking, knowledge graph generation
8. **No agent identity/attribution** - Changes via MCP appear as the API key owner, no distinct agent identity
9. **No approval workflows for agent edits** - No review/approve mechanism for AI-generated content

## Roadmap Signals

- MCP released very recently (Feb 2026) - indicates AI/agent integration is a current priority
- No public roadmap available
- Changelog shows steady feature development but AI features are limited to search/answers
- Tom Moor has not publicly discussed agent-native knowledge management vision
- Company is bootstrapped and profitable, suggesting measured pace rather than VC-fueled AI pivot
