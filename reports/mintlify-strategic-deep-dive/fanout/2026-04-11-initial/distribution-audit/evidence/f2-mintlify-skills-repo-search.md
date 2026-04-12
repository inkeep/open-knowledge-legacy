# Evidence: F2 — Mintlify Skills Repo Search (Negative Audit)

**Dimension:** F2 (P0 Deep)
**Date:** 2026-04-11
**Sources:** GitHub org search, GitHub code search, npm registry, agentskills.io, Claude Code plugin marketplace, cursor-rules repos

---

## Primary question

Does Mintlify have a centralized, authoritative skills collection repo analogous to `kepano/obsidian-skills` (22,662 stars)?

## Verdict

**NOT FOUND at comparable scale.** A minimal Claude Code plugin exists (1 star, 1 skill). No community equivalent at any meaningful scale.

---

## Findings

### Finding: No centralized `mintlify-skills` repo exists

**Confidence:** CONFIRMED (negative result, exhaustive search)
**Evidence:**

| Search | Location | Result |
|---|---|---|
| "skill" repos in mintlify org | github.com/mintlify | No dedicated skills collection repo |
| "agent" repos in mintlify org | github.com/mintlify | No agent-skills aggregation repo |
| `SKILL.md` in mintlify org | GitHub code search | Found in `mintlify/docs` (docs about the feature) and `mintlify/mintlify-claude-plugin` (single skill) |
| `.claude-plugin/` in mintlify org | GitHub code search | Found only in `mintlify-claude-plugin` |
| `@mintlify/skills` | npm registry | NOT FOUND |
| `@mintlify/agent-skills` | npm registry | NOT FOUND |
| `mintlify-skills` | npm registry | NOT FOUND |

**Implication:** Mintlify's agent-format-distribution is purely per-site auto-generation — there is no centralized repo that teaches agents "how to author Mintlify docs" at the ecosystem level.

---

### Finding: `mintlify-claude-plugin` exists but is minimal (1 star)

**Confidence:** CONFIRMED
**Evidence:** `github.com/mintlify/mintlify-claude-plugin` contains:
- One skill (`skills/mintlify/SKILL.md`, ~8.7KB)
- Four reference files (`reference/api-docs.md`, `components.md`, `configuration.md`, `navigation.md`)
- Listed in `anthropics/claude-plugins-official` marketplace.json
- 1 GitHub star

**Implication:** This is a product-usage skill ("how to author docs on Mintlify"), not a format-teaching collection ("how to read/write Mintlify's formats"). It is 1 skill vs obsidian-skills' 5 skills. Scale comparison: 1 star vs 22,662 stars (~22,662× smaller).

---

### Finding: No community skills repos at meaningful scale

**Confidence:** CONFIRMED
**Evidence:**

| Community Repo | Stars | Nature |
|---|---|---|
| `evansso/mintlify-skills` | 0 | Community attempt, negligible traction |
| `ngrayluna/explore_mintlify_agent` | 0 | LLM investigation notebook, not a skills repo |

**Implication:** The community has not organically produced a Mintlify skills aggregation. Unlike Obsidian, where kepano's personal brand + 1.5M user base drove obsidian-skills to 22K stars in 95 days, Mintlify's B2B customer base has not generated an equivalent grassroots effort.

---

### Finding: agentskills.io has per-site Mintlify listings, not a centralized collection

**Confidence:** CONFIRMED
**Evidence:** `agentskills.so/skills/mintlify-docs-mintlify` exists — this is a per-site auto-generated listing from Mintlify's own docs site, following the discovery spec. It is not a curated collection.

**Implication:** The agentskills.io registry reflects Mintlify's auto-generation model. Each Mintlify customer site can register independently, but there is no umbrella `mintlify` skills package.

---

### Finding: No Mintlify entry in community cursor-rules repos

**Confidence:** CONFIRMED
**Evidence:**
- `PatrickJS/awesome-cursorrules` (5,300+ stars): No Mintlify entry found
- `sanjeed5/awesome-cursor-rules-mdc`: No Mintlify entry

**Implication:** Unlike the Obsidian ecosystem (which has cursor-rules via obsidian-skills), there is no community-curated Mintlify cursor rules set.

---

## Structural explanation

The absence of a centralized skills repo is not accidental — it reflects Mintlify's B2B platform model:

1. **Mintlify's customers don't need "how to read/write Mintlify format"** — they need "how to read/write THEIR product's docs." The auto-generated per-site skill.md serves this need directly.
2. **No CEO-scale community figure.** Mintlify's Han Wang is a founder-CEO of a B2B SaaS, not a personal-brand developer like kepano (Steph Ango) who can drive 22K stars from personal authority.
3. **B2B customers don't build community tooling.** Obsidian's 1.5M individual users generate community plugins, themes, and skills. Mintlify's ~3,000 business customers use the platform as infrastructure — they don't extend it.

---

## Negative searches (exhaustive)

| Search | Location | Result |
|---|---|---|
| `mintlify-skills` | npm | NOT FOUND |
| `@mintlify/skills` | npm | NOT FOUND |
| `@mintlify/agent-skills` | npm | NOT FOUND |
| `mintlify skills` repo | GitHub search (sorted by stars) | Only `evansso/mintlify-skills` (0 stars) |
| `mintlify agent` repo | GitHub search (sorted by stars) | No relevant results at scale |
| Mintlify in cursor-rules | awesome-cursorrules, awesome-cursor-rules-mdc | NOT FOUND |
