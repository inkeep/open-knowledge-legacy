import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { getLocalDir } from '@inkeep/open-knowledge-server';
import { sendToRenderer } from '../shared/ipc-send.ts';

async function pollLockReleasedDefault(lockDir: string, deadlineMs: number): Promise<boolean> {
  const lockPath = resolve(lockDir, 'server.lock');
  const tickMs = 25;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!existsSync(lockPath)) return true;
    try {
      const raw = readFileSync(lockPath, 'utf-8');
      const parsed = JSON.parse(raw) as { pid?: unknown };
      if (!isValidLockPidLocal(parsed.pid)) {
        return true;
      }
      if (!isProcessAliveLocal(parsed.pid)) return true;
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, tickMs));
  }
  return !existsSync(lockPath);
}

function isProcessAliveLocal(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'EPERM'
    ) {
      return true;
    }
    return false;
  }
}

function isValidLockPidLocal(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isInteger(value)) return false;
  if (value < 2) return false;
  if (value > 0x7fffffff) return false;
  return true;
}

function formatEditorTitle(projectName: string): string {
  return `${projectName} — Open Knowledge`;
}

export interface BrowserWindowLike {
  focus(): void;
  show?(): void;
  restore?(): void;
  isMinimized?(): boolean;
  isDestroyed?(): boolean;
  isVisible?(): boolean;
  on(event: 'closed', cb: () => void): void;
  once(event: 'ready-to-show', cb: () => void): void;
  webContents: {
    send(channel: string, ...args: unknown[]): void;
    once(event: 'dom-ready', cb: () => void): void;
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }): void;
    on(
      event: 'will-navigate',
      handler: (event: { preventDefault: () => void }, url: string) => void,
    ): void;
  };
  loadFile(filePath: string): Promise<void>;
  loadURL(url: string): Promise<void>;
}

