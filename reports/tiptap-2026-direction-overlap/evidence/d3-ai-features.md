# Evidence: TipTap AI Features

**Dimension:** D3 — TipTap's AI features
**Date:** 2026-04-04
**Sources:** tiptap.dev/docs/content-ai, tiptap.dev/product/content-ai, tiptap.dev/product/ai-toolkit, tiptap.dev/roadmap

---

## Key pages referenced
- https://tiptap.dev/docs/content-ai/capabilities/ai-toolkit/overview — AI Toolkit docs
- https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/overview — Server AI Toolkit
- https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/api-reference/rest-api — REST API
- https://tiptap.dev/docs/content-ai/capabilities/agent/overview — AI Agent (deprecated)
- https://tiptap.dev/docs/content-ai/capabilities/agent/custom-llms/overview — Custom LLM integration

---

## Findings

### Finding: TipTap's AI is a toolkit, not bundled LLM compute
**Confidence:** CONFIRMED
**Evidence:** AI Toolkit overview page

TipTap does NOT bundle LLM compute. The AI Toolkit provides:
- Document-editing **tools** for AI agents (read, edit, plan)
- **Workflows** (pre-built: insert, proofread, edit, comment)
- Schema awareness (understands document structure)
- Selection awareness (reduces token usage by passing only relevant content)

Supported LLM providers: Vercel AI SDK, LangChain.js, OpenAI, Anthropic, Mastra, custom providers.

Quote: "works with any AI model capable of producing text, including open source and self-hosted models"

**Implications:** TipTap is a BYOLLM (bring your own LLM) platform. This is philosophically similar to a "zero LLM compute" approach — TipTap provides the integration surface, not the AI itself.

### Finding: Three-tier AI product evolution (deprecated -> current -> future)
**Confidence:** CONFIRMED
**Evidence:** Blog posts, docs

**Deprecated (2025):**
- AI Suggestion, AI Changes, AI Assistant — being phased out

**Current (production):**
- **AI Toolkit** (client-side) — enables AI agents to edit documents in-browser
  - Brain-Hands-Eyes model: LLM is the "brain," TipTap is "hands and eyes"
  - Tools: document reading, content rewriting, planning/summarization
  - Streaming tool calls shown in real-time
  - Multi-document operations with document switching
  - Comment/annotation insertion
- **AI Generation** — built-in text commands (summarize, rephrase, translate), image generation, autocompletion
- **Content AI Advanced** — streaming AI responses, custom LLM backend connection

**Emerging (alpha/beta):**
- **Server AI Toolkit** — headless document editing with no browser required
  - REST API: POST /v3/ai/toolkit/tools, /execute-tool, /schema-awareness-prompt
  - Tools: tiptapRead, tiptapEdit, getThreads, editThreads
  - Supports both Cloud-managed documents and direct JSON
  - Shorthand format for 80% token cost reduction

### Finding: TipTap Shorthand reduces AI token costs by 80-90%
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/roadmap, Server AI Toolkit docs

Shorthand is a compression format purpose-built for TipTap documents:
- Encodes structure efficiently
- Reduces AI token costs by 80-90% vs standard JSON
- Available in both AI Toolkit and Server AI Toolkit
- Format option in REST API (JSON vs Shorthand)

### Finding: AI Toolkit is a paid add-on, not part of base pricing
**Confidence:** CONFIRMED
**Evidence:** tiptap.dev/pricing, feature comparison

- Available as add-on across Start, Team, and Business plans
- Requires access to TipTap's private npm registry
- AI Generation available from Start tier
- Custom LLMs available from Business tier

### Finding: Server AI Toolkit enables agent-to-document editing without browsers
**Confidence:** CONFIRMED
**Evidence:** Server AI Toolkit overview and REST API docs

Architecture:
- REST API with JWT authentication
- Can operate on Cloud documents (by documentId) or direct JSON
- Tools for reading, editing, thread management
- Schema-aware (understands custom nodes/marks)
- Shorthand format support
- Can be self-hosted or cloud service

**Implications:** This is the most relevant TipTap feature for agent-native platforms. It provides a way for backend AI agents to read/write structured documents without a browser DOM.

---

## Gaps / follow-ups
- Server AI Toolkit is in alpha — stability unknown
- Pricing for AI Toolkit add-on not publicly disclosed
- Performance benchmarks for Shorthand compression not available
- Vendor note: TipTap's AI features are their revenue growth driver; product-incentive bias possible in claimed token savings
