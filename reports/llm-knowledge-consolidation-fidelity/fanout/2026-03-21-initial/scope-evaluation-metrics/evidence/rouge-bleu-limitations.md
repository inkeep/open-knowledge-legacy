---
title: "Limitations of ROUGE and BLEU for Consolidation Evaluation"
source_url: https://arxiv.org/html/2407.00747v1
source_type: academic_paper
authors: Hrishikesh Singh, Ledri Pashaj, Tirthankar Ghosal, Asif Ekbal
date_accessed: 2026-03-21
relevance: D7 — Why traditional overlap metrics are insufficient for measuring consolidation fidelity
---

## Key Findings

Comprehensive comparative study demonstrating that traditional overlap metrics are unreliable for evaluating summarization quality, with direct implications for consolidation evaluation.

### ROUGE Limitations
- ROUGE-2 and BERTScore show weak correlation with human judgment (0.2-0.4 on Kendall Tau-b)
- Systematically penalizes paraphrasing and semantic equivalence
- Simple extractive baselines often outperform sophisticated neural models on ROUGE
- Depends on reference summaries that may not represent valid alternatives
- Limits diversity of generated summaries by rewarding lexical similarity
- "BLEU metric yields low scores (<<0.01) for all summarization models" — essentially unusable

### SummaC Limitations
- "Very weak or non-significant correlation" with human evaluations in the patent domain
- Domain transfer is unreliable

### BERTScore Limitations
- While better than ROUGE, still shows weak-moderate correlation (0.2-0.4) in domain-specific evaluation
- Cannot capture "subtleties and high-level concepts"

### LLM-Based Evaluation Strengths
- GPT-4 and Llama-3-8B achieved 0.8-0.9 Spearman correlation with human assessment on accuracy, coverage, overall quality
- Open-source models performed comparably to commercial ones
- Multi-dimensional assessment (clarity, accuracy, coverage, overall) more informative than single scores

### Recommendations
1. Avoid relying solely on automatic overlap metrics
2. Prioritize LLM-based evaluation for cost-effective, reliable assessment
3. Use multi-dimensional evaluation rather than single composite scores
4. Account for domain-specific behavior differences

### Relevance to Consolidation
- Consolidation inherently involves paraphrasing and restructuring — exactly where ROUGE fails
- Multi-document consolidation means no single "reference" exists, making reference-based metrics impractical
- LLM-as-judge with multi-dimensional criteria is the most promising automated approach
- Domain-specific calibration will be necessary for any consolidation evaluation pipeline
