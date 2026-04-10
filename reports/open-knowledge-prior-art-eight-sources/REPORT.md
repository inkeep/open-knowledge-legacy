---
title: "Prior Art for Open-Knowledge: Eight Sources Deep Investigation"
description: "Deep investigation of eight prior-art sources (Graphify, ByteRover CLI, ByteRover paper arxiv:2604.01599, DeepWiki, obsidian-mind, Garry Tan's GBrain spec, Stably Orca, Karpathy's LLM Wiki gist) mapped against the open-knowledge project (markdown+CRDT+MCP+git agent-native knowledge platform). Grounded in cloned-repo source investigation for OSS projects; verbatim gist/paper extraction for documents. Surfaces convergent architectural bets, divergent design choices, novel patterns to consider, and paper-vs-implementation discrepancies."
createdAt: 2026-04-07
updatedAt: 2026-04-07
dimensions: D1-D11
subjects:
  - Graphify
  - ByteRover
  - ByteRover CLI
  - DeepWiki
  - Cognition Devin
  - obsidian-mind
  - GBrain
  - Garry Tan
  - Stably Orca
  - Karpathy LLM Wiki
  - open-knowledge
topics:
  - agent-native knowledge platforms
  - markdown knowledge bases
  - MCP server design
  - knowledge graph construction
  - agent memory
  - LLM-curated wikis
  - CRDT vs sequential task queue
  - Claude Code skills
  - reference skill patterns
  - wiki linting
  - reference skill mapping
---

# Prior Art for Open-Knowledge: Eight Sources Deep Investigation

**Purpose:** Deep investigation of eight specified prior-art sources mapped against what open-knowledge is building. The reader — likely the open-knowledge project owner during scoping/spec — cares most about: (1) what these projects are actually doing (grounded in code, not marketing), (2) what novel angles they surface that open-knowledge hasn't addressed, (3) what open-knowledge already covers or has similarities for, (4) what risks and failure modes to learn from.

---

## Executive Summary

Eight sources were investigated across a spectrum from published research (arxiv:2604.01599) to working OSS (4 repos cloned and read) to design documents (2 gists) to hosted product (DeepWiki). They share a common thesis — **the LLM should curate a persistent, human-readable, markdown-based knowledge base instead of relying on chunked-and-embedded retrieval** — but diverge sharply on execution: storage format (files vs SQLite), coordination (CRDT vs sequential queue vs file-only), MCP surface size (2 tools vs 10 vs 14), and whether humans are primary authors, co-editors, or passive reviewers.

**The most important findings, ordered by impact on open-knowledge:**

1. **The ByteRover paper's architecture is largely implemented as described, with one notable exception.** Deep code investigation verified: 5-tier progressive retrieval IS implemented in `query-executor.ts` (all 5 tiers with explicit cache, fuzzy-cache, direct-search, LLM-call, and agentic-loop paths); atomic writes ARE implemented via `DirectoryManager.writeFileAtomic()` (temp+rename pattern) used throughout the curation path. The paper's ablation study confirms tiered retrieval is load-bearing: removing it drops accuracy by 29.4 points. **The one real paper-vs-code divergence:** Adaptive Knowledge Lifecycle (AKL) has importance/maturity/recency infrastructure built but all compound-score weights are set to 0 in `memory-scoring.ts` — AKL ranking is effectively disabled. ByteRover's SOTA benchmark results (LoCoMo 96.1%, LongMemEval-S 92.8%) were achieved with AKL compound scoring disabled. Additionally, the README/marketing claims "24 built-in agent tools" but the actual tool registry has 11 — a marketing inflation, not a paper claim. The load-bearing components are: MiniSearch BM25 with field boosting + tiered retrieval architecture + Context Tree hierarchy + LLM-curated entries + bidirectional reference index + symbol tree system-prompt injection.

2. **Open-knowledge has independently arrived at the same architecture the SOTA "agent memory" paper validates.** ByteRover's bidirectional reference index with O(1) lookup per entry is identical to open-knowledge's S10 wiki-links + backlinks dual adjacency list. ByteRover's symbol tree prompt injection is the same pattern as open-knowledge's `.openknowledge/index.md` read by agents. The core data structure is the same; the load-bearing components are the same. Open-knowledge should treat this as strong empirical confirmation of its S10 design, not as a competitor to copy.

3. **obsidian-mind covers a substantial portion of open-knowledge's value proposition with zero application code.** It is a pure template: CLAUDE.md operating manual + 15 slash commands + 9 subagents + 5 lifecycle hooks + note templates + folder scaffolding. No backend. 1.3K stars. This is a **serious positioning risk** — the marginal value of open-knowledge's substrate must be concretely about real-time human+AI co-editing, presence, embeddable editor, sandbox enforcement, and the MCP write surface. Not about "persistent knowledge" or "agent-maintained wiki" as categories — those are already addressed by skills+conventions on top of Obsidian.

4. **Three independent teams (ByteRover, GBrain, open-knowledge) converge on "thin CLI harness + fat markdown skills" as the correct architecture for agent-native knowledge.** This is a strong validation signal for open-knowledge's PQ13 Option D and PQ14 reference-skills decisions. The convergent pattern is: a small, stateless library handles deterministic data operations; rich markdown SKILL.md files contain orchestration logic Claude reads at session start. The intelligence lives in markdown, not code.

5. **Five novel patterns that open-knowledge's PROJECT.md does not currently address emerge across the sources:**
   - **"Compiled truth + timeline"** (GBrain): split each entry into above-the-line current state and below-the-line append-only evidence. Solves the provenance-vs-summary tension without code.
   - **Edge confidence typing** (Graphify + ByteRover): EXTRACTED/INFERRED/AMBIGUOUS provenance on wiki-links, not just "exists/doesn't."
   - **PreToolUse hook injecting "read the index first"** (Graphify): steers Claude to graph-aware navigation before falling back to grep. Installable via `graphify hook install`.
   - **Agent-writable draft status comment** (Orca): `orca worktree set --comment "..."` gives users high-bandwidth "what's the agent doing?" signal without log-parsing.
   - **Git's ~5,000-file scaling ceiling** (GBrain, validated by Garry Tan's 7,471-file brain hitting the wall): open-knowledge's PROJECT.md does not currently acknowledge this limit or plan for it.

6. **Karpathy's gist is the canonical vision, and it is explicitly abstract** ("the document's only job is to communicate the pattern"). It has no reference implementation from Karpathy himself. The three-layer architecture (raw sources / wiki / schema-in-CLAUDE.md) and three operations (Ingest / Query / Lint) are the canonical ontology. Open-knowledge's reference skills should use these exact names.

**Key Findings:**
- **The field is converging on markdown+MCP+git+thin-harness** — but coordination strategy (CRDT vs sequential queue vs file-only) is where real design choices remain, and open-knowledge's CRDT bet is the most ambitious.
- **Paper claims should be verified against code** — the ByteRover investigation found marketing inflation (24→11 tools) and one disabled feature (AKL weights at zero). The lesson is narrower than "papers are unreliable" — ByteRover's core architecture is implemented as described — but marketing claims and optional features should be checked.
- **obsidian-mind is the strongest "you might not need this product" pressure** open-knowledge has seen. The "pure skill/convention" approach covers more ground than PROJECT.md acknowledges.
- **The ~5K file git ceiling is a real constraint** that open-knowledge should explicitly scope around.
- **Competitive positioning: open-knowledge's actual differentiators narrow to 4 concrete things** — real-time human+AI co-editing (CC1/S5), embeddable editor with presence (S9), MCP write tools with permission-based routing (S4), and the developer-grade WYSIWYG+source-toggle editor (S1/S2).

---

## Research Rubric

The rubric agreed with the user during scoping:

