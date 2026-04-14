import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GraphView } from '@/components/GraphView';
import { Button } from '@/components/ui/button';
import { Panel, PanelCount, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MAX_DEPTH,
  MIN_DEPTH,
  useDirectoryColorDepth,
  useSetDirectoryColorDepth,
} from '@/state/directory-color';

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

  const depth = useDirectoryColorDepth();
  const setDepth = useSetDirectoryColorDepth();

  return (
    <Panel ref={panelRef} className={isFullscreen ? 'min-h-[100dvh] bg-background' : undefined}>
      <PanelHeader>
        <div className="flex min-w-0 items-center gap-2">
          <PanelTitle>Graph</PanelTitle>
          {stats && (
            <div className="flex items-center gap-0.5">
              <PanelCount>{stats.nodes} nodes</PanelCount>
              <PanelCount>{stats.links} links</PanelCount>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-xs text-muted-foreground select-none">Depth</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                aria-label="Decrease directory coloring depth"
                disabled={depth <= MIN_DEPTH}
                onClick={() => setDepth(depth - 1)}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Decrease directory coloring depth</TooltipContent>
          </Tooltip>
          <span className="w-4 text-center text-xs tabular-nums text-muted-foreground select-none">
            {depth}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                aria-label="Increase directory coloring depth"
                disabled={depth >= MAX_DEPTH}
                onClick={() => setDepth(depth + 1)}
              >
                <ChevronUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Increase directory coloring depth</TooltipContent>
          </Tooltip>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Full screen'}
          onClick={() => void toggleFullscreen(panelRef.current)}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </PanelHeader>
      <GraphView
        activeDocName={activeDocName}
        isFullscreen={isFullscreen}
        className="min-h-0 flex-1"
        onStatsChange={(nodes, links, loading) => {
          if (!loading) setStats({ nodes, links });
        }}
      />
    </Panel>
  );
}
