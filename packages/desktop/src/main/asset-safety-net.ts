/**
 * Main-process defense-in-depth for asset clicks that bypass the renderer
 * dispatcher (SPEC 2026-04-23 amendment FR-A7, D-A10).
 *
 * The renderer-side `dispatchAssetClick` handles the happy path — every
 * click on a wikiembed `<a>` or an asset-classified link mark routes
 * through it. But clicks can escape:
 *
 *   - Drop-time `<a target="_blank">` renderHTML on the transient
 *     WikiLinkEmbed node (post-save shape differs). The `target="_blank"`
 *     means Electron fires `setWindowOpenHandler` for the new-window
 *     request; we intercept, deny, and delegate to OS.
 *   - Pasted raw `<a href="http://localhost:<port>/notes/foo.pdf">` from
 *     another app's clipboard. Click fires `will-navigate` on the editor's
 *     webContents; we intercept, preventDefault, and delegate to OS.
 *   - Future plugin content that emits `<a>` without wiring into the
 *     dispatcher.
 *
 * Two-handler pattern per research D3 (electron-os-integration-patterns):
 * `setWindowOpenHandler` covers NEW-window requests, `will-navigate`
 * covers IN-PAGE navigations. Electron docs recommend both as the
 * canonical defense; Standard Notes + AFFiNE + VSCode all implement
 * both.
 *
 * Pure-ish: takes a narrow `WebContentsLike` so tests can exercise the
 * dispatch logic without standing up Electron. `openAssetSafely` is
 * injected — the real wiring in `index.ts` passes the main-process gate
 * with the caller window's `ProjectContext.projectPath`.
 */

import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import type { AssetOpenResult } from './asset-allowlist.ts';

/**
 * Narrow webContents type — the subset `attachAssetSafetyNet` uses.
 * Matches Electron's `WebContents` at runtime but lets tests inject
 * a fake without pulling the full `electron` module into test-land.
 */
interface WebContentsLike {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }): void;
  on(
    event: 'will-navigate',
    handler: (event: { preventDefault: () => void }, url: string) => void,
  ): void;
}

interface AttachAssetSafetyNetDeps {
  /** Runs the authoritative main-process gate (containment + blocklist). */
  readonly openAsset: (relPath: string) => Promise<AssetOpenResult>;
  /**
   * Origin the editor serves from — used to distinguish "in-app" asset
   * URLs (which the safety net claims) from external URLs (which go
   * through the existing `ok:shell:open-external` + allowlist path).
   * Pass `apiOrigin` from the window's ProjectContext.
   */
  readonly editorOrigin: string;
  /**
   * Optional log hook — defaults to `console.warn` with a structured
   * prefix. Injected so tests can assert on the log + prod can pipe to
   * the main-process logger when that wiring arrives.
   */
  readonly log?: (event: {
    level: 'warn' | 'info';
    message: string;
    data: Record<string, unknown>;
  }) => void;
}

const DEFAULT_LOG: Required<AttachAssetSafetyNetDeps>['log'] = (event) => {
  console.warn(`[asset-safety-net] ${event.message}`, event.data);
};

/**
 * Parse an absolute URL against the editor's origin and extract a
 * project-relative asset path. Returns null for URLs that don't match
 * the editor origin OR whose path doesn't end in a known asset
 * extension — those escape to the existing `openExternal` / default
 * navigation flow.
 *
 * Exported for test coverage of the matching logic without mounting
 * the safety net.
 */
export function matchAssetUrl(url: string, editorOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const origin = parsed.origin;
  if (origin !== editorOrigin) return null;

  // Path starts with '/'. Strip leading slash to get the raw served
  // path — `/notes/meeting.pdf` → `notes/meeting.pdf`. The Vite dev
  // plugin and the production sirv middleware both serve project-
  // relative paths unchanged, so this matches the same filesystem
  // layout openAssetSafely's containment checks against.
  const path = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
  if (!path) return null;

  // Only claim asset-extension paths. The app bundle (`/index.html`,
  // `/@vite/client`, `/@react-refresh`) stays on the default route so
  // Vite HMR + app reloads keep working.
  const lastSegment = path.split('/').pop() ?? '';
  const extMatch = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!extMatch) return null;
  const ext = (extMatch[1] ?? '').toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) return null;

  return path;
}

export function attachAssetSafetyNet(
  webContents: WebContentsLike,
  deps: AttachAssetSafetyNetDeps,
): void {
  const log = deps.log ?? DEFAULT_LOG;

  webContents.setWindowOpenHandler((details) => {
    const relPath = matchAssetUrl(details.url, deps.editorOrigin);
    if (relPath === null) {
      // Non-asset new-window request — leave to the outer handler if
      // one exists OR Electron's default (deny all, per security
      // recommendation). Returning 'allow' from an unscoped asset
      // handler would open arbitrary origins in an in-app window —
      // the `ok:shell:open-external` + scheme-allowlist path is the
      // correct way to surface external URLs. So: deny by default.
      return { action: 'deny' };
    }
    // Fire-and-forget — the new-window request must be denied
    // synchronously via return value; the openAssetSafely call
    // continues in the background and logs on failure.
    void deps.openAsset(relPath).then((result) => {
      if (!result.ok) {
        log({
          level: 'warn',
          message: 'openAsset refused from setWindowOpenHandler',
          data: { relPath, reason: result.reason },
        });
      }
    });
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    const relPath = matchAssetUrl(url, deps.editorOrigin);
    if (relPath === null) return; // let the default navigation proceed
    event.preventDefault();
    void deps.openAsset(relPath).then((result) => {
      if (!result.ok) {
        log({
          level: 'warn',
          message: 'openAsset refused from will-navigate',
          data: { relPath, reason: result.reason },
        });
      }
    });
  });
}
