import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'AutoSyncOnboardingDialog.tsx'), 'utf8');

describe('AutoSyncOnboardingDialog module', () => {
  test('exports AutoSyncOnboardingDialog component', async () => {
    const mod = await import('./AutoSyncOnboardingDialog');
    expect(typeof mod.AutoSyncOnboardingDialog).toBe('function');
  });
});

describe('AutoSyncOnboardingDialog source-level guards', () => {
  test('writes route through the project-local ConfigBinding (not HTTP)', () => {
    expect(SRC).toContain("from '@/hooks/use-enable-sync-with-confirm'");
    expect(SRC).toContain('useSyncEnabledWriter');
    expect(SRC).toContain('persistChoice(true)');
    expect(SRC).toContain('persistChoice(false)');
    expect(SRC).toContain('writer(enabled)');
    expect(SRC).not.toContain('postSyncEnabled');
    expect(SRC).not.toContain('/api/sync/set-enabled');
    expect(SRC).not.toContain('onboardingResolvedAt');
  });

  test('renders both primary and secondary buttons with stable copy', () => {
    expect(SRC).toContain('Enable auto-sync');
    expect(SRC).toContain('Keep disabled');
  });

  test('non-dismissible: ignores Radix outside-click / Esc until a button is clicked', () => {
    expect(SRC).toContain('onOpenChange={() => {}}');
    expect(SRC).toContain('showCloseButton={false}');
  });

  test('disables buttons during the cold-start window when the binding is null', () => {
    expect(SRC).toMatch(/disabled=\{writer === null\}/);
  });
});
