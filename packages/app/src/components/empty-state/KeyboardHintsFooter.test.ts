import { describe, expect, test } from 'bun:test';
import SRC from './KeyboardHintsFooter?raw';

describe('KeyboardHintsFooter module', () => {
  test('exports KeyboardHintsFooter component', async () => {
    const mod = await import('./KeyboardHintsFooter');
    expect(typeof mod.KeyboardHintsFooter).toBe('function');
  });
});

describe('KeyboardHintsFooter source-level guards', () => {
  test('platform-aware mod key via isMacOs helper', () => {
    expect(SRC).toMatch(/isMacOs[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/);
    expect(SRC).toMatch(/isMacOs\(\)\s*\?\s*'⌘'\s*:\s*'Ctrl'/);
  });

  test('lists the ⌘K Search hint (the only currently-bound shortcut)', () => {
    expect(SRC).toContain('letter="K"');
    expect(SRC).toContain('Search');
  });
});
