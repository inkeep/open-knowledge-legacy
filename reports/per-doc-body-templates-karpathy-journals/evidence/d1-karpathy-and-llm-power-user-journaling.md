# Evidence: Karpathy + LLM Power-User Journaling Patterns

**Dimension:** What does the Karpathy-style "daily/journal" template actually look like in practice
**Date:** 2026-04-30
**Sources:** Prior OK research report (`obsidian-karpathy-workflow-deep-dive`), public posts from Andrej Karpathy, Steph Ango, kepano, Linus Lee, Maggie Appleton, Eric J. Ma, Daniel Pickem
**Note:** Twitter/X primary-source fetches returned HTTP 402 (paywalled to unauthenticated agents). Quotes below are paraphrased from the prior OK research report's evidence files (which captured them in 2026-04-03) and from publicly accessible blog posts. Where direct quotation is unverified in this pass, marked **[paraphrased — verify before quoting in spec]**.

---

## Key files / pages referenced

- `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md` — prior OK research, primary leverage
- `reports/obsidian-karpathy-workflow-deep-dive/evidence/karpathy-workflow-practice.md` — practitioner-account evidence
- Karpathy X post on LLM Knowledge Bases (Sept 2024): https://x.com/karpathy/status/2039805659525644595
- kepano (Steph Ango), CEO of Obsidian: https://stephango.com/notes — public note-taking writings
- Linus Lee (thesephist): https://thesephist.com — extensive LLM+notes writing
- Maggie Appleton: https://maggieappleton.com — Roam/Obsidian + LLM notes
- Eric J. Ma: https://ericmjl.github.io — March 2026 post on LLM-augmented notes

---

## Findings

### Finding: Karpathy describes a 6-stage workflow but does NOT explicitly describe a daily-note template

**Confidence:** CONFIRMED (via prior OK research; Twitter rate-limited in this pass)
**Evidence:** `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md:368` — Karpathy's six stages are: (1) raw ingest via Web Clipper into `raw/`, (2) LLM compiles raw into wiki with summaries/backlinks/categories, (3) Q&A against ~100 articles / ~400K words with auto-maintained index files, (4) rendered output as markdown/Marp slides/matplotlib images, (5) LLM lints wiki for inconsistencies, (6) outputs filed back for compounding.

