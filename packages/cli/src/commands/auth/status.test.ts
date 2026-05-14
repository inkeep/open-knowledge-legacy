import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GhDetectResult } from '../../auth/gh-detect.ts';
import { FileBackend } from '../../auth/token-store.ts';
import { resolveStatusSource } from './status.ts';

function makeStore(tmpDir: string) {
  return new FileBackend(join(tmpDir, 'auth.yml'));
}

function ghAvailable(token = 'ghs_test_token'): (host?: string) => GhDetectResult {
  return () => ({ available: true, token });
}

function ghUnavailable(): (host?: string) => GhDetectResult {
  return () => ({ available: false });
}

describe('resolveStatusSource', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-resolve-status-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('Tier A: gh available → { tier: "A", token: <gh token> }', async () => {
    const store = makeStore(tmpDir);
    const result = await resolveStatusSource('github.com', store, ghAvailable('gho_from_gh'));
    expect(result).toEqual({ tier: 'A', token: 'gho_from_gh' });
  });

  test('Tier A takes priority over a stored token (regression guard for the bug this fix addresses)', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_stored');
    const result = await resolveStatusSource('github.com', store, ghAvailable('gho_from_gh'));
    expect(result).toEqual({ tier: 'A', token: 'gho_from_gh' });
  });

  test('Tier B: gh unavailable + https stored token → { tier: "B", token: stored }', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_stored', { gitProtocol: 'https' });
    const result = await resolveStatusSource('github.com', store, ghUnavailable());
    expect(result).toEqual({ tier: 'B', token: 'gho_stored' });
  });

  test('Tier B: stored token without explicit gitProtocol defaults to B', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_stored');
    const result = await resolveStatusSource('github.com', store, ghUnavailable());
    expect(result.tier).toBe('B');
  });

  test('Tier C: gh unavailable + ssh stored token → { tier: "C", token: stored }', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_stored', { gitProtocol: 'ssh' });
    const result = await resolveStatusSource('github.com', store, ghUnavailable());
    expect(result).toEqual({ tier: 'C', token: 'gho_stored' });
  });

  test('none: gh unavailable, no stored token', async () => {
    const store = makeStore(tmpDir);
    const result = await resolveStatusSource('github.com', store, ghUnavailable());
    expect(result).toEqual({ tier: 'none' });
  });

  test('gh returns available:true but empty token → falls through to TokenStore', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_stored');
    const result = await resolveStatusSource(
      'github.com',
      store,
      () => ({ available: true, token: '' }) as GhDetectResult,
    );
    expect(result.tier).toBe('B');
  });

  test('host is forwarded to the gh detector so GHES vs github.com auth does not bleed', async () => {
    const seen: (string | undefined)[] = [];
    const store = makeStore(tmpDir);
    await resolveStatusSource('ghe.example.com', store, (host) => {
      seen.push(host);
      return { available: false };
    });
    expect(seen).toEqual(['ghe.example.com']);
  });
});
