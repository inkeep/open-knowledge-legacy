import { describe, expect, test } from 'bun:test';
import {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CONTRACT_VERSION,
  parseCC1BranchSwitched,
  parseCC1Signal,
} from './cc1';

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

describe('parseCC1BranchSwitched', () => {
  test('exports the CC1_CHANNEL_BRANCH_SWITCHED constant', () => {
    expect(CC1_CHANNEL_BRANCH_SWITCHED).toBe('branch-switched');
  });

  test('parses a valid branch-switched payload', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_BRANCH_SWITCHED,
          seq: 1,
          branch: 'main',
        }),
      ),
    ).toEqual({ branch: 'main' });
  });

  test('tolerates extra unknown fields (forward-compat)', () => {
    const payload = JSON.stringify({
      v: CC1_CONTRACT_VERSION,
      ch: CC1_CHANNEL_BRANCH_SWITCHED,
      seq: 7,
      branch: 'feature/auth',
      extra: 'whatever',
      nested: { lol: true },
    });
    expect(parseCC1BranchSwitched(payload)).toEqual({ branch: 'feature/auth' });
  });

  test('returns null for malformed JSON', () => {
    expect(parseCC1BranchSwitched('{')).toBeNull();
  });

  test('returns null for unknown contract versions', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({ v: 2, ch: CC1_CHANNEL_BRANCH_SWITCHED, seq: 1, branch: 'main' }),
      ),
    ).toBeNull();
  });

  test('returns null for a different channel', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: 'files',
          seq: 1,
          branch: 'main',
        }),
      ),
    ).toBeNull();
  });

  test('returns null when branch field is missing or not a string', () => {
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({ v: CC1_CONTRACT_VERSION, ch: CC1_CHANNEL_BRANCH_SWITCHED, seq: 1 }),
      ),
    ).toBeNull();
    expect(
      parseCC1BranchSwitched(
        JSON.stringify({
          v: CC1_CONTRACT_VERSION,
          ch: CC1_CHANNEL_BRANCH_SWITCHED,
          seq: 1,
          branch: 42,
        }),
      ),
    ).toBeNull();
  });

  test('returns null for non-object payloads', () => {
    expect(parseCC1BranchSwitched('null')).toBeNull();
    expect(parseCC1BranchSwitched('"string"')).toBeNull();
    expect(parseCC1BranchSwitched('123')).toBeNull();
  });
});
