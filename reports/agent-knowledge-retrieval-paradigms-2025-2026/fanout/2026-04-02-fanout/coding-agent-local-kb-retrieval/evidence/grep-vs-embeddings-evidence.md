---
title: "Grep vs Embeddings: Evidence and Practitioner Reports"
type: evidence
dimension: D2
source_type: synthesis
confidence: high
date_collected: 2026-04-03
sources:
  - url: https://jxnl.co/writing/2025/09/11/why-grep-beat-embeddings-in-our-swe-bench-agent-lessons-from-augment/
    title: "Why Grep Beat Embeddings in Our SWE-Bench Agent (Lessons from Augment)"
    type: blog
  - url: https://www.mindstudio.ai/blog/is-rag-dead-what-ai-agents-use-instead
    title: "Is RAG Dead? What AI Coding Agents Actually Use Instead of Vector Databases"
    type: blog
  - url: https://cursor.com/blog/semsearch
    title: "Cursor: Semantic Search blog post"
    type: official_blog
  - url: https://cognition.ai/blog/swe-grep
    title: "Cognition: SWE-grep RL-trained retrieval models"
    type: official_blog
  - url: https://arxiv.org/html/2602.05892
    title: "ContextBench: A Benchmark for Context Retrieval in Coding Agents"
    type: academic_paper
  - url: https://github.com/giancarloerra/SocratiCode
    title: "SocratiCode: Hybrid search benchmark on VS Code codebase"
    type: github_repo
  - url: https://www.latent.space/p/claude-code
    title: "Latent Space podcast: Claude Code (Boris Cherny)"
    type: podcast
  - url: https://aider.chat/2023/10/22/repomap.html
    title: "Building a better repository map with tree sitter"
    type: blog
  - url: https://www.nuss-and-bolts.com/p/on-the-lost-nuance-of-grep-vs-semantic
    title: "On the Lost Nuance of Grep vs Semantic"
    type: blog
  - url: https://www.morphllm.com/agentic-search
    title: "Morph: Agentic Search — How Coding Agents Find the Right Code"
    type: blog
  - url: https://x.com/jerryjliu0/status/1964098215181168732
    title: "Jerry Liu (LlamaIndex): grep and lightweight semantic search are all you need"
    type: social_media
  - url: https://github.com/openai/codex/issues/5181
    title: "Codex CLI: request for semantic codebase indexing"
    type: github_issue
  - url: https://zerofilter.medium.com/why-claude-code-is-special-for-not-doing-rag-vector-search-agent-search-tool-calling-versus-41b9a6c0f4d9
    title: "Why Claude Code is special for not doing RAG/Vector Search"
    type: blog
---

# Grep vs Embeddings: Evidence and Practitioner Reports

## The Core Finding

Top AI coding agents in 2025-2026 abandoned traditional RAG for file search and grep. Claude Code, Codex, and Cline/Aider don't spin up vector databases. Instead they run grep, read file trees, and call find.

## Evidence Point 1: Augment/SWE-Bench (Colin Flaherty)

