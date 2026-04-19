/**
 * Reconstruct the raw MDX source text for a jsxComponent PM node.
 *
 * Used when converting a jsxComponent to rawMdxFallback for source editing
 * (render failures, wildcard/unregistered components).
 *
 * - Pristine (sourceDirty=false): returns sourceRaw verbatim (byte-identical)
 * - Dirty (sourceDirty=true): reconstructs via MarkdownManager serialize (γ path)
 */
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { Node as PmNode } from '@tiptap/pm/model';

// Lazy module-level singleton. `MarkdownManager`'s constructor builds one
// parse processor and one serialize processor (see
// `packages/core/src/markdown/pipeline.ts` + US-006's processor-caching
// decision) — allocating a fresh one per call was measurably expensive on
// component-heavy docs (O(N) serialize + O(N) processor builds per save
// dirty-walk). Per precedent #15, the underlying remark plugins are
// idempotent under re-entry, so one manager safely serves every call.
let managerSingleton: MarkdownManager | null = null;
function getMarkdownManager(): MarkdownManager {
  if (!managerSingleton) {
    managerSingleton = new MarkdownManager({ extensions: sharedExtensions });
  }
  return managerSingleton;
}

export function reconstructSource(node: PmNode): string {
  // Pristine — use sourceRaw for byte-identical source
  if (!node.attrs.sourceDirty && node.attrs.sourceRaw) {
    return node.attrs.sourceRaw as string;
  }

  // Dirty or no sourceRaw — reconstruct via the γ serialize path
  const mdManager = getMarkdownManager();
  const doc = node.type.schema.node('doc', null, [node]);
  return mdManager.serialize(doc.toJSON()).trim();
}
