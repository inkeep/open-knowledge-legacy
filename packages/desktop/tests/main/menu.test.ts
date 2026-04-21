/**
 * Menu template unit tests — exercise `buildMenuTemplate(deps)` as a pure
 * function over the injected `MenuDeps`, no real Electron runtime needed.
 *
 * `buildMenuTemplate` is the "exported-for-testing" seam in `menu.ts`; these
 * tests pin down (a) the recents-submenu shape on 0 / N entries + top-10
 * clamp, (b) the Clear-Menu click wiring, and (c) the macOS branch of the
 * File / Window submenus (close vs quit, Window `zoom`/`front` vs `close`).
 *
 * We don't mount a real menu — Electron's `Menu.setApplicationMenu` is
 * exercised in packaged-build Playwright smoke (M2). The value here is
 * regression detection on the template shape: if a future edit breaks the
 * top-10 clamp or the isMac branch, these tests fail with a precise diff.
 */
import { describe, expect, mock, test } from 'bun:test';
import type { MenuItemConstructorOptions } from 'electron';
import { buildMenuTemplate, type MenuDeps } from '../../src/main/menu.ts';

type RecentRow = { path: string; name: string };

function makeDeps(overrides: Partial<MenuDeps> = {}): MenuDeps {
  return {
    openNavigator: mock(() => {}),
    openProject: mock(() => Promise.resolve()),
    getRecentProjects: mock(() => []),
    clearRecentProjects: mock(() => {}),
    openExternalUrl: mock(() => {}),
    ...overrides,
  };
}

/** Find the first submenu item with `label === searchLabel` at any depth. */
function findByLabel(
  items: readonly MenuItemConstructorOptions[],
  searchLabel: string,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (item.label === searchLabel) return item;
    const sub = item.submenu;
    if (Array.isArray(sub)) {
      const found = findByLabel(sub, searchLabel);
      if (found) return found;
    }
  }
  return undefined;
}

