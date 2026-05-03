import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import type { AssetOpenResult } from './asset-allowlist.ts';

interface WebContentsLike {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'allow' | 'deny' }): void;
  on(
    event: 'will-navigate',
    handler: (event: { preventDefault: () => void }, url: string) => void,
  ): void;
}

interface AttachAssetSafetyNetDeps {
  readonly openAsset: (relPath: string) => Promise<AssetOpenResult>;
  readonly editorOrigin: string;
  readonly log?: (event: {
    level: 'warn' | 'info';
    message: string;
    data: Record<string, unknown>;
  }) => void;
}

const DEFAULT_LOG: Required<AttachAssetSafetyNetDeps>['log'] = (event) => {
  console.warn(`[asset-safety-net] ${event.message}`, event.data);
};

export function matchAssetUrl(url: string, editorOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const origin = parsed.origin;
  if (origin !== editorOrigin) return null;

  const raw = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!path) return null;

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
      return { action: 'deny' };
    }
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
