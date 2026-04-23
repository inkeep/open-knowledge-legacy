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
 * first time a doc actually enters source mode. Large docs additionally defer
 * the non-active editor until that mode is first visited. After the initial
 * visits, the doc keeps both editors mounted behind hidden-mode wrappers so
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
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type PoolEntrySnapshot, useDocumentContext } from '@/editor/DocumentContext';
import { setActivityMountList } from '@/editor/editor-cache';
import { isSystemDoc } from '@/editor/is-system-doc';
import { TiptapEditor } from '@/editor/TiptapEditor';
import { mark, ProfilerBoundary } from '@/lib/perf';
import { DocumentBoundary } from './DocumentBoundary';
import { DocumentErrorBoundary } from './DocumentErrorBoundary';
import { EditorSkeleton } from './EditorSkeleton';
import { usePageList } from './PageListContext';

/**
 * Large-doc threshold in Y.Text characters. Above this, the non-active editor
 * is defer-mounted on cold load (S1 fix, US-008 / SPEC D12 DIRECTED) instead of
 * pre-mounting both per precedent #18(b)'s small-to-medium-doc default. Once the
 * user toggles to the deferred mode, that editor mounts and stays mounted — so
 * subsequent toggles remain CSS-only and cost nothing.
 *
 * Value rationale (500_000 chars ≈ 500 KB plain text):
 *   - README.md / AGENTS.md / CLAUDE.md (≤150 KB) — BELOW. No change from
 *     pre-mount-both default; toggle stays instant.
 *   - PROJECT.md (3.25 MB / 1.49 M chars in this worktree, up to 9.7 MB / 25k
 *     lines in the SPEC's original measurement) — ABOVE. Cold load skips the
 *     non-active editor's initial mount+parse; first toggle pays the cost;
 *     subsequent toggles are instant.
 *
 * The threshold is a tuning knob, not a contract — see evidence/s1-diagnosis.md
 * for the trade-off analysis. Moving it UP regresses the S1 fix for smaller
 * "large" docs; moving it DOWN unnecessarily delays first-toggle UX for
 * medium docs where pre-mount-both was already fast enough.
 *
 * FIRST-TOGGLE COST (US-008 code-trace, 2026-04-20): On a 3.25 MB PROJECT doc,
 * the first mode toggle after cold load pays the deferred editor's cold mount
 * — measured at `toSourceMs=223 ms`. Proportional scaling to the original
 * 9.7 MB workhorse puts first toggle in the 500–800 ms range. Perceptible but
 * well below the ~1 s hang threshold. Subsequent toggles remain CSS-only.
 * Future engineers: do not assume defer-mount is free at the toggle boundary;
 * it trades cold-load latency for one-time first-toggle latency on the
 * deferred mode. See `ACTIVITY_MOUNT_LIMIT` below — both constants are parts
 * of the same Activity-mount hygiene pattern.
 */
export const LARGE_DOC_CHAR_THRESHOLD = 500_000;

/**
 * Pure helper — given the doc size and the current mode-visit history,
 * compute which editors should be rendered.
 *
 * Below the threshold: always both (pre-mount-both, precedent #18(b) default).
 * Above the threshold: only modes that have been visited at least once.
 * Active mode is ALWAYS considered visited for the purpose of this computation,
 * so the call site never sees `renderSource=false && renderVisual=false`.
 *
 * `isLarge` surfaces the threshold branch taken so the caller can emit an
 * `ok/activity/defer-mount` mark for observability. It is NOT load-bearing
 * for the gating decision itself — always derive render flags from this
 * helper's output.
 */
interface EditorMountGateArgs {
  ytextLength: number;
  isSourceMode: boolean;
  visitedSource: boolean;
  visitedVisual: boolean;
  threshold?: number;
}

interface EditorMountGate {
  renderSource: boolean;
  renderVisual: boolean;
  isLarge: boolean;
}

