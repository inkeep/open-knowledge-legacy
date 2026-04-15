import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { stripFrontmatter } from '@inkeep/open-knowledge-core';
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
import type { DiffLayout } from './DiffView';
import { DiffView } from './DiffView';
import type { EditorMode } from './EditorPane';

interface EditorAreaProps {
  editorMode: EditorMode;
  previewEntry: TimelineEntry | null;
  diffLayout: DiffLayout;
  onNoDiff?: () => void;
}

export function EditorArea({ editorMode, previewEntry, diffLayout, onNoDiff }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
                <div
                  className="flex items-center justify-center py-16"
                  role="status"
                  aria-label="Loading version"
                >
                  <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                </div>
              )}
              {isDiffMode && !previewLoading && diffContent !== null && (
                <DiffView
                  oldContent={diffContent.old}
                  newContent={diffContent.new}
                  layout={diffLayout}
                />
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
