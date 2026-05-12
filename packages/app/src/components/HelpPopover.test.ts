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

describe('HelpPopover Setup section', () => {
  test('Install entry is present with the canonical label', () => {
    expect(src).toContain('Install for Claude Chat');
  });

  test('does NOT render a Settings entry (moved to <SettingsButton />)', () => {
    expect(src).not.toContain('<span>Settings</span>');
    expect(src).not.toContain('SETTINGS_OPEN_HASH');
    expect(src).not.toContain('help-popover-settings');
  });
});
