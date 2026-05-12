import { describe, expect, test } from 'bun:test';
import SRC from './EditorTabs?raw';

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

describe('EditorTabs source-level guards — tab context menu', () => {
  test('uses the shadcn/Radix context menu primitives for tab actions', () => {
    expect(SRC).toContain("from '@/components/ui/context-menu'");
    expect(SRC).toContain('<ContextMenuTrigger asChild>');
    expect(SRC).toContain('<ContextMenuContent');
  });

  test('BOTH folder-tab and document-tab branches wrap with EditorTabContextMenu', () => {
    const matches = SRC.match(/<EditorTabContextMenu[\s\n]/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('tab context menu exposes close, close-others, and close-all actions', () => {
    expect(SRC).toContain('>Close</ContextMenuItem>');
    expect(SRC).toMatch(/>\s*Close others\s*<\/ContextMenuItem>/);
    expect(SRC).toMatch(/>\s*Close all\s*<\/ContextMenuItem>/);
  });

  test('bulk tab context actions route through closeTabs, not repeated single closes', () => {
    expect(SRC).toContain('const otherTabIds = openTabs.filter');
    expect(SRC).toContain('disabled={otherTabIds.length === 0}');
    expect(SRC).toContain('closeTabs(otherTabIds)');
    expect(SRC).toContain('closeTabs(openTabs)');
  });
});
