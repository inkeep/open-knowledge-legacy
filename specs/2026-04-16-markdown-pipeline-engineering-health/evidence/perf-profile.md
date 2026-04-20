# Evidence: Per-Stage Parse Pipeline Profile

**Dimension:** Per-stage cost attribution across the 9-stage parse path
**Date:** 2026-04-16
**Source:** `evidence/perf-profile-harness.ts` (diagnostic, not a test)
**Authoritative run:** `perf-profile.2026-04-16T08-05-17-328Z.json` (next to this file)
**Corpus:** `packages/core/src/markdown/fixtures/perf/<count>.md` — same seeded
synthetic corpus the R1 benchmark harness consumes
**Branch:** `spec/markdown-pipeline-engineering-health`
**Runner:** local darwin-arm64, `bun@1.3.11`

---

## Methodology (pinned)

- **Per-stage timings.** Each of the 9 parse-side stages is timed in
  isolation over 5 warm-up + 5 measured runs. `Bun.gc(true)` between
  measured runs. Transformers mutate in place, so we clone the template
  mdast tree (`structuredClone`) before every iteration — otherwise
  runs 2..N operate on a post-run-1 tree and time nothing.
- **Subset attribution.** To split `processor.parse()` (which fuses
  `remarkParse` + the micromark extensions contributed by
  `remarkFrontmatter` / `remarkMdxAgnostic` / `remarkGfm` /
  `remarkWikiLink` into one pass), we re-measure `.parse()` on five
  processor subsets and attribute the delta between adjacent subsets
  to the newly-added extension. Deltas are noisy at the single-ms
  level but the 10K-block signal is unambiguous.
- **Scope.** Subset attribution runs only at 1K and 10K blocks — the
  proportions are stable and each subset build pays full parse cost,
  so repeating at 20K would triple harness runtime without new signal.

See `perf-profile-harness.ts` for the exact decomposition. Numbers
below are **p50 ms** unless annotated.

---

## Per-stage table (p50 ms)

| Blocks | protect | parse (all) | restore | autolink | docStart | posSlice | unkGuard | ensureNE | stringify | Σ p50  |
|-------:|--------:|------------:|--------:|---------:|---------:|---------:|---------:|---------:|----------:|-------:|
| 100    | 0.12    | 7.3         | 0.78    | 0.82     | 0.64     | 0.77     | 0.65     | 0.65     | 1.4       | 13.2   |
| 1K     | 0.82    | 80.1        | 7.56    | 7.88     | 6.42     | 7.82     | 6.49     | 6.43     | 12.8      | 136.3  |
| 5K     | 3.90    | 465.7       | 40.53   | 40.50    | 32.84    | 40.05    | 33.30    | 31.87    | 63.7      | 752.4  |
| 10K    | 7.59    | 1,105.0     | 87.61   | 88.49    | 70.21    | 91.27    | 74.27    | 70.77    | 133.7     | 1,728.9|
| 20K    | 15.42   | 3,067.3     | 209.25  | 217.41   | 177.51   | 215.64   | 158.46   | 161.17   | 337.7     | 4,559.9|

Stage glossary (order matches `pipeline.ts:95-108`):

| Stage        | What it does                                                         |
|--------------|----------------------------------------------------------------------|
| protect      | `protectFromMdx` — PUA sentinel substitution on source string       |
| parse (all)  | `processor.parse(file)` — `remarkParse` + all micromark extensions   |
| restore      | `restoreFromMdx` — PUA → real `<>:@{` in mdast value fields         |
| autolink     | `autolinkPromotionPlugin` — `<scheme:uri>` text → `link` nodes      |
| docStart     | `docStartThematicFixPlugin` — NG10 empty-yaml → thematicBreak        |
| posSlice     | `positionSlicePlugin` — attach `.data.sourceDelimiter` etc.         |
| unkGuard     | `unknownMdastGuardPlugin` — unknown types → `rawMdxFallbackMdast`    |
| ensureNE     | `ensureNonEmptyDoc` — empty-doc guard                                |
| stringify    | `remarkProseMirror` (mdast → PM doc)                                 |

---

## Stage share of total (at 10K blocks)

Sorted by p50 cost. The top two stages account for 71.6% of total.

