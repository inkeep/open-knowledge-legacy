---
title: "llms.txt and AGENTS.md: Knowledge Delivery Standards for AI Agents"
type: evidence
dimension: D5
source_type: primary
confidence: high
date_collected: 2026-04-03
sources:
  - url: https://llmstxt.org
    title: "llms.txt specification"
    type: specification
  - url: https://agents.md/
    title: "AGENTS.md specification"
    type: specification
  - url: https://www.mintlify.com/blog/what-is-llms-txt
    title: "What is llms.txt? Breaking down the skepticism"
    type: blog
  - url: https://www.mintlify.com/blog/ai-documentation-trends-whats-changing-in-2025
    title: "AI Documentation Trends: What's Changing in 2025"
    type: blog
  - url: https://www.mintlify.com/blog/agent-analytics
    title: "Analytics for AI and agent traffic"
    type: blog
  - url: https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/
    title: "How to write a great agents.md - GitHub Blog"
    type: blog
---

# llms.txt and AGENTS.md: Knowledge Delivery Standards for AI Agents

## llms.txt Standard

### Origin and Purpose

Proposed September 2024 by **Jeremy Howard** (co-founder of Answer.AI, fast.ai). A standardized markdown file placed at `/llms.txt` on websites to provide LLM-friendly documentation within context window limitations.

### File Format

Required structure in order:
1. **H1 heading** (required) — Project or site name
2. **Blockquote** (optional) — Brief summary with key information
3. **Body content** (optional) — Detailed information paragraphs
4. **H2 sections** (optional) — "File lists" organizing curated links
   - Each item: `[name](url)` with optional notes after a colon
5. **"Optional" H2 section** — Secondary info that may be skipped in shorter contexts

### Variants

- **llms.txt**: Concise index/TOC with links to detailed content
- **llms-full.txt**: Complete flattened documentation in one file (for large context windows)

### Adoption

Early adopters: FastHTML, nbdev, Answer.AI, fast.ai

Notable adopters: Anthropic (Claude docs), Cloudflare, Vercel, Stripe, Zapier, Supabase, Cursor, Shopify, Hugging Face, Pinecone, NVIDIA. 784+ websites have implemented llms.txt.

Available integrations: CLI tools (`llms_txt2ctx`), JavaScript implementations, VitePress and Docusaurus plugins, Drupal module, VS Code extensions, WordPress (via Yoast SEO).

**Critical caveat**: Google's John Mueller stated in June 2025: "No AI system currently uses llms.txt." No major LLM provider has officially confirmed reading these files. The standard's primary practical value is for **developer tooling** (AI coding assistants, documentation chatbots via MCP) rather than for general-purpose LLM inference.

### Mintlify's Role

Mintlify helped establish llms.txt as a de facto standard. Key metrics:
- 10,000+ companies onboarded
- 1M+ monthly AI queries
- 8-figure ARR in 2025
- Auto-publishes llms.txt files and MCP servers for each docs site
- LLM traffic projected: 0.25% of search (2024) → 10% (end of 2025)

> "Most docs weren't built for machines to read — they were built for humans to browse, which is problematic when the majority of your 'readers' are increasingly LLMs."

## AGENTS.md Convention

### Origin

Emerged through collaborative efforts involving OpenAI Codex, Amp, Google Jules, Cursor, and Factory. Now managed by the **Agentic AI Foundation** under the **Linux Foundation**. Adopted by **60,000+ repositories** on GitHub.

### Purpose

"A README for agents" — complements README.md with agent-specific context:
- Build steps and test commands
- Coding conventions and style preferences
- Pull request guidelines
- Security boundaries
- Architecture overview

### Key Design Decisions

- **Plain markdown**: No schema, no dependencies
- **Hierarchical**: Nearest file in directory tree takes precedence
- **Size-conscious**: ≤150 lines recommended; files >32 KiB (Codex default) may be truncated
- **Boundaries**: "Never commit secrets" is most common useful constraint

### Cross-Agent Support

AGENTS.md is consumed by:
- OpenAI Codex CLI (native, hierarchical discovery)
- GitHub Copilot (supported)
- Claude Code (via fallback filename configuration)
- Various other agents

## Comparison: llms.txt vs AGENTS.md vs CLAUDE.md

| Dimension | llms.txt | AGENTS.md | CLAUDE.md |
|-----------|----------|-----------|-----------|
| **Scope** | Web documentation | Repository codebase | Repository codebase |
| **Audience** | Any LLM consumer | Coding agents | Claude Code |
| **Location** | `/llms.txt` on website | Project root + subdirs | Project root + subdirs |
| **Discovery** | HTTP fetch | File system traversal | File system traversal |
| **Content** | Doc links + summaries | Build/test/style instructions | Build/test/style/structure |
| **Adoption** | Growing (web docs) | 20,000+ repos | Claude Code ecosystem |
| **Max size** | No formal limit | 32 KiB (Codex default) | <300 lines recommended |

## Significance for KB Design

These standards demonstrate a converging pattern:

1. **Structured metadata first**: Title, summary, links — not raw content
2. **Progressive disclosure**: Index → summary → full content
3. **Agent-authored discovery**: Let the agent decide what to read
4. **Plain markdown**: Universal format, no special tooling required
5. **Hierarchical scoping**: Different levels of specificity for different contexts
