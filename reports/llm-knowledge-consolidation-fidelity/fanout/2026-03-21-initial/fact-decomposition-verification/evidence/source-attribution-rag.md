---
title: "Source Attribution and Citation Tracking in Consolidation Pipelines"
source_type: synthesis
urls:
  - "https://arxiv.org/abs/2305.14627"
  - "https://www.tensorlake.ai/blog/rag-citations"
  - "https://github.com/HITsz-TMG/awesome-llm-attributions"
  - "https://github.com/princeton-nlp/ALCE"
accessed: 2026-03-21
relevance: "Provenance tracking patterns for maintaining source attribution through consolidation"
---

# Source Attribution and Citation Tracking

## The Attribution Problem in Consolidation
When consolidating knowledge from multiple sources, every claim in the output should trace back to its originating source(s). LLMs synthesize information from multiple chunks rather than extracting verbatim, making sentence-level attribution difficult.

## ALCE Benchmark (EMNLP 2023)
First benchmark for Automatic LLMs' Citation Evaluation.

**Three evaluation dimensions:**
1. Fluency
2. Correctness
3. Citation quality (precision and recall)

**Key finding:** Even the best models lack complete citation support 50% of the time on the ELI5 dataset.

**Datasets:** ASQA, QAMPARI, ELI5 — each testing different aspects of cited text generation.

## Citation-Aware RAG Architecture

### Three-stage pipeline for maintaining provenance:

**Stage 1: Document Parsing with Spatial Anchors**
- OCR returns bounding box coordinates, page numbers, fragment classifications
- Lightweight inline anchors (e.g., `<c>2.1</c>` = `[page_num].[reading_order]`) embedded at natural break points
- Each chunk stores citation metadata: `{"citations": {"2.1": {"page": 23, "bbox": {...}}}}`

**Stage 2: Retrieval with Metadata**
- Standard retrieval mechanisms (dense search, hybrid, reranking) work unchanged
- Citation anchors flow transparently through vector DB storage

**Stage 3: Response Generation with Attribution**
- LLM receives chunks containing inline markers
- Instructed to return citation identifiers in structured form
- Output: `{"answer": "...", "citations": ["2.1"]}`
- Final step: resolve citation IDs back to spatial coordinates

### Unbroken provenance chain:
source document → parsed elements with bounding boxes → anchored chunks with metadata → retrieved context → LLM output → resolved citations

## Attribution Methods at Different Granularities

| Level | Method | Traceability |
|-------|--------|-------------|
| Document | Source list / reference list | Coarse — which document |
| Passage/Chunk | Inline citations [1], [2] | Medium — which section |
| Span | Bounding box / character offset | Fine — exact text |
| Token | MIRAGE (attention attribution) | Finest — which tokens influenced output |

## SourceCheckup (Nature Communications, 2025)
Automated agent-based pipeline evaluating relevance and supportiveness of LLM citations.
**Finding:** 50-90% of LLM responses are not fully supported, sometimes contradicted, by cited sources.

## Practical Patterns for Consolidation

### Pattern 1: Claim-Source Index
- Decompose each source into claims
- Assign each claim a (source_id, location) tuple
- During consolidation, carry these tuples as metadata
- Final output includes attribution for each synthesized statement

### Pattern 2: Dual Representation
- Store both original source span (extractive) and normalized claim (abstractive)
- Use normalized form for deduplication/merging
- Preserve original span for attribution

### Pattern 3: Post-hoc Attribution Verification
- After generating consolidated output, verify each claim's attribution
- Use NLI/MiniCheck to confirm claimed source actually supports the statement
- Flag unsupported attributions for review

## Key Challenges
1. LLMs synthesize across multiple sources — hard to pinpoint which output maps to which source
2. Paraphrasing breaks direct text matching
3. Implicit information (inferences from multiple facts) may not trace to any single source
4. Attribution often points to document sets, not specific sentences