**Source**: Jason Liu interview with Colin Flaherty (formerly Augment, co-author Meta's Cicero AI)

> "Embedding-based retrieval wasn't the bottleneck they expected. We explored adding various embedding-based retrieval tools, but found that for SWE-Bench tasks this was not the bottleneck — grep and find were sufficient."

**Why grep worked**:
1. Agent persistence compensated for simpler tools — repeatedly tried different search approaches
2. SWE-Bench repositories were relatively small with keyword-rich structured code
3. Problems typically required under an hour, limiting need for complex retrieval

**When embeddings actually matter** (per Flaherty):
- Large-scale codebases
- Unstructured content (docs, chat logs)
- Third-party code not in training data
- Non-text media retrieval

> "If I was a human working on this use case, and I was a really persistent human that never got tired, would having this other search tool help me? If the answer is yes, then it's probably going to be useful for the agent."

## Evidence Point 2: Anthropic's Own A/B Test

Boris Cherny (Claude Code creator): "Early versions used RAG + a local vector db, but agentic search generally works better." A Claude engineer called this result "surprising."

Anthropic's research paper (arXiv 2602.23368): Keyword search via agentic tool use achieves **>90% of RAG-level performance** without vector databases.

## Evidence Point 3: Why Grep Wins for Code (Structural Argument)

Code has properties that favor exact search over semantic search:
- **Explicit structural relationships**: imports, function calls, type definitions — vector embeddings don't capture these reliably
- **Exact match requirement**: Finding `createD1HttpClient` requires exact match, not semantic similarity
- **Deterministic results**: Grep returns exact matches or nothing. Embeddings return wrong matches silently
- **No preprocessing**: Works on any codebase without indexing
- **Freshness**: Reads current filesystem state (critical during active editing)

## Evidence Point 4: The Iterative Search Advantage

Agentic search's key advantage is **multi-step refinement**:

```
Query → Result → "Hmm, not quite" → Refined Query → Better Result
```

This is impossible with single-shot embedding retrieval. Claude Code demonstrates this by:
- Searching "auth", "session", "token", "middleware", "jwt", "bearer" to triangulate toward a module
- Following call chains: `handler.ts → utils/auth.ts → lib/jwt.ts`
- RAG can't follow these chains; agentic search can

## Evidence Point 5: Cline's Position

Cline (formerly Continue) also uses no indexing. Their blog post "Why Cline Doesn't Index Your Codebase (And Why That's a Good Thing)" argues for the same approach as Claude Code.

## Evidence Point 6: Cursor's Quantified Hybrid Results

Cursor's [semantic search blog post](https://cursor.com/blog/semsearch) provides the strongest quantified evidence for hybrid approaches:

- **12.5% average accuracy improvement** (range: 6.5-23.5% depending on model) from adding semantic search to grep
- **2.6% code retention increase** specifically for **large codebases (1,000+ files)**
- **2.2% reduction in dissatisfied follow-up requests**
- Used a **custom embedding model trained on agent session traces** — learning which file accesses preceded successful code discovery

## Evidence Point 7: Cognition SWE-grep — RL-Optimized Agentic Search

Cognition trained specialized RL models ([SWE-grep](https://cognition.ai/blog/swe-grep)) for fast agentic code retrieval:
- Over **60% of agent first turns** are spent just retrieving context
- RL models execute **up to 8 parallel tool calls per turn** across max 4 turns
- SWE-grep-mini: **2,800 tokens/second**, SWE-grep: **650 tokens/second**
- Performance **matches or outperforms frontier models** at an order of magnitude faster

This represents a **third approach**: neither embedding search nor traditional sequential agentic search, but RL-optimized parallel grep with learned search strategies.

## Evidence Point 8: ContextBench Academic Benchmark

[ContextBench](https://arxiv.org/html/2602.05892) — 1,136 tasks across 66 repos in 8 languages:
- *"Sophisticated agent scaffolding does not necessarily improve context retrieval performance"*
- Simpler approaches often match complex designs
- All LLMs *"retrieve broad context to maximize coverage, introducing substantial noise"* — high recall, low precision
- Critical finding: agents successfully locate relevant code but **fail to retain or incorporate it** into patches

## Evidence Point 9: SocratiCode — Hybrid Crushes Grep at Scale

On VS Code's **2.45M-line codebase** ([SocratiCode](https://github.com/giancarloerra/SocratiCode)):
- Grep needed **31 steps** across 5 questions; hybrid semantic+BM25 needed **5 steps** (1 per question)
- **61% less token consumption**, **84% fewer tool calls**, **37x faster**
- Uses Reciprocal Rank Fusion combining dense vector search with BM25 lexical search

This is the strongest evidence that at enterprise scale, grep-only is dramatically inferior.

## Evidence Point 10: Jerry Liu (LlamaIndex CEO)

> "grep (and lightweight semantic search) are all you need. When you have a 'medium' sized dataset e.g. 1000 ArXiv PDFs, we found that an extremely strong Q&A baseline is just giving agents access to the CLI, along with some tools for fast semantic search using static embeddings."

Built [SemTools](https://x.com/jerryjliu0/status/1961488443663597857) — "blazing-fast semantic search for your entire filesystem without a vector database."

## Evidence Point 11: Steve Krouse (Val Town) — Correction

Despite being frequently cited as a "grep is all you need" proponent, **no primary source evidence exists** for Steve Krouse making this specific argument publicly. Extensive search across X/Twitter, Bluesky, blog posts, and Val Town documentation found no such statement. His `code_search_is_easy` Val Town project is actually a remix demonstrating GitHub's existing search infrastructure, not a statement about grep vs embeddings.

## Evidence Point 12: Codex CLI Acknowledges Grep's Limits

Open [GitHub issue #5181](https://github.com/openai/codex/issues/5181) requesting semantic search: *"Codex CLI struggles to reliably find the right places in medium to large codebases because it lacks a first-class semantic search capability."* Users report *"falling back to grep or filename heuristics, which break down in polyglot repositories, renamed identifiers, or when concepts are expressed differently than the query."*

## When Embeddings Win

The evidence is clear about when embeddings outperform grep:

1. **Large codebases (1,000+ files)**: Cursor measured 2.6% retention improvement at this scale; SocratiCode showed 37x speed advantage on VS Code's 2.45M lines
2. **Unfamiliar codebases**: When you don't know what identifiers to grep for
3. **Natural language queries**: "Where do we handle authentication?" when code uses `verifyToken`, `checkSession`, etc.
4. **Cross-cutting concerns**: Finding scattered logic with different naming conventions
5. **Non-code artifacts**: Documentation, comments, commit messages
6. **High-volume repeated queries**: Amortized index cost < repeated grep cost
7. **Reducing token waste**: Milvus/Zilliz reported **40% token reduction** with vector search vs grep

## The Hybrid Consensus

Most practitioners converge on: **use both, but don't default to embeddings**.

- Cursor: custom embeddings + grep (quantified 12.5% accuracy gain)
- Windsurf: local RAG + action tracking
- Claude Code: grep-first with optional MCP-based semantic search
- Aider: tree-sitter graph + PageRank (structural-first)
- Cognition: RL-optimized parallel grep (SWE-grep)

The pattern: **grep/structural search for code, embeddings for documentation and natural language queries**.

## The Deeper Insight

The real paradigm shift is **from one-shot retrieval to iterative, multi-turn search**. As Morph's analysis states:

> "Agentic search offloads the learned semantics of an embedding model to an LLM."

The question is not grep vs embeddings but: **who does the semantic reasoning — a frozen embedding model or a live reasoning model?** The trajectory suggests convergence toward RL-optimized agentic search (SWE-grep, WarpGrep) that retains agentic flexibility while approaching embedding speed through parallelization and learned strategies.

## Token Cost Tradeoff

The Milvus blog ("Why I'm Against Claude Code's Grep-Only Retrieval") critiques the token cost:
- Multi-step search loops consume more tokens than a single well-placed semantic query
- Zilliz measured **40% token reduction** with vector search vs grep
- For repeated queries on stable codebases, embedding retrieval amortizes the cost
- However, zero setup cost and freshness of grep-based search offset this for most workflows
