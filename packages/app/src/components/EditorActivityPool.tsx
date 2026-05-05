/**
 * EditorActivityPool — bounded `<Activity>` rendering for the most-recently-active
 * pooled docs. `ACTIVITY_MOUNT_LIMIT = 3` decouples from `MAX_POOL = 10`;
 * `__system__` is filtered out as a defense-in-depth.
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
 *   `use(rejectedPromise)` (React 19.2 behavior). A single global boundary
 *   above the pool caused any hidden doc's cached rejection to re-throw
 *   into the visible UI when a healthy doc was active. Scoping per-Activity
 *   confines each error to its own subtree — hidden Activities' errors
 *   render into hidden DOM (`display:none`), and become visible again
 *   naturally when the user navigates back.
 *
 *   `resetKeys={[entry.docName]}` is intentionally stable for each Activity
 *   instance — auto-reset on navigation is not needed when the boundary is
 *   per-Activity (visibility is handled by Activity itself). Error clears
 *   only via (a) imperative "Try again" (recycle), (b) "Back to previous"
 *   (invalidate + nav), or (c) Activity eviction from the MRU mount list.
 */

import { Loader2, RefreshCw } from 'lucide-react';
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
import type { ServerRestartRecoveryState } from '@/editor/provider-pool';
import { TiptapEditor } from '@/editor/TiptapEditor';
import { mark, ProfilerBoundary } from '@/lib/perf';
import { readNumericOverride } from '@/lib/perf/env-override';
import { DocumentBoundary } from './DocumentBoundary';
import { DocumentErrorBoundary } from './DocumentErrorBoundary';
import { EditorSkeleton } from './EditorSkeleton';
import { usePageList } from './PageListContext';
import { PropertyPanel } from './PropertyPanel';
import { Button } from './ui/button';

/**
 * Large-doc threshold in Y.Text characters. Above this, the non-active editor
 * is defer-mounted on cold load instead of pre-mounting both per
 * precedent #18(b)'s small-to-medium-doc default. Once the user toggles to
 * the deferred mode, that editor mounts and stays mounted — so subsequent
 * toggles remain CSS-only and cost nothing.
 *
 * Value rationale (500_000 chars ≈ 500 KB plain text):
 *   - README.md / AGENTS.md / CLAUDE.md (≤150 KB) — BELOW. No change from
 *     pre-mount-both default; toggle stays instant.
 *   - PROJECT.md (multi-MB) — ABOVE. Cold load skips the non-active
 *     editor's initial mount+parse; first toggle pays the cost; subsequent
 *     toggles are instant.
 *
 * The threshold is a tuning knob, not a contract. Moving it UP regresses
 * the fix for smaller "large" docs; moving it DOWN unnecessarily delays
 * first-toggle UX for medium docs where pre-mount-both was already fast
 * enough.
 *
 * FIRST-TOGGLE COST: On a 3.25 MB doc, the first mode toggle after cold
 * load pays the deferred editor's cold mount — measured at
 * `toSourceMs ≈ 223 ms`. Proportional scaling to a ~9.7 MB doc puts first
 * toggle in the 500–800 ms range. Perceptible but well below the ~1 s
 * hang threshold. Subsequent toggles remain CSS-only. Future engineers:
 * do not assume defer-mount is free at the toggle boundary; it trades
 * cold-load latency for one-time first-toggle latency on the deferred
 * mode. See `ACTIVITY_MOUNT_LIMIT` below — both constants are parts of
 * the same Activity-mount hygiene pattern.
 */
export const LARGE_DOC_CHAR_THRESHOLD = readNumericOverride('LARGE_DOC_CHAR_THRESHOLD', 500_000);

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
  const renderSource = args.isSourceMode || args.visitedSource;
  const renderVisual = !args.isSourceMode || args.visitedVisual;
  return { renderSource, renderVisual, isLarge: true };
}

interface ShouldEmitFirstToggleArgs {
  isLarge: boolean;
  renderSource: boolean;
  renderVisual: boolean;
  hasEmittedFirstToggle: boolean;
}

export function shouldEmitFirstToggle(args: ShouldEmitFirstToggleArgs): boolean {
  if (args.hasEmittedFirstToggle) return false;
  if (!args.isLarge) return false;
  return args.renderSource && args.renderVisual;
}

export const ACTIVITY_MOUNT_LIMIT = readNumericOverride('ACTIVITY_MOUNT_LIMIT', 3);

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
  previousDocName?: string;
  onNavigateBack?: (previousDocName: string) => void;
  onRecycle: (docName: string) => void;
}

export function computeActivityMountList<T extends { docName: string; lastAccessedAt: number }>(
  entries: ReadonlyArray<T>,
  activeDocName: string | null,
  limit: number,
): ReadonlyArray<T> {
  if (limit <= 0) return [];
  const filtered = entries.filter((e) => !isSystemDoc(e.docName));
  const sorted = [...filtered].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  const top = sorted.slice(0, limit);

  if (activeDocName === null) return top;
  if (top.some((e) => e.docName === activeDocName)) return top;

  const active = filtered.find((e) => e.docName === activeDocName);
  if (!active) return top;
  return [...top.slice(0, limit - 1), active];
}

