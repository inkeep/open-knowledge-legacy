import { type AssetViewerRegistry, assetViewerRegistry } from './registry.ts';
import type { AssetClickContext } from './types.ts';

interface DispatchAssetClickDeps {
  readonly registry?: AssetViewerRegistry;
  readonly desktopBridge?: typeof window.okDesktop;
  readonly openUrl?: (url: string) => void;
}

function defaultOpenAssetTab(url: string): void {
  globalThis.window?.open(url, '_blank', 'noopener,noreferrer');
}

export async function dispatchAssetClick(
  ctx: AssetClickContext,
  deps: DispatchAssetClickDeps = {},
): Promise<void> {
  const registry = deps.registry ?? assetViewerRegistry;
  const desktopBridge = 'desktopBridge' in deps ? deps.desktopBridge : globalThis.window?.okDesktop;
  const openUrl = deps.openUrl ?? defaultOpenAssetTab;

  if (!ctx.forceOsDelegation) {
    const lookup = registry.lookup(ctx.ext);
    if (lookup.found) {
      lookup.viewer.render(ctx);
      return;
    }
  }

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

  openUrl(ctx.url);
}
