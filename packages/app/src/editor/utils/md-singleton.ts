/**
 * Shared module-level `MarkdownManager` singleton for client-side parse /
 * serialize. Multiple NodeViews and utility paths need this — every fresh
 * allocation builds a parse + serialize processor (per
 * `packages/core/src/markdown/pipeline.ts` + US-006 processor-caching), so
 * allocating one per-call was measurably expensive on component-heavy
 * docs. Per precedent #15, the underlying remark plugins are idempotent
 * under re-entry, so one manager safely serves every call.
 *
 * Consumers today:
 *   - `utils/reconstruct-source.ts` — serializes a jsxComponent node back
 *     to MDX source for the wildcard / render-error auto-convert path.
 *   - `extensions/RawMdxFallbackCMView.tsx` — parses the nested CM source
 *     on blur to upgrade `rawMdxFallback` → `jsxComponent` when the user
 *     fixes broken MDX.
 */
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

let manager: MarkdownManager | null = null;

export function getSharedMarkdownManager(): MarkdownManager {
  if (!manager) {
    manager = new MarkdownManager({ extensions: sharedExtensions });
  }
  return manager;
}