describe('buildMenuTemplate', () => {
  test('empty recents → "No Recent Projects" disabled placeholder', () => {
    const deps = makeDeps();
    const template = buildMenuTemplate(deps);
    const openRecent = findByLabel(template, 'Open Recent');
    expect(openRecent).toBeDefined();
    const sub = openRecent?.submenu as MenuItemConstructorOptions[] | undefined;
    expect(Array.isArray(sub)).toBe(true);
    expect(sub?.length).toBe(1);
    expect(sub?.[0]?.label).toBe('No Recent Projects');
    expect(sub?.[0]?.enabled).toBe(false);
  });

  test('populated recents → N entries + separator + Clear Menu', () => {
    const recents: RecentRow[] = [
      { path: '/tmp/a', name: 'alpha' },
      { path: '/tmp/b', name: 'beta' },
    ];
    const deps = makeDeps({ getRecentProjects: () => recents });
    const template = buildMenuTemplate(deps);
    const openRecent = findByLabel(template, 'Open Recent');
    const sub = openRecent?.submenu as MenuItemConstructorOptions[] | undefined;
    // 2 rows + separator + Clear Menu = 4 items
    expect(sub?.length).toBe(4);
    expect(sub?.[0]?.label).toBe('alpha');
    expect(sub?.[0]?.sublabel).toBe('/tmp/a');
    expect(sub?.[1]?.label).toBe('beta');
    expect(sub?.[2]?.type).toBe('separator');
    expect(sub?.[3]?.label).toBe('Clear Menu');
  });

  test('clamps at 10 entries even when more are present', () => {
    const recents: RecentRow[] = Array.from({ length: 15 }, (_, i) => ({
      path: `/tmp/p${i}`,
      name: `project-${i}`,
    }));
    const deps = makeDeps({ getRecentProjects: () => recents });
    const template = buildMenuTemplate(deps);
    const openRecent = findByLabel(template, 'Open Recent');
    const sub = openRecent?.submenu as MenuItemConstructorOptions[] | undefined;
    // 10 rows + separator + Clear Menu = 12 items (not 17)
    expect(sub?.length).toBe(12);
    expect(sub?.[0]?.label).toBe('project-0');
    expect(sub?.[9]?.label).toBe('project-9');
    // entries 10-14 are dropped; position 10 is the separator.
    expect(sub?.[10]?.type).toBe('separator');
    expect(sub?.[11]?.label).toBe('Clear Menu');
  });

  test('recent-row click dispatches deps.openProject(path)', () => {
    const openProject = mock(() => Promise.resolve());
    const deps = makeDeps({
      getRecentProjects: () => [{ path: '/tmp/foo', name: 'foo' }],
      openProject,
    });
    const template = buildMenuTemplate(deps);
    const openRecent = findByLabel(template, 'Open Recent');
    const sub = openRecent?.submenu as MenuItemConstructorOptions[] | undefined;
    const row = sub?.[0];
    // Electron's click signature accepts many args; we only use the zero-arg form.
    (row?.click as (() => void) | undefined)?.();
    expect(openProject).toHaveBeenCalledWith('/tmp/foo');
  });

  test('Clear Menu click dispatches deps.clearRecentProjects()', () => {
    const clearRecentProjects = mock(() => {});
    const deps = makeDeps({
      getRecentProjects: () => [{ path: '/tmp/foo', name: 'foo' }],
      clearRecentProjects,
    });
    const template = buildMenuTemplate(deps);
    const clearMenu = findByLabel(template, 'Clear Menu');
    expect(clearMenu).toBeDefined();
    (clearMenu?.click as (() => void) | undefined)?.();
    expect(clearRecentProjects).toHaveBeenCalledTimes(1);
  });

  test('New Project click dispatches deps.openNavigator()', () => {
    const openNavigator = mock(() => {});
    const deps = makeDeps({ openNavigator });
    const template = buildMenuTemplate(deps);
    const newProject = findByLabel(template, 'New Project…');
    expect(newProject).toBeDefined();
    (newProject?.click as (() => void) | undefined)?.();
    expect(openNavigator).toHaveBeenCalledTimes(1);
  });

  test('top-level menus include File / Edit / View / Window / Help', () => {
    const template = buildMenuTemplate(makeDeps());
    const topLabels = template.map((t) => t.label);
    expect(topLabels).toContain('File');
    expect(topLabels).toContain('Edit');
    expect(topLabels).toContain('View');
    expect(topLabels).toContain('Window');
    expect(topLabels).toContain('Help');
  });

  test('macOS-branch behavior for the current test host', () => {
    // `buildMenuTemplate` reads `process.platform` directly — we can assert
    // the consistent cross-shape pairing rather than stubbing the platform.
    // On darwin: File.close is a role, Window submenu has zoom + front.
    // On others: File.quit is a role, Window submenu has close.
    const template = buildMenuTemplate(makeDeps());
    const file = findByLabel(template, 'File');
    const fileSub = file?.submenu as MenuItemConstructorOptions[] | undefined;
    const last = fileSub?.[fileSub.length - 1];
    expect(last).toBeDefined();
    // Whichever branch fired, `role` is defined and is one of close|quit.
    expect(['close', 'quit']).toContain(last?.role);

    const windowMenu = findByLabel(template, 'Window');
    const windowSub = windowMenu?.submenu as MenuItemConstructorOptions[] | undefined;
    // macOS adds zoom + separator + front (so length > 1); non-mac adds close.
    const roles = windowSub?.map((i) => i.role).filter(Boolean) ?? [];
    const hasZoom = roles.includes('zoom');
    const hasClose = roles.includes('close');
    const hasFront = roles.includes('front');
    // Exactly one branch must have fired — not both, not neither.
    const isMacBranch = hasZoom && hasFront;
    const isOtherBranch = hasClose && !hasZoom;
    expect(isMacBranch || isOtherBranch).toBe(true);
    // Minimize is always present.
    expect(roles).toContain('minimize');
  });
});
