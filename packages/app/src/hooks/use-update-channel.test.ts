import { describe, expect, test } from 'bun:test';
import SRC from './use-update-channel?raw';

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

  test('queries the channel via state.query()', () => {
    expect(SRC).toMatch(/state[\s\n]*\.query\(\)/);
  });

  test('is read-only — no setter, no channel-change subscription', () => {
    expect(SRC).not.toContain('onChannelChanged');
    expect(SRC).not.toMatch(/setChannel\b/);
  });

  test('returns null channel + no subscription when bridge is absent', () => {
    expect(SRC).toMatch(/if\s*\(\s*!bridge\s*\)\s*return/);
  });

  test('useState initializes channel to null until the query resolves', () => {
    expect(SRC).toMatch(/useState<UpdateChannel\s*\|\s*null>\(null\)/);
  });
});
