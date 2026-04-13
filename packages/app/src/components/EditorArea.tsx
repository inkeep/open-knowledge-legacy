import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { DocPanel } from '@/components/DocPanel';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';
import type { EditorMode } from './EditorPane';
import { PreviewEditor } from './PreviewEditor';
import type { TimelineEntry } from './TimelinePanel';

interface EditorAreaProps {
  editorMode: EditorMode;
  previewEntry: TimelineEntry | null;
  onNoDiff?: () => void;
}

export function EditorArea({ editorMode, previewEntry, onNoDiff }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [diffLines, setDiffLines] = useState<{ type: string; text: string }[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch diff when previewEntry changes — always show the diff view.
  useEffect(() => {
    if (!previewEntry?.sha || !activeDocName) {
      setDiffLines(null);
      return;
    }

    let cancelled = false;
    const sha = previewEntry.sha;
    const docName = activeDocName;
    setPreviewLoading(true);
    setDiffLines(null);

    async function fetchDiff() {
      try {
        const res = await fetch(`/api/diff?docName=${encodeURIComponent(docName)}&to=${sha}`);
        if (cancelled) return;
        if (!res.ok) {
          setDiffLines([{ type: 'unchanged', text: '(Failed to load diff)' }]);
          setPreviewLoading(false);
          return;
        }
        const data = (await res.json()) as {
          lines: { type: string; text: string }[];
          additions: number;
          deletions: number;
        };
        if (!cancelled) {
          if (data.additions === 0 && data.deletions === 0) {
            setPreviewLoading(false);
            onNoDiff?.();
            return;
          }
          setDiffLines(data.lines ?? []);
          setPreviewLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDiffLines([{ type: 'unchanged', text: '(Failed to load diff)' }]);
          setPreviewLoading(false);
        }
      }
    }

    fetchDiff();
    return () => {
      cancelled = true;
    };
  }, [previewEntry?.sha, activeDocName, onNoDiff]);

  if (!activeProvider || !activeDocName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      </div>
    );
  }

  const isDiffMode = editorMode === 'diff';
  const isSourceMode = editorMode === 'source';

  return (
    // Wrapper div takes flex-1 in the flex-col SidebarInset, giving ResizablePanelGroup
    // (which uses h-full internally) a correctly-sized height context.
    <div className="flex min-h-0 flex-1">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel minSize="30%" defaultSize="75%">
          <div className="relative h-full">
            <div
              className="subtle-scrollbar h-full overflow-y-auto"
              style={{ overflowAnchor: 'auto' }}
            >
              {/* Diff view — shown when editorMode === 'diff' */}
              {isDiffMode && previewLoading && (
                <div className="flex items-center justify-center py-16">
                  <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                </div>
              )}
              {isDiffMode && !previewLoading && diffLines !== null && (
                <PreviewEditor lines={diffLines} />
              )}

              {/* CSS-based show/hide — display:none keeps DOM alive without triggering
                  React's effect lifecycle, so both editors survive mode switches. */}
              <div style={{ display: isDiffMode ? 'none' : undefined }}>
                <div className={isSourceMode ? 'h-full' : 'hidden'}>
                  <SourceEditor
                    ytext={activeProvider.document.getText('source')}
                    provider={activeProvider}
                  />
                </div>
                <div className={isSourceMode ? 'hidden' : 'h-full'}>
                  <TiptapEditor key={activeDocName} provider={activeProvider} />
                </div>
              </div>
            </div>
            <div className="absolute top-2 right-2 z-10">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      isCollapsed ? panelRef.current?.expand() : panelRef.current?.collapse()
                    }
                    aria-label={isCollapsed ? 'Show document panel' : 'Hide document panel'}
                    className="text-muted-foreground"
                  >
                    {isCollapsed ? (
                      <PanelRightOpen className="size-4" />
                    ) : (
                      <PanelRightClose className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isCollapsed ? 'Show panel' : 'Hide panel'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel
          panelRef={panelRef}
          defaultSize="25%"
          minSize="15%"
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
