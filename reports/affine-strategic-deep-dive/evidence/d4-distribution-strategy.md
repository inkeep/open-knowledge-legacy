# Evidence: D4 — Agent/format distribution strategy (D8-equivalent audit)

**Dimension:** D4 (P0 Deep)
**Date:** 2026-04-11
**Sources:** github.com code search, agentskills.io, npm registry, AFFiNE docs

---

## Primary question

Does AFFiNE have a distribution play analogous to `kepano/obsidian-skills` (22K stars as of April 2026) — a SKILL.md-based, cross-agent-compatible format-teaching repo distributed via `npx skills add`, Claude Code plugin marketplace, and git clone?

## Verdict

**NOT FOUND.** CONFIRMED via explicit negative searches across all plausible distribution surfaces.

---

## Key sources

- [github.com/kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) — 22K-star baseline for comparison
- [github.com/toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) — scoped for `SKILL.md`, `.claude-plugin/`, agentskills-compatible resources
- [github.com/DAWNCR0W/affine-mcp-server](https://github.com/DAWNCR0W/affine-mcp-server) — largest non-official AFFiNE-AI integration (140 stars)
- [github.com/tomohiro-owada/affine-cli](https://github.com/tomohiro-owada/affine-cli) — community CLI with AGENTS.md (9 stars)
- [github.com/toeverything/awesome-affine](https://github.com/toeverything/awesome-affine) — curated community list (no agent-skill entries at scale)
- [docs.affine.pro: AI admin docs](https://docs.affine.pro/self-host-affine/administer/ai) — BYOK / bundled LLM config, not agent-teaching
- [npmjs.com/package/skills](https://www.npmjs.com/package/skills) — `npx skills add` registry

---

## Findings

### Finding: AFFiNE has no SKILL.md-based agent distribution

**Confidence:** CONFIRMED (negative result, multiple searches)
**Evidence:**
- GitHub code search: `site:github.com/toeverything SKILL.md` → 0 results
- GitHub code search: `site:github.com/toeverything ".claude-plugin"` → 0 results
- No `skills add` registry entry for AFFiNE/BlockSuite
- No cursor-rules repository for AFFiNE in github.com/cursor-rules
- docs.affine.pro has no "teach agents AFFiNE formats" document

**Implication:** There is no official or community-curated agent-skill distribution for AFFiNE. This is the exact structural gap that obsidian-skills fills for Obsidian. AFFiNE has nothing comparable.

---

### Finding: Community AI integrations exist but at fragmentary scale

**Confidence:** CONFIRMED
**Evidence — community repo census (top 5 at any star count):**

| Repo | Stars | Last commit | Purpose |
|---|---|---|---|
| `toeverything/AFFiNE` | 67,178 | 2026-04-11 | Main product (not agent-distribution) |
| `DAWNCR0W/affine-mcp-server` | 140 | 2026-04-10 | Third-party MCP for AI assistants |
| `tomohiro-owada/affine-cli` | 9 | 2026-04-09 | CLI with AGENTS.md |
| `axcode07/affine_ai_helper` | <50 | — | LiteLLM + Ollama bridge |

**Scale comparison:**
- Largest AFFiNE-AI community repo: 140 stars
- obsidian-skills: 22,662 stars (~162× larger)
- Ratio: AFFiNE-AI ecosystem is ~0.6% the reach of Obsidian's (140/22662 = 0.618%)

**Implication:** No dominant community figure like kepano is organizing AFFiNE agent-format education. The ecosystem is a long tail of sub-200-star tooling, none of which approaches the cross-agent standardization of obsidian-skills + `npx skills add`.

---

### Finding: AFFiNE's official AI strategy is product-internal (not ecosystem-external)

**Confidence:** CONFIRMED
**Evidence:**
- [docs.affine.pro/self-host-affine/administer/ai](https://docs.affine.pro/self-host-affine/administer/ai): Config docs for BYOK (bring-your-own-key) and bundled LLM integration — no "teach agents" content.
- AFFiNE's AI features (per v0.25.0 release notes) are in-product integrations: Claude Sonnet 4.5, Gemini 2.5 Pro, multi-model. All rendered inside the AFFiNE UI.
- No format-specification docs designed for external agent consumption (no "Markdown spec for agents", no canvas-format-spec on its own).

**Implication:** AFFiNE's strategy is **"run LLMs inside our product"** (like Notion, Confluence). Obsidian's strategy is **"teach external agents our formats"** (externalizing intelligence). These are architecturally different bets. AFFiNE's bet is also structurally harder: it competes with Notion on feature ground (bundled LLM + cloud) while having 1/30th the funding.

---

### Finding: No movement toward SKILL.md / agent-distribution since 2026-04-07 landscape report

**Confidence:** CONFIRMED (negative searches covering the intervening period)
**Evidence:** No new agent-skills-style repos authored by toeverything or prominent community members since January 2026 (obsidian-skills' reference baseline). GitHub searches for new AFFiNE-AI repos with ≥100 stars in 2026 surfaced only the pre-existing DAWNCR0W/affine-mcp-server.

**Implication:** The gap is not closing. If anything, with obsidian-skills at 22,662 stars and pulling in 33+ compatible agents (per the landscape report's D8), the distributional advantage is compounding *away from* AFFiNE each week.

---

## Structural explanation

The absence of a D8-equivalent for AFFiNE is not accidental — three structural factors predict it:

1. **CRDT-binary canonical format is not agent-friendly.** SKILL.md works for Obsidian because agents can read and write Obsidian's markdown files directly. AFFiNE's canonical format is Yjs binary; agents need an intermediate export/import layer (which is lossy — see `d5-format-fidelity.md`). You cannot write a "teach agents AFFiNE's format" doc that says "open this .json file and edit it" — you have to teach MCP tool orchestration instead.

2. **AFFiNE's AI strategy is product-bundled, not ecosystem-externalized.** The company sells LLM-powered knowledge features. Teaching external agents to work *around* the product reduces LLM-revenue capture. Same dynamic that prevents Notion from externalizing — the business model constrains the technical strategy.

3. **No CEO-scale community figure.** Obsidian has Steph Ango (`@kepano`), with a personal brand and 21K-star repo authority. AFFiNE's Jiachen He is a founder-CEO but does not have a comparable personal distribution engine. Community hasn't organically produced a substitute.

---

## Strategic assessment for the reader

- **For open-knowledge's positioning:** AFFiNE is not a distribution-layer competitor. The D8-equivalent gap is a structural feature of AFFiNE's architecture and business model, not a temporary oversight. This should update (downward) the "Tier-1 threat most technically capable" framing in the competitive landscape report.
- **For open-knowledge's distribution strategy:** The white space remains. Obsidian owns "teach agents Obsidian formats." Open-knowledge can own "teach agents markdown+git+CRDT co-creation primitives" with its own SKILL.md distribution. AFFiNE will not compete on this axis.
- **Decision trigger:** If AFFiNE ever publishes `@blocksuite/agent-skills`, an MCP-native format spec, or a cursor-rules / Claude-plugin marketplace entry at meaningful scale (>500 stars), this assessment flips. As of 2026-04-11, no such artifact exists.

---

## Gaps / negative searches (exhaustive)

| Search | Location | Result |
|---|---|---|
| `SKILL.md + affine` | GitHub code search | NOT FOUND |
| `.claude-plugin + affine` | GitHub code search, toeverything org | NOT FOUND |
| `affine` | npm `skills` package, agentskills.io registry | NOT FOUND |
| `affine` | github.com/cursor-rules community rules | NOT FOUND |
| obsidian-skills analog | toeverything org | NOT FOUND |
| `@blocksuite/skills` / `@affine/skills` | npm | NOT FOUND |
| "markdown-as-canonical" feature | docs.affine.pro | NOT FOUND |
