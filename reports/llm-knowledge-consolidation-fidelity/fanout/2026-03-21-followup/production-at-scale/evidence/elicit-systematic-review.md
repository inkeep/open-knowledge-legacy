---
title: Elicit (Ought) Research Consolidation Architecture
type: primary-source-synthesis
sources:
  - url: https://elicit.com/blog/systematic-review/
    title: "Introducing Elicit Systematic Review"
    publisher: Elicit
  - url: https://journals.sagepub.com/doi/10.1177/08944393251404052
    title: "Evaluating Elicit as Semi-Automated Second Reviewer for Data Extraction"
    publisher: SAGE (Social Science Computer Review)
    year: 2025
  - url: https://pmc.ncbi.nlm.nih.gov/articles/PMC11921719/
    title: "Using AI for systematic review: the example of Elicit"
    publisher: PMC
  - url: https://onlinelibrary.wiley.com/doi/full/10.1002/cesm.70050
    title: "Comparison of Elicit AI and Traditional Literature Searching"
    publisher: Cochrane Evidence Synthesis and Methods (Wiley)
    year: 2025
  - url: https://ought.org/updates/2022-10-06-ice-primer
    title: "ICE: Interactive Composition Explorer"
    publisher: Ought
date_accessed: 2026-03-21
---

## Architecture Philosophy

- Built on "process-based supervision" — supervise reasoning processes, not just outcomes
- Developed Interactive Composition Explorer (ICE): open-source Python library for compositional LM programs
- Operates as "AI-powered spreadsheet" — structured extraction, not conversational

## Systematic Review Workflow

Step-by-step guided process:
1. **Search**: Find relevant papers across databases
2. **Title & Abstract Screening**: AI-assisted filtering
3. **Full-text Data Extraction**: Structured data pull from papers
4. **Synthesis**: Cross-paper analysis with citations

## Claim Extraction & Verification

- Every AI-generated claim backed by exact quote + link to source paper
- Sentence-level citations from underlying sources
- Extracts quantitative and qualitative data including tabular data
- "Verify individual claims in long answers" feature (launched August 2024)

## Scale

- Up to 1,000 relevant papers per search
- Up to 20,000 specific data points simultaneously during extraction
- Claimed 80% time savings (16 hours per systematic review)

## Performance Data (2025)

From Cochrane comparison study (Lau, 2025):
- Elicit sensitivity: 39.5% average (vs 94.5% in original searches)
- Elicit precision: 41.8% average (vs 7.55% in original)
- Elicit identified some studies missed by original searches
- Trade-off: higher precision, much lower recall

## Model Integration

- Integrated Claude Opus 4.5 (December 2025)
- Internal evaluations: outperforms Gemini 3 Pro and GPT-5 at data extraction
- Fewer hallucinations than competing models in extraction tasks

## Handling Conflicting Results

- No explicit "conflict resolution" algorithm documented
- Structured extraction preserves each paper's individual findings
- Users see paper-by-paper data rather than pre-synthesized conclusions
- Conflict detection left to researcher judgment on extracted data
