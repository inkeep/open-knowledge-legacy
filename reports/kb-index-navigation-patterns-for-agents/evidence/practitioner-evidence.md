# Evidence: What Actually Works — Practitioner Evidence

**Dimension:** D7 — What actually works — practitioner evidence
**Date:** 2026-04-02
**Sources:** OpenAI Harness Engineering, Amazon Science, academic papers, practitioner blogs, benchmarks

---

## Key files / pages referenced

- https://openai.com/index/harness-engineering/ — Harness Engineering (OpenAI, 3 engineers, 1M LOC, 1500 PRs)
- https://www.amazon.science/publications/keyword-search-is-all-you-need — Amazon Science keyword search paper
- https://arxiv.org/abs/2603.20432 — Coding Agents are Effective Long-Context Processors
- https://arxiv.org/abs/2505.21577 — RepoMaster (NeurIPS 2025)
- https://arxiv.org/abs/2512.20957 — RepoNavigator: One Tool Is Enough
- https://arxiv.org/abs/2602.20478 — Codified Context (283 sessions)
- https://github.com/giancarloerra/socraticode — SocratiCode benchmark
- https://github.com/upstash/context7 — Context7 (51K+ stars)

---

## Findings

### Finding: "Map, not manual" is the most validated pattern — proven at 1M LOC scale
**Confidence:** CONFIRMED
**Evidence:** https://openai.com/index/harness-engineering/

OpenAI's Harness team built 1M lines of code with 3 engineers using Codex. Key finding: "give Codex a map, not a 1,000-page instruction manual." The map pattern: AGENTS.md as table of contents → structured docs/ directory → agent reads what it needs. Average 3.5 PRs per engineer per day. Humans never directly contributed code.

**Implications:** This is the strongest production evidence for the index-first pattern at scale.

### Finding: Keyword search + agentic tool use achieves 90%+ of RAG performance
**Confidence:** CONFIRMED
**Evidence:** https://www.amazon.science/publications/keyword-search-is-all-you-need

Amazon Science (December 2025): Tool-augmented LLM agents with basic keyword search tools achieve "over 90% of the performance metrics compared to traditional RAG systems without using a standing vector database." Particularly effective on technical documentation and complex financial documents. Simple to implement, cost-effective, useful for frequently updated knowledge bases.

**Implications:** For a KB of 100-1000 articles, keyword search tools (grep-equivalents) may be sufficient. Vector search adds marginal improvement at significant infrastructure cost.

### Finding: Agents-as-file-system-navigators outperform dedicated RAG by 17.3%
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2603.20432

"Coding Agents are Effective Long-Context Processors" (2026): Off-the-shelf coding agents (Claude Code, etc.) outperform "published state-of-the-art by 17.3% on average" on tasks including RAG and QA with corpora up to 3 trillion tokens. Key insight: "By reformulating long-context tasks as file system navigation problems, coding agents can leverage their native capabilities — terminal commands, programmatic search, and iterative script refinement." File system familiarity + native tool proficiency explain effectiveness.

**Implications:** This is landmark evidence that agents navigating a file system with standard tools (grep, find, cat) can OUTPERFORM purpose-built RAG systems. For a markdown KB, the file system IS the primary interface.

### Finding: RepoMaster reduces token usage by 95% through hierarchical exploration + graph analysis
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2505.21577

RepoMaster (NeurIPS 2025): Constructs function-call graphs, module-dependency graphs, and hierarchical code trees. Identifies "core components as initial context" then navigates progressively. 110% improvement in valid submissions vs OpenHands. 62.9% task-pass rate (up from 40.7%). 95% token reduction. Inspired by how human programmers explore unfamiliar codebases: "map structure, start viewing key files, then jump to relevant files based on signals."

**Implications:** Hierarchical exploration (overview → key files → specific details) dramatically reduces token consumption while improving task completion. This is progressive disclosure in action.

### Finding: Single-tool navigation (symbol resolution) outperforms multi-tool approaches
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2512.20957

RepoNavigator: Using only one tool ("jump" for symbol resolution) outperforms systems with 3-5 tools. Adding tools beyond jump DECREASED function-level IoU from 24.28% to 13.71%. The single-tool design reduces action space complexity and eliminates compounding errors. A 7B RL-trained model surpasses 14B baselines.

**Implications:** Counterintuitive finding: fewer, more precise navigation tools may be better than many specialized tools. For a KB, a simple "get article by reference" tool may outperform a suite of search/filter/browse tools.

### Finding: At scale (2.5M+ lines), hybrid search uses 61% fewer tokens than grep-only
**Confidence:** CONFIRMED
**Evidence:** https://github.com/giancarloerra/socraticode

SocratiCode on 2.45M-line codebase: grep needed 31 steps for 5 questions; hybrid semantic search needed 5 steps. 61% fewer tokens, 84% fewer tool calls, 37x faster. Hybrid = BM25 + vector + Reciprocal Rank Fusion with AST-aware chunking.

**Implications:** Scale breakpoint: below ~100K lines / ~1000 articles, grep/keyword search works fine. Above that, hybrid search provides dramatic efficiency gains.

### Finding: Context7 validates the "index → content" two-step MCP pattern at massive scale
**Confidence:** CONFIRMED
**Evidence:** https://github.com/upstash/context7

Context7 (51K+ GitHub stars, most popular MCP server in 2026) uses exactly two tools: (1) search library by name → returns matching libraries with IDs; (2) get docs by library ID → returns documentation. This is the "catalog → content" pattern in its purest form. The search tool IS the index; the docs tool IS the content delivery.

**Implications:** Context7's success demonstrates that the two-tool pattern (search/browse → read full content) scales to massive documentation corpora and is the pattern agents actually use.

### Finding: Codified Context infrastructure grew over 283 sessions, validating persistent index patterns
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2602.20478

108K-line C# codebase, 283 development sessions. Three tiers: hot-memory constitution (always loaded), 19 domain agents, 34 cold-memory spec documents. The infrastructure grew iteratively: "AI must be told — repeatedly, reliably, and in a format it can act on — how the project works, what patterns to follow, and what mistakes to avoid."

**Implications:** Index files are not write-once — they grow and evolve with the project. The system that maintains the index must also update it as the knowledge base changes.

---

## Scale breakpoints summary

| Scale | Best approach | Evidence |
|-------|--------------|----------|
| <100 articles / <10K lines | Full dump or simple search | Karpathy pattern works at ~100 articles |
| 100-1000 articles / 10K-100K lines | Index + keyword search + targeted reading | Amazon Science (90% of RAG), Context7 pattern |
| 1000-10K articles / 100K-1M lines | Hybrid search + progressive disclosure | SocratiCode benchmark, RepoMaster |
| >10K articles / >1M lines | Pre-built semantic index essential | Cursor, Augment Code approaches |

---

## Gaps / follow-ups

* No direct A/B test of index-first vs exploration-first on the same KB
* Token consumption data for index-first approaches on markdown KBs specifically is sparse
* Practitioner evidence heavily skewed toward code (not markdown knowledge bases)
