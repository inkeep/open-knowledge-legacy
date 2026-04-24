import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import {
  Activity,
  Clock,
  CornerDownLeft,
  CornerUpRight,
  FileText,
  ListTree,
  Network,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { ActivityModeContent } from '@/components/ActivityModeContent';
import { BacklinksPanel } from '@/components/BacklinksPanel';
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
 *   - `'agent'`: Agent Activity view keyed to a `connectionId` (SPEC
 *     2026-04-24-activity-panel-to-docpanel-mode-toggle).
 *
 * The mode is chosen at this top level, NOT as a 6th tab — per-file tabs
 * and a per-agent tab violate a shared invariant (see D-T1 in that SPEC).
 */
type DocPanelMode = 'doc' | 'agent';

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
  activeTab: PanelTab;
  onActiveTabChange: (tab: PanelTab) => void;
  onEntrySelect?: (entry: TimelineEntry) => void;
  selectedSha?: string;
  /** Active mode — flipped by the mode-toggle + presence-bar avatar clicks. */
  mode: DocPanelMode;
  /** Imperative mode setter (wired to `DocumentContext.setDocPanelMode`). */
  onModeChange: (mode: DocPanelMode) => void;
  /**
   * Whether any agent has a live presence entry. When `false`, the
   * `'agent'` mode toggle is disabled with a tooltip. Derived from
   * `systemProvider.awareness` in `EditorArea` via `useHasActiveAgents`.
   * SPEC-24 FR-T4.
   */
  hasActiveAgents: boolean;
}

export function DocPanel({
  docName,
  isSourceMode,
  activeTab,
  onActiveTabChange,
  onEntrySelect,
  selectedSha,
  mode,
  onModeChange,
  hasActiveAgents,
}: DocPanelProps) {
  // Disable the `'agent'` toggle when (a) there are no live agents AND
  // (b) we're not already scoped to one — an in-progress `'agent'` mode
  // with a session-ended agent should stay toggleable so the user can
  // review residual activity before deciding to flip away (SPEC-24 S-T6).
  const agentToggleDisabled = !hasActiveAgents && mode !== 'agent';
  return (
    <>
      {/* Single-row header: compact icon-only mode toggle on the LEFT,
          followed (in `'doc'` mode only) by the sub-tab bar for Outline /
          Backlinks / Outgoing / Graph / Timeline. Tooltips carry the text
          that used to sit next to the mode icons. */}
      <div className="flex flex-row items-center justify-center gap-3 border-b border-border/60 p-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(value) => {
            // Radix fires empty string when the user clicks the active item
            // (trying to un-toggle it in a single-select group). Ignore —
            // mode is always one of the two values, no neutral state.
            if (value === 'doc' || value === 'agent') onModeChange(value);
          }}
          aria-label="Panel mode"
          data-testid="docpanel-mode-toggle"
        >
          <Tooltip>
            <ToggleGroupItem
              value="doc"
              aria-label="Document info"
              data-testid="docpanel-mode-doc"
              asChild
            >
              <TooltipTrigger>
                <FileText />
              </TooltipTrigger>
            </ToggleGroupItem>
            <TooltipContent side="bottom">Document info</TooltipContent>
          </Tooltip>
          <Tooltip>
            <ToggleGroupItem
              value="agent"
              aria-label="Agent activity"
              disabled={agentToggleDisabled}
              data-testid="docpanel-mode-agent"
              asChild
            >
              <TooltipTrigger>
                <Activity />
              </TooltipTrigger>
            </ToggleGroupItem>
            <TooltipContent side="bottom">
              {agentToggleDisabled ? 'No active agents' : 'Agent activity'}
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>

        {mode === 'doc' ? (
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
        ) : null}
      </div>

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
              onEntrySelect={onEntrySelect}
              selectedSha={selectedSha}
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ActivityModeContent />
        </div>
      )}
    </>
  );
}
