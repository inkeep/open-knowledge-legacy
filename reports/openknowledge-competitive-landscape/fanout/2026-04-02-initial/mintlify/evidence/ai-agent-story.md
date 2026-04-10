---
title: "Mintlify AI / Agent Story"
dimension: "AI / Agent Story"
date_collected: "2026-04-02"
sources:
  - url: "https://www.mintlify.com/blog/generate-mcp-servers-for-your-docs"
    title: "Generate MCP servers from your docs"
  - url: "https://www.mintlify.com/docs/ai/model-context-protocol"
    title: "Model Context Protocol - Mintlify"
  - url: "https://www.mintlify.com/docs/ai/llmstxt"
    title: "llms.txt - Mintlify"
  - url: "https://www.mintlify.com/blog/skill-md"
    title: "skill.md: An open standard for agent skills"
  - url: "https://www.mintlify.com/docs/ai/skillmd"
    title: "skill.md - Mintlify Docs"
  - url: "https://www.mintlify.com/blog/mintlify-acquires-trieve-to-improve-rag-search-in-documentation"
    title: "Mintlify acquires Trieve"
  - url: "https://www.mintlify.com/blog/mintlify-acquires-helicone"
    title: "Mintlify acquires Helicone"
  - url: "https://www.mintlify.com/blog/knowledge-management-agent-era"
    title: "AI agents are shipping faster than anyone can document"
  - url: "https://www.mintlify.com/blog/autopilot"
    title: "Introducing the next step towards self-updating docs"
  - url: "https://www.mintlify.com/docs/guides/automate-agent"
    title: "Tutorial: Auto-update documentation when code changes"
  - url: "https://ferndesk.com/blog/mintlify-review"
    title: "Mintlify Review 2026 - Ferndesk"
  - url: "https://www.mintlify.com/blog/introducing-ai-assistant-2025"
    title: "Introducing AI Assistant 2025"
---

# AI / Agent Story Evidence

## Three AI Surface Areas

Mintlify positions AI across three vectors:

### 1. AI Assistant (End-User Facing)

- Conversational Q&A embedded directly in docs sites
- Powered by Claude Sonnet 4.5 with agentic retrieval
- 1M+ monthly AI queries served
- Multi-turn conversations with citations and source links
- Text highlighting for context
- Automatic conversation categorization by topic
- 250 messages/month on Pro before overage at $0.15/message
- Available as embeddable widget (assistant-embed-example repo)

### 2. Mintlify Agent (Author Facing)

- Monitors codebases and proposes documentation updates when code ships
- Generates context-aware drafts matching existing documentation style
- Accessible via dashboard, Slack, or API
- Customizable through AGENTS.md files in repo
- Runs on OpenCode and Daytona sandboxed environments
- Creates PRs or commits directly based on configuration
- Pro plan only ($300/month)

### 3. AI Infrastructure (Machine Facing)

**MCP Server (auto-generated for every docs site)**:
- Hosted at `/mcp` path of docs domain (e.g., mintlify.com/docs/mcp)
- Two tools exposed: Search (with pageSize, scoreThreshold, version, language params) and Get Page (full content retrieval by path)
- Authenticated endpoint at `/authed/mcp` for private docs (OAuth-based)
- Rate limits: 5,000 req/hr per user, 10,000 req/hr per site for search/get-page
- Respects .mintignore and docs.json navigation settings

**llms.txt (auto-generated)**:
- Two files: `/llms.txt` (page index) and `/llms-full.txt` (full content dump)
- Also served at `/.well-known/llms.txt` and `/.well-known/llms-full.txt`
- HTTP Link headers and X-Llms-Txt headers for tool detection
- Respects authentication; excludes user-group-gated pages
- Customizable by placing custom files in repo root

**skill.md (auto-generated)**:
- Served at `/.well-known/skills/default/skill.md` and `/skill.md`
- Machine-readable format describing how agents should use the product
- Contains decision tables, capabilities, constraints, gotchas
- Auto-regenerated on every docs update
- Discoverable by 20+ coding agents (Claude Code, OpenCode, Cursor)
- Installable via `npx skills add https://mintlify.com/docs`
- Follows agent-skills 0.2.0 discovery spec with content integrity verification

**Content Negotiation**: Serves different formats (human HTML vs. machine markdown) based on requester.

## Workflows (Automated Documentation Maintenance)

- Version-controlled YAML/Markdown workflow definitions
- Triggers: schedule-based or event-driven (GitHub push events)
- Architecture: GitHub Actions or n8n webhook-based
- API endpoint: `https://api.mintlify.com/v1/agent/{projectId}/job`
- Agent clones code and docs repos in ephemeral Daytona sandbox
- Generates documentation updates based on code diffs
- Creates PRs with descriptive branch names
- Human-in-the-loop review before merge

## Acquisitions Deepening AI Capability

**Trieve (July 2025)**: RAG infrastructure. Now backbone of search. Reduces search times 50%, improves answer accuracy 40%. Open-source project continues.

**Helicone (March 2026)**: LLM observability and AI gateway. 16,000 organizations, three years of production AI insights. Enables: enhanced analytics, multi-provider routing with fallback, full-stack AI knowledge infrastructure.

## What Agents CANNOT Do

- Agents cannot write TO Mintlify content via MCP (read-only: Search and Get Page)
- No support ticket analysis or gap identification
- No customer behavior analytics feeding into docs
- No real-time collaborative editing between agents and humans
- MCP server is read-only -- no create/update/delete operations
