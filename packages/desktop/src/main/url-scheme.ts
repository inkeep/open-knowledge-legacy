/**
 * `openknowledge://` deep-link URL scheme — parser + runtime handler (M4).
 *
 * Two public surfaces in this module:
 *   - `parseOpenKnowledgeUrl(input)` — pure-functional parse + validate. No
 *     Electron import at module top, so unit tests exercise it without a real
 *     Electron runtime (precedent #4 — shared computation, per-surface render).
 *   - `registerProtocolHandler(deps)` — wires `app.on('open-url', ...)` +
 *     `app.on('second-instance', ...)` and implements the VS Code queue-then-
 *     flush pattern so macOS cold-start Apple Events that fire before
 *     `whenReady` are never lost.
 *
 * Validation layers (URL shape: `openknowledge://open?project=<abs>&doc=<name>`):
 *   1. Reject null bytes anywhere in the raw input (`\x00`, `%00`).
 *   2. Protocol must be `openknowledge:`; host must be `open`.
 *   3. `project` + `doc` required; each URL-decoded before path checks.
 *   4. `project` must be absolute AND must not contain `..` segments after
 *      `path.normalize()` — `path.resolve` would silently flatten `../../etc/x`
 *      to `/etc/x`, so we reject ANY `..` segment in the decoded path.
 *   5. `doc` must be a relative in-project name — reject `..`, `/`, `\`.
 *
 * URL shape LOCKED by the parent Electron spec D43. Changes require a
 * corrigendum there — this module is downstream of that contract.
 */

import { isAbsolute, resolve } from 'node:path';

/** Successful parse result — host is narrowed to the one supported value. */
export interface ParsedOpenKnowledgeUrl {
  readonly host: 'open';
  readonly project: string;
  readonly doc: string;
}

/**
 * Parse + validate an `openknowledge://...` URL. Returns `null` on any
 * validation failure (unknown protocol, unknown host, missing params, path
 * traversal, null bytes, ...). Never throws.
 */
export function parseOpenKnowledgeUrl(input: string): ParsedOpenKnowledgeUrl | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  // Reject null bytes BEFORE URL parsing. `new URL()` happily keeps `%00`
  // around, and `decodeURIComponent('%00')` produces `'\x00'` which can
  // truncate paths in downstream C libraries.
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

  // Post-decode null-byte recheck — defense in depth against smugglers that
  // layer encodings (e.g. `%2500` → `%00` → `\x00`).
  if (project.includes('\x00') || doc.includes('\x00')) return null;

  if (project.length === 0 || doc.length === 0) return null;

  if (!isAbsolute(project)) return null;
  // Check for `..` segments in the decoded-but-unnormalized path. `path.resolve`
  // and `path.normalize` BOTH silently flatten `/foo/../../etc/passwd` into
  // `/etc/passwd`, so either would sneak a traversal past the check. The only
  // safe gate is "does the raw string split on separators contain `..`."
  if (project.split(/[/\\]/).includes('..')) return null;

  // `doc` must be a relative name inside the project — NOT a path. Reject any
  // separator or `..` segment. (The renderer uses the doc to set `window.
  // location.hash = '#/' + encodeURIComponent(doc)`; letting `/` or `..` in
  // would break hash-route parsing and could also be used for XSS via the
  // URL fragment.)
  if (doc === '..' || doc.startsWith('../') || doc.includes('/') || doc.includes('\\')) {
    return null;
  }

  return {
    host: 'open',
    project: resolve(project),
    doc,
  };
}

/**
 * Side-effect surface for `registerProtocolHandler`. Injected so the main-
 * process glue can pass real `openProject` / `focusWindowForProject` / `send`
 * functions while tests pass stubs.
 */