| Stage        | p50 (ms)  | Share |
|--------------|----------:|------:|
| parse (all)  | 1,105.0   | 63.9% |
| stringify    | 133.7     |  7.7% |
| posSlice     | 91.3      |  5.3% |
| autolink     | 88.5      |  5.1% |
| restore      | 87.6      |  5.1% |
| unkGuard     | 74.3      |  4.3% |
| ensureNE     | 70.8      |  4.1% |
| docStart     | 70.2      |  4.1% |
| protect      | 7.6       |  0.4% |

At 20K blocks the parse share climbs to **67.3%** — parse dominates
and its dominance intensifies with scale. The 5 post-parse visitor
phases together account for ~23%.

---

## Slope analysis

For a linear stage, a 10× block-count step should produce a 10×
time step. A ratio > 10 is super-linear; ≤ 10 is near-linear.

### 10K ÷ 1K (expected 10×)

| Stage        | 10K/1K | Verdict                  |
|--------------|-------:|--------------------------|
| protect      |  9.3×  | near-linear              |
| parse (all)  | 13.8×  | **super-linear**         |
| restore      | 11.6×  | mildly super-linear      |
| autolink     | 11.2×  | mildly super-linear      |
| docStart     | 10.9×  | near-linear              |
| posSlice     | 11.7×  | mildly super-linear      |
| unkGuard     | 11.4×  | mildly super-linear      |
| ensureNE     | 11.0×  | near-linear              |
| stringify    | 10.4×  | near-linear              |

### 20K ÷ 10K (expected 2×)

The knee is sharpest here — most stages slip well past 2×.

| Stage        | 20K/10K | Verdict                   |
|--------------|--------:|---------------------------|
| protect      |  2.03×  | linear                    |
| parse (all)  |  2.78×  | **super-linear**          |
| restore      |  2.39×  | mildly super-linear       |
| autolink     |  2.46×  | mildly super-linear       |
| docStart     |  2.53×  | mildly super-linear       |
| posSlice     |  2.36×  | mildly super-linear       |
| unkGuard     |  2.13×  | linear-ish                |
| ensureNE     |  2.28×  | mildly super-linear       |
| stringify    |  2.53×  | mildly super-linear       |

**Reading.** `parse (all)` — the fused `remarkParse` + syntax extensions —
is the dominant super-linear term at every scale. The plugin-layer
visitor phases (restore, autolink, docStart, posSlice, unkGuard,
ensureNE) show a mild super-linear tilt (≈15-25% overhead beyond
strictly-linear) — each individually small, but they compound.
Stringify is effectively linear through 10K and slips slightly at 20K.

---

## Subset attribution — marginal cost per syntax extension

Delta between adjacent subsets ≈ marginal cost of the newly-added
extension. Subsets are cumulative: `+gfm` means
`remarkParse + remarkFrontmatter + remarkMdxAgnostic + remarkGfm`.

### At 1K blocks (parse p50)

| Subset             | p50 (ms) | Δ vs prev | Attribution              |
|--------------------|---------:|----------:|--------------------------|
| parse-only         | 42.4     |      —    | `remarkParse` core       |
| +frontmatter       | 42.6     |    +0.2   | noise                    |
| +mdx (agnostic)    | 46.3     |    +3.7   | ~9% — mdx tokenizer      |
| +gfm               | 85.7     |   +39.4   | **+93% — remark-gfm**    |
| +wikilink          | 87.2     |    +1.5   | ~4% — wiki-link micromark|

### At 10K blocks (parse p50)

| Subset             | p50 (ms)  | Δ vs prev | Attribution              |
|--------------------|----------:|----------:|--------------------------|
| parse-only         |   617.9   |      —    | `remarkParse` core       |
| +frontmatter       |   604.8   |   −13.1   | noise (run-to-run var)   |
| +mdx (agnostic)    |   622.7   |   +17.9   | ~3% — mdx tokenizer      |
| +gfm               | 1,101.3   |  +478.6   | **+77% — remark-gfm**    |
| +wikilink          | 1,122.4   |   +21.1   | ~3% — wiki-link micromark|

### Findings

1. **`remarkParse` (micromark core) is the baseline and largest single
   contributor** — 55.9% of full parse at 10K blocks (617.9 / 1,105.0).
   This is upstream code we do not own.