| # | Dimension | What it investigates | Depth | Priority |
|---|---|---|---|---|
| **D1** | **safishamsi/graphify** — code knowledge graphs | What is Graphify, how it builds code graphs, storage model, query API, what "graph of your codebase" bets on vs file-based navigation | Deep | P0 |
| **D2** | **byterover-cli** (campfirein) — persistent agent memory CLI | Architecture, memory model, storage, MCP integration | Deep | P0 |
| **D3** | **arXiv 2604.01599** — the ByteRover paper | What it claims, methods, findings, relation to D2 | Deep | P0 |
| **D4** | **deepwiki.org** (Cognition/Devin) — AI-generated repo wikis | How DeepWiki generates wikis from repos | Deep | P0 |
| **D5** | **obsidian-mind** (breferrari) — Obsidian vault template for Claude Code persistent memory | What it does, hooks, subagents, templates, what it reveals about pure-convention approaches | Deep | P0 |
| **D6** | **garrytan gist** — GBrain spec | Complete SQLite+thin-harness KB spec | Deep | P0 |
| **D7** | **stablyai/orca** — multi-agent Git worktree orchestrator | Architecture, CLI-as-a-skill distribution, worktree management | Deep | P0 |
| **D8** | **karpathy gist 442a6bf** — the canonical LLM Wiki vision | Verbatim gist contents, architecture, operations | Deep | P0 |
| **D9** | **Cross-cutting synthesis** | Common patterns, divergent bets, architectural axes | Deep | P0 |
| **D10** | **Angles, gaps, and implications for open-knowledge** | Novel angles, coverage overlap, risks, failure modes | Deep | P0 |
| **D11** | **Reference skill mapping** | obsidian-mind commands/subagents + GBrain skills + Karpathy ops → v1 skill candidates for PQ14 | Deep | P0 |

**Stance:** Conclusions-enabled. The user explicitly asked for "angles/dimensions we should consider," "what we already cover," "gaps/risks." Report includes evidence-backed implications for open-knowledge.

**Framing:** Mostly 3P (external investigation) with a bounded 1P section (D10) mapping findings to open-knowledge — explicitly requested by the user ("how our system/project we've been scoping out relates to the following").

**Method notes:**
- **OSS sources (D1, D2, D5, D7):** Cloned to `~/.claude/oss-repos/prior-art-open-knowledge/`. Deep source investigation by Explore subagents (one per repo, parallel). Findings grounded in specific file:line citations.
- **Paper (D3):** Full PDF (19 pages) read directly, including tables, figures, appendices, and references.
- **Gists (D6, D8):** Raw content fetched via curl, verbatim extraction.
- **DeepWiki (D4):** Web research + direct fetch of deepwiki.com and docs.devin.ai. No source code to investigate (closed).

**Non-goals (respected):**
- Did NOT re-investigate Obsidian, Notion, Confluence, Mintlify, AFFiNE — covered in `/reports/openknowledge-competitive-landscape/`
- Did NOT re-do general Karpathy workflow analysis — covered in 3 prior reports (obsidian, fumadocs, mintlify flavors)
- Did NOT re-do RAG vs agentic retrieval — covered in `/reports/agent-knowledge-retrieval-paradigms-2025-2026/`
- Did NOT do broad "agent memory" landscape beyond what's relevant to D2/D3

---

## Detailed Findings

### D1: Graphify — Claude Code skill for building code knowledge graphs

**Finding:** Graphify (safishamsi, 3.4K stars) is the most mature example in the prior art of a **Claude Code skill packaged as a pip package with integrated MCP server**. Two-pass extraction architecture: deterministic tree-sitter AST pass (no LLM) runs in parallel with Claude subagent semantic pass over docs/papers/images. Produces NetworkX graph with Leiden clustering, exports HTML + JSON + GRAPH_REPORT.md + optional Obsidian vault. MCP server exposes 7 read-only graph navigation tools; writes happen via CLI/skill.

**Evidence:** [evidence/d1-graphify.md](evidence/d1-graphify.md)

**Implications for open-knowledge:**

- **Architectural validation of PQ13 Option D + PQ14:** The thin Python library (5,941 LOC across 16 modules) + fat 1,214-line SKILL.md is the clearest in-the-wild example of what open-knowledge's reference skills should look like. The library is stateless; the skill does orchestration. Open-knowledge should follow the same pattern.

- **Edge confidence typing is a first-class schema open-knowledge should consider for S10.** EXTRACTED (confidence 1.0, author-stated edges) vs INFERRED (0.6-0.9, reasoned connections) vs AMBIGUOUS (≤0.4, uncertain). For open-knowledge's `suggest_links` tool (S10), this gives a clean provenance model: author-typed wiki-links are EXTRACTED, skill-suggested links are INFERRED, co-occurrence-based suggestions are AMBIGUOUS.

- **PreToolUse hook injection is a novel pattern to adopt.** Graphify's `hook install` command writes to Claude Code `settings.json`, injecting "graph exists, read GRAPH_REPORT.md first" before every Glob/Grep. This steers the agent toward index-first navigation automatically. Open-knowledge could ship `npx openknowledge hook install` to inject a similar nudge before file searches.

**Decision triggers (when this matters):**
- If open-knowledge adopts the PreToolUse hook pattern, it's a **2-line settings.json change** that dramatically improves agent behavior for free. Low cost, high value.
- If open-knowledge adds edge confidence typing to S10, it requires a **frontmatter schema change** — not breaking but worth getting right before v1.

### D2: ByteRover CLI — agent memory CLI (the implementation of D3)

**Finding:** ByteRover CLI (campfirein, 4.3K stars, Elastic License 2.0) is the TypeScript implementation of the ByteRover paper. Three clients (TUI, CLI, MCP) connect via Socket.IO to a daemon with per-project agent pool. **MCP exposes exactly 2 tools — `brv-query` and `brv-curate` — fire-and-forget curation.** Internal agent loop has 11 tools (not 24 as marketing claims). Context Tree uses `domain/topic/[subtopic]/title.md` filesystem hierarchy with `context.md` at each level. Sequential per-project FIFO task queue (NOT CRDT). Uses MiniSearch BM25 with field boosting (title 3x, path 1.5x).

**Key finding:** ByteRover's paper architecture is largely implemented as described — 5-tier retrieval, atomic writes, Context Tree, bidirectional index all verified in code. **One real divergence:** AKL compound-score weights are all 0 (importance, recency, tier_boost disabled) — ranking is pure BM25. Also: README claims "24 built-in agent tools" but the actual registry has 11 (marketing inflation).

**Evidence:** [evidence/d2-byterover-cli.md](evidence/d2-byterover-cli.md)

**Implications for open-knowledge:**

- **The 2-tool MCP surface (`brv-query` + `brv-curate`) is the most aggressive "few tools" design in the prior art.** Open-knowledge's S4 plans 10 tools. This is a valid data point for XQ1 — very small MCP surfaces work, and the agent composes the rest. But ByteRover's approach offloads all the "how to format the write" logic into the LLM-curated pipeline — open-knowledge's 10-tool approach keeps that explicit. Both are defensible.

- **The sequential FIFO task queue is the clearest alternative-to-CRDT pattern in the prior art.** It works for agent-only writes; doesn't support real-time human co-editing. Open-knowledge's CRDT choice (CC1) is justified by the human+AI co-editing requirement — ByteRover validates that for agent-only cases, a simpler sequential queue is sufficient.

- **Paper-vs-code discrepancies are a serious lesson.** When adopting architectural patterns from published papers, clone the repo and verify the implementation. ByteRover's AKL is disabled in production; cite it as "architecture described, not validated" if open-knowledge adopts similar lifecycle metadata.

**Decision triggers (when this matters):**
- If open-knowledge ever benchmarks its S10 backlink + Orama search against memory benchmarks (LoCoMo, LongMemEval), use ByteRover's evaluation harness pattern (Gemini 3 Flash judge, LLM-as-a-Judge metric) for consistency.
- If open-knowledge considers lifecycle metadata (importance/maturity/recency) as a frontmatter convention, **don't treat it as load-bearing for retrieval** — ByteRover's SOTA results were achieved without it.

### D3: ByteRover paper (arxiv:2604.01599) — the academic theory

**Finding:** The paper proposes "agent-native memory" where the same LLM that reasons about a task curates and retrieves knowledge — inverting the traditional external-memory-service pattern. Key contributions: **Context Tree** (Domain > Topic > Subtopic > Entry markdown hierarchy with explicit @path relations), **Adaptive Knowledge Lifecycle (AKL)** with importance/maturity/recency, **5-tier progressive retrieval** (cache → fuzzy cache → MiniSearch → LLM+pre-fetch → agentic loop). Achieves SOTA on LoCoMo (96.1% overall, beating Honcho by 6.2 points) and competitive on LongMemEval-S (92.8%) while "requiring zero external infrastructure — no vector database, no graph database, no embedding service, with all knowledge stored as human-readable markdown files on the local filesystem."

**Three failure modes the paper critiques in external-memory systems:**
1. **Semantic drift** — agent's understanding diverges from what the pipeline captured
2. **Lost coordination context** — agents share data but not the *why* behind it
3. **Recovery fragility** — mid-task crash requires querying a service to reconstruct state

