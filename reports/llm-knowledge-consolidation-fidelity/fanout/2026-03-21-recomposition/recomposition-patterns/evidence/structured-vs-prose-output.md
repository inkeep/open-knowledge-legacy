---
title: Structured vs Prose Output Formats
type: evidence
date: 2026-03-21
tags: [structured-output, prose, hybrid, format-selection, information-density]
---

# Structured vs Prose Output

## Format Impact on LLM Performance

### Format Restrictions and Reasoning (2024)

Structured output formats (JSON, XML) impact LLM reasoning:
- **Reasoning tasks**: Significant decline under format restrictions; stricter constraints → greater degradation
- **Classification tasks**: Some datasets show performance boosts with JSON-mode (constrains answer space)
- **Tradeoff**: Structure aids precision but hinders open-ended reasoning

- **Source**: Tam et al. (2024). "Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models." https://arxiv.org/html/2408.02442v1

**Relevance**: Recomposition should use the least restrictive format that meets the use case. Heavy structural constraints (strict JSON schemas) may degrade synthesis quality.

## When to Use Each Format

| Content Type | Best Format | Rationale |
|-------------|-------------|-----------|
| Comparisons across sources | Table | Visual alignment aids comparison |
| Sequential processes | Numbered list | Order matters, steps are discrete |
| Taxonomies/hierarchies | Nested sections with headers | Reflects inherent structure |
| Nuanced arguments | Prose | Qualifiers, hedging, transitions need sentences |
| Quantitative data | Table with prose commentary | Numbers need context |
| Contradictory evidence | Prose with inline citations | Requires careful framing |
| Reference material | Structured (headers + bullets) | Scannable, navigable |
| Deep analysis | Prose with structural scaffolding | Needs flow + navigation |

## Hybrid Approaches

The most effective recomposition outputs use **hybrid formats** — prose for nuanced synthesis with embedded structured elements:

### Pattern: Prose with Embedded Structure
```
## Topic Heading

Narrative prose explaining the key finding and its significance [1,3].

| System | Approach | Fidelity |
|--------|----------|----------|
| A | ... | High |
| B | ... | Medium |

The key distinction between these approaches is... [2].
```

This preserves the benefits of both:
- **Prose**: Captures nuance, hedging, relationships, flow
- **Structure**: Enables comparison, scanning, reference

## Information Density and Comprehension

### Key Finding from Education Research
Structured reading materials with headings and illustrations don't always outperform unstructured prose. Studies show manuscript readers sometimes scored higher on delayed tests, generated more relevant ideas, and wrote better essays — suggesting deep prose engagement aids retention.

- **Source**: (1985). "Text Structure and Retention of Prose." *Journal of Experimental Education*. https://eric.ed.gov/?id=EJ322958

### Chain of Density Insight
The Adams et al. (2023) finding that optimal information density is intermediate applies to format selection. Extremely dense structured output (all bullets, no prose) may sacrifice comprehension. Extremely verbose prose may bury key claims.

## Format Selection Heuristic for /consolidate

1. **Default to hybrid**: Prose sections with structured elements where appropriate
2. **Claims < 10**: Prose with inline citations sufficient
3. **Claims 10-50**: Sectioned prose with headers derived from claim clusters
4. **Claims 50+**: Hierarchical document with executive summary + detailed sections
5. **Comparison claims**: Auto-detect and render as tables
6. **Quantitative claims**: Auto-detect and render as tables with prose interpretation
7. **Contradictory claims**: Always prose — requires careful framing with attribution
