import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';

import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';
import { buildGraphLabelDescriptors, pickGraphLabelText } from './graph-label-utils';
import type { GraphData, GraphLink, GraphNode } from './graph-view-utils';

interface LinkGraphResponse {
  ok: boolean;
  nodes?: GraphNode[];
  links?: GraphLink[];
  error?: string;
}

const FOCUS_ANIMATION_MS = 350;
const FOCUS_RETRY_INTERVAL_MS = 120;
const FOCUS_RETRY_DISTANCE_PX = 18;
const FINAL_SETTLE_DRIFT_PX = 28;

interface FocusState {
  key: string;
  lastX: number | null;
  lastY: number | null;
  lastAt: number;
}

function getActiveGraphNodeCoords({
  nodes,
  activeDocName,
}: {
  nodes: GraphNode[];
  activeDocName: string;
}): { x: number; y: number } | null {
  const activeNode = nodes.find((node) => node.id === activeDocName) as
    | NodeObject<GraphNode>
    | undefined;
  if (typeof activeNode?.x !== 'number' || typeof activeNode?.y !== 'number') return null;
  return { x: activeNode.x, y: activeNode.y };
}

function shouldRunFinalSettle({
  fg,
  coords,
  dimensions,
}: {
  fg: ForceGraphMethods<NodeObject<GraphNode>> | undefined;
  coords: { x: number; y: number } | null;
  dimensions: { width: number; height: number };
}): boolean {
  if (!fg || !coords || dimensions.width <= 0 || dimensions.height <= 0) return false;

  const screen = fg.graph2ScreenCoords(coords.x, coords.y);
  const drift = Math.hypot(screen.x - dimensions.width / 2, screen.y - dimensions.height / 2);

  return drift >= FINAL_SETTLE_DRIFT_PX;
}

function maybeFocusActiveGraphNode({
  fg,
  nodes,
  activeDocName,
  zoom,
  focusKey,
  focusState,
  force = false,
  durationMs = FOCUS_ANIMATION_MS,
}: {
  fg: ForceGraphMethods<NodeObject<GraphNode>> | undefined;
  nodes: GraphNode[];
  activeDocName: string;
  zoom: number;
  focusKey: string;
  focusState: FocusState;
  force?: boolean;
  durationMs?: number;
}): FocusState {
  const now = Date.now();
  let nextState = focusState;

  if (nextState.key !== focusKey) {
    nextState = {
      key: focusKey,
      lastX: null,
      lastY: null,
      lastAt: 0,
    };
  } else if (!force && now - nextState.lastAt < FOCUS_RETRY_INTERVAL_MS) {
    return nextState;
  }

  const coords = getActiveGraphNodeCoords({
    nodes,
    activeDocName,
  });
  if (!coords) return nextState;

  const distance =
    nextState.lastX === null || nextState.lastY === null
      ? Number.POSITIVE_INFINITY
      : Math.hypot(coords.x - nextState.lastX, coords.y - nextState.lastY);

  if (!force && distance < FOCUS_RETRY_DISTANCE_PX && nextState.lastAt !== 0) {
    return {
      ...nextState,
      lastAt: now,
    };
  }

  if (!fg) return nextState;

  fg.centerAt(coords.x, coords.y, durationMs);
  if (Math.abs(fg.zoom() - zoom) > 0.01) {
    fg.zoom(zoom, durationMs);
  }

  return {
    key: focusKey,
    lastX: coords.x,
    lastY: coords.y,
    lastAt: now,
  };
}

