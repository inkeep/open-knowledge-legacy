/**
 * EditorActivityPool — bounded `<Activity>` rendering for the most-recently-active
 * pooled docs.
 *
 * Spec: SPEC.md §9 system design + §10 D1 (hybrid Activity/Suspense) + DX9
 * (`ACTIVITY_MOUNT_LIMIT = 3` decoupled from `MAX_POOL = 10`) + DX7
 * (`__system__` defense-in-depth filter).
 *
 * Why `ACTIVITY_MOUNT_LIMIT < MAX_POOL`: `setupObservers` (provider-pool.ts)
 * wires Y.js bidirectional bridges that fire regardless of Activity mode —
 * they are NOT React effects and do not pause when Activity flips to hidden.
 * Bounding mounted editors at 3 caps the editor-instance memory cost (≈30-90MB
 * for TipTap + CodeMirror) without preventing the pool from holding warm
 * providers (≈5-10MB each) for fast Suspense-gated remount on revisit.
 *
 * The dual-editor mount pattern (both `SourceEditor` and `TiptapEditor` rendered
 * concurrently with `display:none` toggle) is preserved per spec §9 + audit A2 —
 * mode swap stays CSS-only so neither editor's effect lifecycle re-runs.
 */

import { Activity, Fragment } from 'react';
import { type PoolEntrySnapshot, useDocumentContext } from '@/editor/DocumentContext';
import { isSystemDoc } from '@/editor/is-system-doc';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';
import { DocumentBoundary } from './DocumentBoundary';
import { usePageList } from './PageListContext';

/**
 * Maximum number of editors mounted concurrently inside `<Activity>` boundaries.
 * Decoupled from `ProviderPool.MAX_POOL = 10` per SPEC.md §10 DX9 — pool-resident-
 * but-not-Activity-mounted docs keep their warm provider but skip the per-editor
 * memory + observer-CPU cost. Revisiting one of them performs a Suspense-gated
 * remount with `syncPromise` resolving immediately from `hasSynced=true` (cold
 * mount, warm content).
 *
 * 3 covers the "alt-tab between recent docs" pattern dominant for P1/P2 personas.
 */
export const ACTIVITY_MOUNT_LIMIT = 3;

export interface EditorActivityPoolProps {
  activeDocName: string;
  isSourceMode: boolean;
  editorPlaceholder?: string;
}

/**
 * Pure helper — selects the LRU-bounded subset of pool entries to Activity-mount.
 *
 * Invariants:
 * 1. System docs (`__system__`) are filtered out — defense-in-depth even though
 *    `ProviderPool.open` rejects them at admission (DX7).
 * 2. The active doc is always present in the result if it exists in `entries` —
 *    even if its `lastAccessedAt` would put it outside the top `limit` (this can
 *    happen transiently between `pool.open` and `pool.setActive`, or in tests).
 * 3. Otherwise: top `limit` entries by `lastAccessedAt` descending (MRU first).
 *
 * Pure + table-testable — see `EditorActivityPool.test.ts`.
 */
export function computeActivityMountList<T extends { docName: string; lastAccessedAt: number }>(
  entries: ReadonlyArray<T>,
  activeDocName: string | null,
  limit: number,
): ReadonlyArray<T> {
  if (limit <= 0) return [];
  const filtered = entries.filter((e) => !isSystemDoc(e.docName));
  // Stable MRU sort. Caller (`takeSnapshot`) already sorts but we re-sort here so
  // the helper is correct for any input order — keeps test scenarios independent
  // of upstream snapshot ordering decisions.
  const sorted = [...filtered].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  const top = sorted.slice(0, limit);

  if (activeDocName === null) return top;
  if (top.some((e) => e.docName === activeDocName)) return top;

  // Active doc exists but didn't make the top-N by lastAccessedAt — force-include it
  // by displacing the LRU member of `top`. Preserves invariant #2 without growing
  // beyond `limit`.
  const active = filtered.find((e) => e.docName === activeDocName);
  if (!active) return top;
  return [...top.slice(0, limit - 1), active];
}

export function EditorActivityPool({
  activeDocName,
  isSourceMode,
  editorPlaceholder,
}: EditorActivityPoolProps) {
  const { poolEntries } = useDocumentContext();
  const { pages, loading } = usePageList();

  const mountList = computeActivityMountList(poolEntries, activeDocName, ACTIVITY_MOUNT_LIMIT);

  return (
    <>
      {mountList.map((entry) => (
        <Fragment key={entry.docName}>
          {renderActivity({
            entry,
            isActive: entry.docName === activeDocName,
            isSourceMode,
            editorPlaceholder,
            isNewDoc: !loading && !pages.has(entry.docName),
          })}
        </Fragment>
      ))}
    </>
  );
}

interface RenderActivityArgs {
  entry: PoolEntrySnapshot;
  isActive: boolean;
  isSourceMode: boolean;
  editorPlaceholder?: string;
  isNewDoc: boolean;
}

function renderActivity({
  entry,
  isActive,
  isSourceMode,
  editorPlaceholder,
  isNewDoc,
}: RenderActivityArgs) {
  return (
    <Activity mode={isActive ? 'visible' : 'hidden'} name={`editor:${entry.docName}`}>
      <DocumentBoundary docName={entry.docName} provider={entry.provider}>
        {/* Dual-editor concurrent mount preserved per spec §9 + audit A2 — both
            SourceEditor and TiptapEditor render with display:none toggle so mode
            switches don't trigger effect re-runs (and don't recreate the
            CodeMirror EditorView or the TipTap editor instance). */}
        <div className={isSourceMode ? 'h-full' : 'hidden'}>
          <SourceEditor
            ytext={entry.provider.document.getText('source')}
            provider={entry.provider}
            placeholder={editorPlaceholder}
          />
        </div>
        <div className={isSourceMode ? 'hidden' : 'h-full'}>
          <TiptapEditor
            // Composite key matches existing pattern at EditorArea.tsx:172 —
            // forces TipTap remount on draft → saved transition (the isNewDoc
            // flip changes the page list's membership of this docName).
            key={`${entry.docName}-${String(isNewDoc)}`}
            provider={entry.provider}
            placeholder={editorPlaceholder}
          />
        </div>
      </DocumentBoundary>
    </Activity>
  );
}
