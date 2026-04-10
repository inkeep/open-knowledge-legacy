# Evidence: AI-Specific Frontmatter Fields

**Dimension:** D8 — Fields specifically for agent consumption
**Date:** 2026-04-05
**Sources:** Fern docs, Mintlify docs, llms.txt specification, Karpathy wiki pattern, Mastra blog

---

## Key pages referenced

- https://buildwithfern.com/learn/docs/ai-features/llms-txt — Fern llms.txt
- https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide — Fern guide
- https://www.mintlify.com/docs/ai/llmstxt — Mintlify llms.txt
- https://mastra.ai/blog/how-to-structure-projects-for-ai-agents-and-llms — Mastra structuring

---

## Findings

### Finding: noindex is the only frontmatter field with explicit AI semantics across multiple platforms
**Confidence:** CONFIRMED

| Platform | noindex behavior |
|----------|-----------------|
| Fern | Excludes from search engines AND llms.txt/llms-full.txt |
| Mintlify | Excludes from search engines; hidden pages auto-get noindex |
| Docusaurus | `unlisted: true` achieves similar effect (hidden + not indexed) |
| Starlight | `pagefind: false` excludes from search index |

Only Fern explicitly ties noindex to llms.txt exclusion. Others use noindex for SEO only.

### Finding: Fern's agents key is the only site-level AI directive mechanism
**Confidence:** CONFIRMED
**Evidence:** https://buildwithfern.com/learn/docs/ai-features/llms-txt

The `agents` key in `docs.yml`:
- Prepends a short instruction to AI agents
- Injected after frontmatter, before page body
- Applies to individual page .md/.mdx URLs
- Applies to each page section in llms-full.txt
- Human docs unaffected

This is site-level, not per-page frontmatter. No platform has per-page agent directives as frontmatter fields.

### Finding: Content-level AI tags exist (not frontmatter, but related)
**Confidence:** CONFIRMED
**Evidence:** Fern documentation

- `<llms-only>` — content visible to AI, hidden from humans
- `<llms-ignore>` — content visible to humans, hidden from AI
- These are content tags, not frontmatter fields, but serve a similar filtering purpose

### Finding: description is the primary frontmatter field that feeds llms.txt
**Confidence:** CONFIRMED

| Platform | Field used for llms.txt | Fallback |
|----------|----------------------|----------|
| Fern | description | subtitle |
| Mintlify | description | None |
| Fumadocs | description (via llms() helper) | None |

The description field is the most critical frontmatter field for AI consumption because it directly populates llms.txt page entries.

### Finding: Karpathy's confidence field is the only agent-native metadata innovation
**Confidence:** CONFIRMED
**Evidence:** https://antigravity.codes/blog/karpathy-llm-wiki-idea-file

The `confidence: high | medium | low` field is unique to the Karpathy pattern. It tells an agent how much to trust a claim. No documentation framework has adopted this, but it serves an agent-specific function:
- Agents can prioritize high-confidence pages
- Low-confidence pages can be flagged for verification
- Enables quality-aware retrieval

### Finding: The Karpathy type field serves as agent routing metadata
**Confidence:** INFERRED
**Evidence:** type: concept | entity | source-summary | comparison

This enables an agent to filter or prioritize pages by article type. A concept page provides definitions; an entity page provides facts about a specific subject. This is not present in any docs framework.

### Finding: No platform has adopted an explicit `ai:` namespace in frontmatter
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched across all platforms for `ai:`, `llm:`, `agent:` namespaced frontmatter fields. None found. The closest is Fern's `agents` key in docs.yml (site config, not frontmatter).

### Finding: generated/auto-maintained flag is absent from all frameworks
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched for `generated`, `auto`, `maintained-by`, `author: ai` or similar fields. No framework has a standard field indicating whether content was AI-generated or human-authored. The Karpathy pattern implies all wiki pages are LLM-maintained but doesn't flag this in frontmatter.

### Finding: Priority/weight fields exist but aren't AI-specific
**Confidence:** CONFIRMED
**Evidence:** Hugo has `weight` for sort ordering. Docusaurus has `sidebar_position`. Starlight has `sidebar.order`. These control display ordering, not agent retrieval priority. No platform has an explicit `priority` field for agent consumption.

---

## Emerging AI-specific field patterns (not yet standardized)

Based on the research, these fields would serve agent-specific functions but are not yet adopted by any major platform:

| Potential field | Purpose | Precedent |
|----------------|---------|-----------|
| noindex | Exclude from llms.txt / agent retrieval | Fern (explicit), Mintlify (SEO only) |
| confidence | Claim certainty level | Karpathy wiki |
| type | Article taxonomy for routing | Karpathy wiki |
| sources | Provenance tracking | Karpathy wiki |
| generated | Whether content is AI-authored | None (proposed) |
| agent-instructions | Per-page AI directive | Fern agents key (site-level only) |
| priority | Agent retrieval priority | None (proposed) |

---

## Gaps / follow-ups

- llms.txt spec itself does not define required frontmatter — it's a format spec for the output file
- Per-page agent directives don't exist as frontmatter in any framework yet
- No standard for marking content as AI-generated vs human-authored
