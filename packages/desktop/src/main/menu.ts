import type { Dialog, MenuItemConstructorOptions } from 'electron';
import type { EntryPoint } from '../shared/entry-point.ts';
import { SWITCH_PROJECT_LABEL_WITH_ELLIPSIS } from '../shared/labels.ts';
import type { CliInstallStatus } from './cli-install.ts';
import { promptForExistingFolder } from './dialog-helpers.ts';

export interface MenuDeps {
  appName: string;
  showDevToolsMenu: boolean;
  /** `electron.dialog` — injected so the File → Open Folder click handler
   *  can call `promptForExistingFolder(dialog)` without importing `dialog`
   *  at module scope (breaks Bun-test module load; see file header). */
  dialog: Dialog;
  openNavigator(): void;
  openProject(projectPath: string, entryPoint: EntryPoint): Promise<void>;
  getRecentProjects(): ReadonlyArray<{ path: string; name: string }>;
  clearRecentProjects(): void;
  openExternalUrl(url: string): void;
  cliInstallStatus?(): CliInstallStatus | null;
  toggleCliInstall?(): Promise<void> | void;
  reconfigureMcpWiring?(): Promise<void> | void;
  openInstallSkillDialog?(): void;
  openSettings?(): void;
  onCheckForUpdates?(): void;
}

export async function installApplicationMenu(deps: MenuDeps): Promise<void> {
  const { Menu } = await import('electron');
  const template = buildMenuTemplate(deps);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  const recents = deps.getRecentProjects();
  const cliStatus = isMac ? (deps.cliInstallStatus?.() ?? null) : null;

  const recentSubmenu: MenuItemConstructorOptions[] =
    recents.length === 0
      ? [{ label: 'No Recent Projects', enabled: false }]
      : [
          ...recents.slice(0, 10).map((row) => ({
            label: row.name,
            sublabel: row.path,
            click: () => {
              void deps.openProject(row.path, 'recents');
            },
          })),
          { type: 'separator' as const },
          {
            label: 'Clear Menu',
            click: () => deps.clearRecentProjects(),
          },
        ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: deps.appName,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              ...(deps.onCheckForUpdates
                ? ([
                    {
                      label: 'Check for Updates…',
                      click: deps.onCheckForUpdates,
                    },
                    { type: 'separator' as const },
                  ] satisfies MenuItemConstructorOptions[])
                : []),
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => deps.openSettings?.(),
              },
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
          label: SWITCH_PROJECT_LABEL_WITH_ELLIPSIS,
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => deps.openNavigator(),
        },
        {
          label: 'Open Folder\u2026',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const picked = await promptForExistingFolder(deps.dialog);
            if (picked) {
              await deps.openProject(picked, 'pick-existing');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        ...(cliStatus
          ? ([
              {
                label:
                  cliStatus === 'installed'
                    ? 'Uninstall Command-Line Tools'
                    : 'Install Command-Line Tools…',
                click: () => {
                  void deps.toggleCliInstall?.();
                },
              },
              { type: 'separator' as const },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        ...(deps.reconfigureMcpWiring
          ? ([
              {
                label: 'Configure AI Tool Integrations…',
                click: () => {
                  void deps.reconfigureMcpWiring?.();
                },
              },
              { type: 'separator' as const },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        ...(!isMac
          ? ([
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => deps.openSettings?.(),
              },
              { type: 'separator' as const },
            ] satisfies MenuItemConstructorOptions[])
          : []),
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
        ...(deps.showDevToolsMenu
          ? ([
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ] satisfies MenuItemConstructorOptions[])
          : []),
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
          label: 'Install for Claude Chat & Cowork (Desktop App)…',
          click: () => deps.openInstallSkillDialog?.(),
        },
        { type: 'separator' },
        {
          label: 'Open Knowledge on GitHub',
          click: () => deps.openExternalUrl('https://github.com/inkeep/open-knowledge'),
        },
        ...(deps.onCheckForUpdates
          ? ([
              { type: 'separator' as const },
              {
                label: 'Check for Updates…',
                click: deps.onCheckForUpdates,
              },
            ] satisfies MenuItemConstructorOptions[])
          : []),
      ],
    },
  ];

  return template;
}
