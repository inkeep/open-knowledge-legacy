import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

interface InstallDeepLinkListenerOptions {
  bridge: OkDesktopBridge | undefined;
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
