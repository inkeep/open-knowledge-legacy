# Evidence: Karpathy's Canonical Knowledge-Linting Model

**Dimension:** What does Karpathy's gist actually prescribe for lint, and what's the surrounding model
**Date:** 2026-04-27
**Sources:** Karpathy's LLM Wiki gist (raw fetch + prior-report verbatim extraction)

---

## Key sources referenced

- [karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Karpathy's LLM Wiki idea file (verbatim)
- `reports/open-knowledge-prior-art-eight-sources/evidence/d8-karpathy-gist.md` — prior verbatim extraction in this repo

---

## Findings

### Finding: Karpathy's framework is three layers × three operations
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote (verbatim, prior-report extracted):

> "There are three layers:
> **Raw sources** — your curated collection of source documents. Articles, papers, images, data files. These are immutable — the LLM reads from them but never modifies them. This is your source of truth.
> **The wiki** — a directory of LLM-generated markdown files. Summaries, entity pages, concept pages, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates pages, updates them when new sources arrive, maintains cross-references, and keeps everything consistent. You read it; the LLM writes it.
> **The schema** — a document (e.g. CLAUDE.md for Claude Code or AGENTS.md for Codex) that tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the wiki."

Three operations: **Ingest**, **Query**, **Lint**.

**Implications:**
- Each layer has a different write discipline, so lint rules differ by layer.
- The schema layer (`CLAUDE.md` / `AGENTS.md`) is itself authored prose — it can rot like any other doc.

### Finding: Karpathy's six canonical lint checks
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote on the Lint operation:

> "**Lint** — Periodically, ask the LLM to health-check the wiki. Look for:
> - contradictions between pages,
> - stale claims that newer sources have superseded,
> - orphan pages with no inbound links,
> - important concepts mentioned but lacking their own page,
> - missing cross-references,
> - data gaps that could be filled with a web search.
> The LLM is good at suggesting new questions to investigate and new sources to look for. This keeps the wiki healthy as it grows."

**Implications:** This is the canonical taxonomy. Five of the six checks are about **inter-page knowledge integrity**, not about prose style or markdown formatting. Only "orphan pages" and "missing cross-references" are mechanically checkable; the rest require LLM judgment.

### Finding: The two special files — `index.md` and `log.md` — are part of the lintable surface
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote:

> "**index.md** is content-oriented. It's a catalog of everything in the wiki — each page listed with a link, a one-line summary, and optionally metadata like date or source count. Organized by category (entities, concepts, sources, etc.). The LLM updates it on every ingest."

> "**log.md** is chronological. It's an append-only record of what happened and when — ingests, queries, lint passes."

**Implications:** Lint rules can include "is `index.md` consistent with the actual wiki contents" — a **mechanically detectable** check (just diff the index against `ls`). Several community implementations make this a first-class lint check (see `community-implementations.md`).

### Finding: The lint loop produces follow-up work, not pass/fail
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote:

> "The LLM is good at suggesting new questions to investigate and new sources to look for. This keeps the wiki healthy as it grows."

The output of lint is a list of **knowledge-acquisition tasks** ("research X", "ingest Y", "create page for Z"), not a binary CI result.

**Implications:** Lint in Karpathy's framework is **generative** — it surfaces what the wiki doesn't yet know. A pass/fail gate is not the right shape; an issue tracker is.

### Finding: The "compounding wiki" framing is the *reason* lint matters
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote:

> "The wiki is a persistent, compounding artifact. The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read."

> "Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero."

**Implications:** Lint is the *mechanism* by which "the wiki keeps getting richer." Without it, the wiki accumulates without compounding — sources land in `raw/`, summaries land in `wiki/`, but the cross-references and contradiction-flagging that make it valuable degrade. **The tradeoff is not "lint vs no-lint" — it's "lint vs gradual abandonment."**

### Finding: Karpathy explicitly leaves implementation abstract
**Confidence:** CONFIRMED
**Evidence:** Direct gist quote:

> "This document is intentionally abstract. It describes the idea, not a specific implementation. [...] The right way to use this is to share it with your LLM agent and work together to instantiate a version that fits your needs."

**Implications:** Every concrete lint implementation is an interpretation. Multiple community implementations now exist (see `community-implementations.md`); convergent patterns across them are stronger signal than any single one.

---

## Gaps / follow-ups

- The gist does not specify **cadence** — how often to lint. Community implementations have converged on "after every 10 ingests or monthly, whichever comes first" (see `community-implementations.md`).
- The gist does not address **layer-specific** lint rules (different rules for `raw/` vs `wiki/` vs schema). This is implicit in the layer descriptions but not enumerated.
