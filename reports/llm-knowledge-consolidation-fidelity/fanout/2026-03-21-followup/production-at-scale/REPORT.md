# Production-Scale Knowledge Consolidation: How Real Systems Work

**Date:** 2026-03-21
**Scope:** Follow-up investigation into production systems that consolidate knowledge from many sources, complementing the parent report's academic findings with operational reality.
**Method:** Web research across engineering blogs, case studies, academic evaluations, and benchmarks from Perplexity, Elicit, Consensus, Google, and enterprise deployments.

---

## Executive Summary

Production knowledge consolidation systems converge on a shared meta-architecture despite surface differences: **retrieve → extract/rank → constrain generation → cite**. None have solved high-fidelity consolidation with contradictions. The dominant strategy is to avoid synthesizing contradictions altogether — either by ranking sources and picking winners (Perplexity), preserving per-source extractions for human judgment (Elicit), or constraining generation to user-provided documents (NotebookLM). The highest-performing factuality benchmark (Google FACTS) shows even the best model achieves only 68.8% accuracy, and multi-document hallucination rates reach 20-75% depending on domain.

Three operational lessons stand out for the `/consolidate` skill:
1. **Staged context management** (compaction before summarization) is the production-proven pattern for handling token budgets at scale
2. **Source grounding with citation** is table stakes — every production system implements it, and it reduces hallucination from ~40% to ~13%
3. **The lost-in-the-middle problem** creates a hard ceiling on consolidation quality for long contexts, requiring strategic document ordering and two-stage retrieval

---

## 1. Perplexity: Web-Scale Source Consolidation

### Architecture

