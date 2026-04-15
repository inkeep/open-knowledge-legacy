import { useQuery } from '@tanstack/react-query';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GraphView } from '@/components/GraphView';
import { Button } from '@/components/ui/button';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { hashFromDocName } from '@/lib/doc-hash';

const FULLSCREEN_HUB_LIMIT = 50;

type FullscreenGraphMode = 'explore' | 'orphans' | 'hubs';
type OrphanMode = 'incoming' | 'outgoing' | 'both';

interface OrphanEntry {
  docName: string;
  title: string;
}

interface HubEntry {
  docName: string;
  title: string;
  count: number;
}

interface OrphansResponse {
  ok: boolean;
  orphans?: OrphanEntry[];
  error?: string;
}

interface HubsResponse {
  ok: boolean;
  hubs?: HubEntry[];
  error?: string;
}

const FULLSCREEN_MODE_LABELS: Record<FullscreenGraphMode, string> = {
  explore: 'Explore',
  orphans: 'Orphans',
  hubs: 'Hubs',
};

const ORPHAN_MODE_LABELS: Record<OrphanMode, string> = {
  incoming: 'No Incoming',
  outgoing: 'No Outgoing',
  both: 'Both',
};

async function fetchOrphans(mode: OrphanMode): Promise<OrphanEntry[]> {
  const res = await fetch(`/api/orphans?mode=${encodeURIComponent(mode)}`);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as OrphansResponse;
  if (!data.ok) throw new Error(data.error ?? 'Failed to load orphan pages');
  return data.orphans ?? [];
}

async function fetchHubs(limit: number): Promise<HubEntry[]> {
  const res = await fetch(`/api/hubs?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as HubsResponse;
  if (!data.ok) throw new Error(data.error ?? 'Failed to load hub pages');
  return data.hubs ?? [];
}

function navigateToDoc(docName: string) {
  window.location.assign(hashFromDocName(docName));
}

function getOrphanDescription(mode: OrphanMode): string {
  if (mode === 'incoming') {
    return 'Project-level pages with no incoming graph edges.';
  }
  if (mode === 'outgoing') {
    return 'Project-level pages with no outgoing graph edges.';
  }
  return 'Project-level pages with neither incoming nor outgoing graph edges.';
}

function getOrphanEmptyState(mode: OrphanMode): string {
  if (mode === 'incoming') {
    return 'No pages are missing incoming graph links.';
  }
  if (mode === 'outgoing') {
    return 'No pages are missing outgoing graph links.';
  }
  return 'No disconnected pages. Pages appear here only when they have no incoming and no outgoing graph edges.';
}

function FullscreenOrphansView({
  mode,
  onModeChange,
}: {
  mode: OrphanMode;
  onModeChange: (mode: OrphanMode) => void;
}) {
  const {
    data: orphans = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orphans', mode],
    queryFn: () => fetchOrphans(mode),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Project-level disconnected pages</p>
            <p className="text-xs text-muted-foreground">{getOrphanDescription(mode)}</p>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={mode}
            aria-label="Orphan mode"
            onValueChange={(value) => {
              if (value === 'incoming' || value === 'outgoing' || value === 'both') {
                onModeChange(value);
              }
            }}
          >
            {Object.entries(ORPHAN_MODE_LABELS).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} aria-label={label}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : 'Failed to load orphan pages'}
          </PanelError>
        ) : orphans.length === 0 && !isLoading ? (
          <PanelEmpty>{getOrphanEmptyState(mode)}</PanelEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {orphans.map((entry) => (
              <button
                key={entry.docName}
                type="button"
                className="block w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => navigateToDoc(entry.docName)}
              >
                <div className="truncate text-sm font-medium">{entry.title}</div>
                <div className="truncate text-xs text-muted-foreground">{entry.docName}</div>
              </button>
            ))}
          </div>
        )}
      </PanelBody>
    </div>
  );
}

function FullscreenHubsView() {
  const {
    data: hubs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['hubs', FULLSCREEN_HUB_LIMIT],
    queryFn: () => fetchHubs(FULLSCREEN_HUB_LIMIT),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Top linked pages</p>
          <p className="text-xs text-muted-foreground">
            Project-level pages ordered by inbound link count, up to {FULLSCREEN_HUB_LIMIT} results.
          </p>
        </div>
      </div>
      <PanelBody aria-busy={isLoading}>
        {error ? (
          <PanelError>
            {error instanceof Error ? error.message : 'Failed to load hub pages'}
          </PanelError>
        ) : hubs.length === 0 && !isLoading ? (
          <PanelEmpty>
            No hub pages yet. Hubs appear once pages accumulate inbound graph links.
          </PanelEmpty>
        ) : (
          <div className="flex flex-col gap-2">
            {hubs.map((hub) => (
              <button
                key={hub.docName}
                type="button"
                className="block w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => navigateToDoc(hub.docName)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{hub.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{hub.docName}</div>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                    {hub.count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </PanelBody>
    </div>
  );
}

function getFullscreenElement(): Element | null {
  return (
    document.fullscreenElement ??
    (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
    null
  );
}

async function toggleFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  try {
    if (getFullscreenElement()) {
      await (document.exitFullscreen?.() ??
        (
          document as Document & { webkitExitFullscreen?: () => Promise<void> }
        ).webkitExitFullscreen?.());
    } else {
      await (el.requestFullscreen?.() ??
        (
          el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
        ).webkitRequestFullscreen?.());
    }
  } catch {
    // User gesture / permission / unsupported
  }
}

export function GraphPanel({ activeDocName }: { activeDocName: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState<FullscreenGraphMode>('explore');
  const [orphanMode, setOrphanMode] = useState<OrphanMode>('both');
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);

  useEffect(() => {
    const sync = () => setIsFullscreen(getFullscreenElement() === panelRef.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const activeMode = isFullscreen ? fullscreenMode : 'explore';

  return (
    <Panel ref={panelRef} className={isFullscreen ? 'min-h-[100dvh] bg-background' : undefined}>
      <PanelHeader className="flex-wrap gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <PanelTitle>Graph</PanelTitle>
          {activeMode === 'explore' && stats ? (
            <div className="flex items-center gap-0.5">
              <PanelCount>{stats.nodes} nodes</PanelCount>
              <PanelCount>{stats.links} links</PanelCount>
            </div>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isFullscreen ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={fullscreenMode}
              aria-label="Fullscreen graph mode"
              onValueChange={(value) => {
                if (value === 'explore' || value === 'orphans' || value === 'hubs') {
                  setFullscreenMode(value);
                }
              }}
            >
              {Object.entries(FULLSCREEN_MODE_LABELS).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} aria-label={label}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Full screen'}
              onClick={() => void toggleFullscreen(panelRef.current)}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>
        </div>
      </PanelHeader>
      {activeMode === 'explore' ? (
        <GraphView
          activeDocName={activeDocName}
          isFullscreen={isFullscreen}
          className="min-h-0 flex-1"
          onStatsChange={(nodes, links, loading) => {
            if (loading) {
              setStats(null);
              return;
            }
            setStats({ nodes, links });
          }}
        />
      ) : null}
      {isFullscreen && activeMode === 'orphans' ? (
        <FullscreenOrphansView mode={orphanMode} onModeChange={setOrphanMode} />
      ) : null}
      {isFullscreen && activeMode === 'hubs' ? <FullscreenHubsView /> : null}
    </Panel>
  );
}
