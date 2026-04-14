import { describe, expect, test } from 'bun:test';
import { CC1_CONTRACT_VERSION, parseCC1Signal } from './cc1';

describe('parseCC1Signal', () => {
  test('parses a valid files signal', () => {
    expect(
      parseCC1Signal(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 'files', seq: 3 })),
    ).toEqual({
      v: CC1_CONTRACT_VERSION,
      ch: 'files',
      seq: 3,
    });
  });

  test('returns null for malformed JSON', () => {
    expect(parseCC1Signal('{')).toBeNull();
  });

  test('returns null for unknown contract versions', () => {
    expect(parseCC1Signal(JSON.stringify({ v: 2, ch: 'files', seq: 1 }))).toBeNull();
  });

  test('returns null for invalid payload shapes', () => {
    expect(parseCC1Signal(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 1, seq: 1 }))).toBeNull();
    expect(
      parseCC1Signal(JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: 'files', seq: '1' })),
    ).toBeNull();
  });
});
