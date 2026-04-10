# Evidence: Local KB and Personal Knowledge Retrieval (D5)

**Dimension:** D5 — Local KB and Personal Knowledge Retrieval
**Date:** 2026-04-03
**Sources:** Practitioner posts, tool documentation, benchmarks
**Sub-report evidence:** fanout/2026-04-02-fanout/coding-agent-local-kb-retrieval/evidence/ (7 files)

---

## Key Findings

### Finding: Karpathy's index-first pattern eliminates RAG at ~100 articles
**Confidence:** CONFIRMED
**Evidence:** [x.com/karpathy/status/2039805659525644595](https://x.com/karpathy/status/2039805659525644595), April 2, 2025

~100 articles / ~400K words. LLM generates summaries, backlinks, categories, tracking files. Expected to need "fancy RAG pipelines" but found the LLM handles index maintenance directly. Self-accumulating loop: query outputs feed back as new entries. "Health checks" identify inconsistencies.

### Finding: Hybrid search (BM25 + vector) completes in 23ms on 16,894 files vs 11-66s for grep
**Confidence:** CONFIRMED
**Evidence:** Blake Crosley benchmark on Obsidian vault, [blakecrosley.com/blog/hybrid-retriever-obsidian](https://blakecrosley.com/blog/hybrid-retriever-obsidian)

Full-text-only search became unusable above ~3,000 files. Mandalivia benchmark (2,400 notes) confirmed hybrid mode won for AI agent integration. Splitting into specialized collections improved quality.

### Finding: llms.txt and AGENTS.md converge on index-metadata-first pattern
**Confidence:** CONFIRMED
**Evidence:** [llmstxt.org](https://llmstxt.org); [agents.md](https://agents.md/); [github.blog analysis of 2,500+ repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)

llms.txt: standardized markdown at /llms.txt, Mintlify auto-publishes for 10,000+ companies. AGENTS.md: adopted by 60,000+ repos, max 150 lines / 32 KiB. Both implement: structured index metadata first, detailed content on demand.

### Finding: Context7's biggest optimization was reducing output (65% token reduction)
**Confidence:** CONFIRMED
**Evidence:** [github.com/upstash/context7](https://github.com/upstash/context7) changelog

9,700 -> 3,300 avg tokens. 38% latency reduction (24s -> 15s). 30% fewer tool calls. Through server-side reranking returning only relevant pieces.

### Finding: 19,000 companies have a docs MCP server and most don't know it
**Confidence:** CONFIRMED
**Evidence:** [lefthook.com/blog/docs-mcp-servers-who-ships-them](https://lefthook.com/blog/docs-mcp-servers-who-ships-them)

Via Mintlify, GitBook, ReadMe, or Fern auto-generated MCP servers.

---

## Gaps / Follow-ups

* Karpathy's specific implementation details are sparse — pattern is clear but exact code is not public
* Scale boundary precision: where exactly index-first breaks down needs benchmarking
