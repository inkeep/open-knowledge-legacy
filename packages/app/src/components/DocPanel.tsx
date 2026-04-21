import { CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { GraphPanel } from '@/components/GraphPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type PanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph';

const TABS: { id: PanelTab; label: string; icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', icon: CornerUpRight },
  { id: 'graph', label: 'Graph', icon: Network },
];

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
}

export function DocPanel({ docName, isSourceMode }: DocPanelProps) {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <>
      <ToggleGroup
        type="single"
        variant="outline"
        value={activeTab}
        onValueChange={setActiveTab}
        className="mx-auto p-2"
        aria-label="Document panels"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <ToggleGroupItem
              value={id}
              role="tab"
              id={`tab-${id}`}
              aria-controls={`panel-${id}`}
              aria-label={label}
              asChild
            >
              <TooltipTrigger>
                <Icon />
              </TooltipTrigger>
            </ToggleGroupItem>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

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
