# Changelog

## 2026-04-05 — Add D8: Local _index.md as llms.txt-Compatible Format
**Update type:** Additive
**Why this pass happened:** User requested adding D8 dimension documenting how auto-generated `_index.md` files are structurally compatible with the llms.txt format, the spec's informal status, format alignment and divergences, the zero-work publishing bridge, per-section llms.txt landscape (Fern only), and the Hugo `_index.md` naming convention.

### Scope (delta only)
- D8: llms.txt spec informality (blog post, not W3C/IETF)
- D8: Exact format rules from llmstxt.org
- D8: Structural alignment between _index.md and llms.txt
- D8: Divergences (relative paths, per-folder, extra frontmatter) and why they are non-violations
- D8: Zero-transformation publishing bridge
- D8: Per-section llms.txt landscape (Fern is sole implementer)
- D8: Hugo _index.md vs index.md naming convention and dual-file design

### What changed (current-state)
- REPORT.md — sections touched: frontmatter (description expanded, subjects: +Hugo, topics: +llms.txt compatibility), executive summary key findings (added D8 bullet), rubric table (added D8 row), detailed findings (added full D8 section before Limitations), limitations (added D8 entry), references (added evidence file + 5 external sources)
- Evidence — added: `evidence/d8-local-index-llmstxt-compatibility.md`

### Notes on confidence / contradictions
- llms.txt spec informality: CONFIRMED from llmstxt.org and Answer.AI blog (no standards body involvement)
- Format rules: CONFIRMED from llmstxt.org primary source
- Structural alignment: CONFIRMED from format comparison (H1, blockquote, H2 lists all match)
- Divergences are non-violations: CONFIRMED from spec analysis (no prohibitions on relative paths, extra content, or subpath placement)
- Fern per-section llms.txt: CONFIRMED from Fern docs ("available at any level of your documentation hierarchy")
- Mintlify/GitBook root-only: CONFIRMED from their respective docs
- Hugo _index.md convention: CONFIRMED from Hugo official docs

### Open questions / gaps
- Whether agents consume per-section llms.txt files in practice (no usage data from Fern)
- Whether Mintlify or GitBook plan per-section llms.txt support
- Whether the llms.txt spec will formalize on a standards track

## 2026-04-05 — Add D7: Stripe's Instructions Pattern
**Update type:** Additive
**Why this pass happened:** User requested adding D7 dimension covering Stripe's `## Instructions for Large Language Model Agents` llms.txt pattern — how it works, who adopted it, behavioral impact, relationship to AGENTS.md/SKILL.md, and applicability to per-folder index.md files.

### Scope (delta only)
- D7: Stripe's Instructions Pattern — LLM steering instructions embedded in llms.txt

### What changed (current-state)
- REPORT.md — sections touched: frontmatter (description, subjects, topics), executive summary key findings (expanded Stripe bullet with D7 cross-ref), rubric table (added D7 row), detailed findings (added full D7 section before Limitations), limitations (added D7 entry), references (added evidence file + 8 external sources)
- Evidence — added: `evidence/d7-stripe-instructions-pattern.md`

### Notes on confidence / contradictions
- Stripe's instructions content is CONFIRMED from primary source (docs.stripe.com/llms.txt)
- Adoption survey (Cloudflare, Anthropic, Twilio, Vercel, Supabase) is CONFIRMED — none have instructions sections in llms.txt
- Behavioral impact is CONFIRMED as absent — no formal evaluations exist
- Per-folder index.md instructions applicability is INFERRED from structural analogy to CLAUDE.md nesting and .cursor/rules/ glob scoping

### Open questions / gaps
- Controlled evaluation of instructions section impact on agent output quality
- Whether per-folder instructions in knowledge bases measurably improve agent behavior
- Adoption trajectory — will other API companies follow Stripe's lead?

## 2026-04-05 — Add D2.1: AI Content Permissions Standards (IETF AIPREF, Content-Signal, CoMP)
**Update type:** Additive
**Why this pass happened:** User requested deepening D2 with a subsection on the IETF AIPREF working group, Content-Signal standards, IAB Tech Lab CoMP, contentsignals.org, and robots.txt extensions for AI.

### Scope (delta only)
- D2.1: IETF AIPREF WG charter, draft-ietf-aipref-vocab-05, draft-ietf-aipref-attach-04
- D2.1: Cloudflare Content-Signal vs IETF Content-Usage naming divergence
- D2.1: draft-romm-aipref-contentsignals-00 (Cloudflare IETF submission, expired)
- D2.1: contentsignals.org (Cloudflare-run guide/generator)
- D2.1: IAB Tech Lab CoMP v1.0 (commercial negotiation protocol)
- D2.1: Three-layer permissions model (vocabulary, attachment, commercial)
- D2.1: Implications for S-L2 publishing platforms

### What changed (current-state)
- REPORT.md — sections touched: frontmatter (subjects: IETF AIPREF, IAB Tech Lab, CoMP; topics: AI content permissions standards), D2 section (appended D2.1 subsection), D5 Permissions layer (updated standard name), references (added 11 external sources)
- Evidence — edited-in-place: `evidence/d2-content-negotiation.md` (appended Standards Landscape section with 9 findings)

### Notes on confidence / contradictions
- IETF AIPREF charter, drafts, milestones: CONFIRMED from IETF Datatracker primary sources
- Timeline slip (Aug 2025 to Aug 2026): CONFIRMED from milestone comparison
- Cloudflare Content-Signal naming divergence from IETF Content-Usage: CONFIRMED from primary drafts
- draft-romm-aipref-contentsignals expired and not WG-adopted: CONFIRMED from Datatracker
- IAB Tech Lab CoMP v1.0 spec details: CONFIRMED from GitHub spec + press release
- Three-layer model (vocab/attach/commercial): INFERRED from synthesis of all three standards tracks
- `ai-input` gap (Cloudflare defines it, IETF does not): CONFIRMED from vocab v05 comparison

### Open questions / gaps
- Whether IETF vocab will add an `ai-input` equivalent (RAG/grounding permissions)
- Whether Cloudflare will migrate Content-Signal naming to align with IETF Content-Usage when finalized
- CoMP post-comment-period status and adoption trajectory
- No evidence of any AI system respecting Content-Signal or Content-Usage in practice
- EU AI Act / DSA regulatory pressure on these standards (not investigated)
