---
title: Discourse Planning and Content Ordering for Recomposition
type: evidence
date: 2026-03-21
tags: [discourse-planning, content-ordering, RST, text-planning, NLG, sentence-ordering, aggregation]
---

# Discourse Planning and Content Ordering

## Rhetorical Structure Theory (RST)

RST, developed by Mann & Thompson (1988), provides a hierarchical framework for describing text organization through discourse relations (elaboration, contrast, cause-effect, condition, etc.). In NLG, RST serves as the theoretical basis for computational text planning, with text structures built on small patterns called "schemas."

- **Source**: Mann, W.C. & Thompson, S.A. (1988). "Rhetorical Structure Theory: Toward a Functional Theory of Text Organization." *Text*, 8(3), 243-281. Also: https://www.sfu.ca/rst/
- **Comprehensive review**: Guz & Catal (2020). "Rhetorical structure theory: A comprehensive review of theory, parsing methods and applications." *Expert Systems with Applications*. https://www.sciencedirect.com/science/article/abs/pii/S0957417420302451
- **LLM parsing (2024)**: Liu et al. (2024). "Can we obtain significant success in RST discourse parsing by using Large Language Models?" EACL 2024. Llama 2 70B achieved state-of-the-art RST parsing results. https://aclanthology.org/2024.eacl-long.171/

**Relevance to recomposition**: RST provides the theoretical vocabulary for how claims should relate to each other — which claims elaborate on others, which contrast, which provide evidence. A recomposition system could use RST relations to determine how to connect claims.

## Segmented Discourse Representation Theory (SDRT)

SDRT extends Discourse Representation Theory by segmenting discourse into labeled constituents connected by rhetorical relations. Unlike RST's strict tree structure, SDRT allows more **graph-like structures**. Every segment must connect to another via some discourse relation.

- **Source**: Asher & Lascarides (2003). "Logics of Conversation." Cambridge University Press. https://homepages.inf.ed.ac.uk/alex/sdrt.html

**Relevance**: SDRT's graph structure better captures claims with multiple relationships. Its constraint that every claim must connect to at least one other claim prevents orphaned or incoherently placed claims.

## Classical Text Planning Systems

The Reiter & Dale (2000) NLG architecture distinguishes three stages:
1. **Document planning**: Deciding what to say and creating abstract document structure
2. **Microplanning**: Deciding how to say it (referring expressions, aggregation, lexicalization)
3. **Surface realization**: Producing actual text

- **Source**: Reiter, E. & Dale, R. (2000). *Building Natural Language Generation Systems*. Cambridge University Press.

### McKeown's TEXT System
Uses schema-based templates of rhetorical predicate sequences (Identification, Constituency, Attributive, Cause-Effect) encoding common discourse patterns. Selects schema matching communicative goal, fills from knowledge base, uses focusing mechanism for coherence.

- **Source**: McKeown (1985). *Text Generation*. Cambridge University Press. https://www.sciencedirect.com/science/article/abs/pii/0004370285900827

### Hovy's Text Planner
Uses RST relations as **generative planning operators**. Searches through content and discourse relations to construct an RST tree achieving a communicative goal. Key insight: different goals produce different orderings of the same claims.

- **Source**: Hovy (1993). "Automated Discourse Generation Using Discourse Structure Relations." *Artificial Intelligence*, 63, 341-385. https://www.sciencedirect.com/science/article/abs/pii/0004370293900213

## Entity-Based Coherence (Barzilay & Lapata)

The Entity Grid model captures patterns of entity distribution across sentences, inspired by Centering Theory. Coherent texts exhibit characteristic entity transition patterns.

- **Source**: Barzilay, R. & Lapata, M. (2008). "Modeling Local Coherence: An Entity-Based Approach." *Computational Linguistics*, 34(1), 1-34. https://direct.mit.edu/coli/article/34/1/1/1969/

**Relevance**: Entity grids can evaluate and optimize claim ordering — claims sharing entities should be adjacent.

## Neural Sentence Ordering

### Pointer Networks
Hierarchical encoder-decoder using pointer network to select next sentence from unordered set. Implicitly learns discourse coherence from training data.

- **Source**: Gong et al. (2016). "End-to-End Neural Sentence Ordering Using Pointer Network." https://www.researchgate.net/publication/310329210

### Topic-Guided Coherence Modeling (TGCM)
Augments sentence ordering with latent topic vectors. Captures topic-enhanced sentence-pair interactions, promoting local dependencies while maintaining global topic coherence.

- **Source**: Oh et al. (2019). "Topic-Guided Coherence Modeling for Sentence Ordering." EMNLP 2019. https://aclanthology.org/D19-1232/

## Plan-then-Generate (PlanGen)

Separates data-to-text into content planner and sequence generator. **A 140M-parameter PlanGen model outperformed the 2.8B-parameter T5-3B** — explicit planning is more parameter-efficient than brute-force scaling.

- **Source**: Su et al. (2021). "Plan-then-Generate: Controlled Data-to-Text Generation via Planning." https://ar5iv.labs.arxiv.org/html/2108.13740

**Relevance**: Confirms that planning is not just beneficial but necessary. Claim ordering and grouping before generation far outweighs model scale.

## Aggregation and Sentence Fusion

### Linguistic Aggregation
Merging multiple claims into single sentences to reduce redundancy: syntactic aggregation (shared constituents), embedding aggregation (subordination), set aggregation (listing).

- **Source**: Reiter & Dale (2000); Dalianis (1999). "Aggregation in Natural Language Generation." *Computational Intelligence*, 15(4).

### Sentence Fusion
Synthesizes common information across multiple sentences via bottom-up multisequence alignment, then statistical generation combines common phrases.

- **Source**: Barzilay & McKeown (2005). "Sentence Fusion for Multidocument News Summarization." *Computational Linguistics*, 31(3). https://www.researchgate.net/publication/220355341

**Relevance**: Simply concatenating claims produces choppy text. Aggregation and fusion algorithms identify which claims can be merged, embedded, or listed together — critical for natural prose.

## Outline-Guided Text Generation (WritingPath, 2024)

WritingPath uses a five-step process generating metadata → outline → augmented outline → final text. Both LLM and human evaluators confirmed superior logical fluency, specificity, and coherence.

- **Source**: Yang et al. (2024). "Navigating the Path of Writing: Outline-guided Text Generation with Large Language Models." https://arxiv.org/abs/2404.13919

## Planning-Augmented Generation (2024)

LLMs trained with auxiliary planning task produce higher quality long-form documents. +2.5% ROUGE-Lsum improvement and 3.60 win/loss ratio in human evaluation.

- **Source**: Petrik et al. (2024). "Integrating Planning into Single-Turn Long-Form Text Generation." https://arxiv.org/abs/2410.06203