export interface UtilityProcessLike {
  pid: number | undefined;
  postMessage(msg: unknown): void;
  on(event: 'message', cb: (msg: unknown) => void): void;
  on(event: 'exit', cb: (code: number | null) => void): void;
  once(event: 'message', cb: (msg: unknown) => void): void;
  removeListener?(event: 'message', cb: (msg: unknown) => void): void;
  removeListener?(event: 'exit', cb: (code: number | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface ServerLockMetadataLike {
  pid: number;
  hostname: string;
  port: number;
  startedAt: string;
  worktreeRoot: string;
  kind?: 'interactive' | 'mcp-spawned';
  capabilities?: string[];
}

interface ProjectContext {
  projectPath: string;
  canonicalKey: string;
  projectName: string;
  port: number;
  apiOrigin: string;
  window: BrowserWindowLike;
  utility: UtilityProcessLike | null;
  ownsServer: boolean;
}

interface CreateProjectWindowOpts {
  projectPath: string;
  pendingDeepLinkDoc?: string;
}

export interface WindowManagerDeps {
  createWindow(opts: { additionalArguments: string[]; title: string }): BrowserWindowLike;
  forkUtility(entry: string, opts: { windowLifecycleBound?: boolean }): UtilityProcessLike;
  utilityEntryPath: string;
  rendererEntryPath: string;
  rendererDevUrl?: string | null;
  setTimeout(cb: () => void, ms: number): unknown;
  killProbe(pid: number, signal: number | NodeJS.Signals): void;
  runClean?(opts: { lockDir: string }): Promise<void>;
  realpathSync?(p: string): string;
  readServerLock?(lockDir: string): ServerLockMetadataLike | null;
  isProcessAlive?(pid: number): boolean;
  hostname?(): string;
  probeWsUpgrade?(url: string, timeoutMs: number): Promise<boolean>;
  killProcess?(pid: number, signal: NodeJS.Signals): void;
  waitForLockReleased?(lockDir: string, deadlineMs: number): Promise<boolean>;
  utilityInitTimeoutMs?: number;
  log?: {
    info(obj: object, msg: string): void;
    warn(obj: object, msg: string): void;
    error(obj: object, msg: string): void;
  };
  onUtilityMessage?(msg: unknown): void;
  onUtilityExit?(utility: UtilityProcessLike): void;
}

export class WindowManager {
  private readonly windowsByPath = new Map<string, ProjectContext>();

  constructor(private readonly deps: WindowManagerDeps) {}

  private canonicalizeKey(projectPath: string): string {
    const absolute = resolve(projectPath);
    const rp = this.deps.realpathSync ?? realpathSync;
    try {
      return rp(absolute);
    } catch {
      return absolute;
    }
  }

  getWindowFor(projectPath: string): ProjectContext | undefined {
    return this.windowsByPath.get(this.canonicalizeKey(projectPath));
  }

  focusWindowForProject(projectPath: string): BrowserWindowLike | null {
    const ctx = this.windowsByPath.get(this.canonicalizeKey(projectPath));
    if (!ctx) return null;
    const win = ctx.window;
    if (win.isMinimized?.()) win.restore?.();
    win.show?.();
    win.focus();
    return win;
  }

  getContextForBrowserWindow(win: BrowserWindowLike): ProjectContext | undefined {
    for (const ctx of this.windowsByPath.values()) {
      if (ctx.window === win) return ctx;
    }
    return undefined;
  }

  windowCount(): number {
    return this.windowsByPath.size;
  }

  async createProjectWindow(opts: CreateProjectWindowOpts): Promise<ProjectContext> {
    const projectPath = resolve(opts.projectPath);
    const canonicalKey = this.canonicalizeKey(projectPath);
    const existing = this.windowsByPath.get(canonicalKey);
    if (existing) {
      if (existing.window.isDestroyed?.() !== true) {
        existing.window.focus();
        return existing;
      }
      this.deps.log?.warn(
        { canonicalKey },
        '[window-manager] stale destroyed-window entry — clearing and re-creating',
      );
      this.windowsByPath.delete(canonicalKey);
    }
    const projectName = basename(projectPath);

    const lockDir = getLocalDir(projectPath);

    const candidate = this.tryAttachExistingServer(lockDir);
    const attached =
      candidate !== null && (await this.probeAttachableLock(candidate)) ? candidate : null;
    if (attached) {
      return this.attachToExistingServer({
        projectPath,
        canonicalKey,
        projectName,
        lock: attached,
        pendingDeepLinkDoc: opts.pendingDeepLinkDoc,
      });
    }

    if (this.deps.runClean) {
      try {
        await this.deps.runClean({ lockDir });
      } catch (err) {
        this.deps.log?.warn(
          { err: (err as Error).message, lockDir },
          'runClean failed; proceeding to fork utility',
        );
      }
    }

    const INIT_TIMEOUT_MS = this.deps.utilityInitTimeoutMs ?? 15_000;

    let utility!: UtilityProcessLike;
    let port = 0;
    let apiOrigin = '';
    for (let attempt = 1; ; attempt++) {
      utility = this.deps.forkUtility(this.deps.utilityEntryPath, {
        windowLifecycleBound: true,
      });
      const utilityRef = utility;
      const ready = new Promise<{ port: number; apiOrigin: string }>((resolveReady, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          utilityRef.removeListener?.('message', onMessage);
          utilityRef.removeListener?.('exit', onExit);
          fn();
        };
        const onMessage = (msg: unknown) => {
          const m = msg as {
            type?: string;
            port?: number;
            apiOrigin?: string;
            message?: string;
            kind?: string;
            existingLock?: ServerLockMetadataLike;
          };
          if (m.type === 'ready' && typeof m.port === 'number' && typeof m.apiOrigin === 'string') {
            const p = m.port;
            const o = m.apiOrigin;
            settle(() => resolveReady({ port: p, apiOrigin: o }));
          } else if (m.type === 'error') {
            const richError = Object.assign(new Error(m.message ?? 'utility init failed'), {
              name: m.kind === 'lock-collision' ? 'LockCollisionError' : 'UtilityInitError',
              kind: m.kind,
              existingLock: m.existingLock,
            });
            settle(() => reject(richError));
          }
        };
        const onExit = (code: number | null) => {
          settle(() => reject(new Error(`utility exited before ready (code=${code})`)));
        };
        utilityRef.on('message', onMessage);
        utilityRef.on('exit', onExit);

        this.deps.setTimeout(() => {
          settle(() => reject(new Error(`utility init timed out after ${INIT_TIMEOUT_MS}ms`)));
        }, INIT_TIMEOUT_MS);
      });

      utility.postMessage({
        type: 'init',
        opts: {
          contentDir: projectPath,
          projectDir: projectPath,
          port: 0,
          host: 'localhost',
        },
      });

      try {
        ({ port, apiOrigin } = await ready);
        break;
      } catch (err) {
        const richErr = err as Error & {
          kind?: string;
          existingLock?: ServerLockMetadataLike;
        };
        const candidatePid = richErr.existingLock?.pid;
        const collidedWithMcp =
          attempt === 1 &&
          richErr.name === 'LockCollisionError' &&
          richErr.existingLock?.kind === 'mcp-spawned' &&
          isValidLockPidLocal(candidatePid) &&
          candidatePid !== process.pid;
        if (!collidedWithMcp) {
          if (
            attempt === 1 &&
            richErr.name === 'LockCollisionError' &&
            richErr.existingLock?.kind === 'mcp-spawned'
          ) {
            this.deps.log?.warn(
              {
                event: 'desktop-attach-refused',
                reason: 'invalid-holder-pid',
                holderPid: richErr.existingLock.pid,
                lockDir,
              },
              '[window-manager] refusing to auto-kill collision holder with invalid pid',
            );
          }
          throw err;
        }
        const collisionLock = richErr.existingLock as ServerLockMetadataLike;
        const holderPid = collisionLock.pid;
        this.deps.log?.warn(
          { event: 'desktop-attach-refused', reason: 'collision-mcp-spawned', holderPid, lockDir },
          '[window-manager] mcp-spawned holder collided — sending SIGTERM and retrying',
        );
        const kill =
          this.deps.killProcess ??
          ((pid: number, signal: NodeJS.Signals) => {
            process.kill(pid, signal);
          });
        const verifyHolderStillOwnsLock = (): boolean => {
          if (!isValidLockPidLocal(holderPid)) return false;
          if (holderPid === process.pid) return false;
          const reader = this.deps.readServerLock;
          if (!reader) return true;
          const current = reader(lockDir);
          if (!current) return false;
          if (current.pid !== holderPid) return false;
          if (current.kind !== 'mcp-spawned') return false;
          if (
            typeof collisionLock.startedAt === 'string' &&
            current.startedAt !== collisionLock.startedAt
          ) {
            return false;
          }
          return true;
        };
        if (verifyHolderStillOwnsLock()) {
          try {
            kill(holderPid, 'SIGTERM');
          } catch {}
        } else {
          this.deps.log?.warn(
            { event: 'desktop-attach-refused', reason: 'holder-changed', holderPid, lockDir },
            '[window-manager] holder identity changed before SIGTERM — skipping signal',
          );
        }
        const SIGTERM_GRACE_MS = 5_000;
        const released = await (this.deps.waitForLockReleased
          ? this.deps.waitForLockReleased(lockDir, SIGTERM_GRACE_MS)
          : pollLockReleasedDefault(lockDir, SIGTERM_GRACE_MS));
        let finalReleased = released;
        if (!released) {
          if (verifyHolderStillOwnsLock()) {
            this.deps.log?.warn(
              { holderPid },
              '[window-manager] SIGTERM did not take within grace — escalating to SIGKILL',
            );
            try {
              kill(holderPid, 'SIGKILL');
            } catch {}
            finalReleased = await (this.deps.waitForLockReleased
              ? this.deps.waitForLockReleased(lockDir, 2_000)
              : pollLockReleasedDefault(lockDir, 2_000));
          } else {
            this.deps.log?.warn(
              { event: 'desktop-attach-refused', reason: 'holder-changed', holderPid, lockDir },
              '[window-manager] holder identity changed before SIGKILL — skipping signal',
            );
          }
        }
        if (!finalReleased) {
          const stuck = Object.assign(
            new Error(
              `Open Knowledge could not start: pid ${holderPid} is still holding the server lock at ${lockDir}.`,
            ),
            { kind: 'mcp-server-stuck' as const, holderPid },
          );
          throw stuck;
        }
      }
    }

    if (this.deps.onUtilityMessage) {
      const onMessage = this.deps.onUtilityMessage;
      utility.on('message', (msg) => onMessage(msg));
    }

    utility.on('exit', (code) => {
      this.deps.log?.info({ pid: utility.pid, code }, 'utility exited');
      this.windowsByPath.delete(canonicalKey);
      this.deps.onUtilityExit?.(utility);
      const pid = utility.pid;
      if (typeof pid === 'number') {
        this.deps.setTimeout(() => {
          try {
            this.deps.killProbe(pid, 0);
            this.deps.log?.warn(
              { pid },
              'utility pid still alive 1s after exit event — sending SIGTERM',
            );
            this.deps.killProbe(pid, 'SIGTERM');
          } catch {}
        }, 1000);
      }
    });

    const window = this.deps.createWindow({
      additionalArguments: [
        `--ok-collab-url=ws://localhost:${port}/collab`,
        `--ok-api-origin=${apiOrigin}`,
        `--ok-project-path=${projectPath}`,
        `--ok-project-name=${projectName}`,
        `--ok-mode=editor`,
      ],
      title: formatEditorTitle(projectName),
    });

    if (opts.pendingDeepLinkDoc) {
      const doc = opts.pendingDeepLinkDoc;
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:deep-link', { doc });
      });
    }

    window.once('ready-to-show', () => {
      window.show?.();
    });
    this.deps.setTimeout(() => {
      if (window.isDestroyed?.() || window.isVisible?.()) return;
      this.deps.log?.warn(
        { event: 'ready-to-show-timeout' },
        'ready-to-show did not fire within 5s — falling back',
      );
      window.show?.();
    }, 5000);

    if (this.deps.rendererDevUrl) {
      await window.loadURL(this.deps.rendererDevUrl);
    } else {
      await window.loadFile(this.deps.rendererEntryPath);
    }

    window.on('closed', () => {
      try {
        utility.postMessage({ type: 'shutdown' });
      } catch (err) {
        this.deps.log?.warn(
          { err: (err as Error).message, projectPath },
          'utility shutdown IPC failed on window close (likely already exited)',
        );
      }
    });

    const context: ProjectContext = {
      projectPath,
      canonicalKey,
      projectName,
      port,
      apiOrigin,
      window,
      utility,
      ownsServer: true,
    };
    this.windowsByPath.set(canonicalKey, context);
    return context;
  }

