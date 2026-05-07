import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type {
  OkChannelChangedInfo,
  OkDesktopBridge,
  OkDesktopConfig,
  OkLocalOpAuthEvent,
  OkLocalOpCloneEvent,
  OkLocalOpStream,
  OkMcpWiringShowPayload,
  OkMenuAction,
  OkUpdateChannel,
  OkUpdateDowngradeWarningInfo,
  OkUpdateDownloadedInfo,
  OkUpdateStuckHintInfo,
  OkWhatsNewInfo,
} from '../shared/bridge-contract.ts';
import { createInvoker } from '../shared/ipc-invoke.ts';

const invoke = createInvoker(ipcRenderer);

function createIpcEventStream<E extends { type: string }>(
  startResultPromise: Promise<{ ok: true; streamId: string } | { ok: false; error: string }>,
  eventChannel: 'ok:local-op:auth:event' | 'ok:local-op:clone:event',
  cancelChannel: 'ok:local-op:auth:cancel' | 'ok:local-op:clone:cancel',
): OkLocalOpStream<E> {
  const buffer: E[] = [];
  const waiters: ((event: E | null) => void)[] = [];
  let terminated = false;
  let myStreamId: string | null = null;
  let listenerAttached = false;

  const push = (event: E): void => {
    if (terminated) return;
    if (waiters.length > 0) {
      const next = waiters.shift();
      next?.(event);
    } else {
      buffer.push(event);
    }
    if (event.type === 'complete' || event.type === 'error') {
      terminated = true;
      detach();
      for (const w of waiters.splice(0)) w(null);
    }
  };

  const listener = (_event: IpcRendererEvent, payload: { streamId: string; event: E }): void => {
    if (myStreamId === null || payload.streamId !== myStreamId) return;
    push(payload.event);
  };

  const detach = (): void => {
    if (listenerAttached) {
      ipcRenderer.removeListener(eventChannel, listener);
      listenerAttached = false;
    }
  };

  ipcRenderer.on(eventChannel, listener);
  listenerAttached = true;

  startResultPromise
    .then((result) => {
      if (!result.ok) {
        push({ type: 'error', message: result.error } as unknown as E);
        return;
      }
      myStreamId = result.streamId;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      push({ type: 'error', message: `IPC error: ${message}` } as unknown as E);
    });

  const events: AsyncIterable<E> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<E>> {
          if (buffer.length > 0) {
            const value = buffer.shift();
            if (value === undefined) return { value: undefined, done: true };
            return { value, done: false };
          }
          if (terminated) return { value: undefined, done: true };
          return new Promise<IteratorResult<E>>((resolve) => {
            waiters.push((event) => {
              if (event === null) resolve({ value: undefined, done: true });
              else resolve({ value: event, done: false });
            });
          });
        },
      };
    },
  };

  return {
    events,
    cancel: () => {
      if (terminated) return;
      terminated = true;
      detach();
      for (const w of waiters.splice(0)) w(null);
      if (myStreamId !== null) {
        invoke(cancelChannel, myStreamId).catch(() => {});
        return;
      }
      void startResultPromise.then((result) => {
        if (result.ok) invoke(cancelChannel, result.streamId).catch(() => {});
      });
    },
  };
}

function createLocalOpAuthStream(): OkLocalOpStream<OkLocalOpAuthEvent> {
  return createIpcEventStream<OkLocalOpAuthEvent>(
    invoke('ok:local-op:auth:start'),
    'ok:local-op:auth:event',
    'ok:local-op:auth:cancel',
  );
}

function createLocalOpCloneStream(request: {
  url: string;
  dir: string;
}): OkLocalOpStream<OkLocalOpCloneEvent> {
  return createIpcEventStream<OkLocalOpCloneEvent>(
    invoke('ok:local-op:clone:start', request),
    'ok:local-op:clone:event',
    'ok:local-op:clone:cancel',
  );
}

