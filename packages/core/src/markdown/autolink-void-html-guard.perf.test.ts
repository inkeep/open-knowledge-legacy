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
 * workload runs log-linear. This test pins that behavior: at 10K unique
 * unclosed tags, protectFromMdx must complete in under 100 ms. That
 * bound is ~6× the observed M3-Max wall clock and far below the pre-fix
 * 569 ms — any regression to O(n·m) behavior immediately trips the gate.
 *
 * The bound is deliberately generous (100 ms) so CI runner variance does
 * not cause flakes. A pre-fix regression would violate it by an order of
 * magnitude, keeping the signal unambiguous.
 */
import { describe, expect, test } from 'bun:test';
import { protectFromMdx } from './autolink-void-html-guard.ts';

function pathological(jsxCount: number): string {
  const parts: string[] = [];
  for (let i = 0; i < jsxCount; i++) {
    parts.push(`Para ${i}: <Unclosed${i} text after.`);
  }
  return `${parts.join('\n\n')}\n`;
}

describe('R15 R23 guard: pathological unclosed-tag workload', () => {
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