export function computeEditorMountGate(args: EditorMountGateArgs): EditorMountGate {
  const threshold = args.threshold ?? LARGE_DOC_CHAR_THRESHOLD;
  const isLarge = args.ytextLength > threshold;
  if (!isLarge) {
    return { renderSource: true, renderVisual: true, isLarge: false };
  }
  // Large doc: active mode is always rendered (OR-ed with visited history);
  // non-active only if visited at least once.
  const renderSource = args.isSourceMode || args.visitedSource;
  const renderVisual = !args.isSourceMode || args.visitedVisual;
  return { renderSource, renderVisual, isLarge: true };
}

/**
 * Maximum number of editors mounted concurrently inside `<Activity>` boundaries.
 * Decoupled from `MAX_POOL` (exported from `provider-pool.ts`, default 10) per
 * SPEC.md §10 DX9 / PRECEDENTS.md precedent #18(c) — pool-resident-but-not-
 * Activity-mounted docs keep their warm provider (so revisiting is fast via
 * Suspense-gated remount with `syncPromise` resolving immediately from
 * `hasSynced=true`) but skip the per-editor memory + observer-CPU cost of
 * keeping the TipTap + CodeMirror instances alive.
 *
 * 3 covers the "alt-tab between recent docs" pattern dominant for P1/P2 personas.
 *
 * Changing either this value or `MAX_POOL` is an ASK_FIRST boundary — they're
 * coupled by design. If one moves, audit the other for sympathetic impact.
 *
 * **LIMIT=3 is a stable decision, not a temporary holdpoint.** Both the
 * TipTap-editor-cost argument (LIMIT=1 doesn't avoid `createEditor` cost
 * because `@tiptap/react`'s `useEditor` destroys on effect-cleanup anyway)
 * and the scroll-state argument (F1 scroll preservation requires refs to
 * survive, which requires Activity hidden not full unmount) stand
 * independently of any V2 Editor cache. A module-level editor cache would
 * change the first argument's mechanics but not the second — LIMIT stays
 * at 3 to keep ScrollPreservingContainer's `useRef` alive across navigation.
 *
 * US-007 FINDING (2026-04-19): Reducing this value to 1 was attempted as an S2
 * warm-switch fix (see evidence/s2-diagnosis.md), then REVERTED — LIMIT=1 broke
 * `docs-open.e2e.ts:F1` (scroll position survives A→B→A) because
 * `ScrollPreservingContainer` stores its saved scrollTop in a `useRef`, and
 * refs persist across `<Activity>` mode flips but are lost on full unmount.
 * With LIMIT=3, ScrollPreservingContainer stays mounted for non-active docs
 * (effects paused via Activity-hidden; ref state preserved), so revisiting
 * restores scroll position. With LIMIT=1, the container unmounts on nav and
 * the ref is destroyed. TipTap editor state WAS being destroyed regardless
 * (its `useEditor` schedules destroy on effect-cleanup, so LIMIT=3 + hidden
 * transition = same destroy path as LIMIT=1 + unmount), but scroll state was
 * load-bearing. Conclusion: S2 is architecturally bounded by TipTap's
 * `createEditor` overhead (~350 ms schema + Yjs bind + DOM attach, fixed cost
 * regardless of doc size or `ACTIVITY_MOUNT_LIMIT`); unlocking <100 ms
 * warm-switch requires a module-level Editor cache outside React's lifecycle
 * (V2 refactor, tracked in evidence/s2-diagnosis.md "V2 follow-up").
 *
 * See `LARGE_DOC_CHAR_THRESHOLD` above — both constants are parts of the same
 * Activity-mount hygiene pattern (precedent #18(c) / precedent #24).
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

export function EditorActivityPool(props: EditorActivityPoolProps) {
  return (
    <ProfilerBoundary name="activity-pool">
      <EditorActivityPoolInner {...props} />
    </ProfilerBoundary>
  );
}

function EditorActivityPoolInner({
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

  // Track prior mount list by a stringified doc-name key so we emit
  // `ok/activity/mount-list-change` once per real change (not once per render).
  // The prior key is stored in a ref (not state) so the effect fires only when
  // the composition of mounted docs actually shifts. Mount lists are bounded
  // at ACTIVITY_MOUNT_LIMIT (3), so the string + diff is trivial.
  const priorMountKeyRef = useRef<string>('');
  const mountKey = mountList.map((e) => e.docName).join(',');
  // FR3b — single-writer push of the activity mount list to the V2 editor
  // cache. Uses `useLayoutEffect` (not `useEffect`) so the provider
  // connect/disconnect fires BEFORE children's mount effects (review
  // Major #15). Passive effects run bottom-up, which means
  // `ActivityEntry`'s `mountTiptapEditor` would reparent + restore focus
  // before the provider is reconnected — leaving a window where keystrokes
  // commit locally but don't sync to peers. Layout effects run
  // parent-first, closing the race.
  useLayoutEffect(() => {
    if (priorMountKeyRef.current === mountKey) return;
    const prior = priorMountKeyRef.current ? priorMountKeyRef.current.split(',') : [];
    const mounted = mountKey ? mountKey.split(',') : [];
    const evicted = prior.filter((d) => !mounted.includes(d));
    mark('ok/activity/mount-list-change', {
      active: activeDocName,
      mounted,
      evicted,
    });
    priorMountKeyRef.current = mountKey;
    // The cache uses this list to drive provider connect/disconnect for
    // cached-but-not-Activity-mounted editors (precedent #27(b)). Bounds
    // remote-peer CRDT load to the top ACTIVITY_MOUNT_LIMIT editors
    // regardless of how many docs are pool-resident.
    setActivityMountList(mounted);
  }, [mountKey, activeDocName]);

  return (
    <>
      {mountList.map((entry) => (
        <ActivityEntry
          key={entry.docName}
          entry={entry}
          isActive={entry.docName === activeDocName}
          isSourceMode={isSourceMode}
          editorPlaceholder={editorPlaceholder}
          isNewDoc={!loading && !pages.has(entry.docName)}
          previousDocName={previousDocName}
          onNavigateBack={onNavigateBack}
          onRecycle={onRecycle}
        />
      ))}
    </>
  );
}

interface ActivityEntryProps {
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
function ActivityEntry({
  entry,
  isActive,
  isSourceMode,
  editorPlaceholder,
  isNewDoc,
  previousDocName,
  onNavigateBack,
  onRecycle,
}: ActivityEntryProps) {
  // Defer-mount gating for large docs (US-008 / SPEC D12 DIRECTED).
  //
  // Small/medium docs keep pre-mount-both (precedent #18(b) default): mode swap
  // stays CSS-only, neither editor's effect lifecycle re-runs.
  //
  // Large docs skip the non-active editor on cold load — its initial mount
  // (CodeMirror Lezer parse for SourceEditor, ProseMirror construction for
  // TiptapEditor) runs on first toggle instead. Subsequent toggles are
  // instant because both are mounted from then on (refs track visited modes).
  //
  // The size reads from Y.Text because it's cheap O(1) post-sync (synchronous
  // length access on the CRDT). Y.Text is the markdown source representation
  // so its length reliably signals "this doc will be expensive to render".
  const ytextLength = entry.provider.document.getText('source').length;

  // Track which modes have been visited. useState (not useRef) because React
  // Compiler's Babel plugin rejects render-phase ref mutation — even though the
  // mutation here is idempotent and safe, the compiler can't prove it. State
  // with a lazy initializer + a post-commit effect is the compiler-approved
  // shape.
  //
  // Correctness note: on the render where `isSourceMode` first flips from
  // `false → true`, we need the newly-visited SourceEditor to render in THAT
  // render (not wait for an effect + rerender). `computeEditorMountGate`
  // handles this by OR-ing with `isSourceMode` directly, so even when the
  // `visitedSource` state is still false at the flipped render, the gate
  // returns `renderSource=true`. The effect then flips state, and subsequent
  // renders stay consistent.
  //
  // Activity mode=hidden preserves state across visibility flips (just like
  // refs would), so alt-tab between docs doesn't reset the visit history.
  const [visitedSource, setVisitedSource] = useState(isSourceMode);
  const [visitedVisual, setVisitedVisual] = useState(!isSourceMode);

  useEffect(() => {
    if (isSourceMode && !visitedSource) setVisitedSource(true);
    else if (!isSourceMode && !visitedVisual) setVisitedVisual(true);
  }, [isSourceMode, visitedSource, visitedVisual]);

  const gate = computeEditorMountGate({
    ytextLength,
    isSourceMode,
    visitedSource,
    visitedVisual,
  });

  // Emit a mark ONCE per real defer decision for observability — subsequent
  // renders of the same Activity don't re-emit. A `seen` key captures both
  // the decision outcome and which modes are rendered; when it changes, that's
  // a real transition worth a mark.
  const priorGateKeyRef = useRef<string>('');
  const gateKey = `${gate.isLarge}-${gate.renderSource}-${gate.renderVisual}`;
  useEffect(() => {
    if (priorGateKeyRef.current === gateKey) return;
    priorGateKeyRef.current = gateKey;
    if (gate.isLarge) {
      mark('ok/activity/defer-mount', {
        docName: entry.docName,
        ytextLength,
        isSourceMode,
        renderSource: gate.renderSource,
        renderVisual: gate.renderVisual,
      });
    }
  }, [
    gateKey,
    gate.isLarge,
    gate.renderSource,
    gate.renderVisual,
    entry.docName,
    ytextLength,
    isSourceMode,
  ]);

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
          {/*
            Suspense fallback = `EditorSkeleton`. Earlier iteration shipped
            an Option E "static mdast→React preview" fallback that read disk
            bytes and rendered a fumadocs-style tree; the visual jump from
            preview to the real editor (different typography + spacing)
            was jarring enough that we dropped the preview in favor of the
            neutral skeleton. See commit history for `FallbackDocumentRender`
            removal. The perceived-first-paint budget (spec G5 <500ms P95)
            still applies — the skeleton meets it trivially.
          */}
          <Suspense fallback={<EditorSkeleton />}>
            <DocumentBoundary docName={entry.docName} provider={entry.provider}>
              {/* Dual-editor mount with size-gated defer for large docs. Small
                  docs render both (pre-mount-both default — mode swap stays
                  CSS-only after first source visit). SourceEditor itself is
                  lazy-loaded the first time this doc is shown in source mode.
                  Large docs (>LARGE_DOC_CHAR_THRESHOLD) also defer the non-
                  active editor until its mode is visited at least once — see
                  computeEditorMountGate + evidence/s1-diagnosis.md.

                  Stacking: the wrapper is position:relative + h-full. The
                  non-active child carries `.ok-mode-hidden`, which sets
                  `position:absolute; inset:0; pointer-events:none` alongside
                  `content-visibility:hidden + contain-intrinsic-size`. That
                  takes the hidden editor out of normal flow so its 8000px
                  reserved intrinsic size doesn't size the wrapper or any
                  shared grid row (earlier grid-based stacking sized rows to
                  the MAX intrinsic size across children, stretching the
                  visible editor to 8000px and creating bottom whitespace on
                  short docs — see globals.css §.ok-mode-hidden). */}
              <div className="relative h-full">
                {gate.renderSource ? (
                  <div className={isSourceMode ? 'h-full' : 'ok-mode-hidden h-full'}>
                    <SourceEditorSlot
                      entry={entry}
                      isActive={isActive}
                      isSourceMode={isSourceMode}
                      editorPlaceholder={editorPlaceholder}
                    />
                  </div>
                ) : null}
                {gate.renderVisual ? (
                  <div className={isSourceMode ? 'ok-mode-hidden h-full' : 'h-full'}>
                    <TiptapEditor
                      // Composite key matches existing pattern at EditorArea.tsx:172 —
                      // forces TipTap remount on draft → saved transition (the isNewDoc
                      // flip changes the page list's membership of this docName).
                      key={`${entry.docName}-${String(isNewDoc)}`}
                      provider={entry.provider}
                      placeholder={editorPlaceholder}
                    />
                  </div>
                ) : null}
              </div>
            </DocumentBoundary>
          </Suspense>
        </DocumentErrorBoundary>
      </ScrollPreservingContainer>
    </Activity>
  );
}
