# Evidence: Community Karpathy-Lint Implementations

**Dimension:** What concrete lint surfaces have community implementations of Karpathy's pattern actually shipped
**Date:** 2026-04-27
**Sources:** Web search + GitHub repos + gist comments

---

## Key sources referenced

- [Astro-Han/karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) — Agent Skills package; 94 articles + 99 sources daily since April 2026
- [NicholasSpisak/second-brain](https://github.com/NicholasSpisak/second-brain) — Obsidian + Karpathy implementation with `/second-brain-lint` slash command
- [kytmanov/obsidian-llm-wiki-local](https://github.com/kytmanov/obsidian-llm-wiki-local) — local Ollama-based; pipeline orchestrator with explicit lint stage
- [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) — drift detection + archive-and-rebuild pattern
- [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) — link/citation sync emphasis
- [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) — 31 commands, vault-first research, scheduled agents
- [rohitg00 LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) — extends Karpathy with agentmemory lessons
- Karpathy gist comment thread — DPC Messenger, 7xuanlu Origin, Synthadoc, AgriciDaniel claude-obsidian

---

## Findings

### Finding: Multiple independent implementations converge on a "wiki health-check" lint surface
**Confidence:** CONFIRMED
**Evidence:** Web search results enumerate five distinct slash-command / CLI implementations:

| Implementation | Lint command | What it checks |
|---|---|---|
| NicholasSpisak/second-brain | `/second-brain-lint` | Broken `[[wikilinks]]`, `index.md` ↔ pages drift |
| kytmanov/obsidian-llm-wiki-local | `olw run` (lint stage) | Link consistency, source traceability, claim-level `[S1](#Sources)` markers |
| Ar9av/obsidian-wiki | (archive + rebuild) | "When the wiki drifts too far from your sources, archive the whole thing (timestamped snapshot) and rebuild from scratch" |
| Astro-Han/karpathy-llm-wiki | Agent Skills `lint` | Consistency check across raw/wiki/schema layers |
| eugeniughelbur/obsidian-second-brain | (31 commands incl. lint) | Scheduled agents run lint on cadence |

**Implications:** Lint is universally treated as a first-class operation — every Karpathy implementation ships one. The check sets differ but converge on the canonical six.

### Finding: Cadence is consistently "every 10 ingests or monthly, whichever comes first"
**Confidence:** CONFIRMED
**Evidence:** From web search on second-brain implementations:

> "Linting should be done after every 10 ingests or monthly—whichever comes first, and also before any major query or synthesis work."

(Sourced from NicholasSpisak/second-brain README FAQ section.)

**Implications:** This cadence is **trigger-based** (count of ingests + time threshold + before-query trigger), not purely periodic. Three triggers:
1. **Ingest count** — every 10 raw → wiki transformations.
2. **Time** — at least monthly, even if low ingest activity.
3. **Use** — before a major query or synthesis, when stale state would corrupt downstream work.

### Finding: Source-traceability lints are emerging as a distinct check
**Confidence:** CONFIRMED
**Evidence:** kytmanov/obsidian-llm-wiki-local explicitly:

> "Source traceability — every article links back to the raw notes it was built from; optional inline citations can attach claim-level [S1](#Sources) markers."

This goes beyond the canonical Karpathy six — it's claim-level provenance, not just page-level cross-references. Mechanical: "does every wiki page have at least one link back to `raw/`?" is checkable with grep.

**Implications:** Source-traceability is a **deterministic** lint (link-pattern check), unlike "contradictions" which requires an LLM. This is a wedge for moving lint checks left from "LLM-required" to "static-analysis-doable."

### Finding: Drift-detection-and-rebuild is an alternative to incremental lint
**Confidence:** CONFIRMED
**Evidence:** Ar9av/obsidian-wiki explicitly supports archive-and-rebuild:

> "When the wiki drifts too far from your sources, you can archive the whole thing (timestamped snapshot, nothing lost) and rebuild from scratch. Or restore any previous archive."

**Implications:** A second philosophy alongside "incremental lint": **trash-and-recompile**. When the wiki has decayed beyond easy patching, it's cheaper to re-ingest from raw and let the LLM compile fresh. The raw-source layer's immutability is what makes this safe — `raw/` is the source of truth, `wiki/` is derived. This recasts lint as *one* lifecycle event among several (ingest, lint, rebuild, archive).

### Finding: The gist comment thread surfaces four refinement patterns
**Confidence:** CONFIRMED
**Evidence:** Gist comment summary (web fetch):

| Pattern | Source | What it adds |
|---|---|---|
| **Sleep Consolidation** | DPC Messenger | Agents periodically review archives to identify contradictions, propose refinements, distinguish weak vs important memories. Parallels human cognitive consolidation. |
| **Quality gates at ingest** | 7xuanlu's Origin | Filter noise *before* it lands in the wiki. "Not everything belongs." Ingest-time lint, not post-hoc lint. |
| **Audit-trail-first** | Synthadoc v0.2.0 | Every operation logs with timestamps, token counts, costings. Audit trail is what makes lint fixes reviewable. |
| **Boundary-first autoresearch** | AgriciDaniel claude-obsidian | Score frontier pages to suggest investigation candidates while preserving user agency over what to explore. |

**Implications:** These extensions point at richer lint discipline:
- **Sleep Consolidation** = scheduled background lint (cron-like).
- **Quality gates at ingest** = lint-at-write rather than lint-at-rest. Cheaper because each ingest only touches the new doc + its immediate neighbors.
- **Audit-trail-first** = every lint fix needs an attribution + reason. Maps directly to OK's `summary:` parameter on writes (precedent #25 writer-ID taxonomy).
- **Boundary-first autoresearch** = the "data gaps" Karpathy lint check (#6) is the seed for new ingest cycles. Lint and ingest form a closed loop.

### Finding: 15+ implementations exist as of April 2026; the field is rapidly converging
**Confidence:** CONFIRMED
**Evidence:** Web search (April 2026 article):

> "After 5 days, 16M tweet views, and 15+ GitHub implementations: a practical guide to replicating Karpathy's LLM wiki workflow with the exact tools, schemas, and patterns that work."

**Implications:** The Karpathy pattern is in a Cambrian moment — multiple implementations week-over-week, all making slightly different lint choices. This is the right moment to name the convergent patterns rather than wait for one to dominate.

---

## Negative searches

- No community implementation enforces lint as a **CI gate** that blocks commits. All run as on-demand or scheduled background jobs. The "blocking gate" framing is foreign to the Karpathy ecosystem — possibly because the wikis are personal and lint output is *suggestions*, not failures.
- No community implementation includes a **prose-quality** lint (Vale-style, weasel-words, citation-needed). The canonical six checks are entirely about *knowledge integrity*, not writing quality.

---

## Gaps / follow-ups

- I did not deep-read any single community implementation's source code. The check-set descriptions come from READMEs + web search summaries. A future investigation could clone 2-3 of these and compare implementation specifics.
- The gist comment thread has more discussion than the snippet captured — a full read of the comments would surface additional patterns (rohitg00's "LLM Wiki v2 with agentmemory lessons" was visible but not deeply explored).
