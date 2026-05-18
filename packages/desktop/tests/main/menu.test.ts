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
    showDevToolsMenu: true,
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

  test('recent-row click dispatches deps.openProject(path, "recents")', () => {
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
    expect(openProject).toHaveBeenCalledWith('/tmp/foo', 'recents');
  });

  test('File → Open Folder click dispatches deps.openProject(path, "pick-existing")', async () => {
    const openProject = mock(() => Promise.resolve());
    const showOpenDialog = mock(() =>
      Promise.resolve({ canceled: false, filePaths: ['/tmp/picked'] }),
    );
    const deps = makeDeps({
      openProject,
      dialog: { showOpenDialog } as unknown as MenuDeps['dialog'],
    });
    const template = buildMenuTemplate(deps);
    const openFolder = findByLabel(template, 'Open Folder…');
    expect(openFolder).toBeDefined();
    await (openFolder?.click as (() => Promise<void>) | undefined)?.();
    expect(openProject).toHaveBeenCalledWith('/tmp/picked', 'pick-existing');
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

  test('Switch Project rebound to Cmd+Shift+P (FR19 / D39 — Cmd+Shift+N now owns New Folder)', () => {
    const template = buildMenuTemplate(makeDeps());
    const switchProject = findByLabel(template, 'Switch Project…');
    expect(switchProject?.accelerator).toBe('CmdOrCtrl+Shift+P');
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

  describe('View → Reload / Force Reload / Toggle Developer Tools cluster', () => {
    function viewRoles(deps: MenuDeps): Array<string | undefined> {
      const template = buildMenuTemplate(deps);
      const view = template.find((t) => t.label === 'View');
      const sub = view?.submenu as MenuItemConstructorOptions[] | undefined;
      return sub?.map((item) => item.role) ?? [];
    }

    test('showDevToolsMenu: true exposes the dev cluster (dev + beta channel)', () => {
      const roles = viewRoles(makeDeps({ showDevToolsMenu: true }));
      expect(roles).toContain('reload');
      expect(roles).toContain('forceReload');
      expect(roles).toContain('toggleDevTools');
      expect(roles).toContain('resetZoom');
      expect(roles).toContain('zoomIn');
      expect(roles).toContain('zoomOut');
      expect(roles).toContain('togglefullscreen');
    });

    test('showDevToolsMenu: false hides the dev cluster (stable channel)', () => {
      const roles = viewRoles(makeDeps({ showDevToolsMenu: false }));
      expect(roles).not.toContain('reload');
      expect(roles).not.toContain('forceReload');
      expect(roles).not.toContain('toggleDevTools');
      expect(roles).toContain('resetZoom');
      expect(roles).toContain('zoomIn');
      expect(roles).toContain('zoomOut');
      expect(roles).toContain('togglefullscreen');
    });
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

describe('buildMenuTemplate — File menu state-aware items (US-020 / FR16 + FR19)', () => {
  test('New File renders with Cmd+N accelerator (FR19 — was unbound today)', () => {
    const template = buildMenuTemplate(makeDeps({ onNewFile: mock(() => {}) }));
    const newFile = findByLabel(template, 'New File');
    expect(newFile).toBeDefined();
    expect(newFile?.accelerator).toBe('CmdOrCtrl+N');
  });

  test('New Folder renders with Cmd+Shift+N accelerator (FR19 — rebound from Switch Project)', () => {
    const template = buildMenuTemplate(makeDeps({ onNewFolder: mock(() => {}) }));
    const newFolder = findByLabel(template, 'New Folder');
    expect(newFolder).toBeDefined();
    expect(newFolder?.accelerator).toBe('CmdOrCtrl+Shift+N');
  });

  test('Move to Trash renders with Cmd+Delete accelerator (FR19 — matches Finder + VSCode)', () => {
    const template = buildMenuTemplate(makeDeps({ onMoveToTrash: mock(() => {}) }));
    const moveToTrash = findByLabel(template, 'Move to Trash');
    expect(moveToTrash).toBeDefined();
    expect(moveToTrash?.accelerator).toBe('CmdOrCtrl+Delete');
  });

  test('Rename + Move to Trash DISABLED in project scope (activeTarget.kind = null)', () => {
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: null },
        onRename: mock(() => {}),
        onMoveToTrash: mock(() => {}),
      }),
    );
    expect(findByLabel(template, 'Rename')?.enabled).toBe(false);
    expect(findByLabel(template, 'Move to Trash')?.enabled).toBe(false);
  });

  test('Rename + Move to Trash ENABLED in doc scope (activeTarget.kind = "doc")', () => {
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: 'doc', identifier: 'notes/today' },
        onRename: mock(() => {}),
        onMoveToTrash: mock(() => {}),
      }),
    );
    expect(findByLabel(template, 'Rename')?.enabled).toBe(true);
    expect(findByLabel(template, 'Move to Trash')?.enabled).toBe(true);
  });

  test('Rename + Move to Trash ENABLED in folder scope (activeTarget.kind = "folder")', () => {
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: 'folder', identifier: 'specs/2026' },
        onRename: mock(() => {}),
        onMoveToTrash: mock(() => {}),
      }),
    );
    expect(findByLabel(template, 'Rename')?.enabled).toBe(true);
    expect(findByLabel(template, 'Move to Trash')?.enabled).toBe(true);
  });

  test('Rename DISABLED when activeTarget is undefined (deps missing — unit-test default)', () => {
    const template = buildMenuTemplate(makeDeps({ onRename: mock(() => {}) }));
    expect(findByLabel(template, 'Rename')?.enabled).toBe(false);
  });

  test('Creation cluster + Reveal/Terminal/Send-to-AI/CopyPath always ENABLED when deps provided', () => {
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: null },
        onNewFile: mock(() => {}),
        onNewFolder: mock(() => {}),
        onNewFromTemplate: mock(() => {}),
        onRevealInFinder: mock(() => {}),
        onOpenInTerminal: mock(() => {}),
        onSendToAi: mock(() => {}),
        onCopyFullPath: mock(() => {}),
        onCopyRelativePath: mock(() => {}),
      }),
    );
    expect(findByLabel(template, 'New File')?.enabled).toBe(true);
    expect(findByLabel(template, 'New Folder')?.enabled).toBe(true);
    expect(findByLabel(template, 'New from Template…')?.enabled).toBe(true);
    expect(findByLabel(template, 'Reveal in Finder')?.enabled).toBe(true);
    expect(findByLabel(template, 'Open in Terminal')?.enabled).toBe(true);
    expect(findByLabel(template, 'Open with AI')?.enabled).toBe(true);
    expect(findByLabel(template, 'Copy Path')?.enabled).toBe(true);
  });

  test('Items DISABLED when their handler dep is undefined (unit-test default = unwired)', () => {
    const template = buildMenuTemplate(makeDeps());
    expect(findByLabel(template, 'New File')?.enabled).toBe(false);
    expect(findByLabel(template, 'New Folder')?.enabled).toBe(false);
    expect(findByLabel(template, 'New from Template…')?.enabled).toBe(false);
    expect(findByLabel(template, 'Reveal in Finder')?.enabled).toBe(false);
    expect(findByLabel(template, 'Open in Terminal')?.enabled).toBe(false);
    expect(findByLabel(template, 'Open with AI')?.enabled).toBe(false);
    expect(findByLabel(template, 'Copy Path')?.enabled).toBe(false);
  });

  test('Copy Path submenu renders Full Path + Relative Path (FR9 parity with sidebar)', () => {
    const template = buildMenuTemplate(
      makeDeps({
        onCopyFullPath: mock(() => {}),
        onCopyRelativePath: mock(() => {}),
      }),
    );
    const copyPath = findByLabel(template, 'Copy Path');
    expect(copyPath).toBeDefined();
    const sub = copyPath?.submenu as MenuItemConstructorOptions[] | undefined;
    expect(sub?.[0]?.label).toBe('Full Path');
    expect(sub?.[1]?.label).toBe('Relative Path');
  });

  test('click handlers dispatch to deps (e.g. New File → onNewFile)', () => {
    const onNewFile = mock(() => {});
    const onMoveToTrash = mock(() => {});
    const onCopyFullPath = mock(() => {});
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: 'doc', identifier: 'a' },
        onNewFile,
        onMoveToTrash,
        onCopyFullPath,
      }),
    );
    (findByLabel(template, 'New File')?.click as (() => void) | undefined)?.();
    expect(onNewFile).toHaveBeenCalledTimes(1);
    (findByLabel(template, 'Move to Trash')?.click as (() => void) | undefined)?.();
    expect(onMoveToTrash).toHaveBeenCalledTimes(1);
    (findByLabel(template, 'Full Path')?.click as (() => void) | undefined)?.();
    expect(onCopyFullPath).toHaveBeenCalledTimes(1);
  });

  test('Hide this file / Hide folder do NOT appear in File menu (D37 trim — stays sidebar-only)', () => {
    const template = buildMenuTemplate(
      makeDeps({
        activeTarget: { kind: 'doc', identifier: 'a' },
      }),
    );
    expect(findByLabel(template, 'Hide this file')).toBeUndefined();
    expect(findByLabel(template, 'Hide folder')).toBeUndefined();
  });
});

