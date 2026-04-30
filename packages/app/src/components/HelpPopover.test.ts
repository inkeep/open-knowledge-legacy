/**
 * HelpPopover source-level regression guards (US-010 / FR-1 / D21 / D22).
 *
 * Repo convention (see `EditorActivityPool.test.ts` + the SettingsPane and
 * CommandPalette tests): no @testing-library/react. Full DOM exercise lives
 * in Playwright (deferred to manual verify in v0). The value here is pinning
 * the substring shape of the load-bearing wiring — a Settings entry that's
 * accidentally renamed, has its hash literal drift, or loses the test-id
 * would silently break the four-surface entry-point contract.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PATH = join(__dirname, 'HelpPopover.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('HelpPopover module', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./HelpPopover');
    expect(typeof mod.HelpPopover).toBe('function');
  });
});

describe('HelpPopover Settings entry (US-010)', () => {
  // Isolate the Settings <button> block by its data-testid so a refactor
  // that crosses the onClick onto a sibling button (e.g. Install) would
  // fail the SETTINGS_OPEN_HASH assertion below.
  const settingsBlock = (() => {
    const chunks = src.split(/(?=<button\b)/);
    const ours = chunks.find((c) => c.includes('data-testid="help-popover-settings"'));
    if (!ours) return '';
    return ours.split('</button>')[0] ?? '';
  })();

  test('imports the Settings icon from lucide-react and SETTINGS_OPEN_HASH', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bSettings\b[^}]*\}\s*from\s*'lucide-react'/);
    expect(src).toContain('SETTINGS_OPEN_HASH');
    expect(src).toMatch(/from\s*'@\/lib\/use-settings-route'/);
  });

  test('Settings button block carries the testid + label + Settings icon', () => {
    expect(settingsBlock, 'button[data-testid=help-popover-settings] not found').toBeTruthy();
    expect(settingsBlock).toContain('<Settings');
    expect(settingsBlock).toContain('Settings…');
  });

  test('Settings button onClick closes the popover and routes to SETTINGS_OPEN_HASH', () => {
    expect(settingsBlock).toContain('setPopoverOpen(false)');
    // Hash literal drift guard — the entry MUST funnel through the canonical
    // export rather than inlining a divergent string. SETTINGS_OPEN_HASH is
    // unit-tested separately to be `'#settings'`.
    expect(settingsBlock).toContain('SETTINGS_OPEN_HASH');
  });

  test('Settings entry sits above the Install entry inside the Setup section', () => {
    // The Setup <ul> is the first list. Settings should appear before
    // Install — Settings is the higher-frequency action.
    const setupIdx = src.indexOf('Settings…');
    const installIdx = src.indexOf('Install for Claude Chat');
    expect(setupIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThanOrEqual(0);
    expect(setupIdx).toBeLessThan(installIdx);
  });
});