type ServerRestartRecoveryView =
  | {
      kind: 'recovering';
      title: string;
      summary: string;
    }
  | {
      kind: 'failed';
      title: string;
      summary: string;
      actionLabel: string;
    };

export function getServerRestartRecoveryView(
  docName: string,
  state: ServerRestartRecoveryState,
): ServerRestartRecoveryView | null {
  if (state.kind === 'idle') return null;

  if (state.kind === 'failed' && state.failedDocNames.includes(docName)) {
    return {
      kind: 'failed',
      title: "Couldn't reconnect after server restart",
      summary:
        state.reason === 'clear-data-timeout'
          ? `Local collaboration data for "${docName}" could not be cleared in time. Reload to retry.`
          : `Local collaboration data for "${docName}" could not be cleared. Reload to retry.`,
      actionLabel: 'Reload',
    };
  }

  if (state.kind === 'recovering' && state.docNames.includes(docName)) {
    return {
      kind: 'recovering',
      title: 'Reconnecting after server restart',
      summary:
        state.phase === 'clearing-local-cache'
          ? `Clearing local collaboration data for "${docName}" before reconnecting.`
          : `Reopening "${docName}" with a fresh local collaboration cache.`,
    };
  }

  return null;
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
  const { poolEntries, serverRestartRecovery } = useDocumentContext();
  const { pages, loading } = usePageList();

  const mountList = computeActivityMountList(poolEntries, activeDocName, ACTIVITY_MOUNT_LIMIT);

  const priorMountKeyRef = useRef<string>('');
  const mountKey = mountList.map((e) => e.docName).join(',');
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
          serverRestartRecovery={serverRestartRecovery}
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
  serverRestartRecovery: ServerRestartRecoveryState;
}

function ScrollPreservingContainer({
  isActive,
  children,
}: {
  isActive: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop > 0) savedScrollTop.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (!isActive) return;
    const el = ref.current;
    if (!el) return;
    const target = savedScrollTop.current;
    if (target === 0) return;

    el.scrollTop = target;
    if (el.scrollTop === target) return;

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

function ServerRestartRecoveryPanel({ view }: { view: ServerRestartRecoveryView }) {
  const isFailed = view.kind === 'failed';
  return (
    <div
      data-slot="server-restart-recovery"
      role={isFailed ? 'alert' : 'status'}
      aria-busy={!isFailed}
      className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full border bg-muted text-muted-foreground">
        {isFailed ? (
          <RefreshCw className="size-5" aria-hidden="true" />
        ) : (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-medium">{view.title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{view.summary}</p>
      </div>
      {isFailed ? (
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {view.actionLabel}
        </Button>
      ) : null}
    </div>
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
  serverRestartRecovery,
}: ActivityEntryProps) {
  const recoveryView = getServerRestartRecoveryView(entry.docName, serverRestartRecovery);

  const ytextLength = entry.provider.document.getText('source').length;

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

  const [hasEmittedFirstToggle, setHasEmittedFirstToggle] = useState(false);
  useEffect(() => {
    if (
      !shouldEmitFirstToggle({
        isLarge: gate.isLarge,
        renderSource: gate.renderSource,
        renderVisual: gate.renderVisual,
        hasEmittedFirstToggle,
      })
    ) {
      return;
    }
    mark('ok/cold/first-toggle', {
      docName: entry.docName,
      ytextLength,
      modeEnteredFirst: isSourceMode ? 'source' : 'visual',
    });
    setHasEmittedFirstToggle(true);
  }, [
    hasEmittedFirstToggle,
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
          effect cleanup. */}
      <ScrollPreservingContainer isActive={isActive}>
        {recoveryView ? (
          <ServerRestartRecoveryPanel view={recoveryView} />
        ) : (
          <>
            {/* Per-Activity error + suspense scoping — see file-level docstring
            "ERROR + SUSPENSE SCOPING" for rationale. `activeDocName` passed
            to the boundary is this Activity's OWN docName (entry.docName),
            not the globally-active doc. This keeps the error state tied to
            the Activity instance: a healthy doc becoming active does not
            reset an errored doc's boundary, and revisiting an errored doc
            re-reveals the same error UI. */}
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
            removal. The perceived-first-paint budget (<500ms P95) still
            applies — the skeleton meets it trivially.
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
                  <div className={`flex h-full flex-col ${!isSourceMode ? 'pt-6' : ''}`}>
                    {/* PropertyPanel: top-of-doc frontmatter table, sibling to the
                        dual-editor stack inside DocumentBoundary so it shares the
                        same suspend/error scope and remounts cleanly on doc switch.
                        Hidden in source mode (CodeMirror surfaces raw YAML).
                        The panel itself returns null when the doc has no
                        frontmatter — empty-state shows the toolbar trigger in
                        EditorHeader instead. */}
                    {!isSourceMode && <PropertyPanel provider={entry.provider} />}
                    <div className="relative flex-1">
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
                            key={`${entry.docName}-${String(isNewDoc)}`}
                            provider={entry.provider}
                            placeholder={editorPlaceholder}
                            isSourceMode={isSourceMode}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DocumentBoundary>
              </Suspense>
            </DocumentErrorBoundary>
          </>
        )}
      </ScrollPreservingContainer>
    </Activity>
  );
}
