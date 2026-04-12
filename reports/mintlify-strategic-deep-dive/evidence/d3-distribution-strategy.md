# Evidence: D3 — Agent-Format Distribution Strategy

**Dimension:** D3 (P0 Deep)
**Date:** 2026-04-11
**Sources:** agentskills.io, mintlify.com/docs, GitHub code search, npm, community repos

---

## Key findings

### Finding: Mintlify auto-generates skill.md per Anthropic's Agent Skills spec (not Mintlify-authored)
**Confidence:** CONFIRMED
**Evidence:** [agentskills.io](https://agentskills.io) — "Built with Mintlify" (Mintlify hosts the docs but did not author the spec). Agent Skills spec maintained at [github.com/anthropics/skills](https://github.com/anthropics/skills). [Mintlify skill.md docs](https://www.mintlify.com/docs/ai/skillmd) — auto-generates on deploy, regenerates within 24 hours. [Mintlify skill.md blog](https://www.mintlify.com/blog/skill-md) — announcement. Served at `/.well-known/skills/default/skill.md`.
**Implication:** Standard compliance enables 35+ agent passive discovery. But Mintlify is an implementer, not the standards author.

### Finding: No centralized mintlify-skills repo exists
**Confidence:** NOT FOUND
**Evidence:** npm: `mintlify-skills`, `@mintlify/skills`, `@mintlify/agent-skills` → all NOT FOUND. GitHub mintlify org: no dedicated skills collection repo. `mintlify-claude-plugin` has 1 GitHub star. Community `evansso/mintlify-skills`: 0 stars.
**Implication:** 22,662× smaller than obsidian-skills by GitHub signal. No centralized format-teaching play.

### Finding: Community ecosystem is adversarial, not extensional
**Confidence:** CONFIRMED
**Evidence:** Largest community repo: [remorses/holocron](https://github.com/remorses/holocron) (535 stars) — "drop-in Mintlify replacement." [gregce/unmint](https://github.com/gregce/unmint) (38 stars) — "Mintlify-style docs, minus the price tag." Zero community-built MCP servers, agent skills, or AI integrations for Mintlify.
**Implication:** Pricing friction ($250/month cliff) drives replication rather than ecosystem investment.

### Finding: Mintlify authored zero of the four associated "agents reading docs" standards
**Confidence:** CONFIRMED
**Evidence:** llms.txt: [Jeremy Howard / Answer.AI](https://www.answer.ai/posts/2024-09-03-llmstxt.html) (September 2024). Content negotiation: [IETF RFC 7763](https://www.rfc-editor.org/rfc/rfc7763) (2016). MCP: [Anthropic](https://modelcontextprotocol.io) (2024). Agent Skills: [Anthropic](https://github.com/anthropics/skills) (2025).
**Implication:** Moat is zero-config convenience bundling, not standards ownership. Time-bound as competitors adopt the same standards.

### Finding: Competitors closing the convenience-bundling gap
**Confidence:** CONFIRMED
**Evidence:** [GitBook MCP + llms.txt auto-generation](https://www.gitbook.com/blog/new-in-gitbook-september-2025) (September 2025). Docusaurus community plugins cover llms.txt, MCP, content negotiation. GitBook: 2/4 standards auto-generated. Docusaurus: 3/4 via community plugins.
**Implication:** Mintlify's "only platform that bundles all four" advantage is narrowing.

---

## Negative searches

| Search | Location | Result |
|---|---|---|
| `mintlify-skills` | npm, GitHub | NOT FOUND |
| `@mintlify/skills` | npm | NOT FOUND |
| Mintlify in cursor-rules | awesome-cursorrules | NOT FOUND |
| Mintlify in agentskills.io registry | agentskills.io | Per-site entries only (no centralized Mintlify entry) |