export function GraphView({
  activeDocName,
  isFullscreen = false,
  className = '',
  onStatsChange,
}: {
  activeDocName: string;
  isFullscreen?: boolean;
  className?: string;
  onStatsChange?: (nodes: number, links: number, loading: boolean) => void;
}) {
  // force-graph mutates the objects it receives in-place during layout, so we compare
  // incoming API payloads against separate signatures before replacing graphData.
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [graphSig, setGraphSig] = useState({ nodes: '', links: '' });
  // Signatures of the last-applied API response, stored separately from rendered graph data because
  // force-graph mutates link objects in-place (replacing string IDs with node object refs).
  const lastSigRef = useRef({ nodes: '', links: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>> | undefined>(undefined);
  const focusStateRef = useRef<FocusState>({ key: '', lastX: null, lastY: null, lastAt: 0 });
  const [dimensions, setDimensions] = useState({ width: 320, height: 400 });
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (!isFullscreen && activeDocName) {
          params.set('docName', activeDocName);
          params.set('degrees', '2');
        }
        const url = params.size > 0 ? `/api/link-graph?${params.toString()}` : '/api/link-graph';
        const res = await fetch(url);
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
        const nextNodeSig = nextNodes.map((n) => `${n.id}:${n.label}`).join(',');
        const nextLinkSig = nextLinks.map((l) => `${l.source}>${l.target}`).join(',');
        if (nextNodeSig !== lastSigRef.current.nodes || nextLinkSig !== lastSigRef.current.links) {
          lastSigRef.current = { nodes: nextNodeSig, links: nextLinkSig };
          setGraphSig({ nodes: nextNodeSig, links: nextLinkSig });
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
  }, [activeDocName, isFullscreen]);

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
  const activeNodeRingColor = isDark ? 'rgba(105,163,255,0.45)' : 'rgba(55,132,255,0.3)';
  const focusZoom = isFullscreen ? 1.6 : 2.35;
  const maxLabelWidthPx = isFullscreen ? 220 : 150;
  const labelDescriptors = buildGraphLabelDescriptors(graphData.nodes);
  const focusKey = `${activeDocName}|${focusZoom}|${graphSig.nodes}|${graphSig.links}`;

  useEffect(() => {
    onStatsChange?.(graphData.nodes.length, graphData.links.length, loading);
  }, [graphData, loading, onStatsChange]);

  useEffect(() => {
    focusStateRef.current = {
      key: focusKey,
      lastX: null,
      lastY: null,
      lastAt: 0,
    };
    const animationFrame = window.requestAnimationFrame(() => {
      focusStateRef.current = maybeFocusActiveGraphNode({
        fg: fgRef.current,
        nodes: graphData.nodes,
        activeDocName,
        zoom: focusZoom,
        focusKey,
        focusState: focusStateRef.current,
        force: true,
      });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusKey, activeDocName, focusZoom, graphData.nodes]);

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
            onEngineTick={() => {
              focusStateRef.current = maybeFocusActiveGraphNode({
                fg: fgRef.current,
                nodes: graphData.nodes,
                activeDocName,
                zoom: focusZoom,
                focusKey,
                focusState: focusStateRef.current,
              });
            }}
            onEngineStop={() => {
              const coords = getActiveGraphNodeCoords({
                nodes: graphData.nodes,
                activeDocName,
              });
              if (
                shouldRunFinalSettle({
                  fg: fgRef.current,
                  coords,
                  dimensions,
                })
              ) {
                focusStateRef.current = maybeFocusActiveGraphNode({
                  fg: fgRef.current,
                  nodes: graphData.nodes,
                  activeDocName,
                  zoom: focusZoom,
                  focusKey,
                  focusState: focusStateRef.current,
                  force: true,
                });
              }
              fgRef.current?.pauseAnimation();
            }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={bgColor}
            nodeId="id"
            nodeLabel={(node: NodeObject<GraphNode>) => node.label ?? node.id ?? ''}
            nodeRelSize={4}
            nodeVal={(node: NodeObject<GraphNode>) => (node.id === activeDocName ? 18 : 6)}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(
              node: NodeObject<GraphNode>,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
              const isActive = node.id === activeDocName;
              const nodeRadius = isActive ? 8 : 5;

              ctx.beginPath();
              ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
              ctx.fillStyle = isActive ? activeNodeColor : defaultNodeColor;
              ctx.fill();

              if (isActive) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius + 2 / globalScale, 0, 2 * Math.PI, false);
                ctx.strokeStyle = activeNodeRingColor;
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              }

              if (globalScale < 1.8) return;
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px system-ui, sans-serif`;
              const label = pickGraphLabelText(
                typeof node.id === 'string' ? labelDescriptors.get(node.id) : undefined,
                maxLabelWidthPx,
                (text) => ctx.measureText(text).width * globalScale,
              );
              if (!label) return;
              ctx.fillStyle = labelColor;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(label, node.x, node.y + nodeRadius + 2);
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
