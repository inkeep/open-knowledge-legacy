# Evidence: Measured Perf Baseline

**Dimension:** Current-state TS parse latency
**Date:** 2026-04-16
**Sources:** Ad-hoc bun benchmark on current main @ 4a321e3, validated 2026-04-16 on 2de299b
**Method:** Measured via `/assess-findings` P0-10 investigation subagent

---

## Measured results

Synthetic document generator — heading + paragraph per block:

```ts
Array.from({length: n}, (_, i) =>
  `## Heading ${i}\n\nParagraph content for block ${i} with some **bold** and _italic_ text.\n`
).join('\n')
```

| Block count | Doc size | Parse time (avg of 3 runs) |
|------------|----------|---------------------------|
| 100 | 15.2K chars | 12.8ms |
| 1,000 | 153.8K chars | 104.6ms |
| 5,000 | 777.8K chars | 590.2ms |
| 10,000 | 1.56M chars | 1,486.2ms |

**Scaling analysis:**
- 100 → 1K (10x): 104.6 / 12.8 = **8.2x** (near-linear)
- 1K → 10K (10x): 1486 / 104.6 = **14.2x** (clearly super-linear)
- Knee of the curve: between 1K and 5K blocks

**Implication:** O(n²) behavior activates somewhere in the 1K-5K range. Classic signature of a catastrophic diff algorithm on large inputs.

## Contradiction with Rust spec's motivational numbers

| Claim location | Claimed number | Measured |
|---------------|---------------|----------|
| markdown-engine-rust-bridge SPEC.md:85 (Persona P1) | 460ms at 10K blocks | 1,486ms (**3.2x higher**) |
| markdown-engine-rust-bridge SPEC.md:41 (Complication) | 165ms on 3hr transcript (~5,400 lines, ~2,350 blocks) | ~590ms at 5K blocks (**3.6x higher**) |
| markdown-engine-rust-bridge SPEC.md:151 (Success metric M1) | 460ms → ~5ms | Actual current pain is ~1,486ms |

The spec's numbers come from `evidence/document-distribution.md` which explicitly states "Linear extrapolation from project benchmarks." The linear assumption does not hold — the actual scaling is O(n²).

## Likely culprit

The CRDT observer bridge latency report (`reports/crdt-observer-bridge-latency-analysis/REPORT.md`) identifies `diffLines`/jsdiff as having "catastrophic worst-case behavior — documented 20,000x slower than diff-match-patch on pathological inputs." At 10K blocks the diff call likely dominates.

Other candidates (to be profiled):
- `updateYFragment` O(N) per call
- Full-tree serialize on every parse cycle
- position-slice walker scaling characteristics

## Reproduction

```bash
bun -e "
import { MarkdownManager } from '@inkeep/open-knowledge-core';
const mm = new MarkdownManager();
for (const n of [100, 1000, 5000, 10000]) {
  const doc = Array.from({length: n}, (_, i) => \`## Heading \${i}\n\nParagraph content for block \${i} with some **bold** and _italic_ text.\n\`).join('\n');
  mm.parse(doc); // warmup
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) mm.parse(doc);
  const elapsed = (performance.now() - t0) / 3;
  console.log(\`\${n} blocks (\${doc.length} chars): \${elapsed.toFixed(1)}ms\`);
}
"
```

## Re-measured on spec/markdown-pipeline-engineering-health @ 2de299b (2026-04-16)

| Block count | Doc size | Parse time (avg of 3) | Ratio to 100-block baseline |
|------------|----------|----------------------|----------------------------|
| 100 | 8K chars | 9.5ms | 1.0x (baseline) |
| 500 | 42K chars | 41.0ms | 4.3x (linear: 5x) |
| 1,000 | 85K chars | 73.6ms | 7.7x (linear: 10x) |
| 2,500 | 215K chars | 213.7ms | 22.5x (linear: 25x) |
| 5,000 | 432K chars | 493.9ms | 52.0x (linear: 50x) |
| 10,000 | 867K chars | 1,265.3ms | 133x (linear: 100x) |
| 10,000 (re-measured) | 888K chars | 1,256.8ms | 132x |
| **20,000** | **1.8M chars** | **3,593.8ms** | **378x (linear: 200x)** |

Scaling between 1K → 10K: **17.2x for 10x more blocks** — super-linear, likely O(n log n) + O(n²) on specific hotspots, not strict O(n²).
Scaling between 10K → 20K: **2.86x for 2x more blocks** — super-linearity intensifies at scale.

Discrepancy vs spec's claimed 460ms at 10K: **~2.7x worse**. Discrepancy holds even at the lower end of runner variance.

