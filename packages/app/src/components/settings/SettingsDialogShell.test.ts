import { describe, expect, test } from 'bun:test';
import SRC from './SettingsDialogShell?raw';

describe('SettingsDialogShell module', () => {
  test('exports SettingsDialogShell component', async () => {
    const mod = await import('./SettingsDialogShell');
    expect(typeof mod.SettingsDialogShell).toBe('function');
  });
});

describe('SettingsDialogShell source-level guards', () => {
  test('renders as a Dialog overlay (matches the redesign IA)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/dialog['"]/);
    expect(SRC).toMatch(/<Dialog\s+open=\{open\}/);
    expect(SRC).toMatch(/<DialogContent\b[\s\S]*?data-testid="settings-dialog"/);
  });

  test('Suspense fallback is a non-null content skeleton wrapping the lazy body', () => {
    expect(SRC).not.toMatch(/<Suspense\s+fallback=\{null\}/);
    expect(SRC).toMatch(/<Suspense\s+fallback=\{<SettingsContentSkeleton\s*\/>\}/);
    expect(SRC).toMatch(/<SettingsDialogBodyLazy\b/);
    expect(SRC).toContain('function SettingsContentSkeleton');
  });

  test('the lazy body Suspense is wrapped by SettingsDialogErrorBoundary (failure containment)', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/settings\/SettingsDialogErrorBoundary['"]/);
    expect(SRC).toMatch(
      /<SettingsDialogErrorBoundary>\s*<Suspense\s+fallback=\{<SettingsContentSkeleton\s*\/>\}/,
    );
  });

  test('consumes the body via the preloadable SettingsDialogBodyLazy module', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/settings\/SettingsDialogBodyLazy['"]/);
    expect(SRC).toContain('SettingsDialogBodyLazy');
    expect(SRC).not.toMatch(/\blazy\(/);
    expect(SRC).not.toMatch(/import\(['"]\.\/SettingsDialogBody['"]\)/);
  });

  test('consumes the user-scope ConfigBinding via useConfigContext()', () => {
    expect(SRC).toContain('useConfigContext');
    expect(SRC).toContain('userBinding');
    expect(SRC).toContain('userSynced');
    expect(SRC).toMatch(/userBinding=\{userSynced\s*\?\s*userBinding\s*:\s*null\}/);
    expect(SRC).not.toContain('useUserConfigDocConnection');
    expect(SRC).not.toMatch(/from\s+['"]@hocuspocus\/provider['"]/);
    expect(SRC).not.toMatch(/import\s+\*\s+as\s+Y\s+from\s+['"]yjs['"]/);
    expect(SRC).not.toMatch(/\bbindConfigDoc\(/);
  });

  test('resets to the Preferences page on each fresh open', () => {
    expect(SRC).toMatch(/useState<string>\(\s*['"]preferences['"]\s*\)/);
    expect(SRC).toMatch(/if\s*\(open\)\s*setActiveId\(\s*['"]preferences['"]\s*\)/);
  });

  test('sidebar exposes the three required group labels', () => {
    expect(SRC).toContain("label: 'User'");
    expect(SRC).toContain("label: 'This project'");
    expect(SRC).toContain("label: 'Integrations'");
  });

  test('Integrations sidebar item hides when desktopPresent === false', () => {
    expect(SRC).toMatch(/desktopPresent\s*\?\s*\[\{[^}]*id:\s*['"]claude-desktop['"]/);
  });

  test('no top-level scope toggle in the dialog header', () => {
    expect(SRC).not.toMatch(/value=\{scope\}/);
    expect(SRC).not.toMatch(/aria-label=["']Settings scope["']/);
  });

  test('hasProject derives from collabUrl !== null', () => {
    expect(SRC).toMatch(/collabUrl\s*!==\s*null/);
    expect(SRC).toContain('useDocumentContext');
  });

  test('sidebar is a single labeled <nav> landmark (no outer <aside>)', () => {
    expect(SRC).toMatch(/<nav\s+aria-label="Settings sections"/);
    expect(SRC).not.toMatch(/<aside\b/);
    expect(SRC).not.toMatch(/<nav>/);
  });

  test('active sidebar item uses aria-current="page" (in-dialog navigator)', () => {
    expect(SRC).toMatch(/aria-current=\{activeId === item\.id \? ['"]page['"] : undefined\}/);
    expect(SRC).not.toMatch(/aria-current=\{activeId === item\.id \? ['"]true['"]/);
  });

  test('disabled sidebar buttons describe themselves via the group caption', () => {
    expect(SRC).toMatch(/aria-describedby=\{group\.enabled \? undefined : captionId\}/);
    expect(SRC).toContain('captionId');
  });

  test('SettingsContentSkeleton announces loading via role=status + aria-busy', () => {
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/aria-live="polite"/);
    expect(SRC).toMatch(/aria-busy="true"/);
    expect(SRC).toContain('Loading settings');
  });
});
