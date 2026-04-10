# Evidence: What Big Labs Publish (D6)

**Dimension:** D6 — What Big Labs Publish
**Date:** 2026-04-03
**Sources:** Official lab publications, product documentation, academic papers
**Sub-report evidence:** fanout/2026-04-02-fanout/rag-evolution-lab-publications/evidence/ (10 files)

---

## Key Findings

### Finding: Anthropic published the reference architecture for production RAG (contextual retrieval)
**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/news/contextual-retrieval](https://www.anthropic.com/news/contextual-retrieval), September 2024

67% failure reduction with full stack. Established that no single technique suffices — contextual embeddings + BM25 + reranking together.

### Finding: MCP has 8M+ server downloads and is the community consensus protocol
**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/news/model-context-protocol](https://www.anthropic.com/news/model-context-protocol), November 2024

Three retrieval-relevant primitives: Resources (application-controlled), Tools (agent-controlled), Prompts (templates).

### Finding: Anthropic's context engineering framework recommends minimal tool surfaces (3-5 tools)
**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/engineering/effective-context-engineering-for-ai-agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), September 2025

"The smallest set of high-signal tokens that maximize the likelihood of your desired outcome." Just-in-time retrieval over pre-loading. Sub-agents for context isolation.

### Finding: Google's Developer Knowledge MCP Server is the closest production analog to target system
**Confidence:** CONFIRMED
**Evidence:** [developers.google.com/knowledge/mcp](https://developers.google.com/knowledge/mcp), February 2026

Two-phase: SearchDocumentChunks -> GetDocument/BatchGetDocuments. Serves developer docs as markdown. 24-hour re-indexing. Streamable HTTP transport.

### Finding: OpenAI's file_search validates hybrid search as default
**Confidence:** CONFIRMED
**Evidence:** OpenAI Assistants/Responses API documentation

Hybrid search (vector + keyword + RRF reranking). Automatic, opaque chunking.

### Finding: ChatGPT Memory uses structured fact storage, not RAG over conversations
**Confidence:** CONFIRMED
**Evidence:** OpenAI product documentation

Two-tier: explicit memories (structured facts) + chat history reference. Demonstrates structured fact storage outperforms RAG for personalization.

### Finding: Microsoft Azure AI Search has first-class "agentic retrieval" with 40% relevance improvement
**Confidence:** CONFIRMED
**Evidence:** [learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview)

LLM decomposes queries into focused subqueries, parallel execution, semantic reranking.

### Finding: Meta CRAG benchmark shows even SOTA RAG only answers 63% without hallucination
**Confidence:** CONFIRMED
**Evidence:** Meta CRAG benchmark, June 2024

Naive LLMs hit 34%. Establishes the ceiling and gap for RAG systems.
