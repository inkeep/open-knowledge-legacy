import { isAbsolute, resolve } from 'node:path';
import { parseGitHubBlobUrl } from '@inkeep/open-knowledge';
import {
  decodeShareUrl,
  InvalidShareUrlError,
  UnsupportedShareVersionError,
} from '@inkeep/open-knowledge-core';

interface ParsedOpenKnowledgeUrl {
  readonly host: 'open';
  readonly project: string;
  readonly doc: string;
}

const SHARE_UNIVERSAL_LINK_HOSTS = new Set(['openknowledge.ai', 'www.openknowledge.ai']);

const SHARE_UNIVERSAL_LINK_PATH_PREFIX = '/d/';

function readWebpageURL(source: unknown): string | null {
  if (source === null || typeof source !== 'object') return null;
  const candidate = (source as { webpageURL?: unknown }).webpageURL;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export interface ShareUrlPayload {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly blobUrl: string;
}

export type ShareUrlSource = 'universal-link' | 'custom-scheme';

export type ShareParseResult =
  | { readonly kind: 'ok'; readonly source: ShareUrlSource; readonly payload: ShareUrlPayload }
  | {
      readonly kind: 'unsupported-version';
      readonly source: ShareUrlSource;
      readonly version: number;
    }
  | { readonly kind: 'invalid'; readonly source: ShareUrlSource };

export type ShareDeepLinkPayload =
  | {
      readonly kind: 'ok';
      readonly owner: string;
      readonly repo: string;
      readonly branch: string;
      readonly path: string;
      readonly blobUrl: string;
    }
  | { readonly kind: 'unsupported-version' }
  | { readonly kind: 'invalid' };

export function parseShareUrl(input: string): ShareParseResult | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  if (input.includes('\x00') || /%00/i.test(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol === 'openknowledge:' && url.hostname === 'share') {
    return parseShareCustomScheme(url);
  }
  if (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    SHARE_UNIVERSAL_LINK_HOSTS.has(url.hostname) &&
    url.pathname.startsWith(SHARE_UNIVERSAL_LINK_PATH_PREFIX)
  ) {
    return parseShareUniversalLink(url);
  }
  return null;
}

function parseShareUniversalLink(url: URL): ShareParseResult {
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 2 || segments[0] !== 'd') {
    return { kind: 'invalid', source: 'universal-link' };
  }
  const encoded = segments[1];
  if (encoded === undefined || encoded.length === 0) {
    return { kind: 'invalid', source: 'universal-link' };
  }
  let decoded: { blobUrl: string };
  try {
    decoded = decodeShareUrl(encoded);
  } catch (err) {
    if (err instanceof UnsupportedShareVersionError) {
      return {
        kind: 'unsupported-version',
        source: 'universal-link',
        version: err.version,
      };
    }
    if (err instanceof InvalidShareUrlError) {
      return { kind: 'invalid', source: 'universal-link' };
    }
    return { kind: 'invalid', source: 'universal-link' };
  }
  return finalizeShareResult(decoded.blobUrl, 'universal-link');
}

function parseShareCustomScheme(url: URL): ShareParseResult {
  const rawBlobUrl = url.searchParams.get('url');
  if (!rawBlobUrl) {
    return { kind: 'invalid', source: 'custom-scheme' };
  }
  return finalizeShareResult(rawBlobUrl, 'custom-scheme');
}

const MAX_BLOB_URL_LENGTH = 4096;

function finalizeShareResult(blobUrl: string, source: ShareUrlSource): ShareParseResult {
  if (typeof blobUrl !== 'string' || blobUrl.length === 0) {
    return { kind: 'invalid', source };
  }
  if (blobUrl.length > MAX_BLOB_URL_LENGTH) {
    return { kind: 'invalid', source };
  }
  if (blobUrl.includes('\x00')) {
    return { kind: 'invalid', source };
  }
  const parsed = parseGitHubBlobUrl(blobUrl);
  if (parsed === null) {
    return { kind: 'invalid', source };
  }
  return {
    kind: 'ok',
    source,
    payload: {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
      path: parsed.path,
      blobUrl,
    },
  };
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
    on(
      event: 'continue-activity',
      cb: (
        event: { preventDefault: () => void },
        type: string,
        userInfo: unknown,
        details?: { webpageURL?: string },
      ) => void,
    ): void;
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
  sendShareDeepLink?(win: BrowserWindowHandle, payload: ShareDeepLinkPayload): void;
  getFocusedWindow?(): BrowserWindowHandle | null;
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

  const routeShare = (url: string, result: ShareParseResult): void => {
    if (result.kind === 'unsupported-version') {
      deps.log?.warn(
        { source: result.source, result: result.kind, version: result.version },
        '[receive] action=url-parse',
      );
    } else {
      deps.log?.warn({ source: result.source, result: result.kind }, '[receive] action=url-parse');
    }
    const sendShare = deps.sendShareDeepLink;
    if (!sendShare) {
      deps.log?.warn({ url }, '[receive] sendShareDeepLink dep missing — share dropped');
      return;
    }
    const target = deps.getFocusedWindow?.() ?? deps.getAnyReadyWindow();
    if (!target) {
      deps.log?.warn({ url }, '[receive] no target window — share dropped');
      return;
    }
    const payload: ShareDeepLinkPayload =
      result.kind === 'ok' ? { kind: 'ok', ...result.payload } : { kind: result.kind };
    sendShare(target, payload);
  };

  const routeUrl = (url: string): void => {
    const share = parseShareUrl(url);
    if (share !== null) {
      routeShare(url, share);
      return;
    }
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

  deps.app.on('continue-activity', (event, type, userInfo, details) => {
    if (type !== 'NSUserActivityTypeBrowsingWeb') return;
    const webpageURL =
      readWebpageURL(details) ?? readWebpageURL(userInfo as { webpageURL?: unknown } | undefined);
    if (!webpageURL) return;
    let host: string;
    try {
      host = new URL(webpageURL).hostname.toLowerCase();
    } catch {
      return;
    }
    if (!SHARE_UNIVERSAL_LINK_HOSTS.has(host)) return;
    event.preventDefault();
    deps.log?.warn({ type, urlHost: host }, '[receive] action=continue-activity-received');
    enqueueOrRoute(webpageURL);
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
