import { describe, expect, test } from 'bun:test';
import SRC from './EditorTabs?raw';

describe('EditorTabs module', () => {
  test('exports the EditorTabs component', async () => {
    const mod = await import('./EditorTabs');
    expect(typeof mod.EditorTabs).toBe('function');
  });

  test('does NOT re-export tabParts — canonical home is @/editor/editor-tabs', async () => {
    const mod = await import('./EditorTabs');
    expect('tabParts' in mod).toBe(false);
  });

  test('tabParts is exported from @/editor/editor-tabs and parses paths correctly', async () => {
    const mod = await import('@/editor/editor-tabs');
    expect(typeof mod.tabParts).toBe('function');
    const parts = mod.tabParts('meetings/2026/q1/notes', '.md');
    expect(parts.prefix).toBe('meetings/2026/q1/');
    expect(parts.baseName).toBe('notes');
    expect(parts.extension).toBe('.md');
    expect(parts.label).toBe('notes.md');
    const rootParts = mod.tabParts('notes', '.md');
    expect(rootParts.prefix).toBe('');
    expect(rootParts.baseName).toBe('notes');
  });
});

describe('EditorTabs source-level guards — doc-tab label shape', () => {
  test('doc-tab branch derives hideDocExtension for .md / .mdx only', () => {
    expect(SRC).toContain("const hideDocExtension = docExt === '.md' || docExt === '.mdx';");
  });

  test('doc-tab label render gates the extension span on !hideDocExtension', () => {
    expect(SRC).toMatch(
      /\{!hideDocExtension\s*&&\s*<span\s+className=["']shrink-0["']\s*>\{extension\}<\/span>\}/,
    );
  });

  test('doc-tab label render does NOT include the folder prefix span', () => {
    const docBranch = SRC.split(
      "const hideDocExtension = docExt === '.md' || docExt === '.mdx';",
    )[1];
    expect(docBranch).toBeDefined();
    const renderSlice = (docBranch ?? '').split('TabPinOrCloseButton')[0] ?? '';
    expect(renderSlice).not.toMatch(/min-w-0 flex-1 truncate text-muted-foreground\/60/);
    expect(renderSlice).not.toContain('{prefix}');
  });

  test('doc-tab button surfaces the full path via title for disambiguation on hover', () => {
    expect(SRC).toMatch(
      /<button\s+type="button"\s+aria-label=\{accessibleLabel\}\s+title=\{accessibleLabel\}/,
    );
  });

  test('tab rename mode still uses the InputGroupAddon extension treatment', () => {
    expect(SRC).toMatch(
      /<InputGroupAddon\s+align="inline-end"[\s\S]*?text-muted-foreground\/60[\s\S]*?\{docExt\}/,
    );
    expect(SRC).toContain(
      'setRenameValue(stripRenameExtensionSuffix(event.target.value, docExt));',
    );
  });

  test('folder tab and asset tab render branches retain their own basename+extension shape', () => {
    expect(SRC).toContain('<span className="shrink-0">/</span>');
    expect(SRC).toMatch(
      /tab\.kind === ['"]asset['"][\s\S]*?<span className="shrink-0">\{extension\}/,
    );
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

describe('EditorTabs source-level guards — tab drag-reorder (US-004)', () => {
  test('reuses the already-eager @dnd-kit packages — no new bundle deps', () => {
    expect(SRC).toContain("from '@dnd-kit/core'");
    expect(SRC).toContain("from '@dnd-kit/sortable'");
    expect(SRC).toContain("from '@dnd-kit/utilities'");
    expect(SRC).toContain('DndContext');
    expect(SRC).toContain('SortableContext');
    expect(SRC).toContain('useSortable');
  });

  test('PointerSensor activates at distance: 8 so plain clicks still switch the tab', () => {
    expect(SRC).toMatch(
      /useSensor\(\s*PointerSensor\s*,\s*\{\s*activationConstraint:\s*\{\s*distance:\s*8\s*\}\s*\}\s*\)/,
    );
  });

  test('KeyboardSensor with sortableKeyboardCoordinates wires keyboard accessibility (FR1d)', () => {
    expect(SRC).toContain('KeyboardSensor');
    expect(SRC).toContain('sortableKeyboardCoordinates');
    expect(SRC).toMatch(
      /useSensor\(\s*KeyboardSensor\s*,\s*\{\s*coordinateGetter:\s*sortableKeyboardCoordinates\s*\}\s*\)/,
    );
  });

  test('SortableContext uses horizontalListSortingStrategy keyed off visibleTabIds', () => {
    expect(SRC).toContain('horizontalListSortingStrategy');
    expect(SRC).toMatch(
      /<SortableContext\s+items=\{\[\.\.\.visibleTabIds\]\}\s+strategy=\{horizontalListSortingStrategy\}/,
    );
  });

  test('handleDragEnd uses arrayMove and threads the dragged id into reorderTabs', () => {
    expect(SRC).toContain('arrayMove');
    expect(SRC).toContain('reorderTabs');
    expect(SRC).toMatch(/function handleDragEnd\(event:\s*DragEndEvent\)/);
    expect(SRC).toMatch(
      /reorderTabs\(arrayMove\(\[\.\.\.visibleTabIds\],\s*fromIndex,\s*toIndex\),\s*activeId\)/,
    );
  });

  test('every tab branch (new-tab, folder, asset, doc) is wrapped in a SortableTab', () => {
    const matches = SRC.match(/<SortableTab[\s\n]/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(SRC).not.toMatch(/<SortableTab[\s\S]*?role=["']presentation["']/);
  });

  test('doc-tab SortableTab disables drag while renaming so the input stays interactive', () => {
    expect(SRC).toMatch(/<SortableTab[\s\S]*?disabled=\{isRenaming\}/);
  });

  test('DndContext wraps the visibleTabIds.map output but NOT the standalone "New tab" button', () => {
    expect(SRC).toMatch(/<DndContext\s+[\s\S]*?sensors=\{sensors\}[\s\S]*?<SortableContext/);
    expect(SRC).toMatch(
      /<\/SortableContext>\s*<\/DndContext>\s*<Tooltip>[\s\S]*?aria-label=["']New tab["']/,
    );
  });

  test('DndContext portals @dnd-kit SR helpers out of the strip via accessibility.container', () => {
    expect(SRC).toMatch(/accessibility=\{\{[\s\S]*?container:\s*typeof\s+document/);
    expect(SRC).toMatch(/typeof\s+document\s*!==\s*['"]undefined['"]\s*\?\s*document\.body/);
  });

  test('SortableTab composes refs and merges sortable transform without dropping inline style', () => {
    expect(SRC).toContain('function composedRef');
    expect(SRC).toContain('setNodeRef(node)');
    expect(SRC).toContain('CSS.Transform.toString(transform)');
    expect(SRC).toMatch(/\.\.\.outerStyle/);
  });
});

describe('EditorTabs — Post-commit reconciliation error labeling', () => {
  test('reconciliation is wrapped in its own try/catch (split from the fetch catch)', () => {
    const handlerStart = SRC.indexOf('async function commitRename');
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = SRC.indexOf('\n  }\n', handlerStart);
    const handlerBody = SRC.slice(handlerStart, handlerEnd);
    const remapIdx = handlerBody.indexOf('remapTabsForRename(renamed)');
    expect(remapIdx).toBeGreaterThan(-1);
    const beforeRemap = handlerBody.slice(0, remapIdx);
    const innerTryIdx = beforeRemap.lastIndexOf('try {');
    expect(innerTryIdx).toBeGreaterThan(-1);
    const sliceFromTry = handlerBody.slice(innerTryIdx);
    expect(sliceFromTry).toMatch(/catch\s*\(\s*reconcileErr\s*\)/);
  });

  test('post-commit failure surfaces a distinct toast (NOT "Network error")', () => {
    expect(SRC).toContain(
      "'Rename succeeded but the tabstrip may be out of date — refresh to resync'",
    );
  });

  test('post-commit navigation is gated on reconciliation success', () => {
    expect(SRC).toMatch(/let\s+reconcileOk\s*=\s*true/);
    expect(SRC).toMatch(/reconcileOk\s*=\s*false/);
    expect(SRC).toMatch(/reconcileOk\s*&&\s*nextActiveDocName/);
  });
});

describe('EditorTabs — Active-tab accessibility', () => {
  test('aria-current="page" is emitted on the active SortableTab', () => {
    expect(SRC).toMatch(/aria-current=\{isActive \? 'page' : undefined\}/);
    const matches = SRC.match(/aria-current=\{isActive \? 'page' : undefined\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});
