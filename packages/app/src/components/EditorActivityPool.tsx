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
 * `TiptapEditor` stays on the initial path; `SourceEditor` is lazy-loaded the
 * first time a doc actually enters source mode. After that first source visit,
 * the doc keeps both editors mounted behind a `display:none` toggle so
 * subsequent mode swaps stay CSS-only for that Activity.
 *
 * ERROR + SUSPENSE SCOPING (per-Activity, not global).
 *   Each `<Activity>` wraps its own `<DocumentErrorBoundary>` + `<Suspense>`.
 *   Rationale: `<Activity mode="hidden">` silences suspends in the hidden
 *   subtree (good) but does NOT intercept synchronous throws from
 *   `use(rejectedPromise)` (React 19.2 behavior — verified in regression
 *   QA-023/024). A single global boundary above the pool caused any hidden
 *   doc's cached rejection to re-throw into the visible UI when a healthy
 *   doc was active. Scoping per-Activity confines each error to its own
 *   subtree — hidden Activities' errors render into hidden DOM
 *   (`display:none`), and become visible again naturally when the user
 *   navigates back (QA-024 cached-rejection persistence).
 *
 *   `resetKeys={[entry.docName]}` is intentionally stable for each Activity
 *   instance — auto-reset on navigation is not needed when the boundary is
 *   per-Activity (visibility is handled by Activity itself). Error clears
 *   only via (a) imperative "Try again" (recycle), (b) "Back to previous"
 *   (invalidate + nav), or (c) Activity eviction from the MRU mount list.
 */

import {
  Activity,
  Fragment,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type PoolEntrySnapshot, useDocumentContext } from '@/editor/DocumentContext';
import { isSystemDoc } from '@/editor/is-system-doc';
import { TiptapEditor } from '@/editor/TiptapEditor';
import { DocumentBoundary } from './DocumentBoundary';
import { DocumentErrorBoundary } from './DocumentErrorBoundary';
import { EditorSkeleton } from './EditorSkeleton';
import { usePageList } from './PageListContext';

/**
 * Maximum number of editors mounted concurrently inside `<Activity>` boundaries.
 * Decoupled from `MAX_POOL` (exported from `provider-pool.ts`, default 10) per
 * SPEC.md §10 DX9 / PRECEDENTS.md precedent #15(c) — pool-resident-but-not-
 * Activity-mounted docs keep their warm provider (so revisiting is fast via
 * Suspense-gated remount with `syncPromise` resolving immediately from
 * `hasSynced=true`) but skip the per-editor memory + observer-CPU cost of
 * keeping the TipTap + CodeMirror instances alive.
 *
 * 3 covers the "alt-tab between recent docs" pattern dominant for P1/P2 personas.
 *
 * Changing either this value or `MAX_POOL` is an ASK_FIRST boundary — they're
 * coupled by design. If one moves, audit the other for sympathetic impact.
 */
export const ACTIVITY_MOUNT_LIMIT = 3;

export function loadSourceEditorModule() {
  return import('@/editor/SourceEditor');
}

const LazySourceEditor = lazy(async () => {
  const mod = await loadSourceEditorModule();
  return { default: mod.SourceEditor };
});

interface EditorActivityPoolProps {
  activeDocName: string;
  isSourceMode: boolean;
  editorPlaceholder?: string;
  /**
   * Forwarded to each per-Activity `DocumentErrorBoundary` so the
   * "Back to previous document" affordance in a fallback UI knows where
   * to send the user. Global navigation concern — tracked once at the
   * `EditorArea` level and threaded down through every Activity.
   */
  previousDocName?: string;
  /**
   * Navigation callback for the "Back to previous document" button. Shared
   * across every per-Activity boundary; only the visible Activity's button
   * is ever clickable, so routing is unambiguous.
   */
  onNavigateBack?: (previousDocName: string) => void;
  /**
   * "Try again" recovery for any errored Activity — destroys + recreates
   * the pool entry for the doc that errored (per-Activity boundary passes
   * its own `entry.docName` to the callback, not the globally-active one).
   */
  onRecycle: (docName: string) => void;
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
  previousDocName,
  onNavigateBack,
  onRecycle,
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
            previousDocName,
            onNavigateBack,
            onRecycle,
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
  previousDocName?: string;
  onNavigateBack?: (previousDocName: string) => void;
  onRecycle: (docName: string) => void;
}

/**
 * Per-Activity scroll container that (a) owns its own scroller so scrollTop
 * is DOM-local to this doc's subtree and (b) saves/restores scrollTop across
 * `<Activity>` visibility flips.
 *
 * Why both:
 *   Per-Activity scrollers are necessary but not sufficient. When `<Activity
 *   mode="hidden">` applies `display:none` to the subtree, the browser
 *   removes layout for the hidden element — `scrollTop` reads as 0, and
 *   TipTap's effect cleanup unmounts the ProseMirror DOM so `scrollHeight`
 *   collapses. By the time `isActive` flips to `false` in a layout effect,
 *   `display:none` has already been applied and `ref.current.scrollTop` is
 *   0. To capture the real scroll position, we install a `scroll` listener
 *   that records `scrollTop` on every change, so the last-non-zero value is
 *   preserved in a ref independently of Activity state transitions.
 *
 *   On the restore side, a layout effect races TipTap's own re-mount. The
 *   initial scrollTop assignment usually gets clamped (scrollHeight hasn't
 *   grown back yet), so we follow up with a `ResizeObserver` that re-
 *   applies `scrollTop = target` whenever the subtree grows past it. A
 *   250ms safety timer disconnects the observer so deleted-while-hidden
 *   content doesn't hold it forever.
 *
 * QA-002 / SPEC US-007/F1 — Playwright regression harness validates this.
 */
