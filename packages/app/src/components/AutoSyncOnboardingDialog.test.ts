/**
 * Module-level smoke + source-level guards for AutoSyncOnboardingDialog.
 *
 * Repo convention (see SettingsPane.test.ts): full DOM coverage lives in
 * Playwright; unit tests guard the export shape and the regression-critical
 * strings/contracts that quietly drifting would break.
 */

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
  test('writes onboardingResolvedAt via projectBinding patch', () => {
    expect(SRC).toContain('onboardingResolvedAt');
    expect(SRC).toContain('projectBinding');
    expect(SRC).toContain('.patch(');
    expect(SRC).toContain('toISOString()');
  });

  test('primary action POSTs /api/sync/set-enabled with enabled:true', () => {
    expect(SRC).toContain('/api/sync/set-enabled');
    expect(SRC).toContain('setSyncEnabled(true)');
  });

  test('renders both primary and secondary buttons with stable copy', () => {
    expect(SRC).toContain('Enable auto-sync');
    expect(SRC).toContain('Keep disabled');
  });

  test('non-dismissible: ignores Radix outside-click / Esc until a button is clicked', () => {
    // Both buttons explicitly call onResolved; the Dialog root should NOT
    // close on outside-click / Esc, which would leave onboarding unresolved.
    expect(SRC).toContain('onOpenChange={() => {}}');
    expect(SRC).toContain('showCloseButton={false}');
  });
});
