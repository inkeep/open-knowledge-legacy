import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { DocPanel, type PanelTab } from '@/components/DocPanel';
import { EditorSkeleton } from '@/components/EditorSkeleton';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';

// Lazy-load Settings — pulls ToggleGroup + the schema-driven form which add
// ~330kB gzipped to the main bundle. Settings is opened on demand via Cmd-,
// so the cold-mount cost is acceptable.
const SettingsPane = lazy(() =>
  import('@/components/settings/SettingsPane').then((m) => ({ default: m.SettingsPane })),
);

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { useDocPanelLayout } from '@/hooks/use-doc-panel-layout';
import { useDocumentStats } from '@/hooks/use-document-stats';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { ProfilerBoundary } from '@/lib/perf';
import { useSettingsRoute } from '@/lib/use-settings-route';
import { EditorActivityPool } from './EditorActivityPool';
import { EditorFooter } from './EditorFooter';
import type { EditorMode } from './EditorPane';

interface EditorAreaProps {
  editorMode: EditorMode;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
}

export function EditorArea(props: EditorAreaProps) {
  return (
    <ProfilerBoundary name="editor-area">
      <EditorAreaInner {...props} />
    </ProfilerBoundary>
  );
}

function EditorAreaInner({ editorMode, activeTab, onActiveTabChange }: EditorAreaProps) {
  const settingsRoute = useSettingsRoute();
  const {
    activeDocName,
    activeProvider,
    activeTarget,
    recycleDocument,
    docPanelMode,
    docPanelExpandSignal,
  } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const stats = useDocumentStats(activeProvider, activeDocName);
  // Shell-snap decoupling: `activeDocName` updates urgently across the tree
  // (sidebar aria-current, header title, tab panels — all read the urgent
  // value via `useDocumentContext`). The editor subtree, however, pays a
  // heavy render cost on nav to mark-heavy / oversize docs — TipTap's
  // create-view + per-mark reconciliation can block the main thread for
  // 1-3s on docs above `BYTES_CACHE_THRESHOLD` (which refuse V2 cache
  // admission, forcing a fresh `new Editor()` on every warm visit).
  // Wrapping with `useDeferredValue` lets React commit the shell render
  // first (aria-current + header snap to the new doc) and defer the
  // editor-subtree re-render to a low-priority pass, letting the browser
  // paint the updated shell before the editor mount cost begins. See
  // `docs-open.e2e.ts` F0 for the regression test that pinned the budget
  // at 250ms shell-snap.
  const deferredActiveDocName = useDeferredValue(activeDocName);
  const isNewDoc = activeTarget?.kind === 'missing';
  const showFooter = !!activeDocName && activeTarget?.kind !== 'folder';
  const editorPlaceholder = isNewDoc ? 'Start writing to create this page\u2026' : undefined;
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { layout: docPanelLayout, autoCollapse } = useDocPanelLayout();
  const isSheetMode = docPanelLayout === 'sheet';
  const [sheetOpen, setSheetOpen] = useState(false);
  // Tracks whether the user manually collapsed the panel via the toggle button.
  // When true, auto-expand on crossing the 1024px breakpoint upward is suppressed
  // so the panel respects the user's last manual action.
  // Reset when the user manually expands, or when entering auto-collapse range
  // (so that leaving auto-collapse range later triggers a fresh expand).
  const userCollapsedRef = useRef(false);

  useEffect(() => {
    if (docPanelLayout === 'panel') {
      if (autoCollapse) {
        userCollapsedRef.current = false;
        panelRef.current?.collapse();
      } else if (!userCollapsedRef.current) {
        panelRef.current?.expand();
      }
    }
  }, [autoCollapse, docPanelLayout, panelRef]);

  // SPEC-24 FR-T10: expand-on-avatar-click. `docPanelExpandSignal` is a
  // monotonic counter incremented by `DocumentContext.openActivityPanel`
  // (called from `PresenceBar` avatar clicks and the mode-toggle button).
  // When it increments, expand/open the panel in whichever layout mode
  // is active. Initial 0 → 0 transition (mount) is harmless — calling
  // `expand` when already expanded is a no-op in react-resizable-panels.
  useEffect(() => {
    if (docPanelExpandSignal === 0) return;
    if (isSheetMode) {
      setSheetOpen(true);
    } else {
      // Panel mode — clear the user-collapsed sticky flag so the
      // expand call isn't immediately fought by a later layout effect.
      userCollapsedRef.current = false;
      panelRef.current?.expand();
    }
  }, [docPanelExpandSignal, isSheetMode, panelRef]);

  // Track the previously-active docName for DocumentErrorBoundary's
  // "Back to previous document" affordance. Updated AFTER render (effect) so
  // the *current* render still sees the prior value — during an error, the
  // user sees "Back to <previous>" where <previous> is the last successfully
  // navigated-to doc, not the doc that just errored.
  const previousDocNameRef = useRef<string | null>(null);
  const [previousDocName, setPreviousDocName] = useState<string | null>(null);
  useEffect(() => {
    if (activeDocName && activeDocName !== previousDocNameRef.current) {
      // Capture prior ref value, then update ref + state for the next render.
      const prior = previousDocNameRef.current;
      previousDocNameRef.current = activeDocName;
      setPreviousDocName(prior);
    }
  }, [activeDocName]);

  if (settingsRoute.scope !== null) {
    return (
      <Suspense fallback={<EditorSkeleton />}>
        <SettingsPane
          scope={settingsRoute.scope}
          onClose={settingsRoute.close}
          onScopeChange={settingsRoute.setScope}
        />
      </Suspense>
    );
  }

  if (activeTarget?.kind === 'folder') {
    return <FolderOverview folderPath={activeTarget.folderPath} />;
  }

  if (!activeProvider || !activeDocName) {
    // On initial page load, the URL hash tells us a doc is about to open —
    // render the skeleton instead of the "Select a document" empty state so
    // the user doesn't see a flash of the OkBlob screen before
    // `NavigationHandler`'s effect wires up the hash-driven nav. Once the
    // provider lands, the normal editor tree below takes over. Guarded on
    // `typeof window` so SSR / the DocumentContext bootstrap path doesn't
    // reach the `window` reference.
    const hashDoc = typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
    if (hashDoc !== null) {
      return <EditorSkeleton />;
    }
    return <EmptyEditorState />;
  }

  const isSourceMode = editorMode === 'source';

  const showPanelOpen = isSheetMode ? !sheetOpen : isCollapsed;

  const toggleButton = (
    <div className="absolute top-2 right-2 z-10">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isSheetMode) {
                setSheetOpen((prev) => !prev);
              } else if (isCollapsed) {
                userCollapsedRef.current = false;
                panelRef.current?.expand();
              } else {
                userCollapsedRef.current = true;
                panelRef.current?.collapse();
              }
            }}
            aria-label={showPanelOpen ? 'Show document panel' : 'Hide document panel'}
            className="text-muted-foreground"
          >
            {showPanelOpen ? (
              <PanelRightOpen className="size-4" />
            ) : (
              <PanelRightClose className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{showPanelOpen ? 'Show panel' : 'Hide panel'}</TooltipContent>
      </Tooltip>
    </div>
  );

  const editorContent = (
    <div className="relative flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        {/* Hybrid Activity + Suspense + ErrorBoundary render tree.
          EditorActivityPool keeps Tiptap eager and lazy-loads SourceEditor on
          the first source-mode visit for each doc, then preserves the per-doc
          display:none toggle after that initial load. Each Activity entry owns
          its own scroll container so scroll position is DOM-local to that
          doc's subtree and survives the Activity hidden-mode mount/unmount cycle.

          Error + Suspense scoping lives INSIDE EditorActivityPool — each
          Activity wraps its own DocumentErrorBoundary + Suspense so a
          hidden doc's cached rejected syncPromise cannot re-throw into
          the visible UI (QA-023/024). See EditorActivityPool.tsx file
          docstring "ERROR + SUSPENSE SCOPING" for rationale. */}
        <div className="relative h-full">
          <EditorActivityPool
            // Fall back to the urgent `activeDocName` when the deferred
            // value is still null (initial load, before the first
            // deferred-commit pass populates it). The outer guard at
            // line 173 already short-circuits with skeleton/empty-state
            // when `activeDocName` itself is null, so we can assert
            // non-null here.
            activeDocName={deferredActiveDocName ?? activeDocName}
            isSourceMode={isSourceMode}
            editorPlaceholder={editorPlaceholder}
            previousDocName={previousDocName ?? undefined}
            onNavigateBack={(prev) => {
              // Navigate via hash so the URL stays in sync with app state —
              // NavigationHandler's hashchange listener will call
              // openDocumentTransition(prev). If the hash is already at
              // prev (rare — happens when back-nav is used after agent
              // nav without URL update), fall back to direct transition.
              const nextHash = hashFromDocName(prev);
              if (window.location.hash === nextHash) {
                openDocumentTransition(prev);
              } else {
                window.location.hash = nextHash;
              }
            }}
            onRecycle={recycleDocument}
          />
          {/* Nav-pending skeleton overlay. Rendered when the urgent
            `activeDocName` (shell state — driving sidebar highlight +
            header title) has moved past `deferredActiveDocName` (editor
            subtree prop). That delta window is exactly the interval
            between shell-snap and the editor subtree's deferred commit
            completing — 1-3s on mark-heavy docs that refuse V2 cache
            admission. Without this overlay the user sees the PREVIOUS
            doc's editor linger through the mount window, which looks
            like a "flash of the old editor" and contradicts the
            sidebar's now-updated highlight. The overlay is absolute +
            inset-0 on the positioned parent so it paints over the pool
            without unmounting it — Activity state (scroll, selection,
            editor instances) survives underneath. Regression test:
            docs-open.e2e.ts F0b. */}
          {activeDocName && activeDocName !== deferredActiveDocName ? (
            <div className="absolute inset-0 z-10 bg-background">
              <EditorSkeleton />
            </div>
          ) : null}
        </div>
        {toggleButton}
      </div>
      {showFooter && <EditorFooter stats={stats} />}
    </div>
  );

  if (isSheetMode) {
    return (
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{editorContent}</div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-80 sm:w-96 flex-col gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Document panel</SheetTitle>
            </SheetHeader>
            <DocPanel
              docName={activeDocName}
              isSourceMode={isSourceMode}
              activeTab={activeTab}
              onActiveTabChange={onActiveTabChange}
              mode={docPanelMode}
            />
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    // Wrapper div takes flex-1 in the flex-col SidebarInset, giving ResizablePanelGroup
    // (which uses h-full internally) a correctly-sized height context.
    <div className="flex min-h-0 flex-1">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel minSize="30%" defaultSize="75%">
          {editorContent}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          panelRef={panelRef}
          defaultSize="25%"
          minSize="300px"
          maxSize="40%"
          collapsible
          collapsedSize={0}
          onResize={(size) => setIsCollapsed(size.asPercentage === 0)}
          className="flex flex-col bg-muted/20"
        >
          <DocPanel
            docName={activeDocName}
            isSourceMode={isSourceMode}
            activeTab={activeTab}
            onActiveTabChange={onActiveTabChange}
            mode={docPanelMode}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
