/**
 * R15 (US-005): pathological workload that exposed the pre-fix O(n·m)
 * scaling of the catch-all `<` callback.
 *
 * Pre-fix, each `<` inside the catch-all did `rest.includes('</TagName>')`.
 * With N unique unclosed tags, the search had to scan the full rest of
 * the document every time, producing quadratic wall-clock behavior:
 *
 *   200  unclosed tags →   0.4 ms
 *   1000 unclosed tags →   6   ms
 *   5000 unclosed tags → 137   ms
 *   10000 unclosed tags → 569  ms  (≈ quadratic growth)
 *
 * Post-fix (pre-indexed close-tag positions + binary search), the same
 * workload runs log-linear.
 *
 * GATING. Wall-clock assertions require `RUN_BENCH=1`. Rationale: tier-1
 * CI runners (ubuntu-latest) have 5-20× larger σ than the M-series
 * hardware the bounds were calibrated on (`evidence/r4-calibration.md`),
 * and noisy-neighbor variance can push the 4-5ms p50 toward the 100 ms
 * bound on unrelated changes. Every other perf test in this repo is
 * `RUN_BENCH`-gated (see `tests/perf/markdown-bench.test.ts`); this one
 * now matches. The tier-2 `test:perf:regression` pipeline runs this file
 * with `RUN_BENCH=1` set at the nightly job level.
 *
 * A correctness smoke runs regardless of `RUN_BENCH` — it exercises the
 * 10K-tag input to catch shape regressions (e.g. accidentally returning
 * empty output or throwing on the pathological input). A reintroduced
 * O(n·m) scan would still show up in nightly's wall-clock assertions.
 */
import { describe, expect, test } from 'bun:test';
import { protectFromMdx } from './autolink-void-html-guard.ts';

const BENCH_ENABLED = process.env.RUN_BENCH === '1' || process.env.RUN_BENCH === 'true';
const describeBench = BENCH_ENABLED ? describe : describe.skip;

function pathological(jsxCount: number): string {
  const parts: string[] = [];
  for (let i = 0; i < jsxCount; i++) {
    parts.push(`Para ${i}: <Unclosed${i} text after.`);
  }
  return `${parts.join('\n\n')}\n`;
}

// Correctness smoke — always runs. Behavioral regressions (empty output,
// throw on pathological input) fail tier-1 fast without depending on
// wall-clock numbers.
describe('R15 R23 guard: pathological unclosed-tag correctness (tier-1 smoke)', () => {
  test('10K unique unclosed uppercase tags produce non-empty output', () => {
    const src = pathological(10_000);
    const out = protectFromMdx(src);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(src.length / 2);
  });
});

describeBench('R15 R23 guard: pathological unclosed-tag wall-clock bounds (tier-2)', () => {
  test('10K unique unclosed uppercase tags complete in under 100ms', () => {
    const src = pathological(10_000);
    // Warm-up pass: JIT + any lazy initialization.
    protectFromMdx(src);

    const iterations = 3;
    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      protectFromMdx(src);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    // 100 ms is ~20× the M3-Max p50 (4-5ms) and ~0.18× the pre-fix p50
    // (569ms). Catches any reintroduction of the O(n·m) scan while giving
    // slow CI runners plenty of headroom.
    expect(median).toBeLessThan(100);
  });

  test('5K unique unclosed uppercase tags complete in under 50ms', () => {
    const src = pathological(5_000);
    protectFromMdx(src); // Warm-up
    const iterations = 3;
    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      protectFromMdx(src);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    expect(median).toBeLessThan(50);
  });
});