export interface ProtocolHandlerDeps {
  /** `electron.app` subset — the listeners + setters we touch. */
  app: {
    on(event: 'open-url', cb: (event: { preventDefault: () => void }, url: string) => void): void;
    on(event: 'second-instance', cb: (event: unknown, argv: readonly string[]) => void): void;
    whenReady(): Promise<void>;
    isPackaged: boolean;
    setAsDefaultProtocolClient(scheme: string): boolean;
  };
  /** Resolve an existing BrowserWindow for a project path, or null. */
  focusWindowForProject(projectPath: string): BrowserWindowHandle | null;
  /** Spawn a new window for a project path. Returns the BrowserWindowHandle. */
  openProject(projectPath: string): Promise<BrowserWindowHandle>;
  /** Typed event dispatch — pushes `ok:deep-link` with the doc name. */
  sendDeepLink(win: BrowserWindowHandle, payload: { doc: string }): void;
  /**
   * Returns any currently-ready BrowserWindow, or null if none. The flush loop
   * retries up to 10 × 500ms while this returns null — flushing URLs before
   * the first window is up would drop them into a void.
   */
  getAnyReadyWindow(): BrowserWindowHandle | null;
  /** Test injection for `setTimeout`. Defaults to the global. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  /** Optional structured logger. */
  log?: {
    warn(obj: object, msg: string): void;
    info?(obj: object, msg: string): void;
  };
}

/**
 * Opaque handle to a BrowserWindow — we pass it between deps without caring
 * about Electron internals. Shape-compatible with `BrowserWindowLike` from
 * `window-manager.ts` plus Electron's `BrowserWindow` at runtime.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentional — opaque handle.
export interface BrowserWindowHandle {}

const QUEUE_FLUSH_MAX_ATTEMPTS = 10;
const QUEUE_FLUSH_INTERVAL_MS = 500;

/**
 * Wire `open-url` + `second-instance` handlers synchronously. Call from the
 * main-process entry BEFORE `app.whenReady()` — Phase-1 investigation
 * established that on macOS the `open-url` Apple Event can arrive before any
 * `ready` lifecycle hook, and even before `will-finish-launching` if the
 * Launch Services binding races us.
 *
 * Safe to call multiple times per-process only if you reset state — tests
 * must spin a fresh handler module per run. Production calls this exactly
 * once at top of `main/index.ts`.
 */
export function registerProtocolHandler(deps: ProtocolHandlerDeps): void {
  const schedule = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
  const urlQueue: string[] = [];
  let flushed = false;

  // Dev-mode registration — unpackaged Electron's Info.plist belongs to the
  // Electron.app shell, not this app, so Launch Services has no binding.
  // `setAsDefaultProtocolClient` writes a runtime binding so `open
  // openknowledge://...` targets the dev instance during development. Packaged
  // builds rely on `CFBundleURLTypes` from electron-builder.yml.
  if (!deps.app.isPackaged) {
    try {
      deps.app.setAsDefaultProtocolClient('openknowledge');
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
      // Silent-drop → single warn log line. No error dialog (SPEC AC6).
      deps.log?.warn({ url }, '[url-scheme] dropped malformed URL');
      return;
    }
    const existing = deps.focusWindowForProject(parsed.project);
    if (existing) {
      deps.sendDeepLink(existing, { doc: parsed.doc });
      return;
    }
    // No existing window for this project → spawn a new one.
    void deps
      .openProject(parsed.project)
      .then((win) => {
        deps.sendDeepLink(win, { doc: parsed.doc });
      })
      .catch((err) => {
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

  // `open-url` — macOS Apple Event path (the primary warm/cold delivery
  // channel). `preventDefault` silences Electron's default "log to stderr"
  // behavior and signals we've handled the event.
  deps.app.on('open-url', (event, url) => {
    event.preventDefault();
    enqueueOrRoute(url);
  });

  // `second-instance` — fires when a duplicate process invocation is denied
  // by `requestSingleInstanceLock`. CLI launches (`OK.app/Contents/MacOS/Open
  // Knowledge openknowledge://...`) and dev launches carry the URL in argv
  // rather than firing an Apple Event, so we scan argv here.
  deps.app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      if (typeof arg === 'string' && arg.startsWith('openknowledge://')) {
        enqueueOrRoute(arg);
      }
    }
  });

  // Flush loop — after `whenReady`, wait for any BrowserWindow to be up
  // before draining the queue. URLs routed while the window manager is still
  // booting would either crash or vanish; the 10 × 500ms retry is the VS
  // Code `ElectronURLListener` convention.
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
        // Out of retries with a window still missing. Drain what we have so
        // we don't leak the queue — `routeUrl` will spawn a project window
        // on demand via `openProject`.
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
