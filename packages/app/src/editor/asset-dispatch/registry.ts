/**
 * `AssetViewerRegistry` — module-level singleton that maps lowercased file
 * extensions to renderer-side viewers. Empty at landing (D-A11); follow-up
 * PRs register PDF.js, image lightbox, video/audio inline (D-F typed-
 * component-nodes Phase 2).
 *
 * Contract: `lookup(ext)` returns a discriminated union so callers cannot
 * accidentally pass a possibly-undefined viewer into `.render()` (precedent
 * #19(b) + /type-safety — lookup discriminates on the type, no `!` assertion
 * required).
 *
 * Case discipline: both `register` and `lookup` lowercase inputs — matches
 * `classifyMarkdownHref` which emits `AssetLinkTarget.ext` already
 * normalized via `extractAssetExtension`. Belt-and-braces so a viewer
 * declaring `exts: ['PDF']` still finds itself on `lookup('pdf')`.
 */

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

  /**
   * Test-only — drop all registrations. Production code never calls this.
   * Named `clearForTests` rather than `reset` / `clear` so a stray call site
   * in production would stand out in code review.
   */
  clearForTests(): void {
    this.byExt.clear();
  }

  get size(): number {
    return this.byExt.size;
  }
}

/**
 * The singleton registry the dispatcher consults by default. Follow-up
 * viewer PRs register against this instance at module-init time:
 *
 * ```ts
 * import { assetViewerRegistry } from './asset-dispatch/registry';
 * assetViewerRegistry.register(PdfJsViewer);
 * ```
 */
export const assetViewerRegistry = new AssetViewerRegistry();
