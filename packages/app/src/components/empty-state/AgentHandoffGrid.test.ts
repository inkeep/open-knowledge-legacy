import { describe, expect, test } from 'bun:test';
import SRC from './AgentHandoffGrid?raw';

describe('AgentHandoffGrid module', () => {
  test('exports AgentHandoffGrid component', async () => {
    const mod = await import('./AgentHandoffGrid');
    expect(typeof mod.AgentHandoffGrid).toBe('function');
  });
});

describe('AgentHandoffGrid source-level guards', () => {
  test('uses the shared install probe (useInstalledAgents)', () => {
    expect(SRC).toContain("from '@/components/handoff/useInstalledAgents'");
    expect(SRC).toContain('useInstalledAgents()');
  });

  test('dispatches handoffs through the shared useHandoffDispatch hook', () => {
    expect(SRC).toContain('useHandoffDispatch');
    expect(SRC).toContain('buildProjectScopedHandoffInput');
  });

  test('iterates the VISIBLE_TARGETS render allow-list (no hardcoded id list)', () => {
    expect(SRC).toContain('VISIBLE_TARGETS.map');
  });

  test('not-installed path opens the editor installUrl via the handoff allowlist', () => {
    expect(SRC).toContain('openInstallUrl(target)');
    expect(SRC).not.toContain("from '@/lib/handoff/open-external'");
  });

  test('disables the Open button while workspace input is still resolving', () => {
    expect(SRC).toMatch(/status\s*===\s*['"]installed['"]\s*&&\s*handoffInput\s*!==\s*null/);
  });

  test('pre-probe install state renders as disabled "Checking", not clickable Install', () => {
    expect(SRC).toContain("'pending'");
    expect(SRC).toContain("status === 'pending'");
    expect(SRC).toContain("'Checking'");
  });

  test('re-probes installed state after Install click and on window focus', () => {
    expect(SRC).toContain('void refresh();');
    expect(SRC).toMatch(/refresh\s*}\s*=\s*useInstalledAgents\(\)/);
  });

  test('renders each card as a button for keyboard a11y', () => {
    expect(SRC).toContain('<button');
    expect(SRC).toContain('type="button"');
  });
});
