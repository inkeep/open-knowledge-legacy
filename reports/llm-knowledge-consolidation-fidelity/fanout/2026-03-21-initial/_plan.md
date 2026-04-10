# Consolidation Plan

## Parent purpose
Understand proven patterns, techniques, and implementations for using AI/LLMs to consolidate knowledge from multiple sources (agent outputs, documents, articles, books, web searches) into a single distilled body of work while maintaining factual fidelity — to inform the design of a generalizable /consolidate skill.

## REPORT.md structure (7 sections)

### Section 1: Consolidation Architectures (from sub-1)
- Stuff-it-all, Map-Reduce (flat + structured), Hierarchical Merging (baseline + context-aware), Progressive Refinement, Tree-Structured Merging
- Architecture comparison matrix
- Source-type suitability matrix

### Section 2: Information Loss & Hallucination Failure Modes (from sub-1)
- 7 failure modes: hallucination amplification, information omission, semantic drift, detail flattening, false synthesis, positional bias, ordering sensitivity
- Empirical rates per architecture
- Mitigation strategies

### Section 3: Atomic Fact Decomposition & Claim-Level Extraction (from sub-2)
- FActScore pipeline mechanics
- Extractive vs abstractive decomposition tradeoffs
- Iterative extraction (AFEV)
- Decomposition DURING consolidation (inverted FActScore)
- Claim deduplication pipeline
- Conflict detection and resolution strategies

### Section 4: Factuality Verification & Grounding (from sub-2)
- NLI-based verification (DeBERTa, AlignScore)
- MiniCheck (cost-effective first pass)
- LLM-as-judge verification
- SAFE (search-augmented)
- Source attribution & citation tracking
- Tiered verification pipeline
- Trust-tier-aware verification

### Section 5: Framework Implementations (from sub-3)
- LangChain/LangGraph recursive collapse + state reducers
- LLMxMapReduce V1+V2 (structured protocol, entropy refinement)
- CrewAI (string concatenation — cautionary example)
- AutoGen (summary carryover)
- Agent Zero (5-action taxonomy, safety rails)
- NexusSum (progressive compression with rollback)
- Key finding: no framework ships high-fidelity consolidation by default

### Section 6: Scope-Aware Consolidation (from sub-4)
- QFMDS adapted for completeness (not brevity)
- GraphRAG community structure for scope boundaries
- Goal-directed and rubric-scoped extraction
- Detecting accidental scope-filtering drops

### Section 7: Evaluation & Quality Metrics (from sub-4)
- Why traditional metrics fail (ROUGE, BLEU, BERTScore)
- Factual consistency metrics (FactCC, DAE, SummaC, MiniCheck)
- Claim coverage / nugget-based evaluation (AutoNuggetizer)
- LLM-as-judge
- Composite "lossless within scope" metric
- Practical evaluation pipeline (3 tiers)

## Cross-cutting synthesis

1. **The Decompose-Verify-Recompose meta-pattern**: Across all dimensions, the highest-fidelity approaches share a common structure — decompose sources into atomic claims, verify/deduplicate/resolve conflicts at the claim level, recompose into coherent output, then verify the output against the claim inventory. This is the core design pattern for a /consolidate skill.

2. **No framework does this well by default**: Sub-3 confirms that every major framework's consolidation is lossy summarization or string concatenation. A /consolidate skill fills a genuine gap.

3. **Architecture selection should be source-type-aware**: Sub-1's source-type matrix + Sub-2's structured-vs-unstructured decomposition guidance combine into a routing decision for the skill.

## Contradictions
None identified across sub-reports.

## Evidence file consolidation

| Target file | Action | Sources |
|---|---|---|
| consolidation-architectures.md | Create from sub-1 evidence | sub-1: llmxmapreduce.md, tom-tree-mapreduce.md, context-aware-hierarchical-merging.md, nexussum.md, etc |
| failure-modes.md | Create from sub-1 evidence | sub-1: hallucination-mds.md, hallucinate-at-the-last.md, lost-in-the-middle.md, fables-book-faithfulness.md, synthesis-models.md |
| fact-decomposition.md | Create from sub-2 evidence | sub-2: factscore-decomposition.md, afev-iterative-extraction.md, extractive-vs-abstractive-jedi.md, atomic-snli-findings.md |
| factuality-verification.md | Create from sub-2 evidence | sub-2: minicheck-architecture.md, nli-verification-approaches.md, llm-as-judge-verification.md, safe-pipeline.md, source-attribution-rag.md |
| conflict-resolution.md | Create from sub-2 evidence | sub-2: knowledge-conflicts-taxonomy.md, multi-source-conflict-resolution.md |
| framework-implementations.md | Create from sub-3 evidence | sub-3: all 6 evidence files |
| scope-aware-consolidation.md | Create from sub-4 evidence | sub-4: graphrag-qfmds.md, qfmds-knowledge-intensive.md |
| evaluation-metrics.md | Create from sub-4 evidence | sub-4: autonuggetizer-trec-rag.md, factual-consistency-taxonomy.md, rouge-bleu-limitations.md, practical-eval-pipeline.md, etc |
