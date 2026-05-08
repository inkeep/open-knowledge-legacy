import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'SettingsButton.tsx'), 'utf8');

describe('SettingsButton module', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./SettingsButton');
    expect(typeof mod.SettingsButton).toBe('function');
  });
});

describe('SettingsButton source-level guards', () => {
  test('imports the Settings icon from lucide-react', () => {
    expect(SRC).toMatch(/import\s*\{\s*Settings\s*\}\s*from\s*'lucide-react'/);
    expect(SRC).toMatch(/<Settings\b/);
  });

  test('routes through SETTINGS_OPEN_HASH (canonical hash literal)', () => {
    expect(SRC).toMatch(/from\s*'@\/lib\/use-settings-route'/);
    expect(SRC).toContain('SETTINGS_OPEN_HASH');
    expect(SRC).toMatch(/window\.location\.hash\s*=\s*SETTINGS_OPEN_HASH/);
  });

  test('carries an accessible label and stable test-id', () => {
    expect(SRC).toContain('data-testid="header-settings-button"');
    expect(SRC).toMatch(/<span\s+className="sr-only">Settings<\/span>/);
  });

  test('wraps in a Tooltip that announces "Settings"', () => {
    expect(SRC).toMatch(/from\s*'@\/components\/ui\/tooltip'/);
    expect(SRC).toMatch(/<TooltipContent>Settings<\/TooltipContent>/);
  });
});
