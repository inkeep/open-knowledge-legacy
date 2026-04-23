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
 *
 * Electron import discipline: `electron` named exports (Menu, app, dialog,
 * shell) are only resolvable at runtime inside an Electron process. Bun's
 * unit-test runner loads the `electron` npm package, which is just a string
 * path to the binary — it has NO named exports. So this module uses
 * type-only imports for interface types (MenuItemConstructorOptions) and
 * pulls the one runtime value we need (`app.name`) + side-effecting APIs
 * (Menu.setApplicationMenu, Menu.buildFromTemplate, dialog.showOpenDialog)
 * via a dynamic `await import('electron')` inside `installApplicationMenu`.
 * That keeps `buildMenuTemplate` — the pure function tests exercise —
 * free of runtime electron bindings.
 */

import type { Dialog, MenuItemConstructorOptions } from 'electron';
import type { CliInstallStatus } from './cli-install.ts';
import { promptForFolder } from './dialog-helpers.ts';

export interface MenuDeps {
  /** `app.name` — the running app's name, used for the macOS App menu label. */
  appName: string;
  /** `electron.dialog` — injected so the File → Open Folder click handler
   *  can call `promptForFolder(dialog)` without importing `dialog` at module
   *  scope (breaks Bun-test module load; see file header). */
  dialog: Dialog;
  /** Open the Project Navigator window (File → New Project…). */
  openNavigator(): void;
  /** Open a specific project folder (File → Open Folder… or File → Open Recent ▸ <row>). */
  openProject(projectPath: string): Promise<void>;
  /** Current recent-projects list (top-of-LRU first). Used to build Open Recent submenu. */
  getRecentProjects(): ReadonlyArray<{ path: string; name: string }>;
  /** Clear the recent-projects list (File → Open Recent → Clear Menu). */
  clearRecentProjects(): void;
  /** Open an external URL (Help menu). Injected so the `shell` runtime value doesn't cross the module boundary. */
  openExternalUrl(url: string): void;
  /**
   * Current CLI-on-PATH install status (M6a, D52). Returning `null` hides
   * the File → Install/Uninstall Command-Line Tools menu item entirely —
   * used for non-darwin platforms (NG4 defers Windows/Linux) and for unit
   * tests that don't exercise the M6a feature.
   *
   * A function (not a value) so re-calling `installApplicationMenu` after a
   * toggle re-reads `getInstallStatus(app.getPath('exe'))` afresh without
   * needing to thread a state snapshot through the click handler — same
   * shape as `getRecentProjects`.
   */
  cliInstallStatus?(): CliInstallStatus | null;
  /**
   * Run the install-or-uninstall flow for the Command-Line Tools menu item.
   * Wired in `index.ts` to dispatch `installCli` / `uninstallCli` based on
   * the current status, then call `refreshApplicationMenu()` — same
   * side-effect pattern as `clearRecentProjects`. Rejection semantics live
   * in the CLI-install layer (translocation warning, admin-cancel fallback).
   */
  toggleCliInstall?(): Promise<void> | void;
  /**
   * Pass 2 Major #5: re-trigger M6b consent from the File menu. Invoked
   * by "Configure AI Tool Integrations…" — a user who Skip'd first-launch
   * (or added a new editor afterwards) can re-open the dialog without
   * hand-deleting `~/.open-knowledge/mcp-status.json`. Gated on darwin
   * + `app.isPackaged`; `index.ts` short-circuits in dev + non-darwin so
   * the menu item is hidden there.
   */
  reconfigureMcpWiring?(): Promise<void> | void;
}

/**
 * Install the template as the application menu. Dynamically imports
 * `Menu` so the module-top scope stays Bun-test-loadable; callers must
 * be in an async context (typically `app.whenReady().then(async () => ...)`).
 */
export async function installApplicationMenu(deps: MenuDeps): Promise<void> {
  const { Menu } = await import('electron');
  const template = buildMenuTemplate(deps);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Exported for unit testing — pure function over deps. */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';
  const recents = deps.getRecentProjects();
  // D52 / M6a menu item — shown only on darwin and only when the runtime
  // provides a status probe. `'installed'` flips the label to "Uninstall…";
  // `'not-installed'` and `'broken'` both render "Install…" (broken is
  // primarily surfaced by the launch-time repair dialog in `index.ts`, but
  // clicking the menu item while broken re-runs the install flow which
  // overwrites the dangling symlink — same end state).
  const cliStatus = isMac ? (deps.cliInstallStatus?.() ?? null) : null;

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
            label: deps.appName,
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
            // Shared with the `ok:dialog:create-folder` IPC handler so both
            // call sites agree on dialog options forever — see dialog-helpers.
            const picked = await promptForFolder(deps.dialog);
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
        // Pass 2 Major #5 — re-trigger M6b consent. The dep is optional
        // so non-macOS / non-packaged contexts (where MCP wiring no-ops
        // anyway) hide the row. Gating matches cliStatus above — `deps`
        // plumbs `undefined` when the runtime has nothing to offer.
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
          click: () => deps.openExternalUrl('https://github.com/inkeep/open-knowledge'),
        },
      ],
    },
  ];

  return template;
}
