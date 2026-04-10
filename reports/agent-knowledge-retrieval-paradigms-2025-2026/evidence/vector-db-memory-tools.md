# Evidence: Vector DB Companies and Agent Memory Tools (D3)

**Dimension:** D3 — Vector DB Companies and Agent Memory Tools
**Date:** 2026-04-03
**Sources:** Official documentation, vendor blogs, academic papers, benchmark reports
**Sub-report evidence:** fanout/2026-04-02-fanout/vector-db-cx-agent-retrieval/evidence/ (11 files)

---

## Key Findings

### Finding: Pinecone's Context API provides retrieval-without-generation as agent interface
**Confidence:** CONFIRMED
**Evidence:** [Pinecone docs](https://docs.pinecone.io/reference/architecture/serverless-architecture); Pinecone Assistant documentation

Returns structured chunks with relevancy scores and source references without generation. Internal query planning decomposes complex queries. Claims 12% more accurate than OpenAI Assistants. Every Pinecone Assistant is now a remote MCP server.

### Finding: Turbopuffer powers Cursor (100B+ vectors) and Notion (10B+ vectors) at 10x cheaper pricing
**Confidence:** CONFIRMED
**Evidence:** [Latent Space podcast](https://www.latent.space/p/turbopuffer); vendor documentation

Object storage-first architecture. $1/month per million vectors. Scale-to-zero economics. ~17 person team, profitable. 2.5T+ documents globally.

### Finding: Mem0 extracts facts (not raw chunks) achieving 90% token reduction
**Confidence:** CONFIRMED
**Evidence:** [Mem0 arXiv paper](https://arxiv.org/abs/2504.19413); documentation

Two-phase architecture: extraction (LLM identifies facts) + update (evaluate against existing, ADD/UPDATE/DELETE/NOOP). 66.88% J-score on LOCOMO, 1.44s p95 latency. 51.9k GitHub stars, 14M+ PyPI downloads.

### Finding: Zep/Graphiti provides temporal reasoning with no LLM calls during retrieval
**Confidence:** CONFIRMED
**Evidence:** [Zep arXiv paper](https://arxiv.org/abs/2501.13956)

Three-layer graph: Episodes -> Semantic Entities -> Communities. Bi-temporal model. +48.2% temporal improvement, +77.7% preference tracking. <100ms typical retrieval. **LoCoMo benchmark score contested** — Zep claims 84%, Mem0 CTO disputes (actual 58.44%).

### Finding: Chroma Context-1 is a 20B retrieval subagent model (not a DB feature)
**Confidence:** CONFIRMED (but unverified by independent benchmarks)
**Evidence:** [trychroma.com/research/context-1](https://www.trychroma.com/research/context-1)

Claims to match GPT-5.4 accuracy at 10x speed, 25x cheaper. One week old at time of research. Requires unreleased agent harness. Four tools: search_corpus, grep_corpus, read_document, prune_chunks.

### Finding: Context7 has 51.6K stars and 240K weekly npm downloads as MCP-native docs retrieval
**Confidence:** CONFIRMED
**Evidence:** [github.com/upstash/context7](https://github.com/upstash/context7)

33,000+ libraries. Two-tool interface: resolve-library-id -> query-docs. 65% token reduction through server-side reranking. **Security incident:** ContextCrush vulnerability (Feb 2026, patched).

### Finding: All vendor benchmarks are contested
**Confidence:** CONFIRMED
**Evidence:** Mem0 CTO publicly disputed Zep's LoCoMo claim. All companies benchmark favorably for themselves.

---

## Gaps / Follow-ups

* Independent, apples-to-apples benchmark comparing vector DBs for agent retrieval use case does not exist
* Chroma Context-1 needs independent validation — claims are impressive but unverified