Perplexity implements a five-stage RAG pipeline: query intent parsing → live web retrieval → snippet extraction → synthesized answer generation → conversational refinement. The core design principle: **the model must not assert facts that were not retrieved** ([ByteByteGo](https://blog.bytebytego.com/p/how-perplexity-built-an-ai-google)).

Pro Search adds a planning layer: the system generates a step-by-step execution plan, generates multiple search queries per step, and passes prior step results into subsequent queries as dependent reasoning chains ([LangChain case study](https://www.langchain.com/breakoutagents/perplexity)).

### Scale

- 200 billion unique URLs indexed
- Tens of thousands of index updates per second (Vespa AI)
- 400+ petabytes hot storage
- Hybrid search: dense retrieval (vector) + sparse retrieval (BM25)

### Contradiction Handling

Perplexity does not resolve contradictions algorithmically. A reranking model scores documents by relevance, reliability, authority (primary > secondary, peer-reviewed > blog), and freshness. The system "highlights areas of consensus as well as contention among researchers" but ultimately **picks a synthesized narrative** weighted by source authority rather than explicitly surfacing conflicts ([Oreate AI](https://www.oreateai.com/blog/navigating-the-maze-how-perplexity-deep-research-handles-conflicting-information/9643db67126ff37ef1e5cc650b9f1aaa)). This approach has been criticized: Perplexity has been caught citing AI-generated spam and providing conflicting information across queries.

### Evaluation

Manual side-by-side comparisons, LLM-as-a-Judge at scale, and A/B testing for latency/cost tradeoffs. No published factuality benchmark scores.

### Implication for /consolidate

Perplexity's planning-then-execution model — where each retrieval step informs the next — is directly applicable to consolidation of large source sets. The key insight: **sequential dependent retrieval with accumulating context** outperforms single-pass retrieval for complex queries.

---

## 2. Elicit: Structured Extraction Over Synthesis

### Architecture

Elicit operates as an "AI-powered spreadsheet" — structured extraction, not conversational synthesis. Built on Ought's "process-based supervision" philosophy: supervise the reasoning *process*, not just outcomes. The [Interactive Composition Explorer (ICE)](https://ought.org/updates/2022-10-06-ice-primer) provides the foundation: an open-source Python library for compositional language model programs.

### Systematic Review Workflow

1. Search (find relevant papers)
2. Title & abstract screening (AI-assisted filtering)
3. Full-text data extraction (structured pull per paper)
4. Synthesis (cross-paper analysis with sentence-level citations)

Every AI-generated claim is backed by an exact quote and link to the source paper. Extraction supports quantitative and qualitative data, including tables ([Elicit](https://elicit.com/blog/systematic-review/)).

### Scale

- Up to 1,000 papers per search
- Up to 20,000 data points simultaneously during extraction
- Integrated Claude Opus 4.5 (December 2025) — outperforms GPT-5 and Gemini 3 Pro on extraction tasks

### Key Design Decision: Preserve Structure, Don't Pre-Synthesize

Elicit's approach to conflicting results is distinctive: **it does not resolve conflicts**. Instead, it extracts each paper's findings individually in a structured table, preserving per-study detail (methods, outcomes, populations, sample sizes). Conflict detection and resolution is left to the researcher. This is the highest-fidelity approach documented in production but shifts the consolidation burden to humans.

### Performance Reality

A [2025 Cochrane comparison study](https://onlinelibrary.wiley.com/doi/full/10.1002/cesm.70050) found Elicit achieves 41.8% precision (vs 7.55% for traditional searches) but only 39.5% sensitivity (vs 94.5%). It finds different papers than traditional search — not a subset. This precision-recall tradeoff is fundamental to any consolidation system.

### Implication for /consolidate

Elicit validates the parent report's finding that **structured extraction with per-source preservation** is the highest-fidelity consolidation pattern. The lesson: consolidation systems should separate extraction (per-source) from synthesis (cross-source), and preserve the extraction layer for verification.

---

## 3. Consensus: Multi-Agent Claim-Level Synthesis

### Architecture

Consensus uses a multi-agent system built on GPT-5 and the Responses API, processing 220M+ peer-reviewed papers. Three agent types ([OpenAI case study](https://openai.com/index/consensus/)):

1. **Planning Agent** — decomposes research queries
2. **Reading Agent(s)** — process individual papers, extract structured data
3. **Analysis Agent** — synthesizes results, determines structure/visuals, composes output

Each agent has narrow scope to keep reasoning precise. The team calls their approach "context engineering": assembling the right evidence before generation begins.

### Claim Extraction

Consensus extracts a "Claims and Evidence Table" — structured key claims with supporting/disputing papers, per-study methods, outcomes, populations, and sample sizes. Every claim is linked to its source. An evidence-agreement scoring system rates claim support levels.

### Critical Gap

No rigorous benchmarking exists for Consensus's synthesis quality. A [PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12318603/) notes potential oversimplification of complex academic arguments and warns that AI-generated summaries may not fully represent argument depth.

### Implication for /consolidate

Consensus's multi-agent decomposition — planning, reading, analysis as separate agents with narrow scope — directly validates the parent report's decompose-verify-recompose pattern. The "research context pack" concept (structured evidence bundle assembled *before* generation) is a strong operational pattern.

---

## 4. Google: Grounding as the Core Primitive

### AI Overviews

Google AI Overviews ground every sentence in a retrieved document, using Gemini models with seven ranking factors including real-time factual verification, Knowledge Graph density, and E-E-A-T authority signals ([Google Research](https://research.google/blog/google-research-at-google-io-2025/)).

### FACTS Benchmark

Google's [FACTS Grounding Leaderboard](https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/) (1,719 examples, two-phase evaluation with multiple judge models) reveals critical findings:

- **Best model (Gemini 3 Pro): 68.8% FACTS Score** — still failing 31% of the time
- Models game factuality by being brief (shorter responses = fewer errors)
- Eligibility checks required to prevent unhelpful brevity
- Top performers search *fewer* times than lower-ranked models
- Multiple judge models averaged to reduce evaluation bias

The [expanded FACTS Benchmark Suite](https://arxiv.org/html/2512.10791v1) (December 2025) tests Parametric, Search, Multimodal, and Grounding dimensions. The ceiling remains low.

### NotebookLM: Source-Constrained Consolidation

NotebookLM is the purest production implementation of source-grounded consolidation. Key design decisions:

- **Closed-world assumption**: AI can only reference user-uploaded sources
- Gemini 1.5 Pro with 2M token context window reduces chunking needs
- Google engineers deliberately avoid calling it "RAG" — prefer "source grounding" ([North Denver Tribune](https://northdenvertribune.com/ai-analysis/google-engineers-deliberately-avoid-calling-notebooklm-rag/))
- Hallucination rate: **~13%** vs ~40% for ungrounded LLMs (3x reduction)

However, a [critical regression in February 2026](https://discuss.ai.google.dev/t/critical-regression-gemini-3-1-pro-update-feb-19-completely-broke-notebooklm-s-rag-grounding/126857) where a Gemini 3.1 Pro update "completely broke" NotebookLM's grounding demonstrates **fragility to upstream model changes** — a major operational risk for production consolidation systems.

### Implication for /consolidate

Source grounding (constraining generation to provided documents) is the strongest hallucination mitigation available: 13% vs 40%. But even the best factuality benchmarks show ~31% failure rates. The NotebookLM regression teaches that **consolidation systems must version-pin their models and maintain regression tests**.

---

## 5. Scale-Specific Failure Modes

### The Multi-Document Hallucination Problem

A [2025 NAACL Findings paper](https://arxiv.org/abs/2410.13961) (Belem et al.) evaluated 5 LLMs on multi-document summarization and found:

| Domain | Hallucination Rate |
|---|---|
| News | 20-45% |
| Conversation | 52-75% |

**Scaling from 2 to 10 documents produced a counterintuitive result**: hallucination rates stayed roughly constant (±5%), but **recall dropped up to 33%**. More documents means *less coverage*, not more hallucination. The system misses more rather than fabricating more.

Error taxonomy from 700+ manual annotations:
- **Pedantic errors** (50-80%): overly generic or uninformative
- **Instruction inconsistency** (40-87%): off-topic, redundant, missing cross-document information
- **Context inconsistency** (10-37%): overgeneralization, oversimplification
- **Fabrication** (0-9%): rare but exists

Position effects: accuracy systematically declines for later insights in bullet-point outputs. Simple mitigation heuristics (top-k truncation, redundancy removal) improve F1 by only ~2.5%.

### The Lost-in-the-Middle Problem

The [lost-in-the-middle effect](https://arxiv.org/abs/2307.03172) remains a production-critical issue. From the [2025 mitigation study](https://arxiv.org/abs/2511.13900):

- **20-50% accuracy drops** scaling from 10K to 100K tokens
- **30%+ accuracy drop** when answer document moves from position 1 to position 10 in a 20-document context
- Root cause: Rotary Position Embedding (RoPE) decay
- Claude models decay slowest but are not immune

Production mitigation: Multi-scale Positional Encoding (Ms-PoE) improves middle-position accuracy 20-40% with no compute overhead.

### Context Window Saturation

From [ZenML's analysis of 1,200 production deployments](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025):

- **"Context rot" universally appears between 50K-150K tokens**
- Manus handles this with staged reduction: compaction (reversible) → summarization (irreversible) ([Manus blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus))
- KV-cache hit rate is the "single most important metric" for production agents
- Input-to-output token ratio: 100:1 in agentic systems

### Token Budget Dilemma

Under hard context limits, a fundamental **Relevance–Coverage trade-off** emerges:
- Increasing recall → prompt dilution and generation drift
- Strict precision → excludes essential peripheral evidence
- Information-theoretically, mutual information with the target decays as retrieval breadth increases

### What Breaks at 1000 Documents

Extrapolating from the evidence:

| Scale | Primary Failure Mode | Root Cause |
|---|---|---|
| 10 docs | Lost-in-the-middle | Positional attention bias |
| 100 docs | Recall collapse | Token budget forces triage |
| 1000 docs | Claim inventory explosion | Deduplication intractable; coverage → 0 without hierarchical decomposition |

No production system documented handles 1000+ document consolidation in a single pass. All systems at this scale use hierarchical decomposition: index → cluster → summarize-per-cluster → merge summaries.

---

## 6. Operational Patterns

### Caching (Multi-Tier)

Production systems use layered caching ([Redis](https://redis.io/blog/prompt-caching-vs-semantic-caching/), [Introl](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025)):

| Layer | Mechanism | Savings |
|---|---|---|
| Exact-match | Identical query → cached response | Bypasses LLM |
| Semantic | Paraphrased query → vector similarity match | Bypasses LLM |
| Prefix/prompt | Shared context prefix → cached KV state | 90% cost, 85% latency |

31% of LLM queries exhibit semantic similarity. Combined multi-tier savings exceed 80%. Anthropic cached tokens cost $0.30/MTok vs $3.00/MTok uncached.

### Incremental Processing

- **Delta processing** (Stripe pattern): only re-process changed content, like a git diff
- **Staged context reduction** (Manus): compaction first → summarization when compaction diminishes
  - Threshold: summarize oldest 20 turns when context > 128K tokens
  - Always keep last 3 turns raw to preserve model "rhythm"
- **Real-time processing** (Emergent Methods): 1M+ articles/day via microservices

### Quality Monitoring

| Pattern | Example | Impact |
|---|---|---|
| LLM-as-Judge | Google FACTS (multiple judges averaged) | Reduces evaluator bias |
| Shadow mode | Ramp: agents on historical data | Validates before production |
| Multi-tiered guardrails | DoorDash: 2-tier system | 90% hallucination reduction |
| Deterministic pre-checks | DoorDash: Zero-Data Statistical Query Validation | Catches issues without LLM |
| Regression testing | NotebookLM (learned the hard way) | Upstream model changes break grounding |

### Fallback Strategies

- **Graceful degradation**: DoorDash defaults to human agents on latency issues
- **Circuit breakers**: Cost and conversation-turn limits prevent cascading failures (GetOnStack: $47K/week cost spike from undetected agent loops)
- **Checkpoint recovery**: Railway caches successful steps; retries continue, not restart
- **Durable execution**: Temporal captures every interaction as deterministic workflow — auto-replay after crash/timeout ([Temporal](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai))
- **Multi-model redundancy**: Bito routes across LLM providers with automatic failover

### Enterprise Scale: What Works

From [ZenML's 457 case studies](https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works):

- **Infrastructure > model intelligence** (LinkedIn, Meta wins came from networking/storage/orchestration, not model selection)
- **Tool semantics matter**: CloudQuery's identical functionality was ignored until renamed — clarity in schema naming drives adoption
- **Lean contexts > large contexts**: Dropbox "analysis paralysis" with excessive tools disappeared through careful retrieval
- **Architectural guardrails > prompt-based safety**: Session tainting (Oso) and dual-layer permissions prevent bypass regardless of model behavior

---

## 7. Cross-System Comparison

| System | Source Scale | Contradiction Strategy | Hallucination Control | Consolidation Pattern |
|---|---|---|---|---|
| **Perplexity** | 200B URLs | Authority-weighted ranking | Cite + constrain to retrieved | Sequential dependent retrieval |
| **Elicit** | 1K papers/search | Don't resolve — preserve per-source | Sentence-level citations + quotes | Structured extraction table |
| **Consensus** | 220M papers | Evidence-agreement scoring | Multi-agent narrow scope | Planning → reading → analysis agents |
| **AI Overviews** | Web-scale | Knowledge Graph + E-E-A-T | Grounding + FACTS evaluation | Rank → ground → cite |
| **NotebookLM** | User uploads | Closed-world (no external) | Source grounding (13% hallucination) | Constrained RAG on user docs |
| **GraphRAG** | Enterprise-scale | Community structure | Entity-level verification | Graph cluster → community summaries |
| **DoorDash** | Support corpus | N/A (single-answer domain) | 2-tier guardrails (90% reduction) | RAG + guardrail cascade |

---

## 8. Implications for /consolidate

### Validated Patterns

1. **Decompose-extract-verify-synthesize** is the universal production pattern. No system attempts single-pass consolidation over many sources.

2. **Source grounding reduces hallucination 3x** (40% → 13%). Every production system implements citations. The `/consolidate` skill should treat grounding as non-negotiable.

3. **Staged context management** (Manus pattern) is the proven approach for token budgets: reversible compaction first, irreversible summarization only when necessary.

4. **Multi-agent narrow-scope decomposition** (Consensus pattern) keeps reasoning precise. Each agent should have a focused role with limited context.

5. **Sequential dependent retrieval** (Perplexity Pro Search) outperforms single-pass for complex queries. Later retrieval steps should be informed by earlier findings.

### Open Problems

1. **No production system resolves contradictions algorithmically.** They either pick winners (authority ranking), preserve all positions (structured extraction), or constrain to single source sets (closed world). A `/consolidate` skill that explicitly surfaces and categorizes contradictions would be differentiated.

2. **Recall collapses with scale, not hallucination.** At 10+ documents, the primary failure is *missing information*, not *fabricating information*. Hierarchical decomposition is required but no turnkey solution exists.

3. **The 31% factuality ceiling** (FACTS benchmark) suggests that even with grounding, almost a third of consolidation output may contain errors. Post-generation verification is essential.

4. **Upstream model changes break grounding systems** (NotebookLM regression). Consolidation skills need version pinning and regression tests.

5. **Position bias** (lost-in-the-middle) requires strategic document ordering. Place highest-priority evidence at the start and end of context, never exclusively in the middle.

### Architecture Recommendation

For the `/consolidate` skill operating over many sources:

```
Phase 1: EXTRACT (per-source, parallelizable)
  - Structured claim extraction with sentence-level citations
  - Per-source preservation (Elicit pattern)

Phase 2: CLUSTER (claim-level deduplication)
  - Semantic similarity grouping across extracted claims
  - Contradiction detection within clusters
  - GraphRAG-style community detection for large claim sets

Phase 3: SYNTHESIZE (per-cluster, then merge)
  - Narrow-scope synthesis per claim cluster
  - Explicit contradiction surfacing (not resolution)
  - Evidence-agreement scoring (Consensus pattern)

Phase 4: VERIFY (post-synthesis)
  - Claim-by-claim grounding check against source citations
  - Position-aware output (critical claims at start/end)
  - LLM-as-Judge evaluation with multiple judges

Operational:
  - Staged context reduction (compact → summarize)
  - Multi-tier caching (exact → semantic → prefix)
  - Circuit breakers on cost and iteration count
  - Delta processing for incremental updates
```

---

## Evidence Files

- [evidence/perplexity-architecture.md](evidence/perplexity-architecture.md) — Perplexity's five-stage RAG pipeline, Pro Search, infrastructure scale
- [evidence/elicit-systematic-review.md](evidence/elicit-systematic-review.md) — Elicit's structured extraction, systematic review workflow, performance data
- [evidence/consensus-synthesis.md](evidence/consensus-synthesis.md) — Consensus multi-agent architecture, claim extraction, evidence-agreement scoring
- [evidence/google-ai-overviews-notebooklm.md](evidence/google-ai-overviews-notebooklm.md) — FACTS benchmark, NotebookLM source grounding, AI Overviews architecture
- [evidence/scale-failure-modes.md](evidence/scale-failure-modes.md) — Multi-document hallucination rates, lost-in-the-middle, context saturation
- [evidence/operational-patterns.md](evidence/operational-patterns.md) — Caching strategies, quality monitoring, fallback patterns, enterprise case studies
- [evidence/literature-review-systems.md](evidence/literature-review-systems.md) — Semantic Scholar, Litmaps, GraphRAG at scale, enterprise deployments

---

## Key Sources

- [How Perplexity Built an AI Google — ByteByteGo](https://blog.bytebytego.com/p/how-perplexity-built-an-ai-google)
- [Perplexity Pro Search Case Study — LangChain](https://www.langchain.com/breakoutagents/perplexity)
- [Elicit Systematic Review — Elicit](https://elicit.com/blog/systematic-review/)
- [Comparison of Elicit AI and Traditional Literature Searching — Cochrane/Wiley (2025)](https://onlinelibrary.wiley.com/doi/full/10.1002/cesm.70050)
- [Consensus uses GPT-5 and the Responses API — OpenAI](https://openai.com/index/consensus/)
- [Review of Consensus App — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12318603/)
- [FACTS Grounding Benchmark — Google DeepMind](https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/)
- [FACTS Leaderboard Paper — arXiv (2025)](https://arxiv.org/html/2512.10791v1)
- [How LLMs Hallucinate in Multi-Document Summarization — NAACL 2025](https://arxiv.org/abs/2410.13961)
- [Lost in the Middle: How Language Models Use Long Contexts — arXiv](https://arxiv.org/abs/2307.03172)
- [What Works for Lost-in-the-Middle — arXiv (2025)](https://arxiv.org/abs/2511.13900)
- [Context Engineering for AI Agents — Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- [1,200 Production Deployments — ZenML](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)
- [457 Case Studies of What Works — ZenML](https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works)
- [Towards Practical GraphRAG at Scale — arXiv (2025)](https://arxiv.org/abs/2507.03226)
- [NotebookLM RAG Regression — Google AI Developers Forum (2026)](https://discuss.ai.google.dev/t/critical-regression-gemini-3-1-pro-update-feb-19-completely-broke-notebooklm-s-rag-grounding/126857)
- [Durable Execution meets AI — Temporal](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)
- [Prompt Caching vs Semantic Caching — Redis](https://redis.io/blog/prompt-caching-vs-semantic-caching/)
- [On the Fundamental Limits of LLMs at Scale — arXiv (2025)](https://arxiv.org/html/2511.12869v1)
- [ICE: Interactive Composition Explorer — Ought](https://ought.org/updates/2022-10-06-ice-primer)
