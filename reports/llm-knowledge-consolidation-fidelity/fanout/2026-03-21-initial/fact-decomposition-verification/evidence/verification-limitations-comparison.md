---
title: "Verification Method Comparison: Limitations and False Positive Analysis"
source_type: synthesis
urls:
  - "https://arxiv.org/abs/2404.10774"
  - "https://arxiv.org/abs/2411.15594"
  - "https://arxiv.org/abs/2503.05965"
  - "https://arxiv.org/abs/2406.16842"
  - "https://arxiv.org/abs/2601.06528"
accessed: 2026-03-21
relevance: "Comparative analysis of verification method limitations — informs pipeline design choices"
---

# Verification Method Comparison

## Method Landscape

| Method | Type | Cost | Speed | Accuracy | Best For |
|--------|------|------|-------|----------|----------|
| DeBERTa-MNLI | NLI encoder | Free (local) | Fast | ~88-92% sentence | Contradiction detection |
| AlignScore | Multi-task encoder | Free (local) | Fast | ~70% balanced | Diverse consistency |
| MiniCheck-FT5 | Fine-tuned encoder | Free (local) | Fast | 74.7% balanced | Grounding verification |
| GPT-4 as judge | LLM API | High ($107/test set) | Slow | 75.3% balanced | Nuanced claims |
| SAFE | LLM + Search | Medium | Slow | 72% agreement w/ humans | Open-domain verification |

## Limitation Analysis by Method

### NLI-Based (DeBERTa-MNLI, AlignScore)

**False Positives**: Mark claims as "supported" when:
- Claim is plausible but not actually stated in source (neutral → entailed confusion)
- Surface lexical overlap masks semantic difference
- Multi-sentence inference required but model only sees sentence pairs

**False Negatives**: Mark claims as "unsupported" when:
- Paraphrased heavily from source (different words, same meaning)
- Implicit information requiring inference
- Information distributed across multiple source sentences

**Critical gap**: 84% of factually supporting relationships don't map to NLI entailment. NLI captures a narrower relationship than "factual support."

### MiniCheck

**Strengths over NLI**:
- Trained specifically on factual consistency (not general NLI)
- Synthetic training data includes challenging edge cases
- Handles information synthesis across sentences

**Remaining limitations**:
- Binary output (no confidence score or explanation)
- 770M parameters still miss some nuanced cases
- ~25% error rate on balanced accuracy (comparable to GPT-4)
- No built-in completeness checking

### LLM-as-Judge

**False Positives**: Marks claims as supported when:
- Claim is plausible and matches LLM's parametric knowledge (even if not in source)
- Self-preference bias inflates ratings of similar-style text
- Position bias affects evaluation order

**False Negatives**: Marks claims as unsupported when:
- Implicit support requires multi-step reasoning
- Domain-specific terminology confuses judge

**Mitigation strategies**:
- Estimate true/false positive rates on holdout set
- Use calibration to adjust raw judgments
- Route uncertain cases to human review

### SAFE (Search-Augmented)

**Unique strengths**:
- Can verify against broader knowledge (not limited to provided sources)
- Multi-step search enables deeper investigation

**Limitations**:
- Search results themselves may be unreliable
- Agent may not find relevant evidence (search failure ≠ claim unsupported)
- 28% disagreement rate with humans (though wins 76% of disagreements)
- Not suitable for proprietary/internal knowledge verification

## Atomic vs Sentence-Level Verification

From Atomic-SNLI research:
- Models lose 1-8% accuracy when verifying atomic claims vs full sentences
- Gap widens for multi-fact claims (3+ atomic facts: ~7-10% drop)
- Specialized fine-tuning on atomic-level data closes gap significantly
- Implication: verification pipeline should expect lower accuracy at atomic level

## When Source Trust Varies

### High-trust sources (own agent outputs, primary research)
- Use stricter verification thresholds
- NLI/MiniCheck sufficient for contradiction checking
- Focus verification on internal consistency

### Medium-trust sources (secondary articles, documentation)
- Standard verification pipeline
- Cross-reference claims across multiple medium-trust sources
- Flag claims supported by only one source

### Low-trust sources (web articles, user-generated content)
- Require corroboration from at least one other source
- Use SAFE-style web search for independent verification
- Higher escalation rate to LLM-as-judge or human review

## Recommended Tiered Verification Pipeline

```
claims from consolidated output
  │
  ├─ Tier 1: MiniCheck (fast, cheap, 74.7% accuracy)
  │   ├─ SUPPORTED → accept (with source attribution)
  │   └─ UNSUPPORTED or LOW CONFIDENCE → escalate
  │
  ├─ Tier 2: LLM-as-Judge with CoT (medium cost)
  │   ├─ SUPPORTED with reasoning → accept
  │   ├─ CONTRADICTED → flag for conflict resolution
  │   └─ UNCERTAIN → escalate
  │
  └─ Tier 3: Human review or SAFE web search
      └─ Final determination
```

This tiered approach processes ~80% of claims cheaply in Tier 1, routing only uncertain cases upward.
