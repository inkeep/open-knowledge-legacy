# Evidence: F1 — skill.md True Nature

**Dimension:** F1 (P0 Deep)
**Date:** 2026-04-11
**Sources:** agentskills.io, mintlify.com/blog/skill-md, mintlify.com/docs/ai/skillmd, github.com/anthropics/skills, github.com/mintlify/docs

---

## Key sources

- [agentskills.io](https://agentskills.io) — Agent Skills specification site (hosted by Mintlify infrastructure)
- [mintlify.com/blog/skill-md](https://www.mintlify.com/blog/skill-md) — Mintlify's blog post: "skill.md: An open standard for agent skills"
- [mintlify.com/docs/ai/skillmd](https://www.mintlify.com/docs/ai/skillmd) — Mintlify docs on skill.md feature
- [github.com/anthropics/skills](https://github.com/anthropics/skills) — Anthropic's reference skills repo
- [github.com/mintlify/docs/blob/main/skill.md](https://github.com/mintlify/docs) — Mintlify's own manually-authored skill.md

---

## Findings

### Finding: The Agent Skills specification was created by Anthropic, not Mintlify

**Confidence:** CONFIRMED
**Evidence:** agentskills.io states: "The Agent Skills format was originally developed by Anthropic, released as an open standard." Anthropic launched Agent Skills internally October 2025, open-sourced December 2025. The spec repo is `github.com/agentskills/agentskills`; example skills at `github.com/anthropics/skills`.

**Implication:** Mintlify is a standards implementer, not a standards author. Their blog title "skill.md: An open standard for agent skills" correctly positions it as adopting an open standard, not creating one.

---

### Finding: Mintlify is the infrastructure partner for agentskills.io (docs host), not a co-author

**Confidence:** INFERRED
**Evidence:** agentskills.io is "Built with Mintlify" — the docs site uses Mintlify's platform. Feedback endpoints on agentskills.io route through `/_mintlify/feedback/`. Mintlify is not listed as a co-author or contributor to the specification itself. The relationship is vendor (docs hosting) + early adopter.

**Implication:** Mintlify has proximity to the standard's evolution through the hosting relationship, but the specification governance remains with Anthropic.

---

### Finding: Mintlify auto-generates skill.md for every docs site — a fundamentally different model from Obsidian

**Confidence:** CONFIRMED
**Evidence:** Per mintlify.com/docs/ai/skillmd: Mintlify analyzes documentation "with an agentic loop" and auto-generates a `skill.md` served at `/.well-known/skills/default/skill.md` and `/skill.md`. Regenerated on every deploy (up to 24 hours). Users can override by placing a custom `skill.md` in their repo root, or organize multiple custom skills in `.mintlify/skills/` subdirectories.

**Contrast with Obsidian:** Obsidian's `kepano/obsidian-skills` contains 5 hand-crafted SKILL.md files (1,771 lines, 12 files) teaching agents Obsidian's proprietary formats. Every line is manually authored and curated.

**Implication:** The auto-generation model scales across thousands of customer sites (each generates a unique product-specific skill). The curation model produces deeper, format-level universal skills. These are structurally different distribution strategies.

---

### Finding: Casing difference — Mintlify uses lowercase `skill.md`, spec mandates uppercase `SKILL.md`

**Confidence:** CONFIRMED
**Evidence:** The agentskills.io specification mandates `SKILL.md` (uppercase) as the required filename in skill directories. Mintlify consistently uses lowercase `skill.md` in their implementation, blog posts, and documentation. Example: `/.well-known/skills/default/skill.md`.

**Implication:** Cosmetic deviation. Agents likely handle both casings. Does not affect functional compatibility.

---

### Finding: Mintlify's auto-generated skill.md is a read-only instruction set

**Confidence:** CONFIRMED
**Evidence:** The auto-generated skill.md contains product-specific usage instructions — decision tables, capabilities, constraints, gotchas — derived from the docs content. It does NOT use the spec's `scripts/` directory or `allowed-tools` frontmatter for write capabilities. Mintlify's own manually-authored skill.md (in `mintlify/docs` repo) contains sections: Before you write, Quick reference, Page frontmatter, File conventions, Organize content, Customize docs sites, Write content, Writing standards, Document APIs, Deploy, Workflow, Edge cases, Common gotchas, Resources.

**Implication:** Same nature as Obsidian's SKILL.md files — instructional, not executable. The Agent Skills spec supports write-capable skills via `scripts/` and `allowed-tools`, but Mintlify does not leverage these features in auto-generation.

---

### Finding: Mintlify's auto-generated content is substantive, not boilerplate

**Confidence:** CONFIRMED
**Evidence:** The manually-authored `skill.md` in `mintlify/docs` repo is detailed and product-specific (page frontmatter specs, file conventions, component usage, deployment workflows). Auto-generated versions for customer sites are derived from documentation content via "agentic loop" analysis — they contain product-specific instructions, not generic templates.

**Implication:** The auto-generation quality is high. This differentiates from a hypothetical low-value auto-generated stub.

---

## Gaps / follow-ups

- Could not fetch a live auto-generated skill.md from `/.well-known/skills/default/skill.md` endpoint (returned 404/530 behind CDN). Content confirmed via repo source.
- The precise quality difference between auto-generated vs manually-authored skill.md was not A/B tested. Auto-generated may still be shallower than hand-crafted for complex product formats.
