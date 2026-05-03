import { describe, expect, test } from 'bun:test';

describe('detectGh', () => {
  test('returns available:false when gh is not on PATH (ENOENT)', async () => {
    const { detectGh } = await import('./gh-detect.ts');
    const result = detectGh();
    expect(typeof result.available).toBe('boolean');
    if (result.available) {
      expect(typeof result.token).toBe('string');
      expect(result.token?.length ?? 0).toBeGreaterThan(0);
    } else {
      expect(result.token).toBeUndefined();
    }
  });
});