  closeProjectWindow(projectPath: string): boolean {
    const ctx = this.windowsByPath.get(this.canonicalizeKey(projectPath));
    if (!ctx) return false;
    if (!ctx.ownsServer || !ctx.utility) {
      return true;
    }
    try {
      ctx.utility.postMessage({ type: 'shutdown' });
    } catch (err) {
      this.deps.log?.warn(
        { err: (err as Error).message, projectPath },
        'utility shutdown IPC failed in closeProjectWindow (likely already exited)',
      );
    }
    return true;
  }

  private tryAttachExistingServer(lockDir: string): ServerLockMetadataLike | null {
    const read = this.deps.readServerLock;
    const alive = this.deps.isProcessAlive;
    const getHost = this.deps.hostname;
    if (!read || !alive || !getHost) return null;
    const lock = read(lockDir);
    if (!lock) return null;
    const refuse = (reason: string): null => {
      this.deps.log?.warn(
        { event: 'desktop-attach-refused', reason, lockDir, lockPid: lock.pid },
        '[window-manager] refusing attach',
      );
      return null;
    };
    if (!isValidLockPidLocal(lock.pid)) return refuse('invalid-lock-pid');
    if (lock.hostname !== getHost()) return refuse('foreign-hostname');
    if (!alive(lock.pid)) return refuse('lock-pid-dead');
    if (lock.port <= 0) return refuse('lock-port-zero');
    if (lock.kind === undefined) return refuse('legacy-lock-no-kind');
    if (lock.kind === 'mcp-spawned') return refuse('kind-mcp-spawned');
    if (lock.capabilities !== undefined && !lock.capabilities.includes('ws')) {
      return refuse('capabilities-missing-ws');
    }
    return lock;
  }