describe('buildMenuTemplate — View menu visibility toggles + tree-scoped expand/collapse', () => {
  test('Show Hidden Files renders as a checkbox-type item', () => {
    const template = buildMenuTemplate(
      makeDeps({ onToggleShowHiddenFiles: mock(() => {}), showHiddenFilesChecked: false }),
    );
    const item = findByLabel(template, 'Show Hidden Files');
    expect(item).toBeDefined();
    expect(item?.type).toBe('checkbox');
    expect(item?.checked).toBe(false);
    expect(item?.enabled).toBe(true);
  });

  test('Show Hidden Files binds Cmd+Shift+. accelerator (Finder convention)', () => {
    const template = buildMenuTemplate(
      makeDeps({ onToggleShowHiddenFiles: mock(() => {}), showHiddenFilesChecked: false }),
    );
    expect(findByLabel(template, 'Show Hidden Files')?.accelerator).toBe('CmdOrCtrl+Shift+.');
  });

  test('Show All Files renders as a checkbox-type item with checked state from deps', () => {
    const template = buildMenuTemplate(
      makeDeps({ onToggleShowAllFiles: mock(() => {}), showAllFilesChecked: true }),
    );
    const item = findByLabel(template, 'Show All Files');
    expect(item?.type).toBe('checkbox');
    expect(item?.checked).toBe(true);
  });

  test('Show Hidden Files DISABLED when toggle handler missing (unit-test default)', () => {
    const template = buildMenuTemplate(makeDeps());
    expect(findByLabel(template, 'Show Hidden Files')?.enabled).toBe(false);
    expect(findByLabel(template, 'Show All Files')?.enabled).toBe(false);
  });

  test('Expand All / Collapse All render with visible=true by default', () => {
    const template = buildMenuTemplate(
      makeDeps({ onExpandAll: mock(() => {}), onCollapseAll: mock(() => {}) }),
    );
    expect(findByLabel(template, 'Expand All')?.visible).toBe(true);
    expect(findByLabel(template, 'Collapse All')?.visible).toBe(true);
  });

  test('Expand All HIDDEN when canExpandAll === false (smart-hide per D15)', () => {
    const template = buildMenuTemplate(
      makeDeps({ onExpandAll: mock(() => {}), canExpandAll: false }),
    );
    expect(findByLabel(template, 'Expand All')?.visible).toBe(false);
  });

  test('Collapse All HIDDEN when canCollapseAll === false', () => {
    const template = buildMenuTemplate(
      makeDeps({ onCollapseAll: mock(() => {}), canCollapseAll: false }),
    );
    expect(findByLabel(template, 'Collapse All')?.visible).toBe(false);
  });

  test('View menu click handlers dispatch to deps', () => {
    const onToggleShowHiddenFiles = mock(() => {});
    const onToggleShowAllFiles = mock(() => {});
    const onExpandAll = mock(() => {});
    const onCollapseAll = mock(() => {});
    const template = buildMenuTemplate(
      makeDeps({
        onToggleShowHiddenFiles,
        onToggleShowAllFiles,
        onExpandAll,
        onCollapseAll,
      }),
    );
    (findByLabel(template, 'Show Hidden Files')?.click as (() => void) | undefined)?.();
    expect(onToggleShowHiddenFiles).toHaveBeenCalledTimes(1);
    (findByLabel(template, 'Show All Files')?.click as (() => void) | undefined)?.();
    expect(onToggleShowAllFiles).toHaveBeenCalledTimes(1);
    (findByLabel(template, 'Expand All')?.click as (() => void) | undefined)?.();
    expect(onExpandAll).toHaveBeenCalledTimes(1);
    (findByLabel(template, 'Collapse All')?.click as (() => void) | undefined)?.();
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
  });

  test("View menu retains today's Zoom + Fullscreen items (regression guard)", () => {
    const template = buildMenuTemplate(makeDeps());
    const view = findByLabel(template, 'View');
    expect(view).toBeDefined();
    const sub = view?.submenu as MenuItemConstructorOptions[] | undefined;
    const roles = sub?.map((i) => i.role).filter(Boolean) ?? [];
    expect(roles).toContain('resetZoom');
    expect(roles).toContain('zoomIn');
    expect(roles).toContain('zoomOut');
    expect(roles).toContain('togglefullscreen');
  });

  test('New View menu items appear BEFORE Zoom items (FR17 / D38 placement)', () => {
    const template = buildMenuTemplate(
      makeDeps({
        onToggleShowHiddenFiles: mock(() => {}),
        onExpandAll: mock(() => {}),
      }),
    );
    const view = findByLabel(template, 'View');
    const sub = view?.submenu as MenuItemConstructorOptions[] | undefined;
    expect(sub).toBeDefined();
    const labels = sub?.map((i) => i.label ?? `[role:${i.role ?? 'sep'}]`) ?? [];
    const showHiddenFilesIdx = labels.indexOf('Show Hidden Files');
    const expandAllIdx = labels.indexOf('Expand All');
    const resetZoomIdx = labels.indexOf('[role:resetZoom]');
    expect(showHiddenFilesIdx).toBeGreaterThan(-1);
    expect(resetZoomIdx).toBeGreaterThan(showHiddenFilesIdx);
    expect(resetZoomIdx).toBeGreaterThan(expandAllIdx);
  });
});
