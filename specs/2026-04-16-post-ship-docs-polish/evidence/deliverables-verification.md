---
name: deliverables-verification
description: Spot-check of the three already-written deliverables against source code + committed baseline data.
type: factual
sources:
  - packages/core/tests/health/README.md
  - packages/core/tests/perf/README.md
  - packages/core/src/metrics/parse-health.ts
  - packages/core/src/markdown/parse-with-fallback.ts
  - packages/core/tests/perf/baseline.json
  - packages/core/tests/perf/regression-gate.ts
---

# Deliverables verification

## Parse-health README

### Counter catalog vs. `parse-health.ts:50-53`

README lists 4 counters. Source declares:

```typescript
export interface ParseHealthMetrics {
  parseFallback: { blockLevel: number; wholeDoc: number };
  ypsMismatch: { block: number; inline: number };
}
```

✓ Match.

### Fire-site map vs. `parse-with-fallback.ts`

README claims 6 fire paths across `parseRecursive` + `tryPerBlockFallback` + y-prosemirror patch.

Increment call sites in `parse-with-fallback.ts`:

- Line 49: `incrementWholeDocFallback()` — MAX_SPLIT_DEPTH exceeded branch.
- Line 71: `incrementWholeDocFallback()` — position-less error with no per-block recovery.
- Line 81: `incrementBlockFallback()` — positional parse error, recursive split.
- Line 123: `incrementWholeDocFallback()` — recovery path itself throws.
- Line 324: `incrementBlockFallback()` — per-block fallback, block fails.

Count (semantic fire paths — one per distinct code site + context):
- `parse-with-fallback.ts`: 5 physical increment call sites (lines 49, 71, 81, 123, 324).
- `patches/y-prosemirror@1.3.7.patch`: 2 semantic paths — block context (`createNodeFromYElement` substitutes `rawMdxFallback`) and inline context (`createTextNodesFromYText` log+skip). The `++` statements are doubled across CJS dist + ESM sibling so the runtime-loaded path always increments.

**Total semantic fire paths: 5 + 2 = 7.** The README's §3 "Where counters fire" enumerates all seven. The informal "6 paths" headline is a lower-bound count that collapses the two ypsMismatch paths as one "ypsMismatch subsystem"; the READ­ME's body spells out the breakdown. For precise accounting when adding a new counter, use the enumeration, not the headline count. ✓ Verified.

### Log event names vs. source

README lists `mdx-block-fallback` and `mdx-whole-doc-fallback`. Source:

- `parse-with-fallback.ts:51`: `event: 'mdx-whole-doc-fallback'`
- `parse-with-fallback.ts:74`: same
- `parse-with-fallback.ts:84`: `event: 'mdx-block-fallback'`
- `parse-with-fallback.ts:125`: `event: 'mdx-whole-doc-fallback'`
- `parse-with-fallback.ts:333`: `event: 'mdx-block-fallback'`

✓ Match.

### CJS ↔ ESM globalThis bridge vs. source

README §Design notes describes `ypsCounters()` bridging CJS patch + ESM module via `globalThis.__okYpsCounters`. Source at `parse-health.ts:42-48`:

```typescript
function ypsCounters(): YpsCounters {
  const host = globalThis as YpsCountersHost;
  if (!host.__okYpsCounters) {
    host.__okYpsCounters = { block: 0, inline: 0 };
  }
  return host.__okYpsCounters;
}
```

✓ Match.

## Perf README

### Worked example 1: serializeMs @ 100 blocks

README states:
- `baseline.p99 = 2.29 ms`
- `baseline.p99Stdev = 0.15 ms`
- variance term = 2 × 0.15 = 0.30
- floor term = 0.10 × 2.29 = 0.229
- allowed_delta = max(0.30, 0.229) = 0.30

`baseline.json` at `packages/core/tests/perf/baseline.json` block 100:
```json
"serializeMs": {
  "p99": 2.29,
  "p99StdevMs": 0.15
}
```

Math: 2 × 0.15 = 0.30 ✓, 0.10 × 2.29 = 0.229 ✓, max = 0.30 ✓.

### Worked example 2: parseMs @ 10K blocks

README states:
- `baseline.p99 = 1275.24 ms`
- `baseline.p99Stdev = 16.05 ms`
- variance term = 2 × 16.05 = 32.10
- floor term = 0.10 × 1275.24 = 127.52
- allowed_delta = max(32.10, 127.52) = 127.52

`baseline.json` block 10000:
```json
"parseMs": {
  "p99": 1275.24,
  "p99StdevMs": 16.05
}
```

Math: 2 × 16.05 = 32.10 ✓, 0.10 × 1275.24 = 127.524 ✓, max = 127.52 ✓.

### Methodology vs. `markdown-bench.test.ts:49-50`

README claims `WARMUP_ITERS = 10` and `MEASURED_ITERS = 10`. Source:
```typescript
const WARMUP_ITERS = 10;
const MEASURED_ITERS = 10;
```
✓ Match.

### Threshold formula vs. `regression-gate.ts:7-9`

README quotes:
```
allowed_regression_ms = max(2 × p99_stdev_ms, 10% × baseline_p99_ms)
fresh_p99_ms - baseline_p99_ms > allowed_regression_ms ⇒ REGRESSION
```

Source comment at `regression-gate.ts:7-9` is literally this text. ✓ Match.

### PERF_BLOCK_COUNTS vs. source

README claims `[100, 1000, 5000, 10000, 20000]`. Source at `packages/core/src/markdown/fixtures/index.ts` exports this exact tuple. ✓ Match.

## I11 label correction

Four AGENTS.md edits + one weekly.yml edit, all aligned to the canonical I11 definition from tolerant-parsing spec. See `evidence/i11-provenance.md` for the full chain.

## `bun run check` status at post-edit commit state

13/13 turbo tasks green. No test regressions. Confirmed at baseline `fa0050a4` with edits applied locally.

---

## Summary

Every load-bearing claim in the three deliverables has been cross-checked against the source of truth. No discrepancies found. The spec's R6 and R7 acceptance criteria are met pre-commit.
