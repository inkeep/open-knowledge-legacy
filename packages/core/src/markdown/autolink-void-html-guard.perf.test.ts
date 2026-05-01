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

  test('20K ÷ 5K ratio stays asymptotically sub-quadratic', () => {
    function median(src: string): number {
      protectFromMdx(src); // Warm-up
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        protectFromMdx(src);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    }
    const t5k = median(pathological(5_000));
    const t20k = median(pathological(20_000));
    if (t5k < 0.5) {
      return;
    }
    const ratio = t20k / t5k;
    expect(ratio).toBeLessThan(10);
  });
});
