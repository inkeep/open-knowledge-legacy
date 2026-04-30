import { Clock, CornerDownLeft, CornerUpRight, ListTree, Network } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { BacklinksPanel } from '@/components/BacklinksPanel';
import type { DiffLayout } from '@/components/DiffView';
import { ForwardLinksPanel } from '@/components/ForwardLinksPanel';
import { OutlinePanel } from '@/components/OutlinePanel';
import { TimelineContent } from '@/components/TimelinePanel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type PanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph' | 'timeline';

export const TABS: { id: PanelTab; label: string; icon: typeof ListTree }[] = [
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'backlinks', label: 'Backlinks', icon: CornerDownLeft },
  { id: 'forward-links', label: 'Outgoing Links', icon: CornerUpRight },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

/**
 * Top-level mode for the DocPanel container. Two values:
 *   - `'doc'`:   existing per-document info tabs (outline / backlinks / …).
 *   - `'agent'`: Agent Activity view keyed to a `connectionId`.
 *
 * The mode is a drill-in, not a persistent toggle: agent avatar click enters
 * `'agent'` mode; the back arrow (shown only in `'agent'` mode) returns to
 * `'doc'` mode via `closeActivityPanel()`.
 */
type DocPanelMode = 'doc' | 'agent';

function loadGraphPanelModule() {
  return import('@/components/GraphPanel');
}

const LazyGraphPanel = lazy(async () => {
  const mod = await loadGraphPanelModule();
  return { default: mod.GraphPanel };
});

const LazyActivityModeContent = lazy(async () => {
  const mod = await import('@/components/ActivityModeContent');
  return { default: mod.ActivityModeContent };
});

interface DocPanelProps {
  docName: string;
  isSourceMode: boolean;
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  /** Active mode — controlled by presence-bar avatar clicks + the back arrow. */
  mode: DocPanelMode;
}

export function DocPanel({
  docName,
  isSourceMode,
  activeTab,
  onActiveTabChange,
  mode,
}: DocPanelProps) {
  // Lifted from TimelineContent so the choice survives sub-tab switches —
  // TimelineContent unmounts when activeTab leaves 'timeline'.
  const [diffLayout, setDiffLayout] = useState<DiffLayout>('unified');
  return (
    <>
      {/* In `'doc'` mode: the 5 info sub-tabs render as the panel header.
          In `'agent'` mode: no header row — `ActivityModeContent` owns its
          own header (avatar + back-arrow), which eliminates the empty-row
          footprint the standalone back-arrow used to have. */}
      {mode === 'doc' ? (
        <div className="flex flex-row items-center justify-center gap-3 border-b border-border/60 p-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={activeTab}
            onValueChange={(value: PanelTab) => {
              if (value) onActiveTabChange(value);
            }}
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
        </div>
      ) : null}

      {mode === 'doc' ? (
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="min-h-0 flex-1"
        >
          {activeTab === 'outline' && (
            <OutlinePanel docName={docName} isSourceMode={isSourceMode} />
          )}
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
          {activeTab === 'timeline' && (
            <TimelineContent
              docName={docName}
              diffLayout={diffLayout}
              onDiffLayoutChange={setDiffLayout}
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading agent activity…
              </div>
            }
          >
            <LazyActivityModeContent />
          </Suspense>
        </div>
      )}
    </>
  );
}
