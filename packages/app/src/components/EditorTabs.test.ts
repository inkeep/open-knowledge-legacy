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

  test('all tab-kind divs and the standalone add-tab button carry the no-drag opt-out', () => {
    const matches = SRC.match(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"]/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  test('standalone add-tab button opts out of the Electron drag region', () => {
    expect(SRC).toMatch(
      /aria-label=["']New tab["'][\s\S]*?className=\{cn\([\s\S]*?isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"][\s\S]*?\)\}[\s\S]*?onClick=\{openNewTab\}/,
    );
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

  test('folder, asset, document, and new-tab branches wrap with EditorTabContextMenu', () => {
    const matches = SRC.match(/<EditorTabContextMenu[\s\n]/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(SRC).toMatch(
      /visibleTabIds\.map[\s\S]*?newTabIdSet\.has\(tabId\)[\s\S]*?<EditorTabContextMenu[\s\S]*?openTabs=\{visibleTabIds\}[\s\S]*?closeTab=\{closeNewTab\}[\s\S]*?closeTabs=\{closeVisibleTabs\}/,
    );
  });

  test('asset tabs render inside the tab strip as closeable tabs', () => {
    expect(SRC).toContain("tab.kind === 'asset'");
    expect(SRC).toMatch(
      /tab\.kind === ['"]asset['"][\s\S]*?<EditorTabContextMenu[\s\S]*?closeTab=\{closeTab\}[\s\S]*?activateTab\(tabId\)[\s\S]*?<TabPinOrCloseButton[\s\S]*?accessibleLabel=\{accessibleLabel\}/,
    );
  });

  test('tabs avoid file/folder/asset type icons and keep the close control on the right', () => {
    expect(SRC).not.toContain('FileIcon');
    expect(SRC).not.toContain('FolderOpen');
    expect(SRC).toMatch(/<Button[\s\S]*?aria-label=\{`Close \$\{accessibleLabel\}`\}/);
    expect(SRC).toMatch(
      /aria-label=\{`Close \$\{accessibleLabel\}`\}[\s\S]*?className=["']mr-2["']/,
    );
    expect(SRC).toMatch(
      /<button[\s\S]*?aria-label=\{accessibleLabel\}[\s\S]*?<\/button>\s*<TabPinOrCloseButton/,
    );
  });

  test('active tabs use Obsidian-style contrast without bottom overlay strips', () => {
    expect(SRC).toContain('group relative -mb-px flex h-10');
    expect(SRC).toContain('rounded-t-lg rounded-b-none');
    expect(SRC).toContain('border-border border-b-0 bg-background text-foreground');
    expect(SRC).toContain('bg-transparent hover:bg-muted focus-visible:bg-muted');
    expect(SRC).toContain('border-transparent hover:border-border focus-visible:border-border');
    expect(SRC).not.toContain('tab-bottom-flares');
    expect(SRC).not.toContain('h-2 w-[calc(100%+16px)]');
    expect(SRC).not.toContain("isActive ? 'font-semibold' : 'font-medium'");
  });

  test('placeholder close button reveals on hover without stealing clicks while hidden', () => {
    expect(SRC).toContain('pointer-events-none opacity-0');
    expect(SRC).toContain('group-hover:pointer-events-auto group-hover:opacity-100');
  });

  test('tab context menu exposes close, close-others, and close-all actions', () => {
    expect(SRC).toMatch(/>\s*Close\s*<\/ContextMenuItem>/);
    expect(SRC).toMatch(/>\s*Close others\s*<\/ContextMenuItem>/);
    expect(SRC).toContain('Close all');
    expect(SRC).toContain("pinnedTabIds.length ? 'Close all unpinned' : 'Close all'");
    expect(SRC).toContain('{closeAllLabel}');
  });

  test('tab context menu exposes pin and unpin actions', () => {
    expect(SRC).toContain('Pin tab');
    expect(SRC).toContain('Unpin tab');
    expect(SRC).toContain('PinIcon');
    expect(SRC).toContain('ContextMenuSeparator');
  });

  test('bulk tab context actions route through closeTabs, not repeated single closes', () => {
    expect(SRC).toContain('filterClosableTabIds');
    expect(SRC).toContain('const otherTabIds = filterClosableTabIds');
    expect(SRC).toContain('disabled={otherTabIds.length === 0}');
    expect(SRC).toContain('closeTabs(otherTabIds)');
    expect(SRC).toContain('const closableTabIds = filterClosableTabIds(openTabs, pinnedTabIds)');
    expect(SRC).toContain('closeTabs(closableTabIds)');
  });

  test('pinned tabs replace close controls with an unpin button', () => {
    expect(SRC).toMatch(/aria-label=\{`Unpin \$\{accessibleLabel\}`\}/);
    expect(SRC).not.toMatch(/title=\{`Unpin \$\{accessibleLabel\}`\}/);
    expect(SRC).not.toMatch(/title=\{`Close \$\{accessibleLabel\}`\}/);
    expect(SRC).toContain('text-primary');
  });

  test('bulk context actions operate on document and new-tab ids together', () => {
    expect(SRC).toContain('visibleTabIds,');
    expect(SRC).toContain('const newTabIdSet = new Set(newTabIds);');
    expect(SRC).toContain('function closeVisibleTabs(tabIds: readonly string[])');
    expect(SRC).toMatch(/newTabIdSet\.has\(tabId\)[\s\S]*?emptyTabIds\.push\(tabId\)/);
    expect(SRC).toMatch(
      /if\s*\(documentTabIds\.length > 0\)\s*closeTabs\(documentTabIds\);[\s\S]*?for\s*\(const tabId of emptyTabIds\)\s*closeNewTab\(tabId\)/,
    );
    const contextMenuMatches = SRC.match(/<EditorTabContextMenu[\s\n]/g);
    const closeVisibleMatches = SRC.match(/closeTabs=\{closeVisibleTabs\}/g);
    expect(closeVisibleMatches?.length ?? 0).toBe(contextMenuMatches?.length ?? 0);
  });
});
