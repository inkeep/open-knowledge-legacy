import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'use-update-channel.ts'), 'utf8');

describe('useUpdateChannel module', () => {
  test('exports the hook + the UpdateChannel union', async () => {
    const mod = await import('./use-update-channel');
    expect(typeof mod.useUpdateChannel).toBe('function');
  });
});

describe('useUpdateChannel source-level guards', () => {
  test('side-effect imports the desktop bridge type augmentation', () => {
    expect(SRC).toMatch(/import\s+['"]@\/lib\/desktop-bridge-types['"]/);
  });

  test('subscribes to onChannelChanged on mount', () => {
    expect(SRC).toContain('onChannelChanged(');
  });

  test('queries initial state via state.query()', () => {
    expect(SRC).toMatch(/state[\s\n]*\.query\(\)/);
  });

  test('broadcast wins over a late-arriving query result (race policy)', () => {
    expect(SRC).toContain('broadcastReceivedRef');
    expect(SRC).toMatch(/broadcastReceivedRef\.current\s*=\s*true/);
    expect(SRC).toMatch(/if\s*\(\s*broadcastReceivedRef\.current\s*\)\s*return/);
  });

  test('returns null channel + no subscription when bridge is absent', () => {
    expect(SRC).toMatch(/if\s*\(\s*!bridge\s*\)\s*return/);
  });

  test('useState initializes channel to null until first source resolves', () => {
    expect(SRC).toMatch(/useState<UpdateChannel\s*\|\s*null>\(null\)/);
  });

  test('setChannel rejects when the bridge is unavailable (caller can surface a toast)', () => {
    expect(SRC).toMatch(/throw\s+new\s+Error\([^)]*setChannel/);
  });

  test('returns the unsubscribe handle from useEffect cleanup', () => {
    expect(SRC).toMatch(/return\s+unsubscribe/);
  });
});
