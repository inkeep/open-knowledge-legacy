import { CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { GraphPanel } from '@/components/GraphPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type PanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph';

const TABS: { id: PanelTab; label: string; Icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', Icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', Icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', Icon: CornerUpRight },
  { id: 'graph', label: 'Graph', Icon: Network },
];

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
}

export function DocPanel({ docName, isSourceMode }: DocPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('outline');

  return (
    <>
      <div
        className="flex items-center justify-center gap-0.5 shrink-0 pt-2 px-2"
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
                id={`tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                aria-label={label}
                onClick={() => setActiveTab(id)}
                className={cn(
                  // 'flex-1 rounded-none',
                  activeTab === id
                    ? 'bg-azure-900/5 dark:bg-white/10 text-primary hover:bg-azure-900/5 dark:hover:bg-white/20 hover:text-primary'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="min-h-0 flex-1"
      >
        {activeTab === 'outline' && <OutlinePanel docName={docName} isSourceMode={isSourceMode} />}
        {activeTab === 'backlinks' && <BacklinksPanel docName={docName} />}
        {activeTab === 'forward-links' && <ForwardLinksPanel docName={docName} />}
        {activeTab === 'graph' && <GraphPanel activeDocName={docName} />}
      </div>
    </>
  );
}