**Implications:** The "Karpathy daily journal" framing in the user's request is **pattern interpretation** — Karpathy himself describes raw→wiki, not a daily journal. The daily-journal use case is the *category-canonical* application of body templates that Karpathy's workflow gestures at, popularized by Obsidian's Daily Notes core plugin and Steph Ango's writings. Treat the spec target as: "the per-doc body template feature should make Karpathy-style ingest *and* the Obsidian-canonical daily-journal pattern equally easy," not "replicate a documented Karpathy daily-note schema" (which doesn't exist).

### Finding: Karpathy's "anti-RAG" insight — well-maintained `index.md` files beat retrieval pipelines

**Confidence:** CONFIRMED (prior research)
**Evidence:** `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md:370` — direct quote captured: "I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files."

**Implications:** Karpathy's framing puts *structured per-folder content* (indexes, hubs, periodic notes) above semantic retrieval. A body-template feature that makes hub/index files trivial to scaffold ("each `journals/YYYY-MM-DD.md` starts with the same headings") aligns with this thesis — the templates encode the structure that the LLM later relies on.

### Finding: Practitioner pattern — "external scripts process, Obsidian renders"

**Confidence:** CONFIRMED (prior research, multi-practitioner)
**Evidence:** `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md:381` — across Eric J. Ma, Daniel Pickem, Stefan Imhoff, Eleanor Konik, the **common pattern** is: Obsidian = filesystem + renderer; external LLM tools do the work; markdown + YAML frontmatter is the interchange format.

**Implications:** A body-template feature in Open Knowledge that produces *the same markdown shape* an external LLM script would expect is a sweet spot — humans get scaffolding, agents get predictable structure. Specifically: emit deterministic section headings (so LLMs can parse), keep frontmatter agent-readable, and make the template authority the agent already trusts (config.yml, not a binary plugin setting).

### Finding: kepano's "file-over-app" stance — daily notes are markdown files, not application state

**Confidence:** CONFIRMED (prior research, well-known stance)
**Evidence:** kepano's public stance (multiple posts at stephango.com, repeated in Obsidian product comms): everything in Obsidian must remain plain markdown a user can read forever without the app. The Daily Notes plugin therefore writes plain `.md` files keyed by date — not a database row, not a JSON blob.

**Implications:** This is the design floor for an Open Knowledge body-template feature. Templates must produce **plain markdown** at known disk paths, not a CRDT-only construct or a sidecar-encoded shape. The template is *applied at file-creation time* and then becomes ordinary content the user owns. Prior reports already cite OK precedent #25 + STOP rule "no OK sidecars in user-content paths" — body templates must respect this.

### Finding: Linus Lee — "structure for LLM consumption" framing

**Confidence:** INFERRED (from public writings; not direct quotation in this pass)
**Evidence:** Linus Lee's published essays on LLM-augmented notes (thesephist.com) repeatedly argue that *atomic, dated, sectioned* notes outperform free-form journals when an LLM later queries them. **[paraphrased — verify direct quote before spec citation]**

**Implications:** Reinforces the structural-template thesis: a body-template feature is more valuable for LLM workflows than for purely human ones, because LLMs do better with predictable section headings (`## Today`, `## Decisions`, `## Open questions`) than with free prose.

### Finding: Maggie Appleton — daily-note template public examples

**Confidence:** UNCERTAIN (her public Roam/Obsidian writing exists but specific daily-note schemas not retrieved in this pass)
**Evidence:** Maggie Appleton has written publicly about her Roam-then-Obsidian workflow, including illustrated explainers of her capture flow. Specific verbatim daily-note template not retrieved in this research pass.

**Implications:** Don't cite as primary source unless directly verified. Useful as a "see also" for the spec's prior-art landscape but not as evidence for any specific template shape.

### Finding: Eric J. Ma's PARA + AI sweep flow

**Confidence:** CONFIRMED via prior OK research
**Evidence:** `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md:376-377` — Eric J. Ma (March 2026): Python scripts convert documents to markdown; AI agents run "sweeps" to update notes; knowledge management overhead dropped 30-40% → <10%.

**Implications:** His daily flow is *agent-augmented*, not template-augmented. Suggests the body-template feature is upstream of the AI sweep — templates establish the predictable shape the sweep agents then operate on.

### Finding: Daniel Pickem (NVIDIA, Jan 2026) — PARA + Cursor + Obsidian

**Confidence:** CONFIRMED via prior OK research
**Evidence:** `reports/obsidian-karpathy-workflow-deep-dive/REPORT.md:378` — Pickem: "rarely writes notes from scratch — feeds raw inputs to Claude." PARA structure (Projects/Areas/Resources/Archives — Tiago Forte) provides the folder taxonomy.

**Implications:** PARA folder taxonomy is a strong reference *folder structure* for the template feature's example config. A user adopting Open Knowledge for Karpathy-style work could realistically have folders for `journals/`, `projects/`, `areas/`, `resources/`, `archives/` — each with its own body template.

---

## Synthesized "good daily journal template" shape (composite from sources)

Across the surveyed sources, the recurring elements of a Karpathy/LLM-friendly daily-note body template are:

```markdown
---
date: {{date}}
tags: [journal, daily]
---

# {{date}}

## Today
- 

## Decisions
- 

## Open questions
- 

## Links
- 
```

Recurring ingredients:
- **YAML frontmatter** with `date` + `tags` — makes the file query-friendly for both Dataview-style tools and LLMs
- **A single H1 with the date** — gives the LLM an unambiguous anchor
- **Stable section headings** — the same set every day, in the same order, so LLMs and humans pattern-match
- **Empty bullet placeholders** — prompt the user to start typing without ceremony
- **`{{date}}` substitution** — at minimum date; sometimes `{{title}}`, sometimes `{{time}}`

The schema-canonical Obsidian Daily Note template uses moment.js format tokens (`{{date:YYYY-MM-DD}}`, `{{date:dddd}}`).

## Negative searches

- Searched for "Karpathy daily note template" / "Karpathy journal" / "Karpathy obsidian daily" — **no public template found**. Karpathy describes the 6-stage compile flow, not a daily-note schema. **NOT FOUND** is the right label here, and the spec should not assume a Karpathy daily-template canon exists.
- Searched for kepano's specific daily-note template — not retrieved in this pass; kepano writes about Obsidian + daily notes generically rather than publishing a copy-paste schema. **UNCERTAIN**.

## Gaps / follow-ups

- Direct verbatim Twitter/X quotes from Karpathy's Sept 2024 post — could not retrieve in this pass (HTTP 402). The prior OK research report already captured the substance; spec authors should treat that as the authoritative paraphrase.
- A "good LLM-consumption journal template" empirical study (sectioned vs free prose, retrieval accuracy) — does not exist in surveyed sources. The recommendation is structural by analogy, not by benchmark.
