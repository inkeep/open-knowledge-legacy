# Evidence: AI-Generated Metadata and Catalogs

**Dimension:** D4 — AI-generated metadata and catalogs
**Date:** 2026-04-02
**Sources:** Karpathy's blog, Obsidian plugins, Notion docs, Front Matter CMS, practitioner posts, Cloudflare blog

---

## Key files / pages referenced

- https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/ — Karpathy KB architecture
- https://github.com/rvk7895/llm-knowledge-bases — LLM Knowledge Bases Claude Code plugin
- https://github.com/kepano/obsidian-skills — kepano's Obsidian Skills
- https://www.notion.com/help/autofill — Notion AI Autofill docs
- https://frontmatter.codes/docs/ai-features — Front Matter CMS AI features
- https://blog.cloudflare.com/markdown-for-agents/ — Cloudflare Markdown for Agents
- https://dasroot.net/posts/2026/02/automated-content-tagging-local-llms/ — Automated content tagging
- https://llmstxt.org/ — llms.txt specification

---

## Findings

### Finding: Karpathy's approach — LLM "compiles" raw sources into a structured wiki with auto-maintained indexes
**Confidence:** CONFIRMED
**Evidence:** https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an/

Three stages: (1) Data ingest — raw materials dumped into raw/ directory; (2) Compilation — LLM reads raw data and writes a structured wiki with summaries, encyclopedia-style articles, and backlinks; (3) Active maintenance (linting) — LLM scans for inconsistencies and missing connections. The LLM "auto-maintains index files and brief summaries" and "can read all relevant material fairly easily at this small scale." Scale: ~100 articles, ~400K words on a single research topic.

**Implications:** This is the canonical "AI-generated catalog" pattern. The LLM doesn't just organize — it synthesizes raw sources into navigable, cross-linked knowledge. The auto-maintained index is central to the approach.

### Finding: LLM Knowledge Bases plugin (rvk7895) attempts to productize Karpathy's workflow
**Confidence:** CONFIRMED
**Evidence:** https://github.com/rvk7895/llm-knowledge-bases

"Claude Code plugin for building LLM-maintained Obsidian wikis from raw research — compile, query, lint, and evolve your personal knowledge base. Inspired by Karpathy's knowledge base workflow." This is the most direct implementation of the Karpathy pattern as a tool.

**Implications:** While the implementation exists, it's early-stage. No evidence of widespread adoption beyond the open-source project.

### Finding: Notion AI Autofill auto-generates metadata properties (tags, summaries, key info)
**Confidence:** CONFIRMED
**Evidence:** https://www.notion.com/help/autofill

Four AI property types: Custom Autofill, Summary, Key Information, Translation. "Generate new options" toggle creates new tags from content analysis while reusing existing options to prevent redundant tags. Auto-updates 5 minutes after page edits. Users report unreliable auto-update behavior.

**Implications:** Notion is the closest production implementation of "AI auto-generated frontmatter" for a document collection. It works at the property level (individual fields) but not at the catalog/index level.

### Finding: Front Matter CMS provides LLM-powered title, description, and tag suggestions
**Confidence:** CONFIRMED
**Evidence:** https://frontmatter.codes/docs/ai-features

Uses GitHub Copilot's LLM to suggest frontmatter values: title, description, and tags. This is explicitly for VS Code-based markdown editing workflows.

**Implications:** Demonstrates the "LLM-generated frontmatter" pattern in a developer-focused tool. Limited to individual article metadata, not KB-wide indexes.

### Finding: Automated content tagging with local LLMs achieves 92% accuracy
**Confidence:** CONFIRMED
**Evidence:** https://dasroot.net/posts/2026/02/automated-content-tagging-local-llms/

A tech company in February 2026 used Meta's Llama 3.1 with Weaviate 4.1's semantic chunking to tag internal documentation, achieving 92% categorization accuracy and cutting manual tagging by 75%. Zero-shot classification enables tagging without pre-training on specific data.

**Implications:** Validates that AI-generated metadata can be accurate enough for production use. 92% is high but still requires human review for the remaining 8%.

### Finding: kepano's obsidian-skills teaches agents Obsidian file formats, not KB navigation
**Confidence:** CONFIRMED
**Evidence:** https://github.com/kepano/obsidian-skills

Five skills covering: Obsidian Markdown (wikilinks, callouts, frontmatter, tags), Bases (.base files), Canvas (.canvas files), CLI interactions, and web content extraction. These teach agents to READ and WRITE Obsidian files correctly — not to navigate or index a vault.

**Implications:** kepano's strategy is "teach agents file formats" rather than "build navigation aids." No auto-indexing, no catalog generation, no KB-level navigation.

### Finding: llms.txt is a human-curated site index for LLM consumption — 844K+ implementations
**Confidence:** CONFIRMED
**Evidence:** https://llmstxt.org/, multiple adoption reports

Markdown-formatted plain-text file in a site's root directory. Contains: H1 (project name, required), blockquote (summary), H2-delimited sections with URL lists. Over 844K websites have implemented it. Used by Anthropic, Cloudflare, Stripe. No major AI platform has confirmed they read these files. Google included it in their A2A protocol.

**Implications:** llms.txt IS an index/catalog for agents — human-curated, lightweight, and positioned at the site root. It's the closest existing standard to "a summary document that maps the entire KB" for web-based knowledge.

### Finding: Cloudflare Markdown for Agents converts HTML to markdown on-the-fly with 80% token reduction
**Confidence:** CONFIRMED
**Evidence:** https://blog.cloudflare.com/markdown-for-agents/

Uses HTTP content negotiation (Accept: text/markdown header). Converts HTML to clean markdown at request time. Example: 16,180 tokens (HTML) → 3,150 tokens (markdown). Claude Code and OpenCode already send these headers. Includes x-markdown-tokens header for token budget management.

**Implications:** Agent-friendly content formatting reduces tokens dramatically but doesn't address navigation/indexing — it's about content consumption, not discovery.

---

## Gaps / follow-ups

* No tool found that auto-generates a comprehensive KB catalog (all-article index with summaries)
* The Karpathy "auto-maintained index" pattern has been described but not widely productized
* Smart Connections (Obsidian) generates embeddings but not human-readable summaries/indexes
