import { CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import {
  consumePendingDocPanelTabRequest,
  type DocPanelTab,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TABS: { id: DocPanelTab; label: string; icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', icon: CornerUpRight },
  { id: 'graph', label: 'Graph', icon: Network },
];

export function loadGraphPanelModule() {
  return import('@/components/GraphPanel');
}

const LazyGraphPanel = lazy(async () => {
  const mod = await loadGraphPanelModule();
  return { default: mod.GraphPanel };
});

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
}

export function DocPanel({ docName, isSourceMode }: DocPanelProps) {
  const [activeTab, setActiveTab] = useState<DocPanelTab>(
    () => consumePendingDocPanelTabRequest() ?? TABS[0].id,
  );

  useEffect(
    () =>
      subscribeToDocPanelTabRequests((tab) => {
        consumePendingDocPanelTabRequest();
        setActiveTab(tab);
      }),
    [],
  );

  return (
    <>
      <ToggleGroup
        type="single"
        variant="outline"
        value={activeTab}
        onValueChange={(value: DocPanelTab) => {
          if (value) setActiveTab(value);
        }}
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
        {activeTab === 'graph' && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading graph…
              </div>
            }
          >
            <LazyGraphPanel activeDocName={docName} />
          </Suspense>
        )}
      </div>
    </>
  );
}
