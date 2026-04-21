/**
 * Application menu — M1 baseline.
 *
 * Covers the SPEC §8.2 File / Edit / View / Window scope at the minimum
 * useful level for M1:
 *   - File: New Project (open Navigator), Open Folder (native picker),
 *     Open Recent submenu, Close Window
 *   - Edit: macOS defaults (Undo/Redo/Cut/Copy/Paste/Select All)
 *   - View: Reload / Toggle DevTools / zoom / fullscreen (Electron built-in roles)
 *   - Window: macOS defaults (Minimize / Zoom / Bring to Front)
 *
 * Out of M1 scope (deferred to later milestones):
 *   - Project menu (Save Version, Version History, Reveal .open-knowledge/, Trust Project)
 *   - File → Clone from GitHub… (depends on M4/M5)
 *   - View → Graph / Timeline / Backlinks / Outline toggles (renderer surfaces, M2+ polish)
 *   - File → Install Command-Line Tools… (D52, M6 scope)
 *   - Help menu (Documentation, Report Issue, Check for Updates) — hooks to external URLs + M3 auto-update
 *
 * The menu is rebuilt on recent-projects changes so the Open Recent submenu
 * stays current without us reaching into Electron's menu-item mutation API
 * (Electron recommends full rebuild on state change).
 */

import { app, dialog, Menu, type MenuItemConstructorOptions, shell } from 'electron';

export interface MenuDeps {
  /** Open the Project Navigator window (File → New Project…). */
  openNavigator(): void;
  /** Open a specific project folder (File → Open Folder… or File → Open Recent ▸ <row>). */
  openProject(projectPath: string): Promise<void>;
  /** Current recent-projects list (top-of-LRU first). Used to build Open Recent submenu. */
  getRecentProjects(): ReadonlyArray<{ path: string; name: string }>;
  /** Clear the recent-projects list (File → Open Recent → Clear Menu). */
  clearRecentProjects(): void;
}

/** Build the menu template + install it as the application menu. */
export function installApplicationMenu(deps: MenuDeps): void {
  const template = buildMenuTemplate(deps);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Exported for unit testing — pure function over deps. */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  const recents = deps.getRecentProjects();

  const recentSubmenu: MenuItemConstructorOptions[] =
    recents.length === 0
      ? [{ label: 'No Recent Projects', enabled: false }]
      : [
          ...recents.slice(0, 10).map((row) => ({
            label: row.name,
            sublabel: row.path,
            click: () => {
              void deps.openProject(row.path);
            },
          })),
          { type: 'separator' as const },
          {
            label: 'Clear Menu',
            click: () => deps.clearRecentProjects(),
          },
        ];

  const template: MenuItemConstructorOptions[] = [
    // macOS application menu (auto-populated with the app name).
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    {
      label: 'File',
      submenu: [
        {
          label: 'New Project\u2026',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => deps.openNavigator(),
        },
        {
          label: 'Open Folder\u2026',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory', 'createDirectory'],
            });
            const picked = result.canceled ? null : (result.filePaths[0] ?? null);
            if (picked) {
              await deps.openProject(picked);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac
          ? ([
              { role: 'zoom' as const },
              { type: 'separator' as const },
              { role: 'front' as const },
            ] satisfies MenuItemConstructorOptions[])
          : ([{ role: 'close' as const }] satisfies MenuItemConstructorOptions[])),
      ],
    },

    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Knowledge on GitHub',
          click: () => {
            void shell.openExternal('https://github.com/inkeep/open-knowledge');
          },
        },
      ],
    },
  ];

  return template;
}
