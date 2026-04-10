---
title: "ToM: Tree-oriented MapReduce for Long-Context Reasoning"
source_type: academic_paper
url: https://arxiv.org/abs/2511.00489
authors: Guo, Li, Wu, Wang, Li, Zhang, Zhao, Yang
year: 2025
venue: EMNLP 2025
relevance: Tree-structured evolution of MapReduce that leverages document hierarchy for better long-range dependency capture
---

## Summary

ToM extends flat MapReduce by constructing a DocTree through hierarchical semantic parsing, then performing bottom-up aggregation that preserves document structure for reasoning tasks.

## DocTree Construction

### Hierarchical Semantic Parsing (HSP)
1. Segment documents into fixed-length chunks (1K-8K tokens)
2. 3B-scale distilled model extracts internal semantic hierarchies per chunk
3. Transforms flat text into structured subtrees (headings/subheadings)
4. HSP trained on Wiki727, fine-tuned on 18K query-response pairs from GPT-4o

### Bottom-Up Aggregation
1. **Embed**: Root nodes from parsed subtrees embedded via pre-trained models
2. **Cluster**: Embeddings grouped using Leiden algorithm into semantic clusters
3. **Summarize**: Each cluster generates parent summary node via LLM
4. Recursive until single root node or small set of high-level nodes

## Tree MapReduce Reasoning

### Map Phase
Child nodes generate rationales with structured outputs: {key_info, rationale, answer, confidence}

### Reduce Phase
Sibling node results aggregated at parent levels:
- Conflicts resolved using confidence scores
- Coherence maintained across hierarchy
- Nodes at identical levels process in parallel

## Performance vs Baselines (GPT-4o)

| Task | ToM | LongAgent | RAG |
|------|-----|-----------|-----|
| Inf.QA (192K tokens) | 41.17% F1 | 38.00% F1 | 26.03% F1 |
| Inf.MC (184K tokens) | 85.0% Acc | 72.0% Acc | 65.0% Acc |
| HotpotQA | 61.07% F1 | 55.25% F1 | 53.73% F1 |

Key advantages:
- vs RAG: +15.14pp on ultra-long QA, +20pp on multiple-choice
- vs LongAgent: +11.97pp on Inf.QA, +13pp on Inf.MC

## Ablation Results
- Removing confidence measures: -6.9%
- Removing bottom-up aggregation: -2.0% to -6.0% depending on task

## Computational Profile
- DocTree construction: 75.4s for 250K-token documents
- Fewer LLM calls than LongAgent (4.2K vs 6.3K on 100 samples)
- Query-aware compression selects top-7 relevant chunks