  private async probeAttachableLock(lock: ServerLockMetadataLike): Promise<boolean> {
    const probe = this.deps.probeWsUpgrade;
    if (!probe) return true;
    const url = `ws://localhost:${lock.port}/collab/__attach_probe__`;
    let upgradeOk = false;
    try {
      upgradeOk = await probe(url, 500);
    } catch {
      upgradeOk = false;
    }
    if (!upgradeOk) {
      this.deps.log?.warn(
        { event: 'desktop-attach-refused', reason: 'ws-upgrade-failed', lockPid: lock.pid },
        '[window-manager] refusing attach',
      );
    }
    return upgradeOk;
  }

  private async attachToExistingServer(args: {
    projectPath: string;
    canonicalKey: string;
    projectName: string;
    lock: ServerLockMetadataLike;
    pendingDeepLinkDoc?: string;
  }): Promise<ProjectContext> {
    const { projectPath, canonicalKey, projectName, lock, pendingDeepLinkDoc } = args;
    const port = lock.port;
    const apiOrigin = `http://localhost:${port}`;

    this.deps.log?.info(
      { projectPath, holderPid: lock.pid, port, startedAt: lock.startedAt },
      'attaching to existing Open Knowledge server',
    );

    const window = this.deps.createWindow({
      additionalArguments: [
        `--ok-collab-url=ws://localhost:${port}/collab`,
        `--ok-api-origin=${apiOrigin}`,
        `--ok-project-path=${projectPath}`,
        `--ok-project-name=${projectName}`,
        `--ok-mode=editor`,
      ],
      title: formatEditorTitle(projectName),
    });

    if (pendingDeepLinkDoc) {
      const doc = pendingDeepLinkDoc;
      window.webContents.once('dom-ready', () => {
        sendToRenderer(window.webContents, 'ok:deep-link', { doc });
      });
    }

    window.once('ready-to-show', () => {
      window.show?.();
    });
    this.deps.setTimeout(() => {
      if (window.isDestroyed?.() || window.isVisible?.()) return;
      this.deps.log?.warn(
        { event: 'ready-to-show-timeout' },
        'ready-to-show did not fire within 5s — falling back',
      );
      window.show?.();
    }, 5000);

    if (this.deps.rendererDevUrl) {
      await window.loadURL(this.deps.rendererDevUrl);
    } else {
      await window.loadFile(this.deps.rendererEntryPath);
    }

    window.on('closed', () => {
      this.windowsByPath.delete(canonicalKey);
    });

    const context: ProjectContext = {
      projectPath,
      canonicalKey,
      projectName,
      port,
      apiOrigin,
      window,
      utility: null,
      ownsServer: false,
    };
    this.windowsByPath.set(canonicalKey, context);
    return context;
  }
}
