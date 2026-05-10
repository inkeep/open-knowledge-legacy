import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'EditorTabs.tsx'), 'utf8');

describe('EditorTabs module', () => {
  test('exports the EditorTabs component', async () => {
    const mod = await import('./EditorTabs');
    expect(typeof mod.EditorTabs).toBe('function');
  });
});

describe('EditorTabs source-level guards — tab-strip drag region', () => {
  test('detects Electron host via the canonical window.okDesktop != null idiom', () => {
    expect(SRC).toMatch(
      /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.okDesktop\s*!=\s*null/,
    );
    expect(SRC).toContain('const isElectronHost');
  });

  test('per-tab div opts out of drag region in Electron mode', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"]/);
  });

  test('BOTH folder-tab and document-tab divs carry the no-drag opt-out', () => {
    const matches = SRC.match(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"]/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('no-drag opt-out lives on the per-tab div (the onAuxClick parent), not on inner buttons', () => {
    expect(SRC).toMatch(/onAuxClick=\{\(event\)\s*=>\s*\{[\s\S]*?closeTab\(\w+\)/);
  });

  test('tab strip root explicitly declares drag in Electron mode (self-evident contract, not cascade-inherited)', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:drag\]['"]/);
  });

  test('cn helper composes conditional classes (does not break twMerge contract)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/utils['"]/);
    expect(SRC).toContain('cn(');
  });

  test('web-mode baseline unchanged — existing scroll-on-wheel + flex layout primitives preserved', () => {
    expect(SRC).toContain('overflow-x-auto');
    expect(SRC).toMatch(/subtle-scrollbar|scroll-fade-mask-x/);
    expect(SRC).toContain('onWheel={scrollTabListOnWheel}');
  });
});
