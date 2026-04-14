import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GraphView } from '@/components/GraphView';
import { Button } from '@/components/ui/button';
import { Panel, PanelCount, PanelHeader, PanelTitle } from '@/components/ui/panel';

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

  return (
    <Panel ref={panelRef} className={isFullscreen ? 'min-h-[100dvh] bg-background' : undefined}>
      <PanelHeader>
        <PanelTitle>Graph</PanelTitle>
        {stats && (
          <PanelCount>
            {stats.nodes} nodes, {stats.links} links
          </PanelCount>
        )}
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
        className="min-h-0 flex-1"
        onStatsChange={(nodes, links, loading) => {
          if (!loading) setStats({ nodes, links });
        }}
      />
    </Panel>
  );
}
