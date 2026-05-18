import { describe, expect, test } from 'bun:test';
import { isInteractiveSidebarControl } from './FileSidebar';
import SRC from './FileSidebar?raw';

describe('FileSidebar module', () => {
  test('exports the FileSidebar component', async () => {
    const mod = await import('./FileSidebar');
    expect(typeof mod.FileSidebar).toBe('function');
  });

  test('exports isInteractiveSidebarControl for the sidebar surface context-menu opt-out', async () => {
    const mod = await import('./FileSidebar');
    expect(typeof mod.isInteractiveSidebarControl).toBe('function');
  });
});

describe('isInteractiveSidebarControl — runtime guard clauses', () => {
  test('returns false for null target (defensive against shim edge cases)', () => {
    expect(isInteractiveSidebarControl(null)).toBe(false);
  });

  test('returns false for non-Element EventTarget shapes', () => {
    expect(isInteractiveSidebarControl({} as EventTarget)).toBe(false);
    const fakeElement = { closest: () => ({}) } as unknown as EventTarget;
    expect(isInteractiveSidebarControl(fakeElement)).toBe(false);
  });
});

describe('FileSidebar source-level guards — chrome-row retrofit', () => {
  test('detects Electron host via the canonical window.okDesktop != null idiom', () => {
    expect(SRC).toMatch(
      /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.okDesktop\s*!=\s*null/,
    );
    expect(SRC).toContain('const isElectronHost');
  });

  test('reads sidebar state via useSidebar primitive', () => {
    expect(SRC).toContain('useSidebar');
    expect(SRC).toMatch(/state\s*:\s*sidebarState/);
    expect(SRC).toContain("const isExpanded = sidebarState === 'expanded';");
    expect(SRC).toContain("const isCollapsed = sidebarState === 'collapsed';");
  });

  test('does NOT render project name in SidebarHeader (ProjectSwitcher footer carries identity)', () => {
    expect(SRC).not.toMatch(/projectName/);
    expect(SRC).not.toMatch(/window\.okDesktop\?\.\s*config\.projectName/);
  });

  test('renders the action toolbar with justify-end in Electron, justify-between in web', () => {
    expect(SRC).toMatch(/isElectronHost\s*\?\s*['"]justify-end['"]\s*:\s*['"]justify-between['"]/);
  });

  test("hides 'Files' label in Electron mode (web-only section header)", () => {
    expect(SRC).toMatch(/isExpanded\s*&&\s*!isElectronHost[\s\S]*?Files/);
  });

  test("preserves the 'Files' label classes for web-mode visual continuity", () => {
    expect(SRC).toMatch(
      /font-mono\s+text-sm\s+uppercase\s+tracking-wider\s+text-sidebar-foreground\/50/,
    );
  });

  test('fades SidebarHeader content out during sidebar collapse in Electron mode', () => {
    expect(SRC).toMatch(/const\s+shouldFadeChrome\s*=\s*isElectronHost\s*&&\s*isCollapsed\s*;/);
    expect(SRC).toMatch(/shouldFadeChrome\s*&&\s*['"]opacity-0['"]/);
  });

  test('SidebarHeader empty space drags the window in Electron mode (mirrors EditorHeader)', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:drag\]['"]/);
  });

  test('toolbar buttons opt out of drag via [&>*] no-drag in Electron mode', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[&>\*\]:\[-webkit-app-region:no-drag\]['"]/);
  });

  test('frontloads the opacity fade — half the slide duration with ease-out', () => {
    expect(SRC).toMatch(
      /motion-safe:transition-opacity\s+motion-safe:duration-100\s+motion-safe:ease-out/,
    );
  });

  test('cn helper from @/lib/utils is used to compose conditional classes', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/utils['"]/);
    expect(SRC).toContain('cn(');
  });

  test('subscribes to FileTreeHandle via useState + ref-callback (no first-mount race)', () => {
    expect(SRC).toContain('useState<FileTreeHandle | null>(null)');
    expect(SRC).toMatch(/<FileTree\s+ref=\{setTree\}\s*\/>/);
    expect(SRC).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?tree\.subscribe\(/);
    expect(SRC).toMatch(/\}\s*,\s*\[tree\]\s*\)/);
    expect(SRC).toMatch(/\.getFolderState\(\)/);
    expect(SRC).not.toMatch(
      /import\s*\{[^}]*\buseSyncExternalStore\b[^}]*\}\s*from\s*['"]react['"]/,
    );
    expect(SRC).not.toMatch(/useRef<FileTreeHandle/);
  });

  test('does NOT import useCallback — React Compiler memoizes inline arrows', () => {
    expect(SRC).not.toMatch(/import\s*\{[^}]*\buseCallback\b[^}]*\}\s*from\s*['"]react['"]/);
  });

  test('module-level EMPTY_FOLDER_STATE — stable initial state pre-handle-attach', () => {
    expect(SRC).toMatch(/^const\s+EMPTY_FOLDER_STATE/m);
  });

  test('hides Tree View Options dropdown trigger when there are no folders', () => {
    expect(SRC).toMatch(/hasFolders\s*\?\s*\(\s*<DropdownMenu>/);
    expect(SRC).toMatch(/<\/DropdownMenu>\s*\)\s*:\s*null/);
  });

  test('hides Expand All when allExpanded; hides Collapse All when noneExpanded', () => {
    expect(SRC).toMatch(/!allExpanded\s*\?\s*\(\s*<DropdownMenuItem[\s\S]*?Expand All/);
    expect(SRC).toMatch(/!noneExpanded\s*\?\s*\(\s*<DropdownMenuItem[\s\S]*?Collapse All/);
  });

  test('the lucide Search import is gone — pill is the canonical search entry point', () => {
    expect(SRC).not.toMatch(/import\s*\{[^}]*\bSearch\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
    expect(SRC).not.toMatch(/<ToolbarButton\s+icon=\{Search\}/);
  });

  test('the four remaining ToolbarButtons keep their positions and behaviors', () => {
    expect(SRC).toMatch(/<ToolbarButton\s+icon=\{ListCollapse\}\s+label="Tree View Options"/);
    expect(SRC).toMatch(/<ToolbarButton[\s\S]*?icon=\{SquarePen\}[\s\S]*?label="New File"/);
    expect(SRC).toMatch(/<ToolbarButton[\s\S]*?icon=\{FilePlus\}[\s\S]*?label="New from template/);
    expect(SRC).toMatch(/<ToolbarButton[\s\S]*?icon=\{FolderPlus\}[\s\S]*?label="New Folder"/);
  });

  test('SidebarSearchBar is imported and mounted with onOpenSearch wired through', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*\bSidebarSearchBar\b[^}]*\}\s*from\s*['"]@\/components\/SidebarSearchBar['"]/,
    );
    expect(SRC).toMatch(/<SidebarSearchBar\s+onClick=\{onOpenSearch\}\s*\/>/);
  });

  test('ErrorBoundary wraps the pill so a render-throw is contained to the row', () => {
    expect(SRC).toMatch(/import\s*\{\s*ErrorBoundary\s*\}\s*from\s*['"]react-error-boundary['"]/);
    expect(SRC).toMatch(
      /<ErrorBoundary[\s\S]*?fallbackRender=\{\(\)\s*=>\s*null\}[\s\S]*?<SidebarSearchBar[\s\S]*?<\/ErrorBoundary>/,
    );
    expect(SRC).not.toMatch(/FallbackComponent=\{/);
  });

  test('ErrorBoundary mounts the extracted onPillRenderError on its onError prop', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*\bonPillRenderError\b[^}]*\}\s*from\s*['"]@\/components\/SidebarSearchBar['"]/,
    );
    expect(SRC).toMatch(
      /<ErrorBoundary[\s\S]*?onError=\{onPillRenderError\}[\s\S]*?<SidebarSearchBar/,
    );
  });

  test('ErrorBoundary exposes a recovery path via resetKeys keyed off sidebarState', () => {
    expect(SRC).toMatch(
      /<ErrorBoundary[\s\S]*?resetKeys=\{\[sidebarState\]\}[\s\S]*?<SidebarSearchBar/,
    );
  });

  test('pill row inherits Electron no-drag opt-out (structurally anchored)', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[&>\*\]:\[-webkit-app-region:no-drag\]['"]/);

    expect(SRC).toMatch(
      /['"]px-2 pb-2['"][\s\S]{0,300}isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"]/,
    );
  });

  test('imports the shadcn ContextMenu primitives for the empty-space surface (D28 / FR1)', () => {
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\bContextMenu\b[\s\S]*?\bContextMenuContent\b[\s\S]*?\bContextMenuItem\b[\s\S]*?\bContextMenuTrigger\b[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/context-menu['"]/,
    );
  });

  test('ContextMenu wraps Sidebar children INSIDE Sidebar (preserves Sidebar↔SidebarInset peer-data sibling-ship)', () => {
    expect(SRC).toMatch(/<Sidebar\s+variant="inset">[\s\S]*?<ContextMenu>/);
    expect(SRC).toMatch(/<ContextMenu>[\s\S]*?<ContextMenuTrigger\s+asChild>/);
    expect(SRC).toMatch(
      /<div\s+className="contents"\s+onContextMenu=\{handleSidebarSurfaceContextMenu\}>/,
    );
    expect(SRC).toMatch(/<\/ContextMenu>\s*\n?\s*<\/Sidebar>\s*\n?\s*\)\s*;\s*\n?\s*\}/);
  });

  test('the surface handler uses preventDefault + stopPropagation for button-target opt-out', () => {
    expect(SRC).toMatch(
      /const\s+handleSidebarSurfaceContextMenu[\s\S]*?if\s*\(\s*isInteractiveSidebarControl\(\s*event\.target\s*\)\s*\)\s*\{\s*\n?\s*event\.preventDefault\(\)\s*;\s*\n?\s*event\.stopPropagation\(\)\s*;\s*\n?\s*\}/,
    );
  });

  test('the isInteractiveSidebarControl selector covers all button-like sidebar controls', () => {
    expect(SRC).toMatch(
      /const\s+SIDEBAR_INTERACTIVE_CONTROL_SELECTOR\s*=\s*\n?\s*['"]button,\s*\[role="button"\],\s*\[role="menuitem"\],\s*input,\s*textarea,\s*select,\s*a\[href\]['"]/,
    );
    expect(SRC).toMatch(
      /target\.closest\(\s*SIDEBAR_INTERACTIVE_CONTROL_SELECTOR\s*\)\s*!==\s*null/,
    );
    expect(SRC).toMatch(/typeof\s+Element\s*===\s*['"]undefined['"]/);
  });

  test('empty-space menu — imports the dependencies the 11-item content needs (US-008)', () => {
    expect(SRC).toMatch(/import\s*\{\s*useWorkspace\s*\}\s*from\s*['"]@\/lib\/use-workspace['"]/);
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\buseInstalledAgents\b[\s\S]*?\}\s*from\s*['"]@\/components\/handoff\/useInstalledAgents['"]/,
    );
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\buseHandoffDispatch\b[\s\S]*?\}\s*from\s*['"]@\/components\/handoff\/useHandoffDispatch['"]/,
    );
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\bbuildProjectScopedHandoffInput\b[\s\S]*?\}\s*from\s*['"]@\/components\/handoff\/useHandoffDispatch['"]/,
    );
    expect(SRC).toMatch(
      /import\s*\{\s*OpenInAgentEmptySpaceSubmenu\s*\}\s*from\s*['"]@\/components\/handoff\/OpenInAgentEmptySpaceSubmenu['"]/,
    );
    expect(SRC).toMatch(
      /import\s*\{\s*useConfigContext\s*\}\s*from\s*['"]@\/lib\/config-provider['"]/,
    );
    expect(SRC).toMatch(/import\s*\{\s*toast\s*\}\s*from\s*['"]sonner['"]/);
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\bCopy\b[\s\S]*?\bFolderOpen\b[\s\S]*?\bTerminal\b[\s\S]*?\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(SRC).toMatch(
      /import\s*\{[\s\S]*?\bContextMenuCheckboxItem\b[\s\S]*?\bContextMenuSeparator\b[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/context-menu['"]/,
    );
  });

  test('empty-space menu — 11 items rendered in the spec §9 order (US-008)', () => {
    const items = [
      'empty-space-menu-new-file',
      'empty-space-menu-new-from-template',
      'empty-space-menu-new-folder',
      'empty-space-menu-reveal-in-finder',
      'empty-space-menu-open-in-terminal',
      'empty-space-menu-copy-full-path',
      'empty-space-menu-show-hidden-files',
      'empty-space-menu-show-all-files',
      'empty-space-menu-expand-all',
      'empty-space-menu-collapse-all',
    ];
    let lastIdx = -1;
    for (const id of items) {
      const idx = SRC.indexOf(`data-testid="${id}"`);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  test('empty-space menu — Open with AI submenu mounts between Reveal and Open in Terminal (US-008)', () => {
    const sendToAiIdx = SRC.indexOf('<OpenInAgentEmptySpaceSubmenu');
    const revealIdx = SRC.indexOf('data-testid="empty-space-menu-reveal-in-finder"');
    const terminalIdx = SRC.indexOf('data-testid="empty-space-menu-open-in-terminal"');
    expect(sendToAiIdx).toBeGreaterThan(revealIdx);
    expect(sendToAiIdx).toBeLessThan(terminalIdx);
  });

  test('empty-space menu — Open with AI submenu hides the web fallback row (D25)', () => {
    expect(SRC).toMatch(
      /<OpenInAgentEmptySpaceSubmenu[\s\S]*?webFallbackVisible=\{false\}[\s\S]*?\/>/,
    );
  });

  test('empty-space menu — Reveal in Finder + Open in Terminal are Electron-only (D34)', () => {
    expect(SRC).toMatch(/\{bridge\s*\?\s*\([\s\S]*?empty-space-menu-reveal-in-finder/);
    expect(SRC).toMatch(/\{bridge\s*\?\s*\([\s\S]*?empty-space-menu-open-in-terminal/);
  });

  test('empty-space menu — Copy full path renders unconditionally per D36 (no bridge gate)', () => {
    const copyIdx = SRC.indexOf('data-testid="empty-space-menu-copy-full-path"');
    expect(copyIdx).toBeGreaterThan(-1);
    const windowBefore = SRC.slice(Math.max(0, copyIdx - 400), copyIdx);
    const lastBridgeOpenIdx = windowBefore.lastIndexOf('{bridge ?');
    if (lastBridgeOpenIdx >= 0) {
      const fragment = windowBefore.slice(lastBridgeOpenIdx);
      expect(fragment).toMatch(/:\s*null\}/);
    }
  });

  test('empty-space menu — disabled-with-hint pattern uses "No workspace" affordance (US-008)', () => {
    expect(SRC).toMatch(
      /aria-label=\{workspace\s*\?\s*['"]Reveal in Finder['"]\s*:\s*['"]Reveal in Finder,\s*No workspace['"]\}/,
    );
    expect(SRC).toMatch(
      /aria-label=\{workspace\s*\?\s*['"]Open in Terminal['"]\s*:\s*['"]Open in Terminal,\s*No workspace['"]\}/,
    );
    expect(SRC).toMatch(
      /aria-label=\{workspace\s*\?\s*['"]Copy full path['"]\s*:\s*['"]Copy full path,\s*No workspace['"]\}/,
    );
  });

  test('empty-space menu — Show . / Show all toggles bind to projectLocalBinding (US-008)', () => {
    expect(SRC).toMatch(/merged\?\.appearance\?\.sidebar\?\.showHiddenFiles\s*\?\?\s*false/);
    expect(SRC).toMatch(/merged\?\.appearance\?\.sidebar\?\.showAllFiles\s*\?\?\s*false/);
    expect(SRC).toMatch(
      /projectLocalBinding\.patch\(\s*\{\s*appearance:\s*\{\s*sidebar:\s*\{\s*showHiddenFiles:\s*checked/,
    );
    expect(SRC).toMatch(
      /projectLocalBinding\.patch\(\s*\{\s*appearance:\s*\{\s*sidebar:\s*\{\s*showAllFiles:\s*checked/,
    );
    expect(SRC).toMatch(/disabled=\{projectLocalBinding\s*===\s*null\}/);
  });

  test('empty-space menu — smart-hide gates for tree-state section (D15 / FR7)', () => {
    expect(SRC).toMatch(/const\s+showEmptySpaceExpandAll\s*=\s*hasFolders\s*&&\s*!allExpanded\s*;/);
    expect(SRC).toMatch(
      /const\s+showEmptySpaceCollapseAll\s*=\s*hasFolders\s*&&\s*!noneExpanded\s*;/,
    );
    expect(SRC).toMatch(
      /const\s+showEmptySpaceTreeStateSection\s*=\s*showEmptySpaceExpandAll\s*\|\|\s*showEmptySpaceCollapseAll\s*;/,
    );
    expect(SRC).toMatch(
      /\{showEmptySpaceTreeStateSection\s*\?\s*<ContextMenuSeparator\s*\/>\s*:\s*null\}/,
    );
    expect(SRC).toMatch(/\{showEmptySpaceExpandAll\s*\?\s*\([\s\S]*?Expand all/);
    expect(SRC).toMatch(/\{showEmptySpaceCollapseAll\s*\?\s*\([\s\S]*?Collapse all/);
  });

  test('empty-space menu — creation actions target the project root (D10)', () => {
    expect(SRC).toMatch(
      /const\s+handleEmptySpaceCreateFile\s*=\s*\(\)\s*=>\s*\{[\s\S]*?tree\?\.startCreating\(\s*['"]file['"]\s*,\s*['"]['"]\s*\)/,
    );
    expect(SRC).toMatch(
      /const\s+handleEmptySpaceCreateFromTemplate\s*=\s*\(\)\s*=>\s*\{[\s\S]*?tree\?\.startCreatingFromTemplate\(\s*['"]['"]\s*\)/,
    );
    expect(SRC).toMatch(
      /const\s+handleEmptySpaceCreateFolder\s*=\s*\(\)\s*=>\s*\{[\s\S]*?tree\?\.startCreating\(\s*['"]folder['"]\s*,\s*['"]['"]\s*\)/,
    );
  });

  test('empty-space menu — Open with AI submenu input uses buildProjectScopedHandoffInput (US-008)', () => {
    expect(SRC).toMatch(
      /const\s+emptySpaceHandoffInput\s*=\s*buildProjectScopedHandoffInput\(\s*\{\s*workspace\s*\}\s*\)/,
    );
  });

  test('empty-space menu — copy-to-clipboard uses navigator API per D36 (no bridge)', () => {
    expect(SRC).toMatch(/navigator\.clipboard\.writeText\(\s*workspace\.contentDir\s*\)/);
  });

  test('pill row fades synchronously with the toolbar during sidebar collapse (structurally anchored)', () => {
    const sidebarHeaderBlock = SRC.match(
      /SidebarHeader\s*\n?\s*className=\{cn\(([\s\S]*?h-12[\s\S]*?)\)\}/,
    )?.[1];
    expect(sidebarHeaderBlock).toBeTruthy();
    expect(sidebarHeaderBlock).toMatch(/shouldFadeChrome\s*&&\s*['"]opacity-0['"]/);
    expect(sidebarHeaderBlock).toMatch(
      /motion-safe:transition-opacity\s+motion-safe:duration-100\s+motion-safe:ease-out/,
    );

    const pillRowBlock = SRC.match(/cn\(\s*\n?\s*\/\/[\s\S]*?['"]px-2 pb-2['"]([\s\S]*?)\)/)?.[1];
    expect(pillRowBlock).toBeTruthy();
    expect(pillRowBlock).toMatch(/shouldFadeChrome\s*&&\s*['"]opacity-0['"]/);
    expect(pillRowBlock).toMatch(
      /motion-safe:transition-opacity\s+motion-safe:duration-100\s+motion-safe:ease-out/,
    );
  });
});

describe('FileSidebar onMenuAction subscriber (US-020 + US-021)', () => {
  test('subscribes via the canonical bridge.onMenuAction surface', () => {
    expect(SRC).toMatch(/return\s+bridge\.onMenuAction\(\s*\(action\)\s*=>\s*\{/);
  });

  test('gates the subscription on bridge being present (web mode is no-op)', () => {
    const menuActionBlock =
      SRC.split('macOS menu-action subscriber')[1]?.split('return (')[0] ?? '';
    expect(menuActionBlock).toMatch(/if\s*\(!bridge\)\s*return\s*;/);
  });

  test('switch contains a case for every state-aware US-020 / US-021 action', () => {
    const ACTIONS = [
      'new-doc',
      'new-folder',
      'new-from-template',
      'rename',
      'move-to-trash',
      'reveal-in-finder',
      'open-in-terminal',
      'send-to-ai',
      'copy-full-path',
      'copy-relative-path',
      'toggle-show-hidden-files',
      'toggle-show-all-files',
      'expand-all-tree',
      'collapse-all-tree',
    ];
    for (const action of ACTIONS) {
      expect(SRC).toMatch(new RegExp(`case\\s+['"]${action}['"]\\s*:`));
    }
  });

  test('move-to-trash routes through the FileTree event bus, not a direct HTTP call', () => {
    expect(SRC).toMatch(/emitFileTreeMenuActionDelete\(\s*activeTarget\s*\)/);
  });

  test('rename routes through the FileTree event bus, not a console warn', () => {
    expect(SRC).toMatch(/emitFileTreeMenuActionRename\(\s*activeTarget\s*\)/);
    expect(SRC).not.toMatch(/file-menu-rename-unsupported/);
  });

  test('reveal-in-finder + open-in-terminal go through the typed bridge.shell.* surface', () => {
    expect(SRC).toMatch(/bridge\.shell\.showItemInFolder\(\s*absPath\s*\)/);
    expect(SRC).toMatch(/dispatchOpenInTerminal\(\s*bridge\s*,\s*dirAbsPath\s*\)/);
    expect(SRC).toMatch(/dispatchOpenInTerminal\(\s*bridge\s*,\s*workspace\.contentDir\s*\)/);
  });

  test('toggle actions flip projectLocalBinding via .patch + surface validation failures', () => {
    expect(SRC).toMatch(
      /const result = projectLocalBinding\.patch\(\s*\{[\s\S]*?showHiddenFiles:\s*!showHiddenFiles/,
    );
    expect(SRC).toMatch(
      /const result = projectLocalBinding\.patch\(\s*\{[\s\S]*?showAllFiles:\s*!showAllFiles/,
    );
    expect(SRC).toMatch(/if \(!result\.ok\)/);
    expect(SRC).toMatch(/humanFormat\(result\.error\)/);
  });

  test('expand-all-tree + collapse-all-tree dispatch through the tree handle', () => {
    expect(SRC).toMatch(/case\s+['"]expand-all-tree['"]\s*:\s*\{\s*tree\?\.expandAll\(\)/);
    expect(SRC).toMatch(/case\s+['"]collapse-all-tree['"]\s*:\s*\{\s*tree\?\.collapseAll\(\)/);
  });
});

describe('FileSidebar view-menu state push (US-021)', () => {
  test('declares a useEffect that calls bridge.editor.notifyViewMenuStateChanged', () => {
    expect(SRC).toMatch(/bridge\.editor\.notifyViewMenuStateChanged\(\s*\{/);
  });

  test('snapshot fields cover the full ViewMenuStateSnapshot shape', () => {
    const pushBlock =
      SRC.split('Push the View menu')[1]?.split('macOS menu-action subscriber')[0] ?? '';
    expect(pushBlock).toMatch(/showHiddenFiles/);
    expect(pushBlock).toMatch(/showAllFiles/);
    expect(pushBlock).toMatch(/canExpandAll:\s*showEmptySpaceExpandAll/);
    expect(pushBlock).toMatch(/canCollapseAll:\s*showEmptySpaceCollapseAll/);
  });

  test('gates the push on bridge being present (web mode is no-op)', () => {
    const pushBlock =
      SRC.split('Push the View menu')[1]?.split('macOS menu-action subscriber')[0] ?? '';
    expect(pushBlock).toMatch(/if\s*\(!bridge\)\s*return\s*;/);
  });

  test('effect deps include the visibility flags AND the smart-hide signals', () => {
    const pushBlock =
      SRC.split('Push the View menu')[1]?.split('macOS menu-action subscriber')[0] ?? '';
    expect(pushBlock).toMatch(
      /\[\s*bridge\s*,\s*showHiddenFiles\s*,\s*showAllFiles\s*,\s*showEmptySpaceExpandAll\s*,\s*showEmptySpaceCollapseAll\s*\]/,
    );
  });

  test('canExpandAll / canCollapseAll mirror the empty-space menu gates exactly', () => {
    const pushBlock =
      SRC.split('Push the View menu')[1]?.split('macOS menu-action subscriber')[0] ?? '';
    expect(pushBlock).toContain('showEmptySpaceExpandAll');
    expect(pushBlock).toContain('showEmptySpaceCollapseAll');
  });
});
