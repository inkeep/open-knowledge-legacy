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
    expect(settingsBlock).toContain('SETTINGS_OPEN_HASH');
  });

  test('Settings entry sits above the Install entry inside the Setup section', () => {
    const setupIdx = src.indexOf('Settings…');
    const installIdx = src.indexOf('Install for Claude Chat');
    expect(setupIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThanOrEqual(0);
    expect(setupIdx).toBeLessThan(installIdx);
  });
});
