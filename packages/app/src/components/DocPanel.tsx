import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { Clock, CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { GraphPanel } from '@/components/GraphPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { TimelineContent } from '@/components/TimelinePanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type PanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph' | 'timeline';

const TABS: { id: PanelTab; label: string; Icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', Icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', Icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', Icon: CornerUpRight },
  { id: 'graph', label: 'Graph', Icon: Network },
  { id: 'timeline', label: 'Timeline', Icon: Clock },
];

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  onEntrySelect?: (entry: TimelineEntry) => void;
  selectedSha?: string;
}

export function DocPanel({
  docName,
  isSourceMode,
  activeTab,
  onActiveTabChange,
  onEntrySelect,
  selectedSha,
}: DocPanelProps) {
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
                onClick={() => onActiveTabChange(id)}
                className={cn(
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
        {activeTab === 'timeline' && (
          <TimelineContent
            docName={docName}
            onEntrySelect={onEntrySelect}
            selectedSha={selectedSha}
          />
        )}
      </div>
    </>
  );
}
