# Evidence: D1 — Execution Reality (Shipping vs Marketing)

**Dimension:** D1 (P0 Deep)
**Date:** 2026-04-11
**Sources:** mintlify.com/blog, mintlify.com/changelog, GitHub mintlify org, HN

---

## Key findings

### Finding: 20+ product improvements shipped in 9-day audit window (April 2–11, 2026)
**Confidence:** CONFIRMED
**Evidence:** [Mintlify changelog April 10](https://www.mintlify.com/changelog) — CLI analytics, directory listings, multi-skill `.mintlify/skills/`, Slack agent multi-deployment + read-only mode, MCP client credentials. [Mintlify changelog April 3](https://www.mintlify.com/changelog) — `get_page` MCP tool, password-protected previews, SAML group role mappings.
**Implication:** Categorically different from AFFiNE (0 new AI features across v0.26.x). Execution is real.

### Finding: KB Agent was soft-launched to customers March 22, not internal-only
**Confidence:** CONFIRMED
**Evidence:** [KB Agent blog post CTA](https://www.mintlify.com/blog/kb-agent): "You can sign up for Mintlify, connect your Slack, and try the KB agent out for yourself." Customer feature request on GitHub (March 31) confirms external usage.
**Implication:** Corrects prior "internal-only" assessment. Active development continued in April (Slack agent improvements in April 10 changelog).

### Finding: Pro plan pricing corrected to $250/month (not $300)
**Confidence:** CONFIRMED
**Evidence:** [mintlify.com/pricing](https://www.mintlify.com/pricing) (accessed 2026-04-11). Third-party review sites still cite $300.
**Implication:** ~17% price reduction suggests conversion optimization or competitive pressure.

### Finding: Trieve acquired July 24, 2025, not December 2024
**Confidence:** CONFIRMED
**Evidence:** [GlobeNewswire announcement](https://www.globenewswire.com/news-release/2025/07/24/3121271/) — dated July 24, 2025. "Context-1" is [Chroma's model](https://www.marktechpost.com/2026/03/29/chroma-releases-context-1-a-20b-agentic-search-model/), not Trieve's.
**Implication:** Integration timeline is 8.5 months, not 15 months.

### Finding: "AI knowledge infrastructure" positioning remains aspirational
**Confidence:** INFERRED
**Evidence:** Shipped product is docs-as-code features (changelogs, CLI, MCP tools, Slack agent). No knowledge platform product surface (wikis, handbooks, KB management) shipped.
**Implication:** Marketing oversells architectural ambition; product execution is a docs SaaS with AI layered on top.

### Finding: ChromaFs HN post achieved 409 points
**Confidence:** CONFIRMED
**Evidence:** [HN submission](https://news.ycombinator.com/item?id=47618223) — 409 points, 43 comments.
**Implication:** Strong external signal of developer interest in Mintlify's AI approach.

---

## Vendor bias flag
Blog posts, changelogs, and product announcements are vendor-sourced. GitHub commit counts are independently verifiable. No independent third-party product review of the specific features shipped in this window was found.
