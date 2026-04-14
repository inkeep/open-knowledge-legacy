import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { DocPanel } from '@/components/DocPanel';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';

interface EditorAreaProps {
  isSourceMode: boolean;
}

export function EditorArea({ isSourceMode }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();
  const panelRef = usePanelRef();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!activeProvider || !activeDocName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      </div>
    );
  }

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
              {/* CSS-based show/hide — React Activity runs effect cleanup on 'hidden' which destroys
                  the CodeMirror/TipTap views. display:none keeps DOM in document without triggering
                  React's effect lifecycle, so both editors stay alive across mode switches. */}
              <div className={isSourceMode ? 'h-full' : 'hidden'}>
                <SourceEditor
                  key={activeDocName}
                  ytext={activeProvider.document.getText('source')}
                  provider={activeProvider}
                />
              </div>
              <div className={isSourceMode ? 'hidden' : 'h-full'}>
                <TiptapEditor key={activeDocName} provider={activeProvider} />
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
