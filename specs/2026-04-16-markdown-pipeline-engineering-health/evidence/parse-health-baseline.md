# Evidence: Parse-health baseline (R19)

**Dimension:** Silent-fallback regression gate for the markdown pipeline
**Date:** 2026-04-16
**Source:** R19 gate at `packages/core/tests/health/parse-health-gate.ts`
**Corpus:** CommonMark 0.31 (652 examples from `commonmark.json`) + canonical GFM fixture (20 examples from `packages/core/src/markdown/fixtures/gfm/examples.json`)
**Branch:** `spec/markdown-pipeline-engineering-health`
**HEAD:** see `packages/core/tests/health/baseline.json` `capturedAt`

---

## Thresholds (pinned)

| Counter                     | Threshold | Rationale                                                                                       |
| --------------------------- | --------: | ----------------------------------------------------------------------------------------------- |
| `parseFallback.wholeDoc`    |         0 | Absolute, per SPEC §6 R19 AC. Any whole-doc fallback on valid CommonMark/GFM is a regression.   |
| `parseFallback.blockLevel`  |         0 | Baseline-observed. Current pipeline is clean on the fidelity corpus — threshold mirrors reality.|

## Observed counters at baseline capture

```
{
  "commonmarkExamples": 652,
  "gfmExamples": 20,
  "afterCommonmark": { "blockLevel": 0, "wholeDoc": 0 },
  "afterGfm":        { "blockLevel": 0, "wholeDoc": 0 }
}
```

Both counters remain at zero across all 672 examples. The R23 guard plus
agnostic MDX handle every CommonMark spec edge case and every GFM
fixture without dropping into either fallback path. This is the cleanest
possible baseline: any drift above zero is unambiguously a regression.

## How the gate consumes this

`packages/core/tests/health/parse-health-gate.ts` reads
`packages/core/tests/health/baseline.json`, harvests the same corpus,
and calls `compareParseHealth(baseline, observed)`:

- `observed.wholeDoc > thresholds.wholeDocMax` → FAIL
- `observed.blockLevel > thresholds.blockLevelMax` → FAIL
- otherwise PASS

The synthetic-regression test at
`packages/core/tests/health/parse-health-gate.test.ts` exercises the
comparison logic with both fake inputs (pure tests) and a real injected
broken MDX fragment (class C17 "Closing slash without open" from the
crash taxonomy — the simplest reliable block-fallback trigger).

## Reproduction

```bash
# Harvest fresh counters and gate:
cd packages/core && bun run tests/health/parse-health-gate.ts tests/health/baseline.json

# Or via turbo (tier-2):
bun turbo run test:health --filter=@inkeep/open-knowledge-core
```

The gate is a pure read — no disk mutations. Baseline updates require a
deliberate commit of the new `baseline.json` and a corresponding update
of this evidence file.

## Relationship to R4

R4 catches latency regressions (wall-clock slowdown). R19 catches
silent-fallback regressions (pipeline degraded to fallback path but
returned quickly). Both live in tier-2 because per-PR is the wrong time
for corpus-wide work; both update baselines via deliberate commit, not
environmental drift.

The two gates are complementary: R16's processor-caching refactor and
R17's merged-walker refactor (upcoming stories) could silently shift
blockLevel counts without changing latency — R19 catches that class
specifically.
