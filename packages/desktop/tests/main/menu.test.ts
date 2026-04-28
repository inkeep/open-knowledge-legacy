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

  test('Switch Project click dispatches deps.openNavigator()', () => {
    const openNavigator = mock(() => {});
    const deps = makeDeps({ openNavigator });
    const template = buildMenuTemplate(deps);
    const switchProject = findByLabel(template, 'Switch Project…');
    expect(switchProject).toBeDefined();
    (switchProject?.click as (() => void) | undefined)?.();
    expect(openNavigator).toHaveBeenCalledTimes(1);
  });

  test('Switch Project preserves Cmd+Shift+N accelerator (muscle-memory contract)', () => {
    const template = buildMenuTemplate(makeDeps());
    const switchProject = findByLabel(template, 'Switch Project…');
    expect(switchProject?.accelerator).toBe('CmdOrCtrl+Shift+N');
  });

  test('"New Project…" label no longer appears in any submenu', () => {
    // Regression guard against partial rename — the old verb was misleading
    // because the underlying action covers create AND open AND list.
    const template = buildMenuTemplate(makeDeps());
    expect(findByLabel(template, 'New Project…')).toBeUndefined();
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

  describe('CLI-on-PATH menu item (M6a / D52)', () => {
    const macOnly = process.platform === 'darwin';
    const macOnlyTest = macOnly ? test : test.skip;

    macOnlyTest(
      'cliInstallStatus returning "not-installed" inserts "Install Command-Line Tools…"',
      () => {
        const deps = makeDeps({
          cliInstallStatus: () => 'not-installed',
          toggleCliInstall: mock(() => {}),
        });
        const template = buildMenuTemplate(deps);
        const install = findByLabel(template, 'Install Command-Line Tools…');
        expect(install).toBeDefined();
        const uninstall = findByLabel(template, 'Uninstall Command-Line Tools');
        expect(uninstall).toBeUndefined();
      },
    );

    macOnlyTest(
      'cliInstallStatus returning "installed" flips label to "Uninstall Command-Line Tools"',
      () => {
        const deps = makeDeps({
          cliInstallStatus: () => 'installed',
          toggleCliInstall: mock(() => {}),
        });
        const template = buildMenuTemplate(deps);
        const uninstall = findByLabel(template, 'Uninstall Command-Line Tools');
        expect(uninstall).toBeDefined();
        const install = findByLabel(template, 'Install Command-Line Tools…');
        expect(install).toBeUndefined();
      },
    );

    macOnlyTest(
      'cliInstallStatus returning "broken" renders the Install label (same as not-installed)',
      () => {
        // 'broken' is primarily a launch-time-repair signal, but the menu
        // item must stay clickable so users with a broken symlink have an
        // alternate recovery affordance to the repair dialog.
        const deps = makeDeps({
          cliInstallStatus: () => 'broken',
          toggleCliInstall: mock(() => {}),
        });
        const template = buildMenuTemplate(deps);
        expect(findByLabel(template, 'Install Command-Line Tools…')).toBeDefined();
      },
    );

    test('cliInstallStatus returning null hides the menu item on every platform', () => {
      const deps = makeDeps({
        cliInstallStatus: () => null,
        toggleCliInstall: mock(() => {}),
      });
      const template = buildMenuTemplate(deps);
      expect(findByLabel(template, 'Install Command-Line Tools…')).toBeUndefined();
      expect(findByLabel(template, 'Uninstall Command-Line Tools')).toBeUndefined();
    });

    test('omitting cliInstallStatus hides the menu item (backward-compat default)', () => {
      // Existing callers that don't opt in get the pre-M6a behavior — the
      // menu renders without any CLI-install item, matching the current
      // shape asserted by the top-level-menus test above.
      const deps = makeDeps();
      const template = buildMenuTemplate(deps);
      expect(findByLabel(template, 'Install Command-Line Tools…')).toBeUndefined();
      expect(findByLabel(template, 'Uninstall Command-Line Tools')).toBeUndefined();
    });

    macOnlyTest('menu item click dispatches deps.toggleCliInstall()', () => {
      const toggleCliInstall = mock(() => {});
      const deps = makeDeps({
        cliInstallStatus: () => 'not-installed',
        toggleCliInstall,
      });
      const template = buildMenuTemplate(deps);
      const install = findByLabel(template, 'Install Command-Line Tools…');
      expect(install).toBeDefined();
      (install?.click as (() => void) | undefined)?.();
      expect(toggleCliInstall).toHaveBeenCalledTimes(1);
    });

    macOnlyTest('menu item sits between Open Recent and the close/quit row', () => {
      // Regression guard on placement — spec calls for the item between
      // "Open Recent" and the trailing close/quit role. A future edit that
      // inserts it elsewhere (e.g. above Open Recent) would pass the
      // "item exists" tests above but break the File-submenu ordering.
      const deps = makeDeps({
        cliInstallStatus: () => 'not-installed',
        toggleCliInstall: mock(() => {}),
      });
      const template = buildMenuTemplate(deps);
      const file = findByLabel(template, 'File');
      const sub = file?.submenu as MenuItemConstructorOptions[] | undefined;
      if (!sub) throw new Error('File submenu missing');
      const installIdx = sub.findIndex((i) => i.label === 'Install Command-Line Tools…');
      const openRecentIdx = sub.findIndex((i) => i.label === 'Open Recent');
      const trailingRoleIdx = sub.findIndex((i) => i.role === 'close' || i.role === 'quit');
      expect(installIdx).toBeGreaterThan(openRecentIdx);
      expect(installIdx).toBeLessThan(trailingRoleIdx);
    });
  });

  describe('Edit → Find… (Cmd/Ctrl+F)', () => {
    test('Find item exists under Edit with the platform-portable accelerator', () => {
      const template = buildMenuTemplate(makeDeps());
      const find = findByLabel(template, 'Find…');
      expect(find).toBeDefined();
      expect(find?.accelerator).toBe('CmdOrCtrl+F');
    });

    test('Find click dispatches deps.showFindInPage()', () => {
      const showFindInPage = mock(() => {});
      const deps = makeDeps({ showFindInPage });
      const template = buildMenuTemplate(deps);
      const find = findByLabel(template, 'Find…');
      (find?.click as (() => void) | undefined)?.();
      expect(showFindInPage).toHaveBeenCalledTimes(1);
    });

    test('omitting showFindInPage still renders the menu item without crashing on click', () => {
      // Optional dep — non-Electron contexts (unit tests, embedded harnesses)
      // can render the menu without wiring the find surface and the click
      // becomes a no-op rather than a TypeError.
      const deps = makeDeps();
      const template = buildMenuTemplate(deps);
      const find = findByLabel(template, 'Find…');
      expect(find).toBeDefined();
      expect(() => (find?.click as (() => void) | undefined)?.()).not.toThrow();
    });
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
