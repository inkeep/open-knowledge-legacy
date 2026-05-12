import { describe, expect, test } from 'bun:test';
import SRC from './EditorHeader?raw';

describe('EditorHeader module', () => {
  test('exports the EditorHeader component', async () => {
    const mod = await import('./EditorHeader');
    expect(typeof mod.EditorHeader).toBe('function');
  });
});

describe('EditorHeader source-level guards — chrome-row retrofit', () => {
  test('detects Electron host via the canonical window.okDesktop != null idiom', () => {
    expect(SRC).toMatch(
      /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.okDesktop\s*!=\s*null/,
    );
    expect(SRC).toContain('const isElectronHost');
  });

  test('drag region opts in always-on in Electron mode (sidebar state independent)', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[-webkit-app-region:drag\]['"]/);
  });

  test('traffic-light reserve only engages when sidebar is collapsed (offcanvas)', () => {
    expect(SRC).toContain("const isCollapsed = sidebarState === 'collapsed';");
    expect(SRC).toMatch(/isElectronHost\s*&&\s*isCollapsed\s*&&\s*['"]pl-\[78px\]['"]/);
  });

  test('animates the traffic-light-reserve change with shadcn sidebar timing', () => {
    expect(SRC).toMatch(
      /motion-safe:transition-\[padding\]\s+motion-safe:duration-200\s+motion-safe:ease-linear/,
    );
  });

  test('SidebarTrigger opts out of drag region in Electron mode (interactive child)', () => {
    expect(SRC).toMatch(
      /SidebarTrigger[\s\S]*?isElectronHost\s*&&\s*['"]\[-webkit-app-region:no-drag\]['"]/,
    );
  });

  test('right zone uses [&>*] child combinator to opt every direct child out of drag region', () => {
    expect(SRC).toMatch(/isElectronHost\s*&&\s*['"]\[&>\*\]:\[-webkit-app-region:no-drag\]['"]/);
  });

  test('cn helper from @/lib/utils is used to compose conditional classes', () => {
    expect(SRC).toMatch(/from\s+['"]@\/lib\/utils['"]/);
    expect(SRC).toContain('cn(');
  });

  test('does NOT introduce a new <AppTopBar /> component (EditorHeader IS the chrome row)', () => {
    expect(SRC).not.toMatch(/AppTopBar/);
  });

  test('does NOT add a project name to EditorHeader (project name lives in FileSidebar header)', () => {
    expect(SRC).not.toMatch(/projectName/);
  });

  test('header root retains structural layout primitives (h-12 + flex + items-center)', () => {
    expect(SRC).toMatch(/flex h-12 shrink-0 items-center/);
  });

  test('header root applies a divider treatment between header and editor body', () => {
    expect(SRC).toMatch(/border-b|shadow-\[inset_0_-1px_0_var\(--border\)\]/);
  });
});
