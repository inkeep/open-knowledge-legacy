---
name: GraphRAG — Knowledge Graph Construction for Retrieval
description: Microsoft's GraphRAG, production learnings, and lighter alternatives (LightRAG, LazyGraphRAG)
type: evidence
dimension: D1.4
confidence: high
sources:
  - title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization"
    authors: "Edge et al."
    venue: "EMNLP 2024, arXiv:2404.16130"
    date: "2024-04"
    url: "https://arxiv.org/abs/2404.16130"
  - title: "LightRAG: Simple and Fast Retrieval-Augmented Generation"
    authors: "Guo et al. (HKU)"
    venue: "arXiv, October 2024"
    date: "2024-10"
    url: "https://github.com/HKUDS/LightRAG"
  - title: "LazyGraphRAG"
    authors: "Microsoft Research"
    venue: "Microsoft Research blog"
    date: "2024-11"
    url: "https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/"
---

# GraphRAG

## Microsoft's GraphRAG (Edge et al., EMNLP 2024)

### The Problem It Solves

Vector similarity search excels at **local queries** ("What are the symptoms of X?") but struggles with **global queries** ("What are the main themes across this dataset?"). Global queries require synthesizing information spread across many documents — no single chunk contains the answer.

### How It Works

1. **Entity extraction**: LLM extracts entities and relationships from each document chunk
2. **Graph construction**: Build a knowledge graph from extracted entities/relationships
3. **Community detection**: Use Leiden algorithm to identify communities (clusters of related entities)
4. **Community summarization**: LLM generates summaries for each community at multiple hierarchy levels
5. **Query answering**: For global queries, retrieve relevant community summaries; for local queries, use traditional vector search

### Key Results

- Outperforms naive RAG on global sensemaking queries by significant margins
- Community summaries enable answering questions that require synthesizing information from 10+ documents
- The hierarchical community structure provides different levels of abstraction

### Production Learnings and Costs

**Critical finding**: Indexing cost is extremely high. Microsoft reported **~$33K indexing cost** for large datasets during early production deployments. This is because every chunk requires an LLM call for entity extraction.

The cost structure:
- Every chunk → LLM call for entity extraction
- Every community → LLM call for summarization
- Multiple hierarchy levels → multiplied LLM calls
- Any document update requires re-indexing affected communities

### When GraphRAG Outperforms Vector Search

1. **Global/theme queries**: "What are the main topics discussed?" — vector search can't answer this
2. **Cross-document synthesis**: "How do entities X and Y relate?" when the connection spans multiple documents
3. **Exploratory analysis**: When you need a "map" of the knowledge, not a specific answer

### When GraphRAG Is Overkill

1. **Specific factual queries**: "What is the API rate limit?" — vector search is faster and cheaper
2. **Small corpora**: For 100-1000 documents, the indexing cost isn't justified unless global queries are frequent
3. **Rapidly changing content**: Re-indexing costs make it impractical for frequently updated KBs

## LightRAG (Guo et al., HKU, October 2024)

**Key innovation**: A dramatically cheaper alternative achieving similar quality for many use cases.

- **10x cheaper** than Microsoft's GraphRAG
- **30% lower latency** for query answering
- Uses a simpler graph construction process with fewer LLM calls
- Open source: https://github.com/HKUDS/LightRAG

## LazyGraphRAG (Microsoft Research, November 2024)

Microsoft's own response to GraphRAG's cost problem:

- Achieves comparable quality at **0.1% of the indexing cost**
- Defers most graph construction to query time instead of index time
- "Lazy" evaluation: only builds the parts of the graph needed for the current query
- Best for use cases where queries are infrequent relative to corpus size

## Relevance to Knowledge Platform Design

For a ~100-1000 article markdown KB:

- **Full GraphRAG is likely overkill** — the corpus is small enough that simpler approaches work
- **The insight is valuable**: global queries ("what topics does our KB cover?") need different approaches than local queries ("how do I configure X?")
- **Topic/tag structure in frontmatter** provides lightweight "graph" functionality — articles linked by shared tags, topics forming natural clusters
- **Article cross-references** (related_articles in frontmatter) create an explicit knowledge graph without LLM extraction
- For the use case of ~100-1000 articles, **frontmatter metadata + cross-references** provide the benefits of GraphRAG without the infrastructure cost
