import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'AutoSyncOnboardingDialog.tsx'), 'utf8');
const SYNC_API_SRC = readFileSync(join(HERE, '..', 'lib', 'sync-api.ts'), 'utf8');

describe('AutoSyncOnboardingDialog module', () => {
  test('exports AutoSyncOnboardingDialog component', async () => {
    const mod = await import('./AutoSyncOnboardingDialog');
    expect(typeof mod.AutoSyncOnboardingDialog).toBe('function');
  });
});

describe('AutoSyncOnboardingDialog source-level guards', () => {
  test('both choices persist through the sync enabled API', () => {
    expect(SRC).toContain("from '@/lib/sync-api'");
    expect(SYNC_API_SRC).toContain('/api/sync/set-enabled');
    expect(SRC).toContain('postSyncEnabled(true)');
    expect(SRC).toContain('postSyncEnabled(false)');
    expect(SRC).not.toContain('onboardingResolvedAt');
  });

  test('primary action POSTs /api/sync/set-enabled with enabled:true', () => {
    expect(SYNC_API_SRC).toContain('/api/sync/set-enabled');
    expect(SYNC_API_SRC).toContain("method: 'POST'");
    expect(SRC).toContain('postSyncEnabled(true)');
  });

  test('renders both primary and secondary buttons with stable copy', () => {
    expect(SRC).toContain('Enable auto-sync');
    expect(SRC).toContain('Keep disabled');
  });

  test('non-dismissible: ignores Radix outside-click / Esc until a button is clicked', () => {
    expect(SRC).toContain('onOpenChange={() => {}}');
    expect(SRC).toContain('showCloseButton={false}');
  });
});
