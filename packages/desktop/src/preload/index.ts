/**
 * Desktop preload bridge — exposes `window.okDesktop` to the renderer.
 *
 * Runs in Electron's preload context (Node + DOM available, but isolated
 * from the renderer's JavaScript world via `contextIsolation: true`). Adds
 * a single `okDesktop` global on `window` that the renderer can use to:
 *
 *   - read the project's collab URL + apiOrigin synchronously at startup
 *   - subscribe to project-switch + menu-action events from main
 *   - invoke main-process IPC handlers (folder picker, shell, clipboard)
 *
 * Per electron/electron#33328, subscription methods MUST track the wrapped-
 * listener reference for `removeListener` to actually detach. Returning an
 * unsubscribe closure that closes over the wrapper is the canonical pattern.
 *
 * Per electron/electron#25516, `contextBridge.exposeInMainWorld` evaluates
 * accessors at exposure time, not access time — every value we put on the
 * bridge object is captured immediately. Plain values + methods only; no
 * getters / setters.
 */

import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type { OkDesktopBridge, OkDesktopConfig, OkMenuAction } from '../shared/bridge-contract.ts';
import { createInvoker } from '../shared/ipc-invoke.ts';

const invoke = createInvoker(ipcRenderer);

/** Parse an `--ok-key=value` argv flag, returning the value or undefined. */
function parseArg(name: string): string | undefined {
  const prefix = `--ok-${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

/** Read window-bound config from preload's `process.argv` (injected by main via `additionalArguments`). */
function readConfigFromArgv(): OkDesktopConfig {
  const collabUrl = parseArg('collab-url') ?? '';
  const apiOrigin = parseArg('api-origin') ?? '';
  const projectPath = parseArg('project-path') ?? '';
  const projectName = parseArg('project-name') ?? '';
  const modeRaw = parseArg('mode') ?? 'editor';
  const mode: OkDesktopConfig['mode'] = modeRaw === 'navigator' ? 'navigator' : 'editor';
  return Object.freeze({
    collabUrl,
    apiOrigin,
    projectPath,
    projectName,
    mode,
  });
}

const bridge: OkDesktopBridge = {
  config: readConfigFromArgv(),

  onProjectSwitched(cb: (next: OkDesktopConfig) => void) {
    // Wrapper is what gets registered + later removed (electron/electron#33328).
    // Channel name is the canonical form declared in shared/ipc-events.ts's EventChannels map.
    const listener = (_event: IpcRendererEvent, next: OkDesktopConfig) => cb(next);
    ipcRenderer.on('ok:project:switched', listener);
    return () => ipcRenderer.removeListener('ok:project:switched', listener);
  },

  onMenuAction(cb: (action: OkMenuAction) => void) {
    const listener = (_event: IpcRendererEvent, action: OkMenuAction) => cb(action);
    ipcRenderer.on('ok:menu-action', listener);
    return () => ipcRenderer.removeListener('ok:menu-action', listener);
  },

  onGitInitNotice(cb: (evt: { gitDir: string }) => void) {
    const listener = (_event: IpcRendererEvent, evt: { gitDir: string }) => cb(evt);
    ipcRenderer.on('ok:git-init-notice', listener);
    return () => ipcRenderer.removeListener('ok:git-init-notice', listener);
  },

  dialog: {
    openFolder: () => invoke('ok:dialog:open-folder'),
    createFolder: () => invoke('ok:dialog:create-folder'),
  },

  shell: {
    openExternal: (url: string) => invoke('ok:shell:open-external', url),
    detectProtocol: (scheme: string) => invoke('ok:shell:detect-protocol', scheme),
    spawnCursor: (path: string) => invoke('ok:shell:spawn-cursor', path),
    recordHandoff: (line) => invoke('ok:handoff:record', line),
  },

  clipboard: {
    writeText: (text: string) => invoke('ok:clipboard:write-text', text),
  },

  project: {
    listRecent: () => invoke('ok:project:list-recent'),
    open: (request) => invoke('ok:project:open', request),
    close: () => invoke('ok:project:close'),
  },

  platform: process.platform as 'darwin' | 'win32' | 'linux',
  appVersion: parseArg('app-version') ?? '0.0.0',
};

contextBridge.exposeInMainWorld('okDesktop', bridge);
