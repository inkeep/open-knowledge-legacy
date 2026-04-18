import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { stripFrontmatter } from '@inkeep/open-knowledge-core';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { DocPanel } from '@/components/DocPanel';
import { FolderOverview } from '@/components/FolderOverview';
import { OkBlob } from '@/components/OkBlob';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { useDocPanelLayout } from '@/hooks/use-doc-panel-layout';
import { hashFromDocName } from '@/lib/doc-hash';
import type { DiffLayout } from './DiffView';
import { DiffView } from './DiffView';
import { EditorActivityPool } from './EditorActivityPool';
import type { EditorMode } from './EditorPane';

interface EditorAreaProps {
  editorMode: EditorMode;
  previewEntry: TimelineEntry | null;
  diffLayout: DiffLayout;
  onNoDiff?: () => void;
}

export function EditorArea({ editorMode, previewEntry, diffLayout, onNoDiff }: EditorAreaProps) {
  const { activeDocName, activeProvider, activeTarget, recycleDocument } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const isNewDoc = activeTarget?.kind === 'missing';
  const editorPlaceholder = isNewDoc ? 'Start writing to create this page\u2026' : undefined;
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { layout: docPanelLayout, autoCollapse } = useDocPanelLayout();
  const isSheetMode = docPanelLayout === 'sheet';
  const [sheetOpen, setSheetOpen] = useState(false);

  // Auto-collapse/expand when crossing the 1024px breakpoint.
  // Only fires on breakpoint transitions, so manual collapse on wide screens is respected.
  useEffect(() => {
    if (docPanelLayout === 'panel') {
      if (autoCollapse) {
        panelRef.current?.collapse();
      } else {
        panelRef.current?.expand();
      }
    }
  }, [autoCollapse, docPanelLayout, panelRef]);

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

  // FUTURE: The diff is a snapshot fetched once. If the document changes while
  // the user is in diff mode (e.g., agent writes), the diff view becomes stale.
  // @codemirror/merge supports incremental updates via Chunk.updateA()/updateB()
  // — a future iteration could subscribe to Y.Text changes and live-update the
  // "current" side of the diff. For v0 (solo + AI) this is acceptable as-is.
  const [diffContent, setDiffContent] = useState<{ old: string; new: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!previewEntry?.sha || !activeDocName) {
      setDiffContent(null);
      return;
    }

    let cancelled = false;
    const sha = previewEntry.sha;
    const docName = activeDocName;
    setPreviewLoading(true);
    setDiffContent(null);

    async function fetchHistoricalContent() {
      try {
        const res = await fetch(`/api/history/${sha}?docName=${encodeURIComponent(docName)}`);
        if (cancelled) return;
        if (!res.ok) {
          setDiffContent(null);
          setPreviewLoading(false);
          return;
        }
        const data = (await res.json()) as { content: string };
        if (!cancelled) {
          // Strip frontmatter from both sides so the diff shows only body changes.
          // Git stores full file (with frontmatter); Y.Text('source') also includes
          // frontmatter (Observer A prepends it), so both must be stripped.
          const historical = stripFrontmatter(data.content ?? '').body;
          const current = stripFrontmatter(
            activeProvider?.document.getText('source').toString() ?? '',
          ).body;
          // Normalize trailing whitespace + line endings before comparing —
          // the markdown pipeline may add/remove trailing newlines or spaces.
          const norm = (s: string) =>
            s
              .replace(/\r\n/g, '\n')
              .replace(/[ \t]+$/gm, '')
              .trimEnd();
          if (norm(historical) === norm(current)) {
            setPreviewLoading(false);
            onNoDiff?.();
            return;
          }
          // Capture both sides together so they're consistent — Y.Text may not
          // be populated during the synchronous render that triggers this effect.
          setDiffContent({ old: historical, new: current });
          setPreviewLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDiffContent(null);
          setPreviewLoading(false);
        }
      }
    }

    fetchHistoricalContent();
    return () => {
      cancelled = true;
    };
  }, [previewEntry?.sha, activeDocName, activeProvider, onNoDiff]);

  if (activeTarget?.kind === 'folder') {
    return <FolderOverview folderPath={activeTarget.folderPath} />;
  }

  if (!activeProvider || !activeDocName) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <OkBlob size={80} />
        <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      </div>
    );
  }

  const isDiffMode = editorMode === 'diff';
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
              } else {
                isCollapsed ? panelRef.current?.expand() : panelRef.current?.collapse();
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
    <div className="relative h-full">
      {/* No outer scroller. Scrolling is owned by (a) DiffView's own
          internal scroller in diff mode and (b) the per-Activity scroller
          inside EditorActivityPool in editor mode. Hoisting the scroller
          to this level would let the Activity subtree's content contract
          on hidden-mode effect cleanup, clamping scrollTop to 0 and
          losing the user's position across warm navigation (QA-002 /
          SPEC US-007/F1). */}

      {/* Diff view — shown when editorMode === 'diff' */}
      {isDiffMode && previewLoading && (
        <div
          className="flex items-center justify-center py-16"
          role="status"
          aria-label="Loading version"
        >
          <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      )}
      {isDiffMode && !previewLoading && diffContent !== null && (
        <DiffView oldContent={diffContent.old} newContent={diffContent.new} layout={diffLayout} />
      )}

      {/* Hybrid Activity + Suspense + ErrorBoundary render tree.
          Outer display:none keeps the editor DOM alive when in diff mode.
          Per-Activity dual-editor mount (SourceEditor + TiptapEditor with
          inner display:none toggle) is preserved inside EditorActivityPool
          per spec §9 + audit A2. Each Activity entry owns its own scroll
          container so scroll position is DOM-local to that doc's subtree
          and survives the Activity hidden-mode mount/unmount cycle.

          Error + Suspense scoping lives INSIDE EditorActivityPool — each
          Activity wraps its own DocumentErrorBoundary + Suspense so a
          hidden doc's cached rejected syncPromise cannot re-throw into
          the visible UI (QA-023/024). See EditorActivityPool.tsx file
          docstring "ERROR + SUSPENSE SCOPING" for rationale. */}
      <div className="h-full" style={{ display: isDiffMode ? 'none' : undefined }}>
        <EditorActivityPool
          activeDocName={activeDocName}
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
      </div>
      {toggleButton}
    </div>
  );

  if (isSheetMode) {
    return (
      <div className="flex min-h-0 flex-1">
        {editorContent}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-[300px] flex-col gap-0 p-0 sm:max-w-[300px]">
            <SheetHeader className="sr-only">
              <SheetTitle>Document panel</SheetTitle>
            </SheetHeader>
            <DocPanel docName={activeDocName} isSourceMode={isSourceMode} />
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
          <DocPanel docName={activeDocName} isSourceMode={isSourceMode} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
