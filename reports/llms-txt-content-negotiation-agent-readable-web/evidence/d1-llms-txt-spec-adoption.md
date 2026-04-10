# Evidence: llms.txt Spec & Adoption

**Dimension:** D1 — The llms.txt spec, variants, adoption numbers
**Date:** 2026-04-07
**Sources:** llmstxt.org, SE Ranking, BuiltWith, ALLMO, Rankability, llmstxt.directory

---

## Key sources
- [llmstxt.org spec](https://llmstxt.org/) — formal spec
- [SE Ranking 300K domain study](https://seranking.com/blog/llms-txt/) — 10.13% adoption
- [ALLMO citation analysis](https://www.allmo.ai/articles/llms-txt) — 0.001% of AI citations point to llms.txt
- [Rankability top-1000 tracker](https://www.rankability.com/data/llms-txt-adoption/) — 0% of top 1000 sites
- [Dries Buytaert](https://dri.es/markdown-llms-txt-and-ai-crawlers) — "solution looking for a problem"

## Findings

### Spec: Jeremy Howard, September 2024, markdown file at site root
**Confidence:** CONFIRMED
Variants: llms.txt (curated index), llms-full.txt (full concatenated content), llms-ctx.txt (expanded without URLs), per-page .md. No llms-small.txt in spec (Starlight plugin invented this).

### Adoption: ~10% of web broadly, low thousands of quality implementations
**Confidence:** CONFIRMED
SE Ranking: 10.13% of 300K domains. BuiltWith: 193K live (down from 844K claim). Inflated by Yoast auto-generation. ALLMO: 0.001% of AI citations. Rankability: 0% of global top 1000.

### Notable publishers: developer docs concentrated
**Confidence:** CONFIRMED
Anthropic, Stripe, Cloudflare, Vercel, Supabase, Docker, HubSpot, Coinbase. Notable non-adopters: Google, Meta, Amazon, Microsoft, Apple.

### Auto-generation: 4 native platforms, multiple plugins
**Confidence:** CONFIRMED
Native: Mintlify, Fern, GitBook, Yoast. Plugins: Docusaurus (4+), Starlight, VitePress (2).

### Spec limitations: no versioning, no access control, no structured data
**Confidence:** CONFIRMED
No W3C track. Core paradox: sites that benefit most (dev docs) are already structured; sites that need discoverability have no incentive.

### Stripe's "Instructions" section is the most significant innovation
**Confidence:** CONFIRMED
Stripe added `## Instructions for Large Language Model Agents` — a system prompt in a static file. Not part of spec but potentially the highest-value pattern.