**Evidence:** [evidence/d3-byterover-paper.md](evidence/d3-byterover-paper.md)

**Implications for open-knowledge:**

- **The critique of external-memory systems is also an argument FOR open-knowledge's design.** Open-knowledge stores knowledge as files the agent directly reads/writes via MCP — same pattern as ByteRover. All three failure modes are addressed:
  - Semantic drift: minimal (no re-chunking / re-embedding pipeline between agent and storage)
  - Lost coordination context: preservable via frontmatter conventions (provenance fields, author tags)
  - Recovery fragility: git + CRDT persistence gives exact state reconstruction

- **Open-knowledge's wiki-link bidirectional index (S10) matches ByteRover's "bidirectional reference index with O(1) lookup" exactly.** This is the strongest architectural validation of S10 in the prior art.

- **The symbol tree injection into agent's system prompt pattern** (up to 200 entries or "use the search tool") is what open-knowledge does via `.openknowledge/index.md` and MCP's `instructions` field. Same pattern, different surface.

- **AKL (importance/maturity/recency) as a frontmatter convention is interesting but empirically unvalidated.** ByteRover ships it but disables it. Open-knowledge could consider:
  - **`maturity: draft | validated | core`** — a coarse lifecycle signal the UI can display and skills can filter on. Low cost.
  - **`importance: N` (0-100)** — agent-maintained ranking signal. Subjective, fragile, probably not worth.
  - **Access/update counters** — can be tracked in git log; don't need to be in frontmatter.
  
  Net recommendation: adopt `maturity` as a convention, skip `importance`/`recency` decay until empirical evidence they help.

- **The paper's actual-load-bearing findings:**
  1. **MiniSearch BM25 with title/path field boosting** — open-knowledge's Orama with similar boosting is equivalent
  2. **Context Tree hierarchy** — open-knowledge's folder structure + frontmatter is roughly equivalent; question is whether a canonical 4-level hierarchy (Domain > Topic > Subtopic > Entry) helps vs flat-folder + tags
  3. **LLM-curated entries** — open-knowledge's reference compile skill would produce these
  4. **Bidirectional reference index** — open-knowledge's S10 is the same
  5. **Symbol tree prompt injection** — open-knowledge's instructions field + AGENTS.md pattern

- **Don't cite ByteRover's paper as a product competitor in open-knowledge positioning.** It's a memory system for agents; open-knowledge is a knowledge platform for humans + agents. Different problem. DO cite it as architectural validation for the file-based + bidirectional-index + no-external-infrastructure approach.

**Decision triggers (when this matters):**
- If open-knowledge considers adopting a canonical folder hierarchy (Domain > Topic > Subtopic > Entry), ByteRover validates the approach at scale — but PROJECT.md rabbit hole #4 argues against top-down structure. The tension remains unresolved.
- If open-knowledge ships `maturity: draft|validated|core` as a frontmatter convention, reference ByteRover as the source. Don't ship importance/recency scoring without evidence.

### D4: DeepWiki (Cognition / Devin) — AI-generated repo wikis

**Finding:** DeepWiki (launched April 2025 by Cognition, powered by Devin) auto-generates wiki-style documentation from GitHub repos. Re-indexes every couple of hours. Replace "github.com" with "deepwiki.com" in URL to access. Output: hierarchical wiki with Mermaid diagrams, source citations with line ranges, cross-references, "Relevant source files" collapsible blocks per page. Free for public repos; full experience gated in the Devin app. Has a read-only MCP server for public repos. No engineering blog post explains architecture; limited technical disclosure.

**Evidence:** [evidence/d4-deepwiki.md](evidence/d4-deepwiki.md)

**Implications for open-knowledge:**

- **DeepWiki is NOT a direct competitor to open-knowledge** — it's read-only, code-only, no human editing. But its output is what a "compiled" open-knowledge KB looks like: hierarchical wiki with Mermaid diagrams, inline source citations, cross-references.

- **DeepWiki's page format is a reference for open-knowledge's compile skill output** — especially:
  - "Relevant source files" collapsible block (provenance)
  - Inline source citations with line ranges `[file.ts:25-74]()`
  - Mermaid architecture diagrams
  - Cross-reference links

- **The URL substitution distribution trick** (github.com → deepwiki.com) is a clever pattern worth stealing for open-knowledge's publishing engine (S-L2). If your KB lives in `github.com/you/kb`, then `openknowledge.io/you/kb` could render it as a public wiki. Zero-config publishing tied to existing identity.

- **"Refresh this wiki" has a 6-day cooldown** — signals that LLM-curated wiki generation has real cost. Relevant commercial pricing signal for open-knowledge's Later SaaS tier.

**Decision triggers (when this matters):**
- If open-knowledge ships a compile/publish reference skill, use DeepWiki's output as the visual target for rendered pages.
- If open-knowledge builds the publishing engine (S-L2), consider the URL-substitution distribution pattern as the minimum-friction entry.

### D5: obsidian-mind — Pure skill/convention Obsidian template for Claude Code

**Finding:** obsidian-mind (breferrari, 1.3K stars) is an Obsidian vault template with **zero application code**. It achieves persistent agent memory, structured knowledge workflows, and performance-review evidence accumulation through pure composition of existing primitives: CLAUDE.md (339-line operating manual) + 15 slash commands + 9 specialized subagents + 5 lifecycle hooks + vault-manifest.json + note templates + folder scaffolding. Uses Obsidian's backlinks as the emergent "evidence database" — competency notes accumulate evidence automatically via wiki-links from work notes. Uses QMD (Tobi Lutke's local search engine) for hybrid BM25+vector+LLM rerank semantic search.

**Evidence:** [evidence/d5-obsidian-mind.md](evidence/d5-obsidian-mind.md)

**Implications for open-knowledge:**

- **This is the strongest "you might not need this product" pressure open-knowledge has seen.** obsidian-mind delivers a lot of open-knowledge's value proposition (persistent agent memory, agent-curated knowledge, convention enforcement, reference-skills-as-markdown) through pure composition of existing primitives. 1.3K stars validates there's real demand.

- **Open-knowledge's marginal value must be concretely about:**
  1. **Real-time human+AI co-editing with presence (CC1, S5)** — obsidian-mind cannot do this
  2. **Embeddable editor inside agent environments (S9)** — obsidian-mind depends on Obsidian as the UI
  3. **MCP write tools with permission-based routing (S4, PQ9)** — obsidian-mind writes via bash scripts, no permission model
  4. **Developer-grade WYSIWYG+source-toggle editor (S1, S2, TQ3)** — obsidian-mind relies on Obsidian's editor

- **Strong patterns to adopt from obsidian-mind:**
  1. **CLAUDE.md/AGENTS.md operating manual pattern** — open-knowledge's `npx init` should scaffold a comprehensive AGENTS.md with sections covering vault structure, linking conventions, tag conventions, MCP tools reference, session workflow, agent guidelines, rules.
  2. **PostToolUse hook for write-time validation** — open-knowledge can ship a hook script in `npx init` that validates frontmatter + wikilinks after every Write/Edit, injecting warnings as additional context.
  3. **Classification hook on UserPromptSubmit** — multilingual pattern detection to route user messages to appropriate skills (e.g., "decided" → create Decision Record). CJK-safe regex patterns.
  4. **Subagent composition pattern** — reference skills should use 3-4 focused subagents per skill, each solving one problem, coordinated by the skill's prompt.
  5. **vault-manifest.json for declarative schema** — open-knowledge could ship `.openknowledge/manifest.json` declaring frontmatter schema per content type, version fingerprints for migration, folder conventions. Enables automatic validation and safe upgrades.

