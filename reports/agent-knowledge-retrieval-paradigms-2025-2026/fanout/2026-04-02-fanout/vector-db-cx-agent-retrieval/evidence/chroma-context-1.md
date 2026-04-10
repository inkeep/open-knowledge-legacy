---
title: "Chroma Context-1: Agentic Search Model"
dimension: D3
facet: "Chroma Context-1 and context engine positioning"
collected: 2026-04-03
confidence: high
---

# Chroma Context-1

## What It Is

Context-1 is a **20B parameter open-weights agentic search model** (Apache 2.0) released March 27, 2026. Not a product feature of Chroma's vector DB -- it's a separate fine-tuned LLM trained as a **retrieval subagent** that finds and returns ranked documents to a downstream answering model.

- Base model: `gpt-oss-20B` (Mixture of Experts)
- Training: SFT using trajectories from Kimi K2.5, then RL via CISPO (GRPO variant)
- Context window: 32,000 tokens (self-managed via pruning)
- Inference: 400-500 tokens/sec via vLLM on NVIDIA B200
- Weights on HuggingFace: [chromadb/context-1](https://huggingface.co/chromadb/context-1)

**Critical caveat**: Requires a specific agent harness (not yet publicly released) to reproduce reported results.

## "Context Engine" Framing

Jeff Huber (Chroma CEO) positions against "RAG" as a concept: **"RAG is Dead, Context Engineering is King."** The term "RAG" conflated three concepts (retrieval, augmentation, generation) into one muddy abstraction synonymous with "single dense vector search."

**Context engineering** = the discipline of determining what information populates an LLM's context window for any given generation step.

**Context rot** = when large context gets operated on repeatedly, the model "effectively loses its mind" -- fails to follow clearly-stated instructions. Contradicts vendor marketing about infinite context windows.

The "context engine" technically means:
- Chroma Cloud (vector DB) provides storage/retrieval primitives: hybrid BM25 + dense vector search, metadata filtering, reranking
- Context-1 (model) operates on top as an autonomous retrieval agent
- Together = full "context engine" stack

Sources: [Chroma Research](https://www.trychroma.com/research/context-1), [Latent Space Podcast](https://www.latent.space/p/chroma), [Jeff Huber Substack](https://jeffhuber.substack.com/p/the-rise-of-context-engineering)

## Tool Set Available to the Agent

| Tool | Function |
|------|----------|
| `search_corpus` | Hybrid BM25 + dense vector search via reciprocal rank fusion, 50 reranked candidates |
| `grep_corpus` | Regex pattern matching, up to 5 matches |
| `read_document` | Full document retrieval by ID with reranking and truncation |
| `prune_chunks` | Selective removal of irrelevant chunks from context |

Key innovation: **self-editing context management**. The agent receives continuous visibility of token usage and autonomously prunes irrelevant chunks. Prune accuracy: 0.941 (vs 0.824 for base model).

## Benchmarks

| Benchmark | 1x pass | 4x parallel |
|-----------|---------|-------------|
| BrowseComp-Plus | 0.87 | 0.96 |
| HotpotQA | 0.97 | 0.99 |

Claims: 4x parallel Context-1 matches GPT-5.4 accuracy on BrowseComp-Plus. Up to 10x faster, 25x cheaper than frontier models.

**No independent benchmarks yet** -- all numbers from Chroma's own report.

## Adoption

- Chroma DB: ~16.7k GitHub stars, 100M+ downloads
- Context-1 HuggingFace: 3,195 downloads first week (very new)
- Context-1 API: behind waitlist, no public pricing

## Pricing (Chroma Cloud)

| Dimension | Rate |
|-----------|------|
| Write | $2.50/GiB |
| Storage | $0.33/GiB/month |
| Query | $0.0075/TiB queried |

Sources: [Chroma Pricing](https://www.trychroma.com/pricing), [HuggingFace Model Card](https://huggingface.co/chromadb/context-1), [Philipp Schmid Analysis](https://www.philschmid.de/kimi-composer-context)

## Implications for Agent-Native KB Design

1. The "retrieval as specialized model" pattern is emerging -- separate the retrieval intelligence from the answering intelligence
2. Self-managing context (pruning, token budgets) is becoming a first-class concern
3. The "context engine" framing suggests KB interfaces should expose retrieval primitives (search, filter, read) rather than pre-assembled answers
4. Hybrid search (BM25 + vector) is table stakes for production retrieval