2. **`remark-gfm` is the second dominant term** — adding ≈ 480 ms on top
   of bare parse at 10K blocks. Our corpus is 5% tables (≈ 500 table
   blocks × ~5 rows each = ~2,500 rows at 10K), which is inside the
   super-linear region flagged by
   [remarkjs#978](https://github.com/orgs/remarkjs/discussions/978)
   (400 rows = 1 s, 2,000 rows = 2 min). The shape we see here is
   consistent with that report. Also upstream.
3. **`remarkMdxAgnostic` and `remarkWikiLink` are each ≈ 2-4%** of parse
   at 10K. Not worth optimising individually.
4. **`remarkFrontmatter` is below measurement noise** — our corpus has
   one yaml block at most.

Taken together, ≈ **99% of parse time at 10K blocks is upstream code
we do not own** (`remarkParse` + `remark-gfm`). Our in-tree plugin
surface (`protectFromMdx` + the 6 post-parse visitor phases) adds
≈ 25% on top of parse — material enough that R15 + R16 + R17 are worth
doing, but not where the super-linearity lives.

---

## Implications

### For this spec

- **R15** (`protectFromMdx` O(n log n) fix) targets the `protect` stage
  which is 0.4% of total at 10K blocks. That doesn't mean R15 is
  low-value — the production case R15 protects against is
  MDX-heavy content (≈ 10% JSX tag density), which the perf corpus
  under-samples at 5% MDX. Re-verify R15's improvement with a
  synthesized MDX-dense fixture during the story, not against this
  corpus.
- **R16** (processor caching + two-plugin idempotency) eliminates
  per-parse processor construction cost — it shows up as a flat
  per-call overhead, most visible at 100-1K block sizes where total
  parse is still dominated by small constants. Re-measure post-R16
  against the 100 and 1K rows.
- **R17** (2-phase merged walker) collapses 5 visitor passes —
  currently summing to ~26% of total at 10K — into 2 phases. Since
  the walker's overhead is the `unist-util-visit` tree-traversal and
  the callback dispatch, the theoretical ceiling is ≈ the cost of 3
  fewer walks. Restoration has to stay separate per the
  ordering constraint in `evidence/pipeline-refactor-audit.md`.
  Realistically a 5-15% improvement on total parse at 10K — worth
  doing for the architectural consolidation, not promised as a
  latency win.

### For FW-E1 (upstream micromark filing)

The earlier prose said "`remarkParse` dominates" as a preliminary
indication. This profile confirms it with numbers: at 10K blocks,
bare `remarkParse` is 617.9 ms of the 1,105 ms parse budget (55.9%),
and `remark-gfm` is another 478.6 ms (43.3%). Both are super-linear
past the 5K-block knee. FW-E1's upstream filing should cite:

- `remarkParse` / micromark super-linearity — evident from
  `parse-only` scaling 42.4 → 617.9 ms over 1K → 10K (14.6× for 10×
  blocks).
- `remark-gfm` table super-linearity — evident from the `+gfm` Δ
  of 39.4 → 478.6 ms (12.2× for 10× blocks), compounding with the
  known upstream issue.

Both reproduce from the committed corpus; an upstream maintainer can
run the profile harness verbatim.

### For the sister Rust-port spec

The Rust port's motivational numbers (460 ms at 10K blocks) come from
linear extrapolation that this profile explicitly contradicts. The
profile also clarifies *where* the savings come from in the Rust
port: `markdown-rs` replaces `remarkParse` + `remark-gfm` wholesale
with a faster GFM parser. If the Rust port achieves its target, it
would eliminate ~99% of the current parse budget — a ~70× speedup
ceiling at 10K blocks, assuming bridge + stringify costs stay
constant.

---

## Reproduction

```bash
# Regenerate the corpus (deterministic — same seed ⇒ byte-identical):
bun run packages/core/src/markdown/fixtures/perf/generate.ts

# Run the profile (7-ish minutes on Apple-silicon local):
bun run specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts
```

The harness writes `perf-profile.<timestamp>.json` next to itself.
Re-runs after R15 / R16 / R17 land should update this markdown by
hand (don't overwrite mechanically — the narrative of the diff is
the evidence).
