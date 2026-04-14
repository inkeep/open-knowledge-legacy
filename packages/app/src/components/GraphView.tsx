import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';

import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';

interface GraphNode {
  id: string;
  label: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface LinkGraphResponse {
  ok: boolean;
  nodes?: GraphNode[];
  links?: GraphLink[];
  error?: string;
}

export function GraphView({
  activeDocName,
  className = '',
  onStatsChange,
}: {
  activeDocName: string;
  className?: string;
  onStatsChange?: (nodes: number, links: number, loading: boolean) => void;
}) {
  // Single atomic state — graphData reference only changes when content changes,
  // preventing force-graph's onFinishUpdate from re-firing its auto-zoom on every render.
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  // Signatures of the last-applied API response, stored separately from graphData because
  // force-graph mutates link objects in-place (replacing string IDs with node object refs),
  // which would corrupt a comparison against the live graphData.links array.
  const lastSigRef = useRef({ nodes: '', links: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>> | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 320, height: 400 });
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/link-graph');
        if (!res.ok) {
          if (cancelled) return;
          setError(`Server error: ${res.status}`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as LinkGraphResponse;
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error ?? 'Failed to load graph');
          setLoading(false);
          return;
        }
        const nextNodes = data.nodes ?? [];
        const nextLinks = data.links ?? [];
        const nextNodeSig = nextNodes.map((n) => n.id).join(',');
        const nextLinkSig = nextLinks.map((l) => `${l.source}>${l.target}`).join(',');
        if (nextNodeSig !== lastSigRef.current.nodes || nextLinkSig !== lastSigRef.current.links) {
          lastSigRef.current = { nodes: nextNodeSig, links: nextLinkSig };
          setGraphData({ nodes: nextNodes, links: nextLinks });
          onStatsChange?.(nextNodes.length, nextLinks.length, false);
        }
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load graph');
        setLoading(false);
      }
    }

    onStatsChange?.(0, 0, true);
    setLoading(true);
    void load();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files') || channels.includes('graph')) {
        void load();
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, [onStatsChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const isDark = resolvedTheme === 'dark';
  const bgColor = isDark ? 'hsl(0 0% 4%)' : 'hsl(0 0% 100%)';
  const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
  const activeNodeColor = isDark ? '#69a3ff' : '#3784ff';
  const edgeColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)';
  const labelColor = isDark ? '#f3f4f6' : '#111827';

  return (
    <div ref={containerRef} className={cn('min-h-0 overflow-hidden', className)}>
      {error ? (
        <p className="p-4 text-sm text-destructive">{error}</p>
      ) : graphData.nodes.length === 0 && !loading ? (
        <p className="p-4 text-sm text-muted-foreground">
          No links yet. Add {'[[wikilinks]]'} to build a graph.
        </p>
      ) : (
        <div
          className="h-full min-h-0"
          role="img"
          aria-label="Graph visualization of document links"
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            cooldownTicks={150}
            onEngineStop={() => fgRef.current?.pauseAnimation()}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={bgColor}
            nodeId="id"
            nodeLabel="label"
            nodeRelSize={4}
            nodeColor={(node: NodeObject<GraphNode>) =>
              node.id === activeDocName ? activeNodeColor : defaultNodeColor
            }
            nodeCanvasObjectMode={() => 'after'}
            nodeCanvasObject={(
              node: NodeObject<GraphNode>,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (globalScale < 1.8 || !node.x || !node.y) return;
              const label = node.label ?? node.id ?? '';
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              ctx.fillStyle = labelColor;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(label, node.x, node.y + 5);
            }}
            linkColor={() => edgeColor}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkWidth={1}
            onNodeClick={(node: NodeObject<GraphNode>) => {
              if (node.id) window.location.hash = `#/${node.id}`;
            }}
          />
        </div>
      )}
    </div>
  );
}
