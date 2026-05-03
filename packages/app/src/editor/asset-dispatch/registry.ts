import type { AssetViewer, AssetViewerLookupResult } from './types.ts';

export class AssetViewerRegistry {
  private readonly byExt = new Map<string, AssetViewer>();

  register(viewer: AssetViewer): void {
    for (const ext of viewer.exts) {
      this.byExt.set(ext.toLowerCase(), viewer);
    }
  }

  lookup(ext: string): AssetViewerLookupResult {
    const viewer = this.byExt.get(ext.toLowerCase());
    return viewer ? { found: true, viewer } : { found: false };
  }

  clearForTests(): void {
    this.byExt.clear();
  }

  get size(): number {
    return this.byExt.size;
  }
}

export const assetViewerRegistry = new AssetViewerRegistry();
