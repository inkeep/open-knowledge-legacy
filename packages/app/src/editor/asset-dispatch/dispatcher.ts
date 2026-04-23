/**
 * `dispatchAssetClick` — renderer-side routing for clicks on asset links.
 * Fires on bare-click via the `internal-link.ts` handlePrimary for the post-
 * reload mark path, and via the new node-interaction-bridge for the drop-time
 * `WikiLinkEmbed` node path (Commit 4 wires both).
 *
 * Ordering (SPEC 2026-04-23 amendment FR-A3):
 *   1. Cmd/Ctrl+click → `forceOsDelegation: true` → skip the registry (D-A6)
 *   2. Registry lookup on `ctx.ext` → viewer.render(ctx) if found
 *   3. Electron fallback → `window.okDesktop.shell.openAsset(projectRelPath)`
 *   4. Web fallback → `openHashHrefInNewTab(url)`
 *
 * Deps injected for testability (`registry`, `desktopBridge`, `openUrl`) —
 * prod callers pass none and get the singleton registry + the real
 * `window.okDesktop` + the real tab-opener.
 *
 * No refs-level knowledge of executable-blocklist or path-escape — those
 * checks live in the main-process handler (`openAssetSafely` at Commit 3).
 * The dispatcher's job is routing; the enforcement fires at the IPC boundary
 * where `isPathWithinProject` + `realpath` run under main-process trust.
 */

import { openHashHrefInNewTab } from '../internal-link-helpers';
import { type AssetViewerRegistry, assetViewerRegistry } from './registry.ts';
import type { AssetClickContext } from './types.ts';

/**
 * Optional overrides for tests + alternate host contexts. Production callers
 * pass nothing — defaults read from the module singletons / global window.
 */
interface DispatchAssetClickDeps {
  readonly registry?: AssetViewerRegistry;
  /**
   * Renderer → main bridge. When `undefined`, the Electron branch is skipped
   * and the web fallback fires. Defaults to `globalThis.window?.okDesktop`.
   */
  readonly desktopBridge?: typeof window.okDesktop;
  /**
   * Web fallback — invoked when no registry hit AND no Electron bridge.
   * Defaults to `openHashHrefInNewTab` from `internal-link-helpers`.
   */
  readonly openUrl?: (url: string) => void;
}

export async function dispatchAssetClick(
  ctx: AssetClickContext,
  deps: DispatchAssetClickDeps = {},
): Promise<void> {
  const registry = deps.registry ?? assetViewerRegistry;
  // Respect explicit `desktopBridge: undefined` passed by tests to force the
  // web-fallback branch — only fall back to globalThis when the key is absent
  // from `deps` entirely.
  const desktopBridge = 'desktopBridge' in deps ? deps.desktopBridge : globalThis.window?.okDesktop;
  const openUrl = deps.openUrl ?? openHashHrefInNewTab;

  // 1. Cmd/Ctrl+click (or middle-click) always skips the registry.
  if (!ctx.forceOsDelegation) {
    const lookup = registry.lookup(ctx.ext);
    if (lookup.found) {
      lookup.viewer.render(ctx);
      return;
    }
  }

  // 2. Electron fallback — OS-delegate via IPC. Main-process handler enforces
  //    containment (isPathWithinProject + realpath) and the executable
  //    blocklist (D-A5). Refusal is logged; the dispatcher does not fall
  //    through to web because in Electron a browser-new-tab would still
  //    replace the webContents (Gap 4 root cause).
  if (desktopBridge) {
    const result = await desktopBridge.shell.openAsset(ctx.projectRelPath);
    if (!result.ok) {
      console.warn('[asset-dispatch] openAsset refused:', result.reason, {
        projectRelPath: ctx.projectRelPath,
        ext: ctx.ext,
      });
    }
    return;
  }

  // 3. Web fallback — new tab via `window.open`. `openHashHrefInNewTab`
  //    gates on the scheme-allowlist (`isSafeNavigationUrl`); relative/hash
  //    hrefs pass through unconditionally.
  openUrl(ctx.url);
}
