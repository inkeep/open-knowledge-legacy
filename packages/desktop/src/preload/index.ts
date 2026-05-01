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
import type {
  OkDesktopBridge,
  OkDesktopConfig,
  OkLocalOpAuthEvent,
  OkLocalOpCloneEvent,
  OkLocalOpStream,
  OkMcpWiringShowPayload,
  OkMenuAction,
  OkUpdateDownloadedInfo,
  OkUpdateStuckHintInfo,
  OkWhatsNewInfo,
} from '../shared/bridge-contract.ts';
import { createInvoker } from '../shared/ipc-invoke.ts';

const invoke = createInvoker(ipcRenderer);

/**
 * Async-iterable stream over a streamId-keyed IPC event channel. The
 * factory subscribes to `eventChannel` immediately so events that arrive
 * before iteration starts are buffered. Iteration ends when a `complete`
 * or `error` event arrives (or `cancel()` is called by the consumer).
 *
 * Pattern keeps the renderer surface simple — components consume via
 * `for await (const event of stream.events)` without thinking about
 * subscriptions or unsubscribes; preload owns the listener lifetime.
 */
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
      // Drain waiting consumers with `null` so iterators end.
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

  // Attach the listener BEFORE awaiting the start invoke — events fired
  // from main between the invoke resolving and the listener attaching
  // would otherwise be lost. The streamId-match guard discards events
  // for any other in-flight stream until we know our own.
  ipcRenderer.on(eventChannel, listener);
  listenerAttached = true;

  startResultPromise
    .then((result) => {
      if (!result.ok) {
        // Synthesize an error event so the iterator terminates with a clear
        // signal. The shape mirrors the auth/clone error variants.
        push({ type: 'error', message: result.error } as unknown as E);
        return;
      }
      myStreamId = result.streamId;
    })
    .catch((err: unknown) => {
      // IPC invoke itself rejected (e.g. handler threw before returning,
      // channel not registered). Without this catch the consumer's
      // `await iter.next()` hangs permanently — `myStreamId` never gets
      // set, no terminal event is ever pushed.
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
      // IPC invoke hasn't resolved yet — chain cancel onto the result.
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
    buildAndOpen: () => invoke('ok:skill:build-and-open'),
  },

  update: {
    relaunchNow: () => invoke('ok:update:relaunch-now'),
  },

  mcpWiring: {
    onShow(cb: (payload: OkMcpWiringShowPayload) => void) {
      const listener = (_event: IpcRendererEvent, payload: OkMcpWiringShowPayload) => cb(payload);
      ipcRenderer.on('ok:mcp-wiring:show', listener);
      return () => ipcRenderer.removeListener('ok:mcp-wiring:show', listener);
    },
    signalReady: () => {
      // Fire-and-forget: render doesn't need the resolved result. We invoke
      // (not send) so it composes through the typed `createInvoker`
      // wrapper and clears D19 enforcement. Any rejection is swallowed —
      // a missing handler during teardown is expected, not a programmer error.
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

// Debug namespace — populated ONLY when main decided the runtime gate is
// open (SPEC D-M5-8). When the flag is absent, `bridge.debug` stays
// undefined so a typo in renderer code calling the method surfaces at
// TypeScript compile time.
if (parseArg('debug-keyring-smoke') === '1') {
  bridge.debug = {
    keyringSmoke: () => invoke('ok:debug:keyring-smoke'),
  };
}

contextBridge.exposeInMainWorld('okDesktop', bridge);
