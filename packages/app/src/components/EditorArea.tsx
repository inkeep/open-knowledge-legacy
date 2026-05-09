import { ListPlus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { AssetPreview } from '@/components/AssetPreview';
import { DocPanel, type PanelTab } from '@/components/DocPanel';
import {
  consumePendingDocPanelTabRequest,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import { EditorSkeleton } from '@/components/EditorSkeleton';
import { EmptyEditorState } from '@/components/EmptyEditorState';
import { FolderOverview } from '@/components/FolderOverview';
import { PropertyProvider, useProperties } from '@/components/PropertyContext';
import { Button } from '@/components/ui/button.tsx';
import { ButtonGroup } from '@/components/ui/button-group.tsx';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { mountPromiseHasResolved } from '@/editor/mount-promise';
import { syncPromiseHasResolved } from '@/editor/sync-promise';
import type { EditorModeValue } from '@/editor/use-editor-mode.ts';
import { useDocPanelLayout } from '@/hooks/use-doc-panel-layout';
import { useDocumentStats } from '@/hooks/use-document-stats';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { ProfilerBoundary } from '@/lib/perf';
import { useSettingsRoute } from '@/lib/use-settings-route';
import { useSyncStatus } from '@/presence/use-sync-status';
import { EditorActivityPool } from './EditorActivityPool';
import { EditorFooter } from './EditorFooter';
import type { EditorMode } from './EditorPane';
import { shouldPaintOverlay } from './editor-area-overlay';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';

const SettingsDialog = lazy(() =>
  import('@/components/settings/SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
);

interface EditorAreaProps {
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
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
        <SettingsDialogPortal />
      </PropertyProvider>
    </ProfilerBoundary>
  );
}

function SettingsDialogPortal() {
  const settingsRoute = useSettingsRoute();
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (settingsRoute.open) setHasOpened(true);
  }, [settingsRoute.open]);
  if (!hasOpened) return null;
  return (
    <Suspense fallback={null}>
      <SettingsDialog
        open={settingsRoute.open}
        onOpenChange={(next) => {
          if (!next) settingsRoute.close();
        }}
      />
    </Suspense>
  );
}

function EditorAreaInner({
  editorMode,
  onModeChange,
  activeTab,
  onActiveTabChange,
}: EditorAreaProps) {
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
  const syncStatus = useSyncStatus(activeProvider);
  const isConnected = syncStatus === 'connected' || syncStatus === 'synced';
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
    const openRequestedTab = (tab: PanelTab) => {
      onActiveTabChange(tab);
      if (isSheetMode) {
        setSheetOpen(true);
      } else {
        userCollapsedRef.current = false;
        panelRef.current?.expand();
      }
    };

    const pendingTab = consumePendingDocPanelTabRequest();
    if (pendingTab) {
      openRequestedTab(pendingTab);
    }

    return subscribeToDocPanelTabRequests((tab) => {
      consumePendingDocPanelTabRequest();
      openRequestedTab(tab);
    });
  }, [isSheetMode, onActiveTabChange, panelRef]);

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

  if (activeTarget?.kind === 'folder') {
    return <FolderOverview folderPath={activeTarget.folderPath} />;
  }

  if (activeTarget?.kind === 'asset') {
    return <AssetPreview assetPath={activeTarget.assetPath} mediaKind={activeTarget.mediaKind} />;
  }

  if (!activeProvider || !activeDocName) {
    const hashDoc = typeof window !== 'undefined' ? docNameFromHash(window.location.hash) : null;
    if (hashDoc !== null) {
      return <EditorSkeleton />;
    }
    return <EmptyEditorState />;
  }

  const isSourceMode = editorMode === 'source';
  const sourceDisabled = !isConnected;

  const showPanelOpen = isSheetMode ? !sheetOpen : isCollapsed;

  function openAddPropertyForm() {
    if (!activeDocName) return;
    requestAddProperty(activeDocName);
  }
  const containerClass = 'shrink-0 rounded-lg bg-background/90 p-0.5 shadow-sm backdrop-blur';

  const toggleButton = (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      <ToggleGroup
        type="single"
        value={isSourceMode ? 'source' : 'wysiwyg'}
        onValueChange={(v: EditorModeValue | '') => {
          if (v) onModeChange(v);
        }}
        aria-label="Editor mode"
        variant="outline"
        className={containerClass}
      >
        <Tooltip>
          <ToggleGroupItem value="wysiwyg" aria-label="Visual editor" asChild>
            <TooltipTrigger>
              <Textbox />
            </TooltipTrigger>
          </ToggleGroupItem>
          <TooltipContent side="bottom">Visual</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            {/**
             * Wrap the disabled button in a <div> that can receive hover events since disabled <button> elements
             * don't trigger pointer events in the browser
             **/}
            <div>
              <ToggleGroupItem
                value="source"
                aria-label="Markdown source"
                disabled={sourceDisabled}
                className="rounded-s-none! border-s-0!"
              >
                <Markdown />
              </ToggleGroupItem>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {sourceDisabled
              ? 'Source mode requires a live connection — your edits are saved and will appear when you reconnect.'
              : 'Markdown'}
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
      <ButtonGroup className={containerClass}>
        {!isSourceMode && (
          <Tooltip>
            <Button
              variant="outline"
              size="icon"
              aria-label="Add properties"
              onClick={openAddPropertyForm}
              data-testid="add-properties-button"
              asChild
            >
              <TooltipTrigger>
                <ListPlus />
              </TooltipTrigger>
            </Button>
            <TooltipContent side="bottom">Add properties</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <Button
            variant="outline"
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
            asChild
          >
            <TooltipTrigger>
              {showPanelOpen ? <PanelRightOpen /> : <PanelRightClose />}
            </TooltipTrigger>
          </Button>
          <TooltipContent side="bottom">
            {showPanelOpen ? 'Show panel' : 'Hide panel'}
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
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
            subtree prop), AND the upcoming deferred commit will pay a
            real Suspense suspension. The delta window is the interval
            between shell-snap and the editor subtree's deferred commit
            completing — 1-3s on mark-heavy docs that refuse V2 cache
            admission, sub-frame on warm reopens (NG7 Pattern D + Q21
            with both mount-promise and sync-promise resolved).
            Without this overlay the user sees the PREVIOUS doc's editor
            linger through a slow mount window, which looks like a
            "flash of the old editor" and contradicts the sidebar's
            now-updated highlight. The overlay is absolute + inset-0 on
            the positioned parent so it paints over the pool without
            unmounting it — Activity state (scroll, selection, editor
            instances) survives underneath.
            Warm-reopen bypass: skip the overlay when both the mount-
            promise and sync-promise caches have resolved entries for
            the new docName. In that state `use()` short-circuits
            synchronously, the deferred commit lands in 1 frame, and
            painting a skeleton during the urgent-paint → deferred-
            commit gap creates a perceptible "cold load" flash on a
            genuinely warm reopen. Reading module state during render
            is safe because resolution is a terminal cache-entry state
            (only invalidate clears it, and invalidate runs from
            park-uncached / evict effects that have already committed
            before this render reads the flag).
            Regression tests: docs-open.e2e.ts F0b (skeleton on V2-
            refuse warm nav), ng7-warm-tab-switch.e2e.ts (no skeleton
            on V2-admit warm reopen with NG7 flags ON). */}
          {shouldPaintOverlay({
            activeDocName,
            deferredActiveDocName,
            mountResolved: activeDocName !== null && mountPromiseHasResolved(activeDocName),
            syncResolved: activeDocName !== null && syncPromiseHasResolved(activeDocName),
          }) ? (
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
