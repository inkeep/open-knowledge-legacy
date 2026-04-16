# Perf corpus

Synthetic markdown documents consumed by the benchmark harness
(`packages/core/tests/perf/markdown-bench.test.ts`), the profile harness
(`specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-profile-harness.ts`),
and the R4 regression gate. Static `.md` files are checked in — do not
generate at runtime. The committed fixtures and the matching baseline
are a unit; they stand or fall together.

## Files

| File | Blocks | Size | Purpose |
|------|-------:|-----:|---------|
| `100.md` | 100 | ~20K chars | Smallest sample; near-linear regime |
| `1000.md` | 1,000 | ~194K chars | Baseline working-size |
| `5000.md` | 5,000 | ~950K chars | Super-linearity onset |
| `10000.md` | 10,000 | ~1.9M chars | R4 regression gate primary point |
| `20000.md` | 20,000 | ~3.8M chars | Stress ceiling |
| `large-realistic.md` | — | ~77K chars | Legacy hand-picked realistic content |
| `generate.ts` | — | — | Seeded generator (regenerates `<count>.md`) |

## Block-type mix

Each document is a weighted sample of these block kinds per R1/R18:

| Kind | Weight | Notes |
|------|-------:|-------|
| paragraph | 40% | 2-5 sentences; ~15% carry inline emphasis / code |
| heading | 25% | Levels 1-3, deterministically interleaved |
| list | 15% | Bullet or ordered; 3-6 items |
| code | 10% | Fenced with an info string (ts/py/rust/…) |
| table | 5% | GFM, 3-4 cols × 2-5 rows |
| mdx | 5% | Block-form `<Note>…</Note>` (avoids NG8) |

## Regeneration

Both the selection order and the per-block content share one Mulberry32
PRNG keyed by the seed at `generate.ts`. Same seed ⇒ byte-identical
output:

```bash
bun run packages/core/src/markdown/fixtures/perf/generate.ts
```

Regenerating invalidates the committed baseline at
`specs/2026-04-16-markdown-pipeline-engineering-health/evidence/perf-baseline-measured.md`;
re-run the harness and recommit the baseline whenever the seed or mix
changes.

## Measurement parity

The benchmark harness (R1), profile harness (R3a), and regression gate
(R4) all consume these fixtures through `loadPerfFixture(blockCount)` in
`packages/core/src/markdown/fixtures/index.ts`. No ad-hoc generation
in measurement code — otherwise runs are not comparable.
