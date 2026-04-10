---
name: Classic RAG Pipeline Failures
description: Documented failure modes of naive chunk-embed-retrieve-generate RAG pipelines (2023-2024)
type: evidence
dimension: D1.1
confidence: high
sources:
  - title: "Seven Failure Points When Engineering a Retrieval Augmented Generation System"
    authors: "Barnett et al."
    venue: "arXiv:2401.05856"
    date: "2024-01"
    url: "https://arxiv.org/abs/2401.05856"
---

# Classic RAG Pipeline Failures

## The Standard Pipeline

The "naive RAG" pipeline that dominated 2023-early 2024:
1. **Chunk** documents into fixed-size segments (typically 256-512 tokens)
2. **Embed** each chunk using a sentence embedding model
3. **Index** embeddings in a vector store (Pinecone, Weaviate, Chroma, etc.)
4. **Retrieve** top-k chunks via cosine similarity to the query embedding
5. **Generate** an answer using the retrieved chunks as context

## Documented Failure Modes

**Barnett et al. (2024)** systematically cataloged seven failure points across three domains:

1. **Missing content** — The indexed corpus doesn't contain the answer at all. No amount of retrieval improvement helps.

2. **Missed the top-k** — The answer exists in the corpus but the correct chunk wasn't retrieved in the top-k results. Embeddings fail to capture the right semantic similarity.

3. **Not in context / consolidation failure** — Relevant information is spread across multiple chunks, and the system fails to consolidate them into a coherent answer.

4. **Not extracted** — The correct chunk is retrieved but the LLM fails to extract or use the relevant information from it. Information buried mid-chunk is particularly vulnerable.

5. **Wrong format** — The answer is generated but in the wrong format (e.g., a table when prose was expected, or vice versa).

6. **Incorrect specificity** — The answer is too vague or too specific for the question asked.

7. **Incomplete** — The answer addresses part of the question but misses aspects that require information from other chunks.

## Chunking as Root Cause

Chunking artifacts are the single largest source of RAG failures:

- **Context loss**: Fixed-size chunks split semantic units at arbitrary boundaries. A paragraph explaining a concept may be split across two chunks, with neither chunk being self-contained.
- **Reference resolution**: Chunks lose pronouns and references. "It" in chunk 3 refers to an entity defined in chunk 1, but chunk 3 is retrieved without chunk 1.
- **Metadata stripping**: Section headers, document titles, and hierarchical context are lost when a chunk is extracted from its document.

Anthropic's Contextual Retrieval (September 2024) directly addresses this: prepending LLM-generated context to each chunk before embedding reduces retrieval failure by 49-67%.

## Retrieval Noise

Proximity in embedding space ≠ relevance to the query:
- Chunks that are semantically similar but factually irrelevant get retrieved
- Highly specific technical questions retrieve chunks about the general topic but not the specific answer
- Negative examples and caveats in documentation get retrieved when the user asks about the feature itself

## Implications for Knowledge Platform Design

For a ~100-1000 article markdown KB:
- Chunking is less necessary if articles are self-contained units
- Returning full articles (not chunks) avoids most chunking failure modes
- Frontmatter metadata provides the "context" that chunks lose
- At this scale, the retrieval problem is selecting the right 2-5 articles, not the right 10 chunks from 100K
