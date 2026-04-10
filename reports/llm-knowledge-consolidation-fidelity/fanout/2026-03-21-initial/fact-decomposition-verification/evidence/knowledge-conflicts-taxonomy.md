---
title: "Knowledge Conflicts for LLMs: Taxonomy and Resolution Strategies"
source_type: academic_paper
url: "https://arxiv.org/abs/2403.08319"
authors: "Rongwu Xu, et al."
venue: "EMNLP 2024"
accessed: 2026-03-21
relevance: "Comprehensive taxonomy of how conflicting information is handled — directly applicable to multi-source consolidation"
---

# Knowledge Conflicts for LLMs: Survey Findings

## Taxonomy of Conflicts

### 1. Context-Memory Conflicts
Contextual knowledge conflicts with parametric knowledge in LLM's parameters.

**Causes:**
- Temporal misalignment (training data outdated)
- Misinformation pollution in retrieved documents
- Prompt injection attacks

**LLM Behavior:**
- No universal rule — models favor "semantically coherent, logical, and compelling" knowledge
- Display confirmation bias: prefer information consistent with internal memory
- Certain attention heads specialize in "memory" while others in "context"

**Resolution:**
- Fine-tuning (KAFT, TrueTeacher) to prefer context
- Context-aware decoding
- Discriminator training to identify misinformation
- COMBO framework: pairing compatible passages

### 2. Inter-Context Conflicts (Most Relevant to Consolidation)
Conflicts among various pieces of contextual knowledge from multiple sources.

**Causes:**
- Misinformation/fake news in retrieved documents
- Outdated information (conflicting timestamps)
- Genuine disagreements between sources

**LLM Behavior:**
- Poor contradiction detection abilities
- Favor context directly pertinent to query
- Confirmation bias for evidence aligning with internal memory
- Performance degrades as conflicting reasoning chains lengthen

**Resolution Approaches:**
- **Eliminating Conflict**: Specialized contradiction detection models (PCNN); use external tools (Google Search, Scholar) for ground truth
- **Improving Robustness**: Simultaneous discriminator-decoder training; query augmentation with confidence scoring across predictions
- No inherent confidence weighting by source reliability

### 3. Intra-Memory Conflicts
LLM's own parametric knowledge yields divergent responses to differently phrased queries.

**Causes:**
- Training corpus bias / inconsistent data
- Stochastic sampling in decoding
- Knowledge editing failures (post-hoc modifications don't generalize)

**Scale:** Even GPT-4 exhibits 13% inconsistency on commonsense tasks.

## Critical Gaps Identified

1. Solutions rely heavily on artificially constructed scenarios, not real-world retrieval conflicts
2. No unified framework handles multiple conflict types simultaneously
3. Lack of research on how conflicts interact in high-stakes domains
4. No established method for source reliability weighting

## Implications for Consolidation

### Inter-context conflicts are the primary concern
When consolidating from multiple sources (agent outputs, articles, web results), conflicting claims are expected. Current LLMs handle these poorly by default.

### Recommended mitigation for consolidation pipeline:
1. **Explicit conflict detection** using NLI contradiction detection between decomposed claims
2. **Source trust stratification**: weight claims by source reliability (own agent outputs > primary sources > web articles)
3. **Transparent conflict surfacing**: rather than silently resolving, flag conflicts in output with competing claims and sources
4. **Temporal awareness**: prefer newer information when sources conflict on time-sensitive facts
5. **Majority voting with provenance**: when multiple sources agree, increase confidence; track which sources support each claim

## GitHub
https://github.com/pillowsofwind/Knowledge-Conflicts-Survey
