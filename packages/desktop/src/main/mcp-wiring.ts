import {
  existsSync as fsExistsSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  readlinkSync as fsReadlinkSync,
  renameSync as fsRenameSync,
  unlinkSync as fsUnlinkSync,
  writeFileSync as fsWriteFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { EditorMcpTarget } from '@inkeep/open-knowledge';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type {
  McpWiringConfirmRequest,
  McpWiringConfirmResult,
  McpWiringEditorDetection,
  McpWiringEditorId,
  McpWiringSkipResult,
} from '../shared/ipc-channels.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import { sendToRenderer } from '../shared/ipc-send.ts';
import { wrapperPathInBundle } from './cli-install.ts';

export const SYMLINK_OK_PATH = '/usr/local/bin/ok';

const MCP_STATUS_DIR_NAME = '.ok';
const MCP_STATUS_FILE_NAME = 'mcp-status.json';

export type McpStatusMarker =
  | {
      configured: true;
      configuredAt: string;
      editors: string[];
      cliPath: string;
    }
  | {
      configured: false;
      skippedAt: string;
    };

export interface McpWiringFsOps {
  existsSync(path: string): boolean;
  readlinkSync(path: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, content: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
}

const defaultFsOps: McpWiringFsOps = {
  existsSync: (path) => fsExistsSync(path),
  readlinkSync: (path) => fsReadlinkSync(path),
  readFileSync: (path, encoding) => fsReadFileSync(path, encoding),
  writeFileSync: (path, content) => {
    fsWriteFileSync(path, content);
  },
  mkdirSync: (path, options) => {
    fsMkdirSync(path, options);
  },
  renameSync: (oldPath, newPath) => {
    fsRenameSync(oldPath, newPath);
  },
  unlinkSync: (path) => {
    fsUnlinkSync(path);
  },
};

export function mcpStatusMarkerPath(home: string): string {
  return join(home, MCP_STATUS_DIR_NAME, MCP_STATUS_FILE_NAME);
}

export function readMcpStatusMarker(
  home: string,
  fs: McpWiringFsOps = defaultFsOps,
): McpStatusMarker | null {
  const path = mcpStatusMarkerPath(home);
  if (!fs.existsSync(path)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isValidMarker(parsed) ? parsed : null;
}

function isValidMarker(value: unknown): value is McpStatusMarker {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.configured === true) {
    return (
      typeof v.configuredAt === 'string' &&
      Array.isArray(v.editors) &&
      v.editors.every((e) => typeof e === 'string') &&
      typeof v.cliPath === 'string'
    );
  }
  if (v.configured === false) {
    return typeof v.skippedAt === 'string';
  }
  return false;
}

export function writeMcpStatusMarker(
  home: string,
  status: McpStatusMarker,
  fs: McpWiringFsOps = defaultFsOps,
): void {
  const path = mcpStatusMarkerPath(home);
  fs.mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(status, null, 2)}\n`);
  try {
    fs.renameSync(tmpPath, path);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

export function resolveCliPath(executablePath: string, fs: McpWiringFsOps = defaultFsOps): string {
  const bundleAbsolute = wrapperPathInBundle(executablePath);
  const bundleRoot = bundleAbsolute.replace(/\/Contents\/Resources\/cli\/bin\/ok\.sh$/, '');

  try {
    if (!fs.existsSync(SYMLINK_OK_PATH)) return bundleAbsolute;
    const linkTarget = fs.readlinkSync(SYMLINK_OK_PATH);
    const resolved = resolve(dirname(SYMLINK_OK_PATH), linkTarget);
    if (resolved === bundleAbsolute) return SYMLINK_OK_PATH;
    if (resolved.startsWith(`${bundleRoot}/`)) return SYMLINK_OK_PATH;
    return bundleAbsolute;
  } catch {
    return bundleAbsolute;
  }
}

export type ForceComputeTarget = Pick<EditorMcpTarget, 'isCompatible'>;

export function isPublishedCanonical(
  existing: Record<string, unknown>,
  target: ForceComputeTarget,
): boolean {
  return target.isCompatible(existing, '', { mode: 'published' });
}

export function formatPartialFailureMessage(
  failures: ReadonlyArray<{ editorId: string; error?: string }>,
  totalCount: number,
): string {
  const okCount = totalCount - failures.length;
  const detail = failures.map((f) => `${f.editorId}${f.error ? `: ${f.error}` : ''}`).join('; ');
  const summary =
    failures.length === 1
      ? `Couldn't add MCP to ${detail}.`
      : `${failures.length} of ${totalCount} MCP writes failed (${detail}).`;
  const successHint = okCount > 0 ? ` ${okCount} succeeded.` : '';
  return `${summary}${successHint} The dialog will reappear on next launch so you can retry.`;
}

function isPermittedSender(
  event: Pick<IpcMainInvokeEvent, 'sender'>,
  capturedSenderId: number | null,
): boolean {
  if (capturedSenderId === null) return false;
  return event.sender.id === capturedSenderId;
}

export interface IpcMainLike extends Pick<IpcMain, 'handle' | 'removeHandler'> {}

export interface IpcMainEventLike {
  sender: { send(channel: string, ...args: unknown[]): void };
}

export interface McpWiringCliSurface {
  detectInstalledEditors(cwd: string, home?: string): McpWiringEditorId[];
  writeUserMcpConfigs(opts: {
    editors: McpWiringEditorId[];
    cliPath?: string;
    home?: string;
  }): Promise<
    Array<{
      editorId: McpWiringEditorId;
      label: string;
      action: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
      configPath: string;
      serverName: string;
      error?: string;
    }>
  >;
  readExistingMcpEntry(editorId: McpWiringEditorId, home: string): Record<string, unknown> | null;
  allEditorIds: readonly McpWiringEditorId[];
  editorTargets: Record<McpWiringEditorId, EditorMcpTarget>;
}

export interface McpWiringLogger {
  info(msg: string, ctx?: object): void;
  warn(msg: string, ctx?: object): void;
  error(msg: string, ctx?: object): void;
  event(payload: { event: string; [k: string]: unknown }): void;
}

const DEFAULT_LOGGER: McpWiringLogger = {
  info: (msg, ctx) => console.info('[mcp-wiring]', msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn('[mcp-wiring]', msg, ctx ?? ''),
  error: (msg, ctx) => console.error('[mcp-wiring]', msg, ctx ?? ''),
  event: (payload) => console.warn(JSON.stringify(payload)),
};

interface RunMcpWiringOpts {
  isPackaged: boolean;
  executablePath: string;
  home: string;
  platform: 'darwin' | 'win32' | 'linux' | string;
  ipcMain: IpcMainLike;
  cli: McpWiringCliSurface;
  forceEnv?: string | null | undefined;
  forceShow?: boolean;
  fs?: McpWiringFsOps;
  now?: () => Date;
  logger?: McpWiringLogger;
}

export interface RunMcpWiringHandle {
  destroy(): void;
  readonly armed: boolean;
}

export function runMcpWiringOnFirstLaunch(opts: RunMcpWiringOpts): RunMcpWiringHandle {
  const {
    isPackaged,
    executablePath,
    home,
    platform,
    ipcMain,
    cli,
    forceEnv,
    forceShow = false,
    fs,
    now,
    logger = DEFAULT_LOGGER,
  } = opts;
  const nowDate = (): Date => (now ? now() : new Date());
  const inertHandle: RunMcpWiringHandle = { destroy() {}, armed: false };

  if (platform !== 'darwin') {
    logger.info('skip — platform is not darwin', { platform });
    return inertHandle;
  }

  if (!isPackaged && forceEnv !== '1') {
    logger.info('skip — app not packaged and OK_M6B_FORCE not set');
    return inertHandle;
  }

  if (!/\.app\/Contents\/MacOS\/[^/]+$/.test(executablePath)) {
    logger.warn('skip — executablePath does not match .app/Contents/MacOS/<name> shape', {
      executablePath,
    });
    return inertHandle;
  }

  const marker = readMcpStatusMarker(home, fs);
  if (marker !== null && !forceShow) {
    logger.info('skip — marker present', { configured: marker.configured });
    return inertHandle;
  }
  if (marker !== null && forceShow) {
    logger.info('forceShow — ignoring prior marker', { configured: marker.configured });
  }

  let detections: McpWiringEditorDetection[];
  try {
    const detectedIds = new Set<McpWiringEditorId>(cli.detectInstalledEditors('', home));
    detections = cli.allEditorIds.map((id) => {
      const target = cli.editorTargets[id];
      if (!target) {
        throw new Error(`editorTargets missing entry for id=${id}`);
      }
      let willReplace = false;
      try {
        const existing = cli.readExistingMcpEntry(id, home);
        if (existing !== null) {
          willReplace = isPublishedCanonical(existing, target);
        }
      } catch (err) {
        logger.info('willReplace probe failed for editor', {
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { id, label: target.label, detected: detectedIds.has(id), willReplace };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('detection failed — wiring inert for this boot', { message });
    logger.event({ event: 'mcp-wiring-detect-failed', error: message });
    return inertHandle;
  }

  let handled = false;

  let capturedSenderId: number | null = null;

  const confirmHandler = async (
    event: IpcMainInvokeEvent,
    request: McpWiringConfirmRequest,
  ): Promise<McpWiringConfirmResult> => {
    if (!isPermittedSender(event, capturedSenderId)) {
      logger.warn('rejecting confirm — sender is not the renderer that received show', {
        capturedSenderId,
        gotSenderId: event.sender.id,
      });
      return {
        ok: false,
        error: 'Consent must come from the window that displayed the dialog.',
      };
    }
    if (handled) return { ok: true };
    handled = true;
    const selectedEditors = Array.isArray(request?.editorIds)
      ? [...request.editorIds].filter((id): id is McpWiringEditorId =>
          cli.allEditorIds.includes(id as McpWiringEditorId),
        )
      : [];

    const cliPath = resolveCliPath(executablePath, fs);

    const editorsToWrite: McpWiringEditorId[] = [];
    for (const editor of selectedEditors) {
      const target = cli.editorTargets[editor];
      if (!target) continue;
      const existing = cli.readExistingMcpEntry(editor, home);
      if (existing === null) {
        editorsToWrite.push(editor);
        continue;
      }
      if (isPublishedCanonical(existing, target)) {
        editorsToWrite.push(editor);
      } else {
        logger.event({
          event: 'mcp-wiring-skip-customized',
          editor,
        });
      }
    }

    let results: Awaited<ReturnType<McpWiringCliSurface['writeUserMcpConfigs']>>;
    try {
      results = await cli.writeUserMcpConfigs({
        editors: editorsToWrite,
        cliPath,
        home,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('writeUserMcpConfigs threw — marker not written', { message });
      handled = false;
      return { ok: false, error: message };
    }

    const failedResults = results.filter((r) => r.action === 'failed');
    for (const r of failedResults) {
      logger.event({
        event: 'mcp-wiring-write-failed',
        editor: r.editorId,
        configPath: r.configPath,
        error: r.error ?? null,
      });
    }
    if (failedResults.length > 0) {
      logger.info('partial failure — marker not written; dialog will re-fire next boot');
      handled = false;
      return {
        ok: false,
        error: formatPartialFailureMessage(failedResults, results.length),
      };
    }

    try {
      writeMcpStatusMarker(
        home,
        {
          configured: true,
          configuredAt: nowDate().toISOString(),
          editors: [...selectedEditors],
          cliPath,
        },
        fs,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('marker write failed', { message });
      handled = false;
      return { ok: false, error: message };
    }

    logger.info('configured', { editors: selectedEditors, cliPath });
    return { ok: true };
  };

  const skipHandler = async (event: IpcMainInvokeEvent): Promise<McpWiringSkipResult> => {
    if (!isPermittedSender(event, capturedSenderId)) {
      logger.warn('rejecting skip — sender is not the renderer that received show', {
        capturedSenderId,
        gotSenderId: event.sender.id,
      });
      return {
        ok: false,
        error: 'Consent must come from the window that displayed the dialog.',
      };
    }
    if (handled) return { ok: true };
    handled = true;
    try {
      writeMcpStatusMarker(
        home,
        {
          configured: false,
          skippedAt: nowDate().toISOString(),
        },
        fs,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('skip-marker write failed', { message });
      handled = false;
      return {
        ok: false,
        error: `Could not record your preference (${message}). The consent dialog may reappear on next launch.`,
      };
    }
    logger.info('skipped');
    return { ok: true };
  };

  const rendererReadyHandler = (event: IpcMainInvokeEvent): undefined => {
    try {
      sendToRenderer(event.sender, 'ok:mcp-wiring:show', {
        detectedEditors: detections,
      });
      logger.info('dispatched show to renderer', {
        detectedCount: detections.length,
        senderId: event.sender.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('show dispatch failed — handler remains armed for next renderer', {
        message,
      });
      return undefined;
    }
    capturedSenderId = event.sender.id;
    try {
      ipcMain.removeHandler('ok:mcp-wiring:renderer-ready');
    } catch {}
    return undefined;
  };

  const register = createHandler(ipcMain as IpcMain);
  register('ok:mcp-wiring:confirm', confirmHandler);
  register('ok:mcp-wiring:skip', skipHandler);
  register('ok:mcp-wiring:renderer-ready', rendererReadyHandler);

  logger.info('armed — waiting for renderer mount-ack', {
    detectedCount: detections.filter((d) => d.detected).length,
  });

  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        ipcMain.removeHandler('ok:mcp-wiring:confirm');
      } catch (err) {
        logger.warn('removeHandler(confirm) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        ipcMain.removeHandler('ok:mcp-wiring:skip');
      } catch (err) {
        logger.warn('removeHandler(skip) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        ipcMain.removeHandler('ok:mcp-wiring:renderer-ready');
      } catch (err) {
        logger.warn('removeHandler(renderer-ready) threw', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    get armed(): boolean {
      return !destroyed;
    },
  };
}