- **Reference skills to add to open-knowledge's PQ14 list** based on obsidian-mind:
  - `/humanize` — voice-calibrated editing (load user's writing samples, extract voice fingerprint, rewrite Claude-drafted content to match)
  - `/vault-upgrade`-style import for migrating arbitrary Obsidian vaults with multi-tier classification heuristics
  - `/weekly` — cross-session synthesis pattern (different from daily standup)

- **"A note without links is a bug"** — steal this phrasing. It converts the linking convention from a suggestion into a hygiene rule.

**Decision triggers (when this matters):**
- **If open-knowledge ships a reference AGENTS.md template, copy obsidian-mind's CLAUDE.md structure directly.** It's the best in-the-wild template.
- **If open-knowledge ships a PostToolUse hook, the validate-write.py pattern is the right implementation.** Bash fallback, graceful failure, injects warnings as additional context.
- **If open-knowledge positions against obsidian-mind, be explicit and honest**: "for real-time human+AI co-editing with presence, and for embeddability inside agent environments, obsidian-mind's pure-convention approach doesn't work — you need a substrate. That's what open-knowledge is."

### D6: Garry Tan's GBrain spec — SQLite-backed personal knowledge brain

**Finding:** GBrain (garrytan gist, dated 2026-04-05, spec complete, repo github.com/garrytan/gbrain) is a build spec for an SQLite-backed personal knowledge brain built by Garry Tan (YC president). Bun runtime. Single SQLite file with FTS5 + vector embeddings in one database (~500MB for 7,471 pages). "Thin CLI harness, fat skills" architecture: ~500 lines of TypeScript dispatching commands; 5 fat markdown SKILL.md files (ingest, query, maintain, enrich, briefing) containing all workflows and heuristics. MCP server from day one exposing 14 tools. "Compiled truth + timeline" architecture per page: above-the-line is always-current (rewritten), below-the-line is append-only (evidence). Motivation: Git doesn't scale past ~5K files; Garry's current brain has 7,471 markdown files (2.3GB) and is choking.

**Evidence:** [evidence/d6-garrytan-gbrain.md](evidence/d6-garrytan-gbrain.md)

**Implications for open-knowledge:**

- **Git's ~5K file scaling ceiling is a hard constraint that open-knowledge's PROJECT.md does not currently address.** Garry's data point (7,471 files → git choking) is directly comparable to what a power-user open-knowledge KB looks like in 2-3 years. Open-knowledge should:
  1. Set an explicit P0 scale target (e.g., "up to 5,000 articles per KB")
  2. Plan a migration/sharding story for KBs that grow beyond
  3. Document the limit in day-0 docs so users don't try to put 10K articles in a single git-backed KB

- **"Compiled truth + timeline" is the strongest "steal this" pattern in the entire report.** Structure each entry as:
  ```
  # Title
  [Compiled truth — always current, rewritten as new info arrives]
  
  ---
  
  ## Timeline
  - **2026-04-01** | Meeting — decided X
  - **2026-03-28** | PR #847 — introduced middleware
  ```
  This is a convention, not a feature. Open-knowledge's reference compile skill should author entries in this format. Solves the provenance-vs-summary tension that currently has no convention in PROJECT.md.

- **Garry's 5 reference skills (ingest, query, maintain, enrich, briefing) are a stronger template than PROJECT.md's list.** The `briefing` skill in particular is interesting — compile a new page from current KB state (calendar + active work + open threads + recent changes + stale alerts). This is the "queries become new wiki pages" feedback loop Karpathy describes, operationalized. Open-knowledge should ship `briefing` as a reference skill.

- **GBrain's architectural bet is the OPPOSITE of open-knowledge on canonical storage.** Open-knowledge: markdown files canonical, indexes derived. GBrain: SQLite canonical, markdown is export-only. The tradeoff is clear:
  | Dimension | Open-knowledge | GBrain |
  |---|---|---|
  | Git-friendly | ✅ Native | ❌ Single .db file |
  | Multi-user/collab | ⚠ Via CRDT | ❌ "one writer, many readers" |
  | Scale ceiling | ~5K files | 100K+ rows |
  | Structured queries | ❌ Orama only | ✅ SQL |
  | Human editing | ✅ Any editor | ⚠ Export → edit → import |
  **The two approaches concede different things.** GBrain concedes multi-user; open-knowledge concedes scale.

- **Open-knowledge's "markdown canonical" bet is explicitly contradicted by a knowledgeable practitioner building for scale.** This is a risk to acknowledge and plan for. The mitigation: stay under 5K files per KB; encourage multiple KBs (multi-brain support); treat large-scale as Later.

- **MCP tools: GBrain's 14 tools with `brain_` prefix (brain_search, brain_query, brain_get, brain_put, brain_ingest, brain_link, brain_timeline, etc.) is similar in size to open-knowledge's planned 10.** Both are much larger than ByteRover's 2. The design choice seems to be: when you want the MCP surface to be legible and composable, ~10-14 tools is the sweet spot.

- **GBrain exists because Garry Tan experienced the exact pain point open-knowledge targets.** "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping" (Karpathy's framing, quoted in D8). Garry built GBrain to solve this for himself. **This is validation that the market is real at the top of the developer ecosystem.**

**Decision triggers (when this matters):**
- **Before v1 release:** scope open-knowledge explicitly to "up to 5,000 articles per KB" in user-facing docs. Name the limit. Plan multi-brain support for users beyond that.
- **For the compile reference skill:** author in "compiled truth + timeline" format. Use this exact phrasing in the skill's SKILL.md.
- **For the query reference skill:** include the `briefing` pattern — compile a new summary page from current KB state — as a core use case.

### D7: Stably Orca — cross-platform AI agent orchestrator

**Finding:** Orca (stablyai, 495 stars, MIT, 88 releases) is an Electron desktop app for orchestrating multi-agent development workflows. Manages git worktrees, terminals, and RPC bridges between a desktop UI and CLI skills. Does NOT spawn agents — agents (Claude Code, Codex, OpenCode) are external processes that control Orca via CLI. Three surfaces: Electron renderer (React UI), OrcaRuntimeRpcServer (Unix socket / Named pipe + JSON-RPC + token auth), `/skills/orca-cli/` (installable Claude Code skill via `npx skills add`). Wraps `git worktree` commands with explicit lifecycle. Uses Monaco for code editing, Tiptap for markdown. GitHub integration delegated to `gh` CLI.

**Evidence:** [evidence/d7-stablyai-orca.md](evidence/d7-stablyai-orca.md)

**Implications for open-knowledge:**

- **Orca's CLI-as-a-skill distribution pattern is the right model for open-knowledge's CLI.** Users run:
  ```bash
  npx skills add https://github.com/openknowledge/openknowledge --skill openknowledge-cli
  ```
  and the CLI becomes available in every Claude Code session. Zero manual configuration. Much simpler than the typical "install package + configure MCP + restart agent" dance.

- **The RPC server pattern (Unix socket + JSON-RPC + token auth + metadata file) is the right solution for multi-client coordination.** Open-knowledge needs this when the user has the editor open AND runs `openknowledge` CLI in a terminal AND has Claude Code connected via MCP. All three need to share state. Orca's metadata-file approach (published at `~/.orca/runtime-metadata.json`) is cross-platform and auto-spawning.

- **Worktree management (`git worktree add/list/remove`) wrapped with production-ready patterns:**
  - CRLF handling for Windows
  - Atomic prune after remove
  - Branch deletion guarded against "checked out elsewhere"
  - Force flag for stuck worktrees
  
  Open-knowledge's TQ22 needs all of this. Copy Orca's `src/main/git/worktree.ts` as the reference implementation.

- **Agent-writable draft status comment pattern is the most brilliant small pattern in the prior art.** `orca worktree set --comment "reproduced bug; waiting on review"` — agent updates a status field, user sees it in the sidebar. High-bandwidth signal about "what's the agent doing right now" without parsing logs. **Open-knowledge should add a `set_draft_status(comment: string)` MCP tool for this exact use case.** The editor's draft sidebar shows the comment prominently.

- **Delegate external APIs to existing CLIs (`gh`, and analogously Slack-CLI, Notion-CLI).** Open-knowledge's reference skills should NOT own auth flows for external services. Shell out to user-installed tools.

- **Orca validates TipTap as a production choice for Electron desktop apps.** Open-knowledge's TQ4 (TipTap + y-prosemirror) is the right editor; Orca is independent evidence.

- **Persistence pattern for non-CRDT state:** single JSON file (`~/.orca/orca-data.json`) + 300ms debounce + atomic rename + lazy merge on load. Open-knowledge's non-document state (recent KBs, preferences, MCP config) should follow this pattern.

**Decision triggers (when this matters):**
- **For CC5 (zero-friction onboarding):** ship BOTH `npx openknowledge init` (local project) AND `npx skills add .../openknowledge --skill openknowledge-cli` (global CLI). Let users adopt either path.
- **For S4 (MCP tools):** add `set_draft_status(comment)` as the "what am I working on?" affordance.
- **For TQ22 (worktree management):** fork Orca's git worktree wrapper rather than writing from scratch.

### D8: Karpathy's LLM Wiki gist — the canonical vision

**Finding:** Karpathy's gist (442a6bf) is the canonical articulation of the "LLM-maintained persistent wiki" pattern open-knowledge traces to. Explicitly positioned as "an idea file... designed to be copy pasted to your own LLM Agent" — no reference implementation from Karpathy himself. Three-layer architecture: **Raw sources** (immutable, LLM reads only) / **The wiki** (LLM-generated markdown files) / **The schema** (CLAUDE.md or AGENTS.md convention file). Three operations: **Ingest** (process source → update 10-15 wiki pages + index + log), **Query** (search wiki, synthesize answer, optionally file results back as new pages), **Lint** (health-check for contradictions, stale claims, orphan pages, missing cross-references). Two special navigation files: `index.md` (content-oriented catalog, updated on every ingest) and `log.md` (chronological append-only record with parseable prefixes). Quoted key insight: **"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."**

**Evidence:** [evidence/d8-karpathy-gist.md](evidence/d8-karpathy-gist.md)

**Implications for open-knowledge:**

- **PROJECT.md already traces to this vision.** Line 4: "Traces to: Karpathy LLM Knowledge Bases vision + OpenDesign architectural precedent." The gist is the canonical reference.

- **Open-knowledge's explicit stance is: be the IDE in the "Obsidian is the IDE; LLM is the programmer; wiki is the codebase" triple.** The product replaces Obsidian in Karpathy's setup with a better editor + real-time presence + CRDT co-editing + embeddable surface. Use this exact framing in positioning.

- **Three-layer architecture (raw / wiki / schema) is a CONVENTION open-knowledge should make explicit:**
  ```
  raw/        — ingested sources, agent is READER
  articles/   — the compiled wiki, agent is EDITOR or PROPOSER
  AGENTS.md   — the schema, user-owned convention file
  ```
  This maps cleanly to PQ7 (project structure as permission boundaries) — the three layers have different permission models.

- **Three operations (Ingest / Query / Lint) are the canonical reference skill names.** Open-knowledge's PQ14 list should use these exact names for maximum recognition by users who've read the Karpathy gist:
  - `ingest` (not "compile") — the Karpathy canonical name
  - `query` (not "Q&A") — the Karpathy canonical name  
  - `lint` — already aligned
  - Add `briefing` from GBrain for the "query results become new wiki pages" pattern

- **`log.md` with parseable prefix is a simple convention with high value.** Not in open-knowledge's current spec. Add via reference skill:
  ```
  ## [2026-04-07] ingest | Article Title
  ## [2026-04-07] query | What does auth do?
  ## [2026-04-07] lint | Found 3 orphan pages
  ```
  Allows `grep "^## \[" log.md | tail -5` for last 5 entries. Pure convention, zero code. Reference skills should maintain a `log.md` in project root.

- **"At moderate scale (~100 sources, ~hundreds of pages), the index file is enough — no embedding-based RAG infrastructure needed."** This is Karpathy's direct claim that S8 (semantic search) is premature optimization for the day-0 scale. **This resolves the S8 phasing debate in PROJECT.md** — index.md + regex/Orama BM25 is sufficient for the walking skeleton; semantic search is Next, not Now, unless user research says otherwise.

- **"Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored."** Use this framing in open-knowledge positioning. It's the clearest articulation of the product's reason-to-exist.

- **"The wiki is just a git repo of markdown files"** — direct Karpathy validation of open-knowledge's canonical storage bet. Counterpoint to GBrain's SQLite bet (D6). At moderate scale, Karpathy's framing holds; at 5K+ files, GBrain's critique applies.

- **Karpathy's "good answers can be filed back into the wiki as new pages"** is the compounding loop. Reference query skill must encourage this — not just return answers but offer to save them as new wiki pages.

**Decision triggers (when this matters):**
- **For reference skill naming:** use `ingest`, `query`, `lint`, `briefing`. Match the canonical terminology.
- **For S8 (semantic search) phasing:** decide Now vs Next. Karpathy's evidence supports Next. Only move to Now if user research from a real user study shows keyword search is insufficient.
- **For positioning:** steal "the tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping" as a headline.

---

## D9: Cross-Cutting Synthesis

### Convergent architectural bets (5 of 8 sources align)

**1. Markdown files on the local filesystem as the canonical substrate.**
| Source | Aligned? |
|---|---|
| Graphify | ✅ (outputs Obsidian vaults + JSON) |
| ByteRover CLI | ✅ (Context Tree is markdown files) |
| ByteRover paper | ✅ ("zero external infrastructure... markdown files on local filesystem") |
| DeepWiki | ✅ (generated from code → wiki pages) |
| obsidian-mind | ✅ (Obsidian vault) |
| GBrain | ⚠ Partial (SQLite canonical; markdown is round-trip) |
| Orca | ⚠ Partial (operates on git repos; not a KB itself) |
| Karpathy gist | ✅ ("a directory of LLM-generated markdown files") |

GBrain is the clearest divergence — it bets SQLite is better at scale. Orca is orthogonal (not a KB). The other 6 all converge on "markdown on filesystem" as the canonical form.

**2. MCP server as the agent integration surface.**
All 8 sources ship or reference MCP. DeepWiki has one for public repos. ByteRover CLI ships 2 MCP tools. GBrain's spec includes MCP from day one. Graphify has a stdio MCP server. Orca has both MCP and its own RPC server. obsidian-mind uses Obsidian CLI + QMD (which has MCP). Karpathy's gist references MCP. **MCP is table stakes.** Open-knowledge's bet is on **bidirectional write-capable MCP with permission-based routing** — that's the differentiator, not MCP itself.

**3. Thin CLI/library + fat markdown skills as the reference-skill architecture.**
| Source | Pattern |
|---|---|
| Graphify | Python library (5,941 LOC) + 1,214-line skill.md |
| ByteRover CLI | TypeScript daemon + 11 built-in agent tools + external MCP agents |
| GBrain | ~500-line TypeScript CLI + 5 fat SKILL.md files |
| obsidian-mind | Zero code + 15 slash commands + 9 subagents + hooks |
| Karpathy gist | "LLM does all the grunt work" + CLAUDE.md as schema |
| open-knowledge | TQ4+S4 substrate + PQ14 reference skills |

**Four independent projects converge on "thin code + fat markdown" for the reference skill layer.** obsidian-mind is the extreme — zero code. This is the strongest architectural convergence in the report and validates open-knowledge's PQ13 Option D decisively.

**4. Bidirectional wiki-link index as the knowledge structure.**
| Source | Aligned? |
|---|---|
| Graphify | ✅ (NetworkX graph with bidirectional traversal) |
| ByteRover paper | ✅ ("bidirectional reference index with O(1) lookup") |
| ByteRover CLI | ✅ (forward + backward links) |
| DeepWiki | ✅ (cross-references between pages) |
| obsidian-mind | ✅ (Obsidian backlinks as evidence accumulator) |
| GBrain | ✅ (`links` table with from/to) |
| Karpathy gist | ✅ (wiki cross-references) |
| open-knowledge S10 | ✅ (dual adjacency list) |

**All 8 sources converge on "bidirectional links as the knowledge structure."** This is not controversial; it's the universal bet. Open-knowledge's S10 architecture is validated by unanimous prior art.

**5. Hierarchical folder structure reflecting semantic hierarchy.**
| Source | Pattern |
|---|---|
| ByteRover | Domain/Topic/Subtopic/Entry enforced |
| GBrain | type-prefixed slugs (people/pedro-franceschi) |
| obsidian-mind | Purpose-based folders (work/, org/, perf/, brain/) |
| Karpathy gist | Deferred to user/domain |
| DeepWiki | By subsystem (derived from code) |
| Graphify | Communities via Leiden |
| open-knowledge | PQ7 parked (permission boundaries) |

**Hierarchical organization is near-universal**, but WHO authors the hierarchy varies: ByteRover says agents discover it, GBrain/obsidian-mind say users define it, open-knowledge is undecided. Karpathy deliberately doesn't prescribe. There is no consensus on this dimension.

### Divergent design bets (where the prior art splits)

**1. Canonical storage format — files vs SQLite.**
- **Files canonical:** Graphify, ByteRover, obsidian-mind, Karpathy gist, open-knowledge
- **SQLite canonical:** GBrain
- **Code canonical:** DeepWiki (wiki is derived)

GBrain's bet is explicit and tied to scale (~5K file git ceiling). For 100-1000 files, files are fine. For 5K+, SQLite wins. **Open-knowledge's position is structurally sound at its P0 scale but needs an explicit ceiling.**

**2. Coordination model — CRDT vs sequential queue vs file-level atomicity.**
- **CRDT:** open-knowledge (CC1, Yjs+Hocuspocus)
- **Sequential queue:** ByteRover (per-project FIFO)
- **File-level direct writes:** Graphify, obsidian-mind, GBrain, Karpathy gist
- **IPC/RPC:** Orca (no KB but similar coordination for multi-client)

**This is open-knowledge's most ambitious bet.** CRDT enables real-time human+AI co-editing (S5 presence), which no other source in the prior art supports. ByteRover's sequential queue handles agent-only writes. The file-level approach works for single-writer cases. Open-knowledge's choice is the most complex but the most differentiated.

**3. MCP surface size — 2 tools vs 10 vs 14.**
- **2 tools:** ByteRover (`brv-query`, `brv-curate`)
- **7 tools (read-only):** Graphify
- **10 tools:** open-knowledge (planned)
- **14 tools:** GBrain

**Small MCP surfaces (2 tools) require more work from the LLM to format the input.** Medium surfaces (10-14) give the agent explicit affordances. Open-knowledge's 10 is in the middle — defensible. The ByteRover 2-tool approach depends on natural-language curation requests that the server's pipeline structures into the Context Tree — a higher-abstraction interface.

**4. Who writes the wiki — AI-primary vs human-primary vs co-authored.**
- **AI-primary:** Karpathy gist ("you never (or rarely) write the wiki yourself"), GBrain ("written by AI agents, not human editors"), ByteRover (curate operations from agent), DeepWiki (fully auto-generated), Graphify (fully auto-generated)
- **Human-primary with AI assist:** obsidian-mind ("brain is your operational knowledge; AI helps maintain")
- **Co-authored with presence:** open-knowledge (explicit P0)

**Only open-knowledge treats real-time human+AI co-editing as the P0 differentiator.** This is the clearest unique positioning in the set.

**5. Editor — Obsidian dependency vs standalone.**
- **Obsidian-native:** obsidian-mind, Graphify (optional export)
- **Obsidian-compatible:** Karpathy gist (used alongside Obsidian)
- **No editor:** ByteRover, ByteRover paper, GBrain, DeepWiki
- **Standalone editor:** open-knowledge (custom TipTap)

**Open-knowledge is the only source that ships its own editor.** This is tied to the human-primary/co-author bet. If the editor is the product, it has to be Obsidian-grade.

### Four architectural axes to position on

The prior art suggests four orthogonal axes open-knowledge should position on explicitly:

**Axis 1: Storage canonicity (Files ↔ Database)**
- Open-knowledge is firmly on the Files end. GBrain is the near counter-example (SQLite).
- **Position:** "markdown files in git, canonical and portable" — this is already PROJECT.md's position.

**Axis 2: Coordination (File-level → Sequential → CRDT)**
- Open-knowledge is firmly on CRDT end. ByteRover is sequential. Graphify/obsidian-mind are file-level.
- **Position:** "real-time human+AI co-editing with CRDT" — the differentiator.

**Axis 3: Authorship (AI-only → Co-authored → Human-only)**
- Open-knowledge is firmly Co-authored. ByteRover is AI-only. obsidian-mind is Co-authored with human-primary bias.
- **Position:** "first platform designed for agents as co-creators, not consumers or authors."

**Axis 4: MCP surface abstraction (Primitive → Semantic → Domain)**
- Open-knowledge is Semantic/Filesystem-compatible (read_file, write_file + 5 knowledge-specific). ByteRover is Domain (curate, query). Graphify is Primitive (graph navigation).
- **Position:** "filesystem-compatible MCP + knowledge-specific tools for the semantic layer" — already XQ1.

### Paper vs implementation — a narrow but real methodology lesson

**Deep code investigation of ByteRover found the paper's architecture is largely implemented as described.** The 5-tier progressive retrieval IS in `query-executor.ts`. Atomic writes ARE in `DirectoryManager.writeFileAtomic()`. The Context Tree hierarchy, bidirectional reference index, MiniSearch BM25, symbol tree, and curate operations all match the paper.

**Where it diverges:** (1) AKL compound-score weights are all zero — the infrastructure exists but ranking is pure BM25, making AKL effectively disabled. (2) The README claims "24 built-in agent tools" but the actual tool registry has 11 — marketing inflation, not a paper claim. These are meaningful findings but narrower than a blanket "papers are unreliable" lesson.

**Methodology implication:** For OSS projects, clone the repo and verify — not because papers are systematically wrong, but because marketing copy inflates and optional features may be disabled in production. The ByteRover paper was largely accurate; the README/marketing was not. Different trust levels for different sources.

### Three independent confirmations of the Karpathy vision

Karpathy's gist is the canonical vision. Three independent systems have since instantiated variations:

1. **ByteRover (academic research + production)** — Context Tree, LLM-curated, SOTA benchmarks
2. **GBrain (spec by Garry Tan)** — SQLite-backed but same thin-harness + fat-skills + compile-truth pattern
3. **obsidian-mind (pure convention)** — zero-code Obsidian template achieving the same workflow

**This is a validation chain:** Karpathy describes → multiple parties independently implement → all succeed. The pattern is real and productive. Open-knowledge is another implementation, distinguished by the editor substrate + CRDT + co-editing focus.

---

## D10: Angles, Gaps, and Implications for Open-Knowledge

**(1P analysis — explicitly requested by the user during scoping. Clearly separated from the 3P findings above.)**

### What open-knowledge ALREADY COVERS (strengths confirmed by prior art)

1. **Markdown + git substrate** — validated by 6 of 8 sources. Karpathy's "just a git repo of markdown files" is directly aligned.
2. **Bidirectional wiki-link index (S10)** — unanimous convergence. ByteRover's bidirectional reference index with O(1) lookup is the same architecture.
3. **Reference skills as thin-harness + fat-skills** (PQ13 Option D, PQ14) — 4 independent convergent implementations. Decisively validated.
4. **MCP server as the agent integration surface** — table stakes; all 8 sources ship or reference MCP.
5. **Orama BM25 + optional embeddings for search (S8)** — Karpathy recommends hybrid BM25+vector+LLM rerank at scale; obsidian-mind uses QMD for the same pipeline. Open-knowledge's S8 is aligned.
6. **index.md per folder from frontmatter + structure (CC6)** — Karpathy's exact pattern.
7. **TipTap + y-prosemirror editor (TQ4)** — validated by Orca's independent choice for markdown editing.
8. **Zero-LLM-inference in OSS core** — validated by ByteRover (memory is agent-curated; no embedding pipeline), Karpathy (LLM is external), GBrain (thin harness).
9. **Agent-agnostic substrate principle** — validated by Orca (no agent spawning, just orchestration).

### What open-knowledge DOES NOT currently address (gaps surfaced by prior art)

**1. Git's ~5,000-file scaling ceiling (from GBrain)**
- **Risk:** Open-knowledge claims 100-1000 articles as P0 scale but doesn't acknowledge the ceiling. Power users will hit it in 2-3 years.
- **Recommendation:** Name the limit. Plan for multi-brain support (separate git repos) as the scaling strategy. Defer sharding/SQLite backing to Later or explicit post-P0.
- **Priority:** Before v1 user-facing docs.

**2. "Compiled truth + timeline" as a content convention (from GBrain)**
- **Risk:** Open-knowledge has no convention for separating always-current summary from append-only evidence. Reference skills will either overwrite history or grow files unboundedly.
- **Recommendation:** Adopt the compiled truth + timeline split as a reference convention. Document in the AGENTS.md template. Reference skills (compile, ingest) author in this format.
- **Priority:** Reference skill design, before v1.

**3. Edge confidence typing for wiki-links (from Graphify, ByteRover)**
- **Risk:** Open-knowledge treats wiki-links as binary (exists/doesn't). No provenance distinction between "author stated X relates to Y" vs "skill inferred X might relate to Y."
- **Recommendation:** Add a convention for typed relations in frontmatter: `related: [...]` for author-stated, `suggested_related: [...]` for skill-inferred. `suggest_links` tool (S10) produces suggestions, not wiki-links in body.
- **Priority:** Medium — can ship without it in v1, refine as a convention later.

**4. Agent-writable draft status comment (from Orca)**
- **Risk:** When an agent is working on a long-running task, the user has no high-bandwidth signal about "what is the agent doing right now?" beyond activity feeds and diffs.
- **Recommendation:** Add `set_draft_status(comment: string)` MCP tool. Editor UI shows the comment in the draft sidebar. Agent updates at meaningful checkpoints.
- **Priority:** Easy to add. Medium value. Ship with S6 (version history) or S5 (presence).

**5. PreToolUse hook for index-first navigation (from Graphify)**
- **Risk:** Open-knowledge relies on the MCP `instructions` field + AGENTS.md to steer navigation. The user may not have these wired up correctly.
- **Recommendation:** Ship a `PreToolUse` hook in `npx openknowledge init` that injects "your project has an index at .openknowledge/index.md" before Grep/Glob calls. Makes tier-aware navigation automatic.
- **Priority:** Easy addition. High value for any agent that falls back to grep.

**6. The `log.md` parseable prefix convention (from Karpathy)**
- **Risk:** Open-knowledge tracks history via git but has no lightweight agent-parseable audit trail.
- **Recommendation:** Reference skills (ingest, query, lint) append to `log.md` in the root with format: `## [YYYY-MM-DD] skill | summary`. Enables `grep "^## \[" log.md | tail -5` queries. Pure convention, zero code.
- **Priority:** Reference skill design, before v1.

**7. Canonical reference skill naming (from Karpathy)**
- **Risk:** PQ14 lists "ingest, compile, Q&A, lint, index-maintenance" — doesn't match the canonical Karpathy names.
- **Recommendation:** Use `ingest`, `query`, `lint` as the canonical names. Add `briefing` from GBrain for the compound page pattern. Rename `compile` if open-knowledge keeps it distinct from `ingest`.
- **Priority:** Easy rename. Do it before any reference skills are published.

**8. The `briefing` reference skill as a compounding-loop affordance (from GBrain + Karpathy)**
- **Risk:** Open-knowledge's reference skills don't currently have a skill that FILES QUERY RESULTS BACK INTO THE KB as new pages. This is the "compounding artifact" behavior Karpathy describes.
- **Recommendation:** Ship `briefing` as a reference skill that (a) queries the KB for current state on a topic, (b) synthesizes a new page, (c) files it back. Demo use case: daily briefing compiled from calendar + active work + open threads.
- **Priority:** Reference skill, can ship post-v1.

**9. Voice-calibrated editing skill (from obsidian-mind)**
- **Risk:** Agent-authored content "sounds like AI." Humans perceive it as generic.
- **Recommendation:** Ship `/humanize` as a reference skill. Loads 2-3 user-written samples from the KB, extracts a voice fingerprint, rewrites Claude-drafted content to match. obsidian-mind's `humanize.md` (83 lines) is a complete template.
- **Priority:** Nice-to-have reference skill, post-v1.

**10. vault-manifest.json pattern for declarative schema (from obsidian-mind)**
- **Risk:** Open-knowledge's frontmatter conventions are buried in prose docs. No declarative schema for validation or migration.
- **Recommendation:** Ship `.openknowledge/manifest.json` declaring: frontmatter schema per content type, version fingerprints for migration, folder conventions. PostToolUse hook validates against it. Enables automatic schema enforcement and safe upgrades.
- **Priority:** Medium. Can ship as a convention in v1, formalize later.

### Strong positioning risks to acknowledge

**Risk 1: obsidian-mind delivers significant value with zero code.**
- **What's at risk:** The "persistent agent memory" and "agent-curated knowledge" value props are already delivered by obsidian-mind's pure-convention approach, running on Obsidian + Claude Code.
- **Mitigation:** Position open-knowledge's actual differentiators concretely — real-time co-editing (CC1/S5), embeddable editor (S9), MCP write tools with permission-based routing (S4, PQ9), developer-grade WYSIWYG+source editor (S1/S2). Do NOT position against "persistent agent memory" as a category — that fight is already lost to conventions+Obsidian.

**Risk 2: The "markdown canonical" bet is explicitly contradicted by GBrain at scale.**
- **What's at risk:** Users who build up to 7K+ articles will hit the git scaling ceiling and either migrate off (to GBrain or similar) or have a degraded experience.
- **Mitigation:** Scope P0 explicitly to ≤5K articles per KB. Document the limit in day-0 docs. Encourage multi-brain (multiple git repos) for users beyond the ceiling. Treat SQLite-backed storage as a Later question, not P0.

**Risk 3: Marketing claims vs paper claims vs code — three different trust levels.**
- **What's at risk:** Open-knowledge might adopt patterns from README marketing (ByteRover's "24 tools") or disabled features (AKL with zero weights). The wasted effort would be smaller than if the core architecture diverged — but AKL specifically should NOT be treated as "validated at SOTA" since it was disabled during benchmarks.
- **Mitigation:** For any prior art: trust code > trust paper > trust marketing. ByteRover's paper was largely accurate; its README was not. AKL is "described and built but not used for ranking."

**Risk 4: The 2-tool MCP surface (ByteRover) may outperform the 10-tool surface (open-knowledge) for some use cases.**
- **What's at risk:** Agents that are better at natural-language curation (describe what to remember, let the server structure it) may outperform agents that format explicit write calls.
- **Mitigation:** Consider adding a higher-level `curate(description: string)` tool ALONGSIDE the 10 tools. Gives agents the ergonomic "just tell me what to remember" option while keeping explicit write tools for structured operations.

**Risk 5: Hierarchy imposition vs emergent hierarchy — the prior art is split.**
- **What's at risk:** PROJECT.md rabbit hole #4 says "don't impose top-down structure." But ByteRover's canonical Domain/Topic/Subtopic hierarchy works at 23K docs in benchmarks. Open-knowledge's flat-folder default might not scale.
- **Mitigation:** Ship `npx openknowledge init --template=<X>` with optional templates (ByteRover-style domain/topic, GBrain-style type-prefixed, Karpathy-style flat+convention). Let users pick. Don't force a default hierarchy.

### Specific recommendations, ranked

**Tier 1: Do before v1 (low cost, high value)**
1. **Rename PQ14 reference skills to Karpathy canonical names** (ingest, query, lint) + add briefing from GBrain
2. **Ship the PostToolUse validation hook** (adapted from obsidian-mind's validate-write.py) in `npx openknowledge init`
3. **Adopt "compiled truth + timeline" as a content convention** for reference skills
4. **Scope the 5K-file ceiling explicitly** in user-facing docs
5. **Add `set_draft_status(comment)` MCP tool** for high-bandwidth agent status
6. **Ship a PreToolUse hook** for index-first navigation (Graphify pattern)
7. **Ship `npx skills add .../openknowledge --skill ok-cli`** as a distribution alternative to `npx openknowledge init`

**Tier 2: Do in v1 reference skills (medium cost)**
1. **Write a comprehensive AGENTS.md template** using obsidian-mind's CLAUDE.md structure as the reference (339 lines of operating manual)
2. **Ship `.openknowledge/manifest.json`** with declarative schema, version fingerprints, folder conventions
3. **Implement `log.md` convention** with parseable prefixes, maintained by reference skills
4. **Ship `briefing` reference skill** — the "query results become new wiki pages" compounding loop
5. **Fork Orca's git worktree wrapper** for TQ22 implementation

**Tier 3: Consider post-v1 (exploration)**
1. **`/humanize` reference skill** — voice-calibrated editing from samples
2. **Edge confidence typing convention** — `related:` vs `suggested_related:` frontmatter fields
3. **Single high-level `curate(description)` MCP tool** alongside the 10-tool surface
4. **`maturity: draft|validated|core` frontmatter convention** — low cost, skip importance/recency until empirical evidence

### Final framing for positioning

From Karpathy: **"The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping. Humans abandon wikis because the maintenance burden grows faster than the value."**

From Karpathy: **"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."** Open-knowledge replaces Obsidian.

From ByteRover: "**the same LLM that reasons about a task also curates, structures, and retrieves knowledge**" — open-knowledge's MCP tools make this possible by giving the LLM first-class write access.

**Open-knowledge's differentiator in one sentence:** The first developer-grade markdown editor + MCP substrate designed for real-time human+AI co-editing, where the LLM is a first-class author with presence, permissions, and a git-backed audit trail — not a memory backend or a sidekick sending file suggestions.

---

## D11: Reference Skill Mapping — Which Skills Ship with v1?

*(Cross-source mapping: obsidian-mind 15 commands + 9 subagents, GBrain 5 skills, Karpathy 3 operations → open-knowledge v1 reference skill list. Full evidence in [evidence/d11-reference-skill-mapping.md](evidence/d11-reference-skill-mapping.md).)*

### The canonical three operations are unanimous across all sources

| Operation | Karpathy | GBrain | obsidian-mind | open-knowledge v1 |
|---|---|---|---|---|
| Ingest | Ingest | `ingest` | `/dump` | **`/ingest`** |
| Query | Query | `query` | QMD + context-loader | **`/query`** |
| Lint | Lint | `maintain` | `/vault-audit` + vault-librarian + cross-linker | **`/lint`** |

These three are non-negotiable P0. Without them, the Karpathy workflow doesn't function — you can't add knowledge, retrieve knowledge, or maintain knowledge.

### Three additional skills complete the v1 set

**`/compile` (P1)** — Synthesize multiple KB pages into a new compiled artifact. Maps to GBrain's `briefing` skill and obsidian-mind's `/weekly`. This is the compounding mechanism — "good answers filed back into the wiki as new pages" (Karpathy). Without it, the KB accumulates but doesn't synthesize.

**`/import` (P1)** — Migrate an existing markdown vault (Obsidian, flat folder, PARA) into open-knowledge format. Maps to obsidian-mind's `/vault-upgrade` + vault-migrator agent. Critical for adoption — existing Obsidian users (obsidian-mind has 1.3K stars) need a day-0 migration path. The multi-tier classification heuristic (Tier 0 vault shape → Tier 4 fallback) from obsidian-mind is the reference pattern.

**`/init` (P1)** — Bootstrap a new KB with folder structure, AGENTS.md, manifest.json, hooks, and MCP config. Maps to obsidian-mind's repo-as-template pattern and GBrain's implied `gbrain init`. This is CC5 (zero-friction onboarding) — `npx openknowledge init` should produce a working KB in one command.

### What's explicitly excluded from v1 (11 of 15 obsidian-mind commands)

The excluded commands fall into three categories:

1. **Domain-locked** (5 commands): `/capture-1on1`, `/review-brief`, `/self-review`, `/review-peer`, `/incident-capture` — all tied to performance reviews or incident response. The community builds these on top of `/ingest`.

2. **External service dependent** (2 commands): `/slack-scan`, `/peer-scan` — require Slack and GitHub integrations that open-knowledge doesn't ship with. Deferred to S-L6 (connectors).

3. **Covered by hooks or conventions** (4 commands): `/standup` (SessionStart hook), `/wrap-up` (lint + Stop hook), `/project-archive` (AGENTS.md convention), `/humanize` (novel but Tier 3 — not substrate-level).

### Filtering principle

The v1 reference skills are **substrate-level** — they make the Karpathy workflow work on any topic, for any user, without external dependencies. Domain-specific skills (performance reviews, incident response, VC deal tracking) are the community's job. Open-knowledge ships the platform; the ecosystem ships the specializations.

### Recommended v1 reference skill list (6 skills)

| Priority | Skill | Karpathy op | GBrain equiv | Key subagents |
|---|---|---|---|---|
| **P0** | `/ingest` | Ingest | `ingest` | source-analyzer, cross-linker |
| **P0** | `/query` | Query | `query` | — (MCP tools) |
| **P0** | `/lint` | Lint | `maintain` | librarian, cross-linker |
| **P1** | `/compile` | (Query "file back") | `briefing` | source-gatherer, draft-writer |
| **P1** | `/import` | — | — | classifier, migrator |
| **P1** | `/init` | — | — | — (single-pass) |

**6 skills total. 3 P0, 3 P1.** This is within the 5-8 range constraint from PQ14 and covers 100% of Karpathy's canonical operations plus adoption (import), onboarding (init), and compounding (compile).

---

## Limitations & Open Questions

### Dimensions not fully covered
- **DeepWiki's generation architecture** — no engineering blog post exists, so technical details are inferred from the output format. Investigation is limited to the public surface.
- **QMD (Tobi Lutke's search tool)** — referenced by both Karpathy and obsidian-mind as the recommended semantic search backend, but not investigated directly. Could be a valuable deep-dive if open-knowledge is weighing Orama vs QMD.
- **GBrain's actual repo** — github.com/garrytan/gbrain exists but was not cloned and inspected; only the spec gist. If Garry has started building, the implementation may diverge from the spec.

### Out of scope (per rubric)
- Broader "agent memory" landscape beyond D2/D3 (Mem0, Zep, Letta) — covered in `/reports/agent-knowledge-retrieval-paradigms-2025-2026/`
- Re-investigation of Obsidian, Notion, Confluence, Mintlify, AFFiNE — covered in `/reports/openknowledge-competitive-landscape/`
- Karpathy workflow via Obsidian/Fumadocs/Mintlify — covered in 3 prior reports
- Implementation details for open-knowledge changes (that's /spec or /stories territory)

### Known confidence gaps
- **ByteRover paper's benchmark results** (96.1% LoCoMo, 92.8% LongMemEval-S) are real and the architecture is largely implemented as described. The one real gap: AKL compound scoring is disabled (weights at zero), so the benchmark wins are NOT attributable to importance/maturity/recency ranking — but they ARE attributable to tiered retrieval (ablation shows -29.4pp without it).
- **The 71.5x token reduction claim for Graphify** is the vendor's own benchmark with sample questions chosen by the vendor. Directional evidence only.

---

## References

### Evidence Files (this report)
- [evidence/d1-graphify.md](evidence/d1-graphify.md) — Graphify deep exploration
- [evidence/d2-byterover-cli.md](evidence/d2-byterover-cli.md) — ByteRover CLI source investigation (with paper-vs-code discrepancies)
- [evidence/d3-byterover-paper.md](evidence/d3-byterover-paper.md) — arxiv:2604.01599 full paper analysis
- [evidence/d4-deepwiki.md](evidence/d4-deepwiki.md) — DeepWiki product analysis
- [evidence/d5-obsidian-mind.md](evidence/d5-obsidian-mind.md) — obsidian-mind template deep exploration
- [evidence/d6-garrytan-gbrain.md](evidence/d6-garrytan-gbrain.md) — GBrain spec verbatim analysis
- [evidence/d7-stablyai-orca.md](evidence/d7-stablyai-orca.md) — Orca desktop app source investigation
- [evidence/d8-karpathy-gist.md](evidence/d8-karpathy-gist.md) — Karpathy LLM Wiki gist verbatim analysis
- [evidence/d11-reference-skill-mapping.md](evidence/d11-reference-skill-mapping.md) — Reference skill mapping (obsidian-mind + GBrain + Karpathy → v1 skill list)

### External Sources
- [safishamsi/graphify](https://github.com/safishamsi/graphify) — Claude Code knowledge graph skill
- [campfirein/byterover-cli](https://github.com/campfirein/byterover-cli) — ByteRover CLI implementation
- [arXiv:2604.01599](https://arxiv.org/abs/2604.01599) — ByteRover: Agent-Native Memory Through LLM-Curated Hierarchical Context
- [deepwiki.com](https://deepwiki.com) — Cognition/Devin auto-generated repo wikis
- [docs.devin.ai/work-with-devin/deepwiki](https://docs.devin.ai/work-with-devin/deepwiki) — DeepWiki documentation
- [breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind) — Obsidian vault template for Claude Code
- [garrytan gist — GBrain spec](https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb)
- [stablyai/orca](https://github.com/stablyai/orca) — Cross-platform AI agent orchestrator
- [karpathy gist — LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

### Related Research (open-knowledge's existing prior art)
- [/reports/openknowledge-competitive-landscape/](../openknowledge-competitive-landscape/) — 7 primary competitors (Notion, Confluence, Obsidian, Mintlify, Chroma, Outline, AFFiNE)
- [/reports/obsidian-karpathy-workflow-deep-dive/](../obsidian-karpathy-workflow-deep-dive/) — Obsidian against Karpathy's workflow
- [/reports/fumadocs-karpathy-workflow-deep-dive/](../fumadocs-karpathy-workflow-deep-dive/) — Fumadocs against Karpathy's workflow
- [/reports/mintlify-karpathy-workflow-deep-dive/](../mintlify-karpathy-workflow-deep-dive/) — Mintlify against Karpathy's workflow
- [/reports/agent-knowledge-retrieval-paradigms-2025-2026/](../agent-knowledge-retrieval-paradigms-2025-2026/) — RAG → agentic retrieval landscape
- [/reports/knowledge-graph-incremental-updates/](../knowledge-graph-incremental-updates/) — Temporal KG patterns
- [/reports/llm-knowledge-consolidation-fidelity/](../llm-knowledge-consolidation-fidelity/) — Compilation and fidelity patterns
- [/reports/wiki-links-backlinks-architecture/](../wiki-links-backlinks-architecture/) — Open-knowledge S10 architecture research
