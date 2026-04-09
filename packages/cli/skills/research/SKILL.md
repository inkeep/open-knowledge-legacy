---
name: research
description: Analyze a topic by gathering external sources via /ingest, reading them alongside existing wiki content, and writing provisional findings to .openknowledge/research/. Not canonical — for exploratory analysis and trade-off exploration.
---

# /research — Analyze a Topic

Gather sources, read them, and write provisional findings to `.openknowledge/research/`.

## When to use

- Developer asks you to research a topic (e.g., "research CRDT alternatives for our editor")
- Exploring a decision space before committing to an approach
- Spec conversations and exploratory work that isn't ready to be canonical yet
- When you need to synthesize multiple sources into a structured analysis

## Principle: provisional, not canonical

Research articles are **provisional**. They capture findings, trade-offs, and open questions at a point in time. They are not the source of truth — that's what `articles/` is for. When decisions solidify, research gets promoted to `articles/` via `/consolidate` (or manually).

## Steps

### 1. Scope the research

Understand what the developer is asking:

- What specific question needs answering?
- What's the decision this research will inform?
- What's already known (check `.openknowledge/articles/` and `.openknowledge/research/` first)?

If there's existing research on the topic, read it before starting fresh.

### 2. Gather sources via /ingest

Call `/ingest` on each relevant URL, paper, or document. This saves raw content to `.openknowledge/external-sources/` for reference. Typical research pulls 3-8 sources.

Don't skip `/ingest`. Sources must be preserved raw before analysis — it separates concerns (capture vs. interpretation) and makes the research reproducible.

### 3. Read and analyze

Read each ingested source carefully. Also read:

- Any existing wiki articles on the topic (`articles/`)
- Relevant source code (for projects where research is grounded in the codebase)
- Prior research articles on adjacent topics

Take notes on:

- **Key claims** and their evidence
- **Trade-offs** between options
- **Contradictions** between sources
- **Unknowns** and open questions
- **Relevance** to the specific decision at hand

### 4. Write the research article

Save to `.openknowledge/research/` (or the path configured in `config.yaml`). Use a descriptive, kebab-case filename: `crdt-alternatives-for-editor.md`.

Structure:

```yaml
---
title: CRDT Alternatives for the Editor
description: Comparison of Yjs, Automerge, and Loro for real-time collaboration
status: provisional
date: 2026-04-09
tags:
  - crdt
  - architecture
  - research
sources:
  - external-sources/yjs-docs.md
  - external-sources/automerge-docs.md
  - external-sources/loro-docs.md
---

## Question

[What specific question is this research answering?]

## Context

[Why does this matter? What decision does it inform?]

## Findings

[Main findings organized by theme, option, or criterion]

### Option A

- Pros
- Cons
- Evidence (with source links)

### Option B

...

## Trade-offs

[What you gain vs. lose with each option]

## Open questions

[What you still don't know — these are candidates for further research or prototyping]

## Tentative recommendation

[Your best guess, clearly marked as tentative]
```

### 5. Mark it provisional

- Set `status: provisional` in frontmatter
- Use language like "tentative", "initial findings", "based on current understanding"
- Do NOT write research articles as if they were canonical — that's misleading

### 6. Verify

- File exists in `.openknowledge/research/`
- Has frontmatter with `title`, `description`, `status: provisional`, and `sources` list
- `research/INDEX.md` catalog picks up the new entry automatically
- Linked external sources exist in `.openknowledge/external-sources/`

## Non-goals

- **Don't promote to `articles/`** — that's `/consolidate` after the team decides
- **Don't hide uncertainty** — research is where uncertainty lives; be explicit about what you don't know
- **Don't skip `/ingest`** — always capture raw sources first, then analyze
- **Don't overwrite existing research** — if the topic was researched before, create a new article (e.g., `crdt-alternatives-2.md`) or clearly supersede the old one
