---
title: Attribution and Citation in Recomposed Output
type: evidence
date: 2026-03-21
tags: [attribution, citations, AIS, ALCE, inline-citations, source-tracking]
---

# Attribution in Recomposed Output

## AIS Framework (Attributable to Identified Sources)

Defines that NLG output pertaining to the external world should be verifiable against an independent, provided source. Provides a two-stage annotation pipeline for evaluating model output attribution.

- **Source**: Rashkin et al. (2023). "Measuring Attribution in Natural Language Generation Models." *Computational Linguistics*, 49(4), 777-840. https://direct.mit.edu/coli/article/49/4/777/116438/
- **Data/Guidelines**: https://github.com/google-research-datasets/AIS

NLI-based models are now commonly used as automated AIS metrics.

**Relevance**: AIS provides the gold standard for what "faithful attribution" means. Every claim in recomposed output should be attributable to its source(s).

## ALCE Benchmark (EMNLP 2023)

First benchmark for Automatic LLMs' Citation Evaluation. Three datasets: ASQA, QAMPARI, ELI5. Evaluates along three dimensions:
- **Fluency**: Measured via MAUVE score
- **Correctness**: Factual accuracy
- **Citation quality**: Citation recall and precision via NLI verification

### Key Finding
Even the best models lack complete citation support 50% of the time on ELI5.

- **Source**: Gao et al. (2023). "Enabling Large Language Models to Generate Text with Citations." EMNLP 2023. https://aclanthology.org/2023.emnlp-main.398/
- **Code**: https://github.com/princeton-nlp/ALCE

## Chain-of-Thought for Citations (AAAI 2024)

CoT reasoning improves citation accuracy in generated text.

- **Source**: (2024). "Chain-of-Thought Improves Text Generation with Citations in Large Language Models." AAAI 2024. https://ojs.aaai.org/index.php/AAAI/article/view/29794/31374

## C2-Cite: Contextual-Aware Citation (2025)

Context-aware citation generation for attributed LLMs.

- **Source**: (2025). "C2-Cite: Contextual-Aware Citation Generation for Attributed Large Language Models." https://arxiv.org/html/2602.00004

## Production System Approaches

### Perplexity AI
- Inline footnote numbers linking to expandable source snippets
- Synthesizes from multiple sources while citing authoritative references
- Dual engine: Sonar LLM family + real-time web retrieval
- Every claim grounded in retrieved sources, with groundingSupports mapping text segments to source indices
- **Source**: https://www.shapeof.ai/patterns/citations

### Google AI Overviews
- Multi-stage pipeline: retrieval → semantic ranking → LLM re-ranking → E-E-A-T filtering → data fusion
- 5-15 sources in final output
- groundingMetadata maps specific text segments back to source URLs
- **Source**: https://ai.google.dev/gemini-api/docs/google-search

### Elicit
- 94-99% accuracy in data extraction from scientific papers
- Every extraction supported by quotes or tables from underlying paper
- Better at extraction than deep interpretive synthesis
- **Source**: https://elicit.com/

## Citation Density Tradeoffs

| Approach | Readability | Traceability | Granularity |
|----------|-------------|--------------|-------------|
| Inline footnotes [1] | High | High | Per-claim |
| Parenthetical (Author, Year) | Medium | Medium | Per-claim |
| Section-level attribution | High | Low | Per-section |
| End-of-document bibliography | Highest | Lowest | Per-document |
| Hover/expandable citations | High | High | Per-claim |

**Recommendation for /consolidate**: Use inline numerical citations [1] with a sources section. Each claim should carry its source(s). For multi-source claims, use [1,3,5] format. This matches user expectations from Perplexity/AI Overview patterns and maintains traceability without destroying readability.