function ScrollPreservingContainer({
  isActive,
  children,
}: {
  isActive: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);

  // Continuously track scrollTop via scroll listener so we always have the
  // latest user position — independent of Activity mode transitions.
  // `display:none` zeros scrollTop before any layout effect could read it,
  // so we MUST capture via scroll events to have a real value to restore.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      // Only record non-zero values — a content collapse under display:none
      // can fire a spurious scroll event with scrollTop=0 that we must NOT
      // persist (it would overwrite the real saved value).
      if (el.scrollTop > 0) savedScrollTop.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Restore scrollTop when `isActive` flips to true. Two phases:
  //   1. Synchronous scrollTop assignment in the layout effect — cheap if
  //      content is already mounted.
  //   2. `ResizeObserver`-driven retry once the subtree grows past
  //      `target` — handles the Activity-unhide race where TipTap's
  //      ProseMirror hasn't re-inflated scrollHeight in time.
  useLayoutEffect(() => {
    if (!isActive) return;
    const el = ref.current;
    if (!el) return;
    const target = savedScrollTop.current;
    if (target === 0) return;

    // Phase 1 — try immediately.
    el.scrollTop = target;
    if (el.scrollTop === target) return;

    // Phase 2 — observe size changes until content grows past target.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(safetyTimer);
    };
    const observer = new ResizeObserver(() => {
      if (done || !el) return;
      if (el.scrollHeight > target) {
        el.scrollTop = target;
        if (el.scrollTop === target) finish();
      }
    });
    observer.observe(el);

    // Safety timeout — don't leak the observer if content never grows back.
    const safetyTimer = setTimeout(finish, 500);

    return finish;
  }, [isActive]);

  return (
    <div
      ref={ref}
      className="subtle-scrollbar h-full overflow-y-auto"
      style={{ overflowAnchor: 'auto' }}
    >
      {children}
    </div>
  );
}

function SourceEditorSlot({
  entry,
  isActive,
  isSourceMode,
  editorPlaceholder,
}: {
  entry: PoolEntrySnapshot;
  isActive: boolean;
  isSourceMode: boolean;
  editorPlaceholder?: string;
}) {
  const sourceModeRequested = isActive && isSourceMode;
  const [hasLoadedSourceEditor, setHasLoadedSourceEditor] = useState(sourceModeRequested);

  useEffect(() => {
    if (sourceModeRequested) {
      setHasLoadedSourceEditor(true);
    }
  }, [sourceModeRequested]);

  if (!hasLoadedSourceEditor && !sourceModeRequested) {
    return null;
  }

  return (
    <Suspense fallback={<EditorSkeleton />}>
      <LazySourceEditor
        docName={entry.docName}
        ytext={entry.provider.document.getText('source')}
        provider={entry.provider}
        placeholder={editorPlaceholder}
        isSourceModeActive={sourceModeRequested}
      />
    </Suspense>
  );
}

function renderActivity({
  entry,
  isActive,
  isSourceMode,
  editorPlaceholder,
  isNewDoc,
  previousDocName,
  onNavigateBack,
  onRecycle,
}: RenderActivityArgs) {
  return (
    <Activity mode={isActive ? 'visible' : 'hidden'} name={`editor:${entry.docName}`}>
      {/* Per-Activity scroll container with save/restore across Activity
          visibility flips. See ScrollPreservingContainer for the full
          rationale. Hoisting the scroller to EditorArea would make scroll
          state cross-document and collapse scrollHeight on hidden-mode
          effect cleanup (QA-002 / SPEC US-007/F1). */}
      <ScrollPreservingContainer isActive={isActive}>
        {/* Per-Activity error + suspense scoping — see file-level docstring
            "ERROR + SUSPENSE SCOPING" for rationale. `activeDocName` passed
            to the boundary is this Activity's OWN docName (entry.docName),
            not the globally-active doc. This keeps the error state tied to
            the Activity instance: a healthy doc becoming active does not
            reset an errored doc's boundary, and revisiting an errored doc
            re-reveals the same error UI (QA-024). */}
        <DocumentErrorBoundary
          activeDocName={entry.docName}
          previousDocName={previousDocName}
          onNavigateBack={onNavigateBack}
          onRecycle={onRecycle}
        >
          <Suspense fallback={<EditorSkeleton />}>
            <DocumentBoundary docName={entry.docName} provider={entry.provider}>
              {/* Tiptap stays eager; SourceEditor lazy-loads the first time this doc
                  is shown in source mode, then remains mounted behind the display
                  toggle so later source/wysiwyg swaps stay CSS-only. */}
              <div className={isSourceMode ? 'h-full' : 'hidden'}>
                <SourceEditorSlot
                  entry={entry}
                  isActive={isActive}
                  isSourceMode={isSourceMode}
                  editorPlaceholder={editorPlaceholder}
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
          </Suspense>
        </DocumentErrorBoundary>
      </ScrollPreservingContainer>
    </Activity>
  );
}
