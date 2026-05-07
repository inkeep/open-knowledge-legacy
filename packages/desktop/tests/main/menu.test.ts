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
    appName: 'Open Knowledge',
    dialog: {} as MenuDeps['dialog'],
    openNavigator: mock(() => {}),
    openProject: mock(() => Promise.resolve()),
    getRecentProjects: mock(() => []),
    clearRecentProjects: mock(() => {}),
    openExternalUrl: mock(() => {}),
    ...overrides,
  };
}

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
    expect(sub?.length).toBe(12);
    expect(sub?.[0]?.label).toBe('project-0');
    expect(sub?.[9]?.label).toBe('project-9');
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

  describe('Settings… menu item (US-010 / FR-1 / D54)', () => {
    const isMac = process.platform === 'darwin';

    test('Settings… is rendered with the CmdOrCtrl+, accelerator', () => {
      const deps = makeDeps({ openSettings: mock(() => {}) });
      const template = buildMenuTemplate(deps);
      const settings = findByLabel(template, 'Settings…');
      expect(settings).toBeDefined();
      expect(settings?.accelerator).toBe('CmdOrCtrl+,');
    });

    test('Settings… click dispatches deps.openSettings()', () => {
      const openSettings = mock(() => {});
      const deps = makeDeps({ openSettings });
      const template = buildMenuTemplate(deps);
      const settings = findByLabel(template, 'Settings…');
      (settings?.click as (() => void) | undefined)?.();
      expect(openSettings).toHaveBeenCalledTimes(1);
    });

    test('Settings… click is a safe no-op when openSettings dep is omitted', () => {
      const deps = makeDeps();
      const template = buildMenuTemplate(deps);
      const settings = findByLabel(template, 'Settings…');
      expect(() => (settings?.click as (() => void) | undefined)?.()).not.toThrow();
    });

    if (isMac) {
      test('macOS: Settings… lives in the App menu, between About and the services separator', () => {
        const deps = makeDeps({ openSettings: mock(() => {}) });
        const template = buildMenuTemplate(deps);
        const appMenu = template.find((t) => t.label === deps.appName);
        expect(appMenu).toBeDefined();
        const sub = appMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('App submenu missing on macOS');
        const aboutIdx = sub.findIndex((i) => i.role === 'about');
        const settingsIdx = sub.findIndex((i) => i.label === 'Settings…');
        const servicesIdx = sub.findIndex((i) => i.role === 'services');
        expect(aboutIdx).toBeGreaterThanOrEqual(0);
        expect(settingsIdx).toBeGreaterThan(aboutIdx);
        expect(settingsIdx).toBeLessThan(servicesIdx);
      });

      test('macOS: Settings… does NOT appear in the File submenu', () => {
        const deps = makeDeps({ openSettings: mock(() => {}) });
        const template = buildMenuTemplate(deps);
        const fileMenu = template.find((t) => t.label === 'File');
        const sub = fileMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('File submenu missing');
        const settingsInFile = sub.find((i) => i.label === 'Settings…');
        expect(settingsInFile).toBeUndefined();
      });
    } else {
      test('Windows/Linux: Settings… lives in the File submenu, above the trailing close/quit row', () => {
        const deps = makeDeps({ openSettings: mock(() => {}) });
        const template = buildMenuTemplate(deps);
        const fileMenu = template.find((t) => t.label === 'File');
        const sub = fileMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('File submenu missing');
        const settingsIdx = sub.findIndex((i) => i.label === 'Settings…');
        const trailingRoleIdx = sub.findIndex((i) => i.role === 'close' || i.role === 'quit');
        expect(settingsIdx).toBeGreaterThanOrEqual(0);
        expect(settingsIdx).toBeLessThan(trailingRoleIdx);
      });
    }
  });

  describe('Check for Updates… menu item', () => {
    const isMac = process.platform === 'darwin';

    test('omitted entirely when onCheckForUpdates dep is undefined (dev mode / boot failure)', () => {
      const deps = makeDeps();
      const template = buildMenuTemplate(deps);
      expect(findByLabel(template, 'Check for Updates…')).toBeUndefined();
    });

    if (isMac) {
      test('macOS: appears in App menu between About and Settings…', () => {
        const onCheckForUpdates = mock(() => {});
        const deps = makeDeps({ onCheckForUpdates, openSettings: mock(() => {}) });
        const template = buildMenuTemplate(deps);
        const appMenu = template.find((t) => t.label === deps.appName);
        const sub = appMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('App submenu missing');
        const aboutIdx = sub.findIndex((i) => i.role === 'about');
        const checkIdx = sub.findIndex((i) => i.label === 'Check for Updates…');
        const settingsIdx = sub.findIndex((i) => i.label === 'Settings…');
        expect(aboutIdx).toBeGreaterThanOrEqual(0);
        expect(checkIdx).toBeGreaterThan(aboutIdx);
        expect(settingsIdx).toBeGreaterThan(checkIdx);
      });

      test('macOS: also appears in Help menu (cross-platform discoverability)', () => {
        const onCheckForUpdates = mock(() => {});
        const deps = makeDeps({ onCheckForUpdates });
        const template = buildMenuTemplate(deps);
        const helpMenu = template.find((t) => t.label === 'Help');
        const sub = helpMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('Help submenu missing');
        expect(sub.find((i) => i.label === 'Check for Updates…')).toBeDefined();
      });
    } else {
      test('non-mac: appears in Help menu only (no App menu on these platforms)', () => {
        const onCheckForUpdates = mock(() => {});
        const deps = makeDeps({ onCheckForUpdates });
        const template = buildMenuTemplate(deps);
        const helpMenu = template.find((t) => t.label === 'Help');
        const sub = helpMenu?.submenu as MenuItemConstructorOptions[] | undefined;
        if (!sub) throw new Error('Help submenu missing');
        expect(sub.find((i) => i.label === 'Check for Updates…')).toBeDefined();
      });
    }

    test('click dispatches deps.onCheckForUpdates()', () => {
      const onCheckForUpdates = mock(() => {});
      const deps = makeDeps({ onCheckForUpdates });
      const template = buildMenuTemplate(deps);
      const item = findByLabel(template, 'Check for Updates…');
      if (!item || typeof item.click !== 'function')
        throw new Error('Check for Updates… click missing');
      (item.click as () => void)();
      expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
    });
  });

  test('macOS-branch behavior for the current test host', () => {
    const template = buildMenuTemplate(makeDeps());
    const file = findByLabel(template, 'File');
    const fileSub = file?.submenu as MenuItemConstructorOptions[] | undefined;
    const last = fileSub?.[fileSub.length - 1];
    expect(last).toBeDefined();
    expect(['close', 'quit']).toContain(last?.role);

    const windowMenu = findByLabel(template, 'Window');
    const windowSub = windowMenu?.submenu as MenuItemConstructorOptions[] | undefined;
    const roles = windowSub?.map((i) => i.role).filter(Boolean) ?? [];
    const hasZoom = roles.includes('zoom');
    const hasClose = roles.includes('close');
    const hasFront = roles.includes('front');
    const isMacBranch = hasZoom && hasFront;
    const isOtherBranch = hasClose && !hasZoom;
    expect(isMacBranch || isOtherBranch).toBe(true);
    expect(roles).toContain('minimize');
  });
});
