import { CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { GraphPanel } from '@/components/GraphPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { SourceEditor } from '@/editor/SourceEditor';
import { TiptapEditor } from '@/editor/TiptapEditor';
import { cn } from '@/lib/utils';

type PanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph';

const TABS: { id: PanelTab; label: string; Icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', Icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', Icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', Icon: CornerUpRight },
  { id: 'graph', label: 'Graph', Icon: Network },
];

interface EditorAreaProps {
  isSourceMode: boolean;
}

export function EditorArea({ isSourceMode }: EditorAreaProps) {
  const { activeDocName, activeProvider } = useDocumentContext();
  const [activeTab, setActiveTab] = useState<PanelTab>('outline');

  if (!activeProvider || !activeDocName) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto"
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

      <aside className="hidden w-72 shrink-0 border-l border-border/60 bg-muted/20 lg:flex lg:flex-col">
        <div
          className="flex shrink-0 border-b border-border/60"
          role="tablist"
          aria-label="Document panels"
        >
          {TABS.map(({ id, label, Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  role="tab"
                  aria-selected={activeTab === id}
                  aria-label={label}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex-1 rounded-none',
                    activeTab === id ? 'bg-background text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="min-h-0 flex-1">
          {activeTab === 'outline' && <OutlinePanel docName={activeDocName} />}
          {activeTab === 'backlinks' && <BacklinksPanel docName={activeDocName} />}
          {activeTab === 'forward-links' && <ForwardLinksPanel docName={activeDocName} />}
          {activeTab === 'graph' && <GraphPanel activeDocName={activeDocName} />}
        </div>
      </aside>
    </div>
  );
}
