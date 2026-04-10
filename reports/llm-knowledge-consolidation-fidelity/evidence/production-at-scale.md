---
title: "Production-Scale Knowledge Consolidation: How Real Systems Work"
description: "Evidence from production systems (Perplexity, Elicit, Consensus, Google AI Overviews, NotebookLM, DoorDash) covering retrieve-extract-constrain-cite meta-architecture, contradiction handling strategies, scale-specific failure modes (lost-in-the-middle, recall collapse, context saturation), operational patterns (caching, incremental processing, fallbacks), and cross-system comparison."
created: 2026-03-21
last-updated: 2026-03-21
---

## 1. Production System Architectures

### 1.1 Perplexity

**Sources:** [ByteByteGo](https://blog.bytebytego.com/p/how-perplexity-built-an-ai-google), [LangChain case study](https://www.langchain.com/breakoutagents/perplexity)

Five-stage RAG pipeline: query intent parsing → live web retrieval → snippet extraction → synthesized answer → conversational refinement. Pro Search adds planning layer with dependent retrieval chains. Scale: 200B URLs indexed, tens of thousands of index updates/second (Vespa AI), 400+ PB storage, hybrid dense+sparse retrieval.

Contradiction handling: does not resolve algorithmically. Reranking model scores by relevance, reliability, authority, freshness. Picks synthesized narrative weighted by source authority. Has been caught citing AI-generated spam.

### 1.2 Elicit

**Sources:** [Elicit blog](https://elicit.com/blog/systematic-review/), [Cochrane/Wiley 2025](https://onlinelibrary.wiley.com/doi/full/10.1002/cesm.70050), [ICE primer](https://ought.org/updates/2022-10-06-ice-primer)

"AI-powered spreadsheet" — structured extraction, not conversational synthesis. Built on Ought's "process-based supervision." Systematic review workflow: Search → Screen → Extract → Synthesize with sentence-level citations. Up to 1,000 papers/search, 20,000 data points. Integrated Claude Opus 4.5 (Dec 2025).

**Key design decision:** Does not resolve conflicts. Extracts each paper's findings individually in structured table, preserving per-study detail. Conflict detection left to researcher. Highest-fidelity approach but shifts burden to humans.

Performance: 41.8% precision (vs 7.55% traditional) but 39.5% sensitivity (vs 94.5%). Finds different papers, not a subset.

### 1.3 Consensus

**Source:** [OpenAI case study](https://openai.com/index/consensus/)

Multi-agent system on GPT-5, 220M+ papers. Three agents: Planning Agent (decomposes queries), Reading Agent(s) (process individual papers), Analysis Agent (synthesizes). Claims and Evidence Table with evidence-agreement scoring. No rigorous benchmarking exists for synthesis quality.

### 1.4 Google AI Overviews / NotebookLM

**Sources:** [Google Research](https://research.google/blog/google-research-at-google-io-2025/), [FACTS Grounding](https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/), [FACTS Benchmark Suite](https://arxiv.org/html/2512.10791v1)

AI Overviews: ground every sentence in retrieved document, seven ranking factors including real-time factual verification, Knowledge Graph density, E-E-A-T.

FACTS Benchmark (1,719 examples): Best model (Gemini 3 Pro) achieves 68.8% — still failing 31%. Models game factuality by being brief. Top performers search fewer times than lower-ranked models.

NotebookLM: Closed-world source grounding, Gemini 1.5 Pro with 2M context window. Hallucination rate: ~13% vs ~40% for ungrounded (3x reduction). Critical regression Feb 2026 when Gemini 3.1 Pro update broke grounding — fragility to upstream model changes.

## 2. Scale-Specific Failure Modes

### 2.1 Multi-Document Hallucination

**Source:** Belem et al. NAACL 2025 Findings. [arXiv:2410.13961](https://arxiv.org/abs/2410.13961)

5 LLMs, 700+ manual annotations:
- News domain: 20-45% hallucination rate
- Conversation domain: 52-75%
- Scaling 2→10 documents: hallucination rates constant (±5%), but recall dropped up to 33%
- Pedantic errors: 50-80%, instruction inconsistency: 40-87%, context inconsistency: 10-37%, fabrication: 0-9%
- Position effects: accuracy declines for later insights in bullet-point outputs

### 2.2 Lost-in-the-Middle

**Sources:** [arXiv:2307.03172](https://arxiv.org/abs/2307.03172), [arXiv:2511.13900](https://arxiv.org/abs/2511.13900)

20-50% accuracy drops scaling 10K→100K tokens. 30%+ drop when answer moves from position 1 to 10 in 20-document context. Root cause: RoPE decay. Claude models decay slowest. Mitigation: Ms-PoE improves middle-position accuracy 20-40% with no compute overhead.

### 2.3 Context Window Saturation

**Source:** [ZenML](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)

"Context rot" universally appears between 50K-150K tokens. Manus handles with staged reduction: compaction (reversible) → summarization (irreversible). KV-cache hit rate is "single most important metric." Input-to-output ratio: 100:1 in agentic systems.

### 2.4 What Breaks at Scale

| Scale | Primary Failure Mode | Root Cause |
|---|---|---|
| 10 docs | Lost-in-the-middle | Positional attention bias |
| 100 docs | Recall collapse | Token budget forces triage |
| 1000 docs | Claim inventory explosion | Deduplication intractable without hierarchical decomposition |

No production system handles 1000+ documents in single pass. All use hierarchical decomposition.

## 3. Operational Patterns

### 3.1 Caching (Multi-Tier)

**Sources:** [Redis](https://redis.io/blog/prompt-caching-vs-semantic-caching/), [Introl](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025)

| Layer | Mechanism | Savings |
|---|---|---|
| Exact-match | Identical query → cached response | Bypasses LLM |
| Semantic | Paraphrased query → vector similarity | Bypasses LLM |
| Prefix/prompt | Shared context prefix → cached KV state | 90% cost, 85% latency |

31% of queries exhibit semantic similarity. Combined savings >80%. Anthropic cached: $0.30/MTok vs $3.00/MTok.

### 3.2 Quality Monitoring

LLM-as-Judge with multiple judges (FACTS), shadow mode (Ramp), multi-tiered guardrails (DoorDash: 90% hallucination reduction), deterministic pre-checks, regression testing (NotebookLM lesson).

### 3.3 Fallback Strategies

Graceful degradation (DoorDash → human agents), circuit breakers (GetOnStack: $47K/week cost spike from agent loops), checkpoint recovery (Railway), durable execution (Temporal), multi-model redundancy (Bito).

### 3.4 Enterprise Scale Lessons

**Source:** [ZenML 457 case studies](https://www.zenml.io/blog/llmops-in-production-457-case-studies-of-what-actually-works)

Infrastructure > model intelligence. Tool semantics matter (CloudQuery naming). Lean contexts > large contexts (Dropbox paralysis). Architectural guardrails > prompt-based safety.

## 4. Cross-System Comparison

| System | Source Scale | Contradiction Strategy | Hallucination Control | Consolidation Pattern |
|---|---|---|---|---|
| Perplexity | 200B URLs | Authority-weighted ranking | Cite + constrain to retrieved | Sequential dependent retrieval |
| Elicit | 1K papers/search | Don't resolve — preserve per-source | Sentence-level citations | Structured extraction table |
| Consensus | 220M papers | Evidence-agreement scoring | Multi-agent narrow scope | Planning → reading → analysis agents |
| AI Overviews | Web-scale | Knowledge Graph + E-E-A-T | Grounding + FACTS | Rank → ground → cite |
| NotebookLM | User uploads | Closed-world | Source grounding (13% hallucination) | Constrained RAG on user docs |
| DoorDash | Support corpus | N/A | 2-tier guardrails (90% reduction) | RAG + guardrail cascade |

**Meta-pattern:** All converge on retrieve → extract/rank → constrain generation → cite. None resolve contradictions algorithmically.