function parseArg(name: string): string | undefined {
  const prefix = `--ok-${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

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
    const listener = (_event: IpcRendererEvent, next: OkDesktopConfig) => cb(next);
    ipcRenderer.on('ok:project:switched', listener);
    return () => ipcRenderer.removeListener('ok:project:switched', listener);
  },

  onMenuAction(cb: (action: OkMenuAction) => void) {
    const listener = (_event: IpcRendererEvent, action: OkMenuAction) => cb(action);
    ipcRenderer.on('ok:menu-action', listener);
    return () => ipcRenderer.removeListener('ok:menu-action', listener);
  },

  onUpdateDownloaded(cb: (info: OkUpdateDownloadedInfo) => void) {
    const listener = (_event: IpcRendererEvent, info: OkUpdateDownloadedInfo) => cb(info);
    ipcRenderer.on('ok:update:downloaded', listener);
    return () => ipcRenderer.removeListener('ok:update:downloaded', listener);
  },

  onWhatsNew(cb: (info: OkWhatsNewInfo) => void) {
    const listener = (_event: IpcRendererEvent, info: OkWhatsNewInfo) => cb(info);
    ipcRenderer.on('ok:update:whats-new', listener);
    return () => ipcRenderer.removeListener('ok:update:whats-new', listener);
  },

  onUpdateStuckHint(cb: (info: OkUpdateStuckHintInfo) => void) {
    const listener = (_event: IpcRendererEvent, info: OkUpdateStuckHintInfo) => cb(info);
    ipcRenderer.on('ok:update:stuck-hint', listener);
    return () => ipcRenderer.removeListener('ok:update:stuck-hint', listener);
  },

  onUpdateDowngradeWarning(cb: (info: OkUpdateDowngradeWarningInfo) => void) {
    const listener = (_event: IpcRendererEvent, info: OkUpdateDowngradeWarningInfo) => cb(info);
    ipcRenderer.on('ok:update:downgrade-warning', listener);
    return () => ipcRenderer.removeListener('ok:update:downgrade-warning', listener);
  },

  onChannelChanged(cb: (info: OkChannelChangedInfo) => void) {
    const listener = (_event: IpcRendererEvent, info: OkChannelChangedInfo) => cb(info);
    ipcRenderer.on('ok:state:update-channel-changed', listener);
    return () => ipcRenderer.removeListener('ok:state:update-channel-changed', listener);
  },

  onDeepLink(cb: (evt: { doc: string }) => void) {
    const listener = (_event: IpcRendererEvent, evt: { doc: string }) => cb(evt);
    ipcRenderer.on('ok:deep-link', listener);
    return () => ipcRenderer.removeListener('ok:deep-link', listener);
  },

  dialog: {
    openFolder: () => invoke('ok:dialog:open-folder'),
    createFolder: () => invoke('ok:dialog:create-folder'),
  },

  shell: {
    openExternal: (url: string) => invoke('ok:shell:open-external', url),
    detectProtocol: (scheme: string) => invoke('ok:shell:detect-protocol', scheme),
    spawnCursor: (path: string) => invoke('ok:shell:spawn-cursor', path),
    recordHandoff: (line) => invoke('ok:shell:record-handoff', line),
    openAsset: (relPath: string) => invoke('ok:shell:open-asset', relPath),
    revealAsset: (relPath: string) => invoke('ok:shell:reveal-asset', relPath),
    showAssetMenu: (params) => invoke('ok:shell:show-asset-menu', params),
    showItemInFolder: (path: string) => invoke('ok:shell:show-item-in-folder', path),
  },

  clipboard: {
    writeText: (text: string) => invoke('ok:clipboard:write-text', text),
  },

  project: {
    listRecent: () => invoke('ok:project:list-recent'),
    getSessionState: () => invoke('ok:project:get-session-state'),
    setSessionState: (state) => invoke('ok:project:set-session-state', state),
    open: (request) => invoke('ok:project:open', request),
    close: () => invoke('ok:project:close'),
  },

  navigator: {
    open: () => invoke('ok:navigator:open'),
  },

  seed: {
    plan: (rootDir) => invoke('ok:seed:plan', rootDir),
    apply: (plan) => invoke('ok:seed:apply', plan),
  },

  skill: {
    detectClaudeDesktop: () => invoke('ok:skill:detect-claude-desktop'),
    buildAndOpen: (opts) => invoke('ok:skill:build-and-open', opts),
  },

  update: {
    relaunchNow: () => invoke('ok:update:relaunch-now'),
    setChannel: (channel: OkUpdateChannel) => invoke('ok:update:set-channel', { channel }),
    confirmDowngrade: () => invoke('ok:update:confirm-downgrade'),
    checkNow: () => invoke('ok:update:check-now'),
  },

  state: {
    query: () => invoke('ok:state:query'),
    resetIncompatible: () => invoke('ok:state:reset-incompatible'),
  },

  mcpWiring: {
    onShow(cb: (payload: OkMcpWiringShowPayload) => void) {
      const listener = (_event: IpcRendererEvent, payload: OkMcpWiringShowPayload) => cb(payload);
      ipcRenderer.on('ok:mcp-wiring:show', listener);
      return () => ipcRenderer.removeListener('ok:mcp-wiring:show', listener);
    },
    signalReady: () => {
      invoke('ok:mcp-wiring:renderer-ready').catch(() => {});
    },
    confirm: (editorIds) => invoke('ok:mcp-wiring:confirm', { editorIds }),
    skip: () => invoke('ok:mcp-wiring:skip'),
  },

  localOp: {
    auth: {
      start: () => createLocalOpAuthStream(),
    },
    clone: {
      start: (request) => createLocalOpCloneStream(request),
    },
    authStatus: (request) => invoke('ok:local-op:auth:status', request),
    authRepos: (request) => invoke('ok:local-op:auth:repos', request),
  },

  platform: process.platform as 'darwin' | 'win32' | 'linux',
  appVersion: parseArg('app-version') ?? '0.0.0',
};

if (parseArg('debug-keyring-smoke') === '1') {
  bridge.debug = {
    keyringSmoke: () => invoke('ok:debug:keyring-smoke'),
  };
}

contextBridge.exposeInMainWorld('okDesktop', bridge);
