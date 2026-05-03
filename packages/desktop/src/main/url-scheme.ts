import { isAbsolute, resolve } from 'node:path';

interface ParsedOpenKnowledgeUrl {
  readonly host: 'open';
  readonly project: string;
  readonly doc: string;
}

export function parseOpenKnowledgeUrl(input: string): ParsedOpenKnowledgeUrl | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  if (input.includes('\x00') || /%00/i.test(input)) return null;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'openknowledge:') return null;
  if (parsed.hostname !== 'open') return null;

  const rawProject = parsed.searchParams.get('project');
  const rawDoc = parsed.searchParams.get('doc');
  if (!rawProject || !rawDoc) return null;

  let project: string;
  let doc: string;
  try {
    project = decodeURIComponent(rawProject);
    doc = decodeURIComponent(rawDoc);
  } catch {
    return null;
  }

  if (project.includes('\x00') || doc.includes('\x00')) return null;

  if (project.length === 0 || doc.length === 0) return null;

  if (!isAbsolute(project)) return null;
  if (project.split(/[/\\]/).includes('..')) return null;

  if (doc.includes('\\')) return null;
  if (doc.startsWith('/')) return null;
  if (doc.split('/').includes('..')) return null;

  return {
    host: 'open',
    project: resolve(project),
    doc,
  };
}

interface ProtocolHandlerDeps {
  app: {
    on(event: 'open-url', cb: (event: { preventDefault: () => void }, url: string) => void): void;
    on(event: 'second-instance', cb: (event: unknown, argv: readonly string[]) => void): void;
    on(event: 'before-quit', cb: () => void): void;
    whenReady(): Promise<void>;
    isPackaged: boolean;
    setAsDefaultProtocolClient(scheme: string): boolean;
    removeAsDefaultProtocolClient(scheme: string): boolean;
  };
  focusWindowForProject(projectPath: string): BrowserWindowHandle | null;
  openProject(
    projectPath: string,
    opts?: { pendingDeepLinkDoc?: string },
  ): Promise<BrowserWindowHandle | null>;
  sendDeepLink(win: BrowserWindowHandle, payload: { doc: string }): void;
  getAnyReadyWindow(): BrowserWindowHandle | null;
  getInitialArgv?: () => readonly string[];
  setTimeout?: (cb: () => void, ms: number) => unknown;
  log?: {
    warn(obj: object, msg: string): void;
    info?(obj: object, msg: string): void;
  };
}

// biome-ignore lint/suspicious/noEmptyInterface: intentional — opaque handle.
interface BrowserWindowHandle {}

const QUEUE_FLUSH_MAX_ATTEMPTS = 10;
const QUEUE_FLUSH_INTERVAL_MS = 500;

export function registerProtocolHandler(deps: ProtocolHandlerDeps): void {
  const schedule = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
  const urlQueue: string[] = [];
  let flushed = false;

  if (!deps.app.isPackaged) {
    try {
      const ok = deps.app.setAsDefaultProtocolClient('openknowledge');
      if (!ok) {
        deps.log?.warn(
          {},
          '[url-scheme] setAsDefaultProtocolClient returned false — dev deep-links may not reach this instance',
        );
      } else {
        deps.app.on('before-quit', () => {
          try {
            deps.app.removeAsDefaultProtocolClient('openknowledge');
          } catch (err) {
            deps.log?.warn(
              { err: (err as Error).message },
              '[url-scheme] removeAsDefaultProtocolClient failed on before-quit',
            );
          }
        });
      }
    } catch (err) {
      deps.log?.warn(
        { err: (err as Error).message },
        '[url-scheme] setAsDefaultProtocolClient failed',
      );
    }
  }

  const routeUrl = (url: string): void => {
    const parsed = parseOpenKnowledgeUrl(url);
    if (!parsed) {
      deps.log?.warn({ url }, '[url-scheme] dropped malformed URL');
      return;
    }
    const existing = deps.focusWindowForProject(parsed.project);
    if (existing) {
      deps.sendDeepLink(existing, { doc: parsed.doc });
      return;
    }
    void deps.openProject(parsed.project, { pendingDeepLinkDoc: parsed.doc }).catch((err) => {
      deps.log?.warn(
        { err: (err as Error).message, project: parsed.project },
        '[url-scheme] openProject failed',
      );
    });
  };

  const enqueueOrRoute = (url: string): void => {
    if (flushed) {
      routeUrl(url);
    } else {
      urlQueue.push(url);
    }
  };

  deps.app.on('open-url', (event, url) => {
    event.preventDefault();
    enqueueOrRoute(url);
  });

  deps.app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      if (typeof arg === 'string' && arg.startsWith('openknowledge://')) {
        enqueueOrRoute(arg);
      }
    }
  });

  const initialArgv = deps.getInitialArgv ? deps.getInitialArgv() : [];
  for (const arg of initialArgv) {
    if (typeof arg === 'string' && arg.startsWith('openknowledge://')) {
      enqueueOrRoute(arg);
    }
  }

  void deps.app.whenReady().then(() => {
    const tryFlush = (attempt: number): void => {
      if (urlQueue.length === 0 || deps.getAnyReadyWindow()) {
        flushed = true;
        while (urlQueue.length > 0) {
          const next = urlQueue.shift();
          if (next) routeUrl(next);
        }
        return;
      }
      if (attempt >= QUEUE_FLUSH_MAX_ATTEMPTS) {
        flushed = true;
        while (urlQueue.length > 0) {
          const next = urlQueue.shift();
          if (next) routeUrl(next);
        }
        return;
      }
      schedule(() => tryFlush(attempt + 1), QUEUE_FLUSH_INTERVAL_MS);
    };
    tryFlush(0);
  });
}
