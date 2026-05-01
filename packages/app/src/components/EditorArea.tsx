import { ListPlus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { DocPanel, type PanelTab } from '@/components/DocPanel';
import { EditorSkeleton } from '@/components/EditorSkeleton';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';
import { PropertyProvider, useProperties } from '@/components/PropertyContext';

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
      {/* PropertyProvider scopes the cross-tree property-panel signal bus
          to the editor surface — both the toolbar (button → dispatcher)
          and EditorActivityPool's PropertyPanel mounts (consumers) live
          underneath. Replaces the prior `BEGIN_ADD_EVENT` window event,
          whose global broadcast leaked across hidden Activity boundaries.
          See PropertyContext.tsx for the design notes. */}
      <PropertyProvider>
        <EditorAreaInner {...props} />
      </PropertyProvider>
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
  const { requestAddProperty } = useProperties();
  const stats = useDocumentStats(activeProvider, activeDocName);
  const deferredActiveDocName = useDeferredValue(activeDocName);
  const isNewDoc = activeTarget?.kind === 'missing';
  const showFooter = !!activeDocName && activeTarget?.kind !== 'folder';
  const editorPlaceholder = isNewDoc ? 'Start writing to create this page\u2026' : undefined;
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { layout: docPanelLayout, autoCollapse } = useDocPanelLayout();
  const isSheetMode = docPanelLayout === 'sheet';
  const [sheetOpen, setSheetOpen] = useState(false);
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

  useEffect(() => {
    if (docPanelExpandSignal === 0) return;
    if (isSheetMode) {
      setSheetOpen(true);
    } else {
      userCollapsedRef.current = false;
      panelRef.current?.expand();
    }
  }, [docPanelExpandSignal, isSheetMode, panelRef]);

  const previousDocNameRef = useRef<string | null>(null);
  const [previousDocName, setPreviousDocName] = useState<string | null>(null);
  useEffect(() => {
    if (activeDocName && activeDocName !== previousDocNameRef.current) {
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
    const hashDoc = typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
    if (hashDoc !== null) {
      return <EditorSkeleton />;
    }
    return <EmptyEditorState />;
  }

  const isSourceMode = editorMode === 'source';

  const showPanelOpen = isSheetMode ? !sheetOpen : isCollapsed;

  function openAddPropertyForm() {
    if (!activeDocName) return;
    requestAddProperty(activeDocName);
  }

  const toggleButton = (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      {!isSourceMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add properties"
              onClick={openAddPropertyForm}
              data-testid="add-properties-button"
              className="text-muted-foreground"
            >
              <ListPlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Add properties</TooltipContent>
        </Tooltip>
      )}
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
            activeDocName={deferredActiveDocName ?? activeDocName}
            isSourceMode={isSourceMode}
            editorPlaceholder={editorPlaceholder}
            previousDocName={previousDocName ?? undefined}
            onNavigateBack={(prev) => {
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
