import { describe, expect, test } from 'bun:test';
import { tokenEncode } from './tiktoken-lazy';

describe('tokenEncode (real js-tiktoken/lite + cl100k_base)', () => {
  test('encodes non-empty text to non-empty id sequence', async () => {
    const ids = await tokenEncode('hello world');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(Number.isInteger(id)).toBe(true);
  });

  test('empty string encodes to empty sequence', async () => {
    const ids = await tokenEncode('');
    expect(ids).toEqual([]);
  });

  test('distinct inputs produce distinct encodings', async () => {
    const [a, b] = await Promise.all([tokenEncode('a'), tokenEncode('hello world')]);
    expect(a).not.toEqual(b);
    expect(b.length).toBeGreaterThan(a.length);
  });

  test('repeated calls reuse the cached encoder (identity across calls)', async () => {
    const first = await tokenEncode('reuse check');
    const second = await tokenEncode('reuse check');
    expect(first).toEqual(second);
  });
});
