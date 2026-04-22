/**
 * `openknowledge://` deep-link URL scheme — parser + runtime handler (M4).
 *
 * Two public surfaces in this module:
 *   - `parseOpenKnowledgeUrl(input)` — pure-functional parse + validate. No
 *     Electron import at module top, so unit tests exercise it without a real
 *     Electron runtime (precedent #4 — shared computation, per-surface render).
 *   - `registerProtocolHandler(deps)` — wires `app.on('open-url', ...)` +
 *     `app.on('second-instance', ...)`, scans `process.argv` for cold-start
 *     CLI-launch delivery, and implements the VS Code queue-then-flush
 *     pattern so macOS cold-start Apple Events that fire before `whenReady`
 *     are never lost.
 *
 * **Caller contract:** `app.requestSingleInstanceLock()` MUST be acquired by
 * the caller BEFORE `registerProtocolHandler` runs. Without the lock, the
 * `second-instance` event cannot fire (Electron only dispatches it on the
 * primary when a secondary invocation relinquishes the lock), so the
 * documented "CLI launch with argv delivery" path is silently dead. The
 * current call site is `packages/desktop/src/main/index.ts`, gated on
 * `GOT_SINGLE_INSTANCE_LOCK`.
 *
 * Validation layers (URL shape: `openknowledge://open?project=<abs>&doc=<name>`):
 *   1. Reject null bytes anywhere in the raw input (`\x00`, `%00`).
 *   2. Protocol must be `openknowledge:`; host must be `open`.
 *   3. `project` + `doc` required; each URL-decoded before path checks.
 *   4. `project` must be absolute AND must not contain `..` segments after
 *      `path.normalize()` — `path.resolve` would silently flatten `../../etc/x`
 *      to `/etc/x`, so we reject ANY `..` segment in the decoded path.
 *   5. `doc` must be a relative in-project name — reject any `..` segment (so
 *      `a/../b`, `../a`, and `..` all fail) and reject Windows `\` separators.
 *      `/` IS allowed as a segment separator — nested docNames like
 *      `notes/meeting-2026` are the common MCP producer shape (see
 *      `packages/cli/src/mcp/tools/write-document.ts:31` + `preview-url.ts:183`),
 *      and the renderer round-trips them cleanly via `encodeURIComponent(doc)`
 *      + `docNameFromHash` (`packages/app/src/lib/doc-hash.ts:14`).
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

  // `doc` is a relative in-project name. Nested paths (`notes/meeting`) ARE
  // allowed — the MCP `preview-url.ts` producer emits them via
  // `encodeURIComponent(docName)`, and the renderer round-trips them through
  // `encodeURIComponent` + `docNameFromHash`. Reject `..` segments (any
  // position), Windows-style `\` separators, and leading `/` (which would
  // be interpreted as an absolute path in unrelated downstream code).
  if (doc.includes('\\')) return null;
  if (doc.startsWith('/')) return null;
  if (doc.split('/').includes('..')) return null;

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
  /**
   * Spawn a new window for a project path. Returns `null` when the spawn
   * failed AND the error has already been surfaced to the user (dialog,
   * Navigator fallback) — the caller must skip downstream `sendDeepLink` so
   * the failure isn't double-logged.
   */
  openProject(projectPath: string): Promise<BrowserWindowHandle | null>;
  /** Typed event dispatch — pushes `ok:deep-link` with the doc name. */
  sendDeepLink(win: BrowserWindowHandle, payload: { doc: string }): void;
  /**
   * Returns any currently-ready BrowserWindow, or null if none. The flush loop
   * retries up to 10 × 500ms while this returns null — flushing URLs before
   * the first window is up would drop them into a void.
   */
  getAnyReadyWindow(): BrowserWindowHandle | null;
  /**
   * Initial `process.argv` snapshot for cold-start CLI-launch delivery. The
   * handler scans argv once at registration time for `openknowledge://`
   * entries; macOS packaged builds receive URLs via the `open-url` Apple
   * Event, but direct-binary launches (`OK.app/Contents/MacOS/Open Knowledge
   * openknowledge://...`) and dev-mode electron-vite launches deliver via
   * argv. Defaults to `process.argv` when omitted; tests inject a stub.
   */
  getInitialArgv?: () => readonly string[];
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
      // Per Electron docs `setAsDefaultProtocolClient` is non-throwing and
      // returns `false` when the OS refused the binding (another app owns
      // the scheme, sandboxing, permissions). Surface `false` as a warn —
      // without it the only symptom is "dev deep-links silently reach the
      // wrong instance," which burns hours to diagnose.
      const ok = deps.app.setAsDefaultProtocolClient('openknowledge');
      if (!ok) {
        deps.log?.warn(
          {},
          '[url-scheme] setAsDefaultProtocolClient returned false — dev deep-links may not reach this instance',
        );
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
      // Silent-drop → single warn log line. No error dialog (SPEC AC6).
      deps.log?.warn({ url }, '[url-scheme] dropped malformed URL');
      return;
    }
    const existing = deps.focusWindowForProject(parsed.project);
    if (existing) {
      deps.sendDeepLink(existing, { doc: parsed.doc });
      return;
    }
    // No existing window for this project → spawn a new one. `openProject`
    // returns `null` when the spawn failed AND the error was already surfaced
    // to the user (dialog + Navigator fallback); in that case we skip
    // `sendDeepLink` because there's no window to send to and the user has
    // already seen why.
    void deps
      .openProject(parsed.project)
      .then((win) => {
        if (!win) return;
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
  // by `requestSingleInstanceLock` (caller MUST acquire the lock in
  // `main/index.ts` before `registerProtocolHandler` runs, or this listener
  // is dead code — Electron only emits `second-instance` on the primary
  // when the lock machinery is active). CLI launches and dev launches carry
  // the URL in argv rather than firing an Apple Event.
  deps.app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      if (typeof arg === 'string' && arg.startsWith('openknowledge://')) {
        enqueueOrRoute(arg);
      }
    }
  });

  // Cold-start CLI-launch scan: on the primary instance's initial boot,
  // `process.argv` is the delivery surface for direct-binary launches (the
  // `second-instance` handler above only catches SECOND invocations). We
  // scan argv once here, synchronously, so a user running
  // `./OK.app/Contents/MacOS/Open\ Knowledge openknowledge://...` on a
  // not-yet-running app gets the URL queued alongside any Apple-Event
  // deliveries. Electron shell launches with no URL (the normal case)
  // produce zero matches.
  const initialArgv = deps.getInitialArgv ? deps.getInitialArgv() : [];
  for (const arg of initialArgv) {
    if (typeof arg === 'string' && arg.startsWith('openknowledge://')) {
      enqueueOrRoute(arg);
    }
  }

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
