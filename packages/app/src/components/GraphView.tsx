import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';

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
}: {
  activeDocName: string;
  className?: string;
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
        }
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load graph');
        setLoading(false);
      }
    }

    setLoading(true);
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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
  const activeNodeColor = '#8b5cf6';
  const edgeColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)';
  const labelColor = isDark ? '#f3f4f6' : '#111827';

  return (
    <section className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="border-b border-border/60 px-4 py-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Graph</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading
            ? 'Loading…'
            : `${graphData.nodes.length} ${graphData.nodes.length === 1 ? 'page' : 'pages'}, ${graphData.links.length} ${graphData.links.length === 1 ? 'link' : 'links'}`}
        </p>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
        {error ? (
          <p className="p-4 text-sm text-destructive">{error}</p>
        ) : graphData.nodes.length === 0 && !loading ? (
          <p className="p-4 text-sm text-muted-foreground">
            No links yet. Add {'[[wikilinks]]'} to build a graph.
          </p>
        ) : (
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
        )}
      </div>
    </section>
  );
}
