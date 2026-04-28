# Evidence: Tooling Landscape

**Dimension:** What tools exist for each lint check; what's deterministic vs LLM-required; what gaps remain
**Date:** 2026-04-27
**Sources:** Web search; this repo's existing reports; community implementation READMEs

---

## Findings

### Finding: Static link-checkers are a mature category
**Confidence:** CONFIRMED
**Evidence:** Web search results:

| Tool | Language | Use | Maturity |
|---|---|---|---|
| [lychee](https://github.com/lycheeverse/lychee) | Rust, async | Markdown, HTML, plain text — internal + external | Production; "576 links in ~1 minute" |
| [lychee-action](https://github.com/lycheeverse/lychee-action) | GitHub Action | CI gate, can fail PRs on broken links | Production |
| [markdown-link-check](https://github.com/tcort/markdown-link-check) | Node | Markdown only | Older, slower than lychee |
| [hyperlink](https://github.com/untitaker/hyperlink) | Rust | "Very fast link checker for CI" | Production |
| [linaro-its/jekyll-link-checker](https://github.com/linaro-its/jekyll-link-checker) | Ruby/Jekyll | Static-site internal+external | Niche |

**Implications:** Dead-link detection (check #7) is a **solved problem with a CI-gate-ready Rust tool** (lychee). It's the easiest knowledge-lint check to add to any pipeline. lychee-action specifically supports failing PRs on broken links — making it a deterministic gate, not an advisory.

### Finding: Wikipedia + Internet Archive solved external-URL rot at scale
**Confidence:** CONFIRMED
**Evidence:** [More than 9 million broken links on Wikipedia rescued](https://blog.archive.org/2018/10/01/more-than-9-million-broken-links-on-wikipedia-are-now-rescued/):

> "Wikipedia has successfully used IABot to edit and fix the URLs of nearly 6 million external references that would have otherwise returned a 404 [...]. Members of the Wikipedia community have fixed more than 3 million links individually, resulting in more than 9 million URLs pointing to archived resources from the Wayback Machine and other web archive providers."

The pattern: **archive-on-cite**. Every external URL gets a Wayback snapshot at citation time; if the live URL rots, the archive URL serves as fallback.

**Implications:** External URL rot has a **deterministic** mitigation pattern (archive-on-ingest), independent of any LLM. Knowledge linting in a Karpathy KB could automate this: every `ingest` operation also Wayback-snapshots `source_url` and stores the archive URL in frontmatter. Then lint check #7 becomes: "for every dead `source_url`, is there a working archive URL?"

### Finding: Academic citation rot is a recognized "fundamental" problem
**Confidence:** CONFIRMED
**Evidence:** [Spellbound Blog — Margolis on legal citation rot](https://www.spellboundblog.com/2018/12/29/chapter-4-link-rot-reference-rot-and-the-thorny-problems-of-legal-citation-by-ellie-margolis/):

> "Link and reference rot call into question the very foundation on which legal analysis is built [...] when a source becomes unavailable due to link rot, it is as though a part of the opinion disappears."

**Implications:** The Karpathy "raw sources" layer is *meant* to mitigate this — by preserving source content locally rather than citing live URLs. But: the local copy can drift from the original, and the original can update without the local copy noticing. A **source-integrity lint** (compare local raw file's content hash against the live URL's current content) is a check no surveyed system implements.

### Finding: Wikipedia has 153 quality labels; "Citation needed" is the *hardest* category to automate
**Confidence:** CONFIRMED
**Evidence:** [WikiSQE: Wikipedia Sentence Quality Estimation](https://arxiv.org/html/2305.05928):

> "WikiSQE is the first large-scale dataset for sentence quality estimation in Wikipedia, extracting about 3.4 million sentences with 153 quality labels."
>
> "Sentences that had problems with citation, syntax/semantics, or propositions were found to be more difficult to detect."
>
> "Automated models outperformed non-experts unfamiliar with editing Wikipedia by learning from expert-generated data, except for the 'Citation needed' label."

**Implications:**
- The empirical evidence from 3.4M sentences is that **automated detection of "needs a source" is the hardest content-quality check**, even with abundant training data.
- This is empirical grounding for the position that **closed-loop grounding cannot be deterministically enforced** — it has to be agent-discipline + human review, not a static gate.
- Other quality categories (Weasel words, Peacock, Puffery) are more tractable for automation but are out of scope for the Karpathy frame.

### Finding: Andy Matuschak's evergreen-notes practice substitutes hygiene for explicit lint
**Confidence:** CONFIRMED
**Evidence:** [Evergreen notes should be densely linked](https://notes.andymatuschak.org/Evergreen_notes_should_be_densely_linked):

> "When you add lots of links between notes, it makes you think expansively about related concepts and creates pressure to think carefully about how ideas relate to each other. Finding the right links requires reading old notes, so it's an organic mechanism for intermittently reviewing notes, which approximates spaced repetition."

**Implications:** Matuschak's discipline replaces explicit lint with **structural pressure** — by mandating dense linking, the act of writing forces re-reading and refactoring. No formal "lint" pass; the maintenance is interleaved with authoring. **This is the Karpathy gist's bet too**: lint is the *exception*; the LLM's per-ingest "touch 10-15 pages" pass is the *rule*. Structural hygiene at write time obviates much post-hoc lint.

### Finding: Digital-garden static linters exist but are scoped to link/index integrity
**Confidence:** CONFIRMED
**Evidence:**
- [linaro-its/jekyll-link-checker](https://github.com/linaro-its/jekyll-link-checker) — broken internal/external links.
- [Jekyll Part 14: Validating Links and Images](https://digitaldrummerj.me/jekyll-validating-links-and-images/) — tutorial scope.
- [Maggie Appleton — digital-gardeners](https://github.com/MaggieAppleton/digital-gardeners) — resources index, no integrated linter.

None cover semantic dimensions (contradictions, stale claims, lost nuance). All are scoped to link integrity + image-resolution checks.

**Implications:** The static-analysis side of knowledge lint has tooling (lychee, jekyll-link-checker, hyperlink). The semantic side has *no tools* — it is exclusively LLM-judgment territory.

### Finding: Mapping every check to "what tool would do it today"
**Confidence:** INFERRED
**Evidence:** Synthesis of the 16-check taxonomy against surveyed tooling:

| Check | Existing tool | LLM required? | Notes |
|---|---|---|---|
| 1. Contradictions | none | ✅ yes | LLM compares page pairs |
| 2. Stale claims | timestamp diff (deterministic prefilter) + LLM | hybrid | Find pages older than newest source on same topic; LLM verifies actual staleness |
| 3. Orphan pages | jekyll-link-checker, lychee, custom grep | no | "Pages with no inbound links" is a graph traversal |
| 4. Redlinks (concepts without pages) | grep + concept dictionary | no | Detect `[[Foo]]` where `Foo.md` doesn't exist |
| 5. Missing cross-references | grep + concept dictionary + LLM final call | hybrid | Detect mention of a concept name in body without a `[[link]]` |
| 6. Data gaps | none | ✅ yes | LLM reads, identifies questions raised but unanswered |
| 7. Dead links | lychee, hyperlink | no | Solved problem |
| 8. Tag consistency | static analysis on frontmatter | no | Trivial: union of tags across docs, flag near-duplicates |
| 9. Embedding freshness | timestamp diff (source vs vector index) | no | Trivial |
| 10. Source traceability | grep | no | Every wiki page links to ≥1 file in `raw/` |
| 11. Index ↔ content drift | diff `index.md` against `find <wiki> -name "*.md"` | no | Trivial |
| 12. Compiled truth ↔ timeline coupling | mtime check (prefilter) + LLM | hybrid | Mtime trivial; semantic alignment LLM |
| 13. Lost-nuance regression | none | ✅ yes | LLM compares pre/post compilation |
| 14. Hallucination amplification | LLM (claim-extraction + match) | ✅ yes | |
| 15. Over-confident summaries | LLM | ✅ yes | |
| 16. Citation-required | grep (paragraph has 0 links) + LLM | hybrid | Empirically the hardest per WikiSQE |
| (External URL archive) | curl + Wayback API | no | Wikipedia/IABot pattern |

**Tally:** 7 deterministic, 5 hybrid, 5 LLM-required (out of 17 with the bonus archive check).

**Implications:** **Just under half** the canonical knowledge-lint surface is mechanically detectable today with off-the-shelf tools. The other half requires LLM judgment. A *pragmatic* knowledge linter mixes:
- A fast **deterministic** pass (lychee + custom graph scripts) — runs on every commit / push.
- A slower **LLM** pass — runs as scheduled background work or on explicit invocation.
This split mirrors the prior report's findings on this repo's existing surface (graph-health MCP tools exist; semantic checks don't).

---

## Gaps / follow-ups

- No tool integrates the 7 deterministic checks into one runner. lychee covers links; everything else is custom shell or per-platform.
- No tool implements the **archive-on-ingest** pattern as a CLI-installable add-on for digital gardens. IABot is Wikipedia-specific.
- No public dataset exists for measuring LLM lint accuracy at the semantic checks (#1, #6, #13, #14, #15) — community implementations don't publish quality measurements.
