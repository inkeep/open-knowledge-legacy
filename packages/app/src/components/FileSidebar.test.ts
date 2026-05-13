import { describe, expect, test } from 'bun:test';
import SRC from './FileSidebar?raw';

describe('FileSidebar module', () => {
  test('exports the FileSidebar component', async () => {
    const mod = await import('./FileSidebar');
    expect(typeof mod.FileSidebar).toBe('function');
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
