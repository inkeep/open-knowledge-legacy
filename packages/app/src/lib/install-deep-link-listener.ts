/**
 * Install a subscriber for the Desktop `ok:deep-link` bridge event (M4 SPEC
 * 2026-04-21-m4-url-scheme). When an `openknowledge://` URL routes to this
 * window, main fires the bridge event with `{ doc }`; this installer updates
 * `window.location.hash` so the existing hash-route listener in App opens the
 * target doc.
 *
 * Registered imperatively during main.tsx module init (not inside a React
 * effect) so the `ipcRenderer.on` listener is in place before the main process
 * fires the event on `dom-ready` or later. Matches the precedent set by
 * `install-git-init-toast.ts`.
 *
 * No-op in web / CLI distribution (window.okDesktop undefined). In Desktop,
 * returns the bridge-provided unsubscribe so the caller can detach on
 * hot-module-replacement or teardown.
 */

import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

interface InstallDeepLinkListenerOptions {
  /** Bridge resolved from `window.okDesktop`. Absent in web/CLI. */
  bridge: OkDesktopBridge | undefined;
  /**
   * Hash-setter override for tests. Production: writes
   * `window.location.hash = '#/' + encodeURIComponent(doc)`.
   */
  setHash?: (hash: string) => void;
}

function encodeDocForHash(doc: string): string {
  return `#/${encodeURIComponent(doc)}`;
}

export function installDeepLinkListener(
  opts: InstallDeepLinkListenerOptions,
): (() => void) | undefined {
  const bridge = opts.bridge;
  if (!bridge) return undefined;

  const setHash =
    opts.setHash ??
    ((hash: string) => {
      window.location.hash = hash;
    });
  return bridge.onDeepLink((evt) => {
    setHash(encodeDocForHash(evt.doc));
  });
}
