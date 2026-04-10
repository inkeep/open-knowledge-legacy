---
title: "Practical Evaluation Pipeline Design for Production Summarization/Consolidation"
source_url: https://www.zenml.io/llmops-database/automated-evaluation-framework-for-llm-powered-features
source_type: technical_case_study
authors: Slack ML team (via ZenML); OpenAI Cookbook; various
date_accessed: 2026-03-21
relevance: D7 — Production-ready evaluation pipeline architecture for consolidation skill
---

## Key Findings

### Slack's Three-Tiered Evaluation Framework
1. **Golden Set Evaluation**: Very small sample (~10-20 examples) where engineers manually inspect data + outputs for rapid prototyping
2. **Validation Set Evaluation**: Larger sample (100-500 examples), more representative of production traffic, automated metric scoring
3. **A/B Testing**: Production deployment with real users, measuring engagement/satisfaction

### Pipeline Architecture Principles
- Individual metrics combined into composite scores OR broken-down dimension scores
- Composite scores for overall monitoring; dimension scores for diagnosing specific problems
- ETL layer for data ingestion and normalization is critical infrastructure
- Custom task-specific metrics required for production readiness

### OpenAI Cookbook Recommendations
- Combine automated metrics with human evaluation
- Start with automated evaluation for scale, complement with human judgment for quality
- Multi-metric evaluation: no single metric captures all quality dimensions
- Reference-free evaluation (G-Eval style) when reference outputs unavailable

### Key Insight: Staged Approach
The consensus across sources is a staged evaluation approach:
1. **Development**: Quick automated checks (ROUGE/BERTScore for regression, LLM-judge for quality)
2. **Validation**: Larger-scale automated evaluation with multiple metrics + periodic human spot-checks
3. **Production**: Continuous monitoring with automated alerts on metric degradation

### Relevance to Consolidation Skill
A practical consolidation evaluation pipeline should implement:

**Automated Layer (every run)**:
- Claim extraction from sources → claim coverage check against output (nugget recall)
- LLM-as-judge for faithfulness (no hallucinated claims)
- LLM-as-judge for scope adherence (no out-of-scope content)
- Basic statistics: compression ratio, source coverage per document

**Periodic Validation Layer**:
- Human review of random samples against source documents
- Inter-rater reliability on faithfulness and completeness dimensions
- Comparison against baseline (e.g., naive concatenation)

**Regression Layer**:
- Golden set of consolidation examples with known quality scores
- Run on each model/prompt change to detect regressions
