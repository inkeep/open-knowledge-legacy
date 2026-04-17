import { colorFromSeed } from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import { usePageList } from '@/components/PageListContext';
import { hashFromDocName } from '@/lib/doc-hash';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { cn } from '@/lib/utils';
import {
  type ActiveAgent,
  activeAgentsFromNodes,
  anyHaloActive,
  haloAlpha,
  haloPulseScale,
  isHaloActive,
} from './graph-attribution';
import { clusterColor } from './graph-colors';
import { type GraphDiffMarks, hasAnyDiff, linkDiffState, nodeDiffState } from './graph-diff-marks';
import {
  type GraphLabelLayoutLink,
  type GraphLabelLayoutNode,
  type GraphLabelPlacement,
  planGraphLabels,
} from './graph-label-layout';
import { buildGraphLabelDescriptors } from './graph-label-utils';
import {
  type GraphData,
  type GraphDocClickBehavior,
  type GraphLink,
  type GraphNode,
  type GraphNodeSelection,
  type GraphNodeVisualState,
  getGraphNodeCanvasRadius,
  getGraphNodePointerRadius,
  getGraphNodeTooltipLabel,
  getGraphNodeVisualState,
  resolveGraphNodeClickAction,
} from './graph-view-utils';
import { resolveTargetNavigationIntent } from './target-navigation-intent';

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
const BACKGROUND_CLICK_TOLERANCE_PX = 5;

interface FocusState {
  key: string;
  lastX: number | null;
  lastY: number | null;
  lastAt: number;
}

interface GraphNodeHitbox {
  x: number;
  y: number;
  radiusPx: number;
  state: GraphNodeVisualState;
}

interface BackgroundPointerState {
  pointerId: number;
  clientX: number;
  clientY: number;
  target: GraphPointerTarget;
}

type GraphPointerTarget =
  | { kind: 'background' }
  | { kind: 'link' }
  | { kind: 'node'; node: GraphNode };

function getActiveGraphNodeCoords({
  nodes,
  activeDocName,
}: {
  nodes: GraphNode[];
  activeDocName: string;
}): { x: number; y: number } | null {
  const activeNode = nodes.find((node) => node.kind === 'doc' && node.docName === activeDocName) as
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

function drawGraphLabelPlacements({
  ctx,
  placements,
  labelColor,
  chipColor,
  chipBorderColor,
}: {
  ctx: CanvasRenderingContext2D;
  placements: GraphLabelPlacement[];
  labelColor: string;
  chipColor: string;
  chipBorderColor: string;
}): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const placement of placements) {
    const width = placement.rect.right - placement.rect.left;
    const height = placement.rect.bottom - placement.rect.top;

    ctx.fillStyle = chipColor;
    ctx.fillRect(placement.rect.left, placement.rect.top, width, height);

    ctx.strokeStyle = chipBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(placement.rect.left, placement.rect.top, width, height);

    ctx.fillStyle = labelColor;
    ctx.fillText(placement.text, placement.textX, placement.textY);
  }
}

function getGraphNodeHitbox({
  node,
  fg,
  activeDocName,
  selectedNodeId,
  globalScale,
}: {
  node: NodeObject<GraphNode>;
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  activeDocName: string;
  selectedNodeId: string | null;
  globalScale: number;
}): GraphNodeHitbox | null {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') return null;

  const state = getGraphNodeVisualState(node, {
    activeDocName,
    selectedNodeId,
  });
  const screen = fg.graph2ScreenCoords(node.x, node.y);

  return {
    x: screen.x,
    y: screen.y,
    radiusPx: getGraphNodePointerRadius(state, globalScale) * globalScale,
    state,
  };
}

function getLocalPointerPoint({
  clientX,
  clientY,
  container,
}: {
  clientX: number;
  clientY: number;
  container: HTMLElement;
}): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function getGraphNodeAtPoint({
  point,
  fg,
  nodes,
  activeDocName,
  selectedNodeId,
}: {
  point: { x: number; y: number };
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  nodes: GraphNode[];
  activeDocName: string;
  selectedNodeId: string | null;
}): GraphNode | null {
  const globalScale = fg.zoom();
  let closestNode: { node: GraphNode; distance: number } | null = null;

  for (const node of nodes as NodeObject<GraphNode>[]) {
    const hitbox = getGraphNodeHitbox({
      node,
      fg,
      activeDocName,
      selectedNodeId,
      globalScale,
    });
    if (!hitbox) continue;

    const distance = Math.hypot(point.x - hitbox.x, point.y - hitbox.y);
    if (distance > hitbox.radiusPx) continue;
    if (closestNode !== null && distance >= closestNode.distance) continue;

    closestNode = { node, distance };
  }

  return closestNode?.node ?? null;
}

function getLinkEndpointCoords(
  endpoint: string | number | NodeObject<GraphNode> | undefined,
  fg: ForceGraphMethods<NodeObject<GraphNode>>,
): { x: number; y: number } | null {
  if (
    endpoint === undefined ||
    typeof endpoint === 'string' ||
    typeof endpoint === 'number' ||
    typeof endpoint.x !== 'number' ||
    typeof endpoint.y !== 'number'
  ) {
    return null;
  }

  return fg.graph2ScreenCoords(endpoint.x, endpoint.y);
}

function getDistanceToSegmentPx({
  point,
  start,
  end,
}: {
  point: { x: number; y: number };
  start: { x: number; y: number };
  end: { x: number; y: number };
}): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = start.x + projection * dx;
  const projectedY = start.y + projection * dy;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function isGraphLinkAtPoint({
  point,
  fg,
  links,
}: {
  point: { x: number; y: number };
  fg: ForceGraphMethods<NodeObject<GraphNode>>;
  links: GraphLink[];
}): boolean {
  const LINK_HITBOX_PX = 6;

  return (links as LinkObject<GraphNode, GraphLink>[]).some((link) => {
    const start = getLinkEndpointCoords(link.source, fg);
    const end = getLinkEndpointCoords(link.target, fg);
    if (!start || !end) return false;
    return getDistanceToSegmentPx({ point, start, end }) <= LINK_HITBOX_PX;
  });
}

function getGraphLinkEndpointDocName({
  endpoint,
  nodes,
}: {
  endpoint: string | number | NodeObject<GraphNode> | undefined;
  nodes: GraphNode[];
}): string | null {
  if (endpoint === undefined || typeof endpoint === 'number') {
    return null;
  }

  if (typeof endpoint === 'string') {
    const node = nodes.find(
      (candidate): candidate is GraphNode & { kind: 'doc' } =>
        candidate.kind === 'doc' && candidate.id === endpoint,
    );
    return node?.docName ?? null;
  }

  if (endpoint.kind === 'doc') {
    return endpoint.docName;
  }

  return null;
}

function applyGraphNodeClick({
  node,
  docClickBehavior,
  onSelectNode,
}: {
  node: GraphNode;
  docClickBehavior: GraphDocClickBehavior;
  onSelectNode?: (selection: GraphNodeSelection) => void;
}): void {
  const action = resolveGraphNodeClickAction(node, docClickBehavior);

  if (action.kind === 'external') {
    window.open(action.url, '_blank', 'noopener,noreferrer');
    return;
  }

  if (action.kind === 'navigate') {
    window.location.assign(action.hash);
    return;
  }

  onSelectNode?.(action.selection);
}

function handleGraphPointerTapTarget({
  target,
  docClickBehavior,
  selectedNodeId,
  onSelectNode,
  onBackgroundClick,
}: {
  target: GraphPointerTarget;
  docClickBehavior: GraphDocClickBehavior;
  selectedNodeId: string | null;
  onSelectNode?: (selection: GraphNodeSelection) => void;
  onBackgroundClick?: () => void;
}): void {
  if (target.kind === 'background' || target.kind === 'link') {
    onBackgroundClick?.();
    return;
  }

  if (
    docClickBehavior === 'select' &&
    selectedNodeId !== null &&
    target.node.id === selectedNodeId
  ) {
    onBackgroundClick?.();
    return;
  }

  applyGraphNodeClick({
    node: target.node,
    docClickBehavior,
    onSelectNode,
  });
}

export function GraphView({
  activeDocName,
  selectedNodeId = null,
  isFullscreen = false,
  showUrlNodes = true,
  className = '',
  docClickBehavior = 'navigate',
  onSelectNode,
  onBackgroundClick,
  onStatsChange,
  onClustersChange,
  onActiveAgentsChange,
  overrideGraph = null,
  overrideLoading = false,
  overrideError = null,
  diffMarks = null,
}: {
  activeDocName: string;
  selectedNodeId?: string | null;
  isFullscreen?: boolean;
  showUrlNodes?: boolean;
  className?: string;
  docClickBehavior?: GraphDocClickBehavior;
  onSelectNode?: (selection: GraphNodeSelection) => void;
  onBackgroundClick?: () => void;
  onStatsChange?: (nodes: number, links: number, loading: boolean) => void;
  onClustersChange?: (clusters: string[]) => void;
  onActiveAgentsChange?: (agents: ActiveAgent[]) => void;
  /**
   * When non-null, disables the live `/api/link-graph` fetch and renders the
   * supplied snapshot instead. Used by Stage 7 time-travel (GraphTimeline) to
   * display historical or diff-union graphs.
   */
  overrideGraph?: { nodes: GraphNode[]; links: GraphLink[] } | null;
  /** Loading / error flags forwarded for the override source, rendered as the
   * same skeleton/error UI the live source uses. */
  overrideLoading?: boolean;
  overrideError?: string | null;
  /** When non-null and `overrideGraph` is set, per-node/per-link diff marks
   * are rendered as green/red overlays. Must be null when not in diff mode. */
  diffMarks?: GraphDiffMarks | null;
}) {
  // force-graph mutates the objects it receives in-place during layout, so we compare
  // incoming API payloads against separate signatures before replacing graphData.
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [graphSig, setGraphSig] = useState({ nodes: '', links: '' });
  // Signatures of the last-applied API response, stored separately from rendered graph data because
  // force-graph mutates link objects in-place (replacing string IDs with node object refs).
  const lastSigRef = useRef({ nodes: '', links: '' });
  // Kept in lock-step with graphData so `load()` can mutate lastEditedBy on
  // existing node refs without waiting for a React re-render first.
  const graphDataRef = useRef<GraphData>({ nodes: [], links: [] });
  // Attribution-only bump signal: triggers a React re-render so the animation
  // effect below notices there are fresh halos to run.
  const [_attributionTick, setAttributionTick] = useState(0);
  const attributionTickRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>> | undefined>(undefined);
  const focusStateRef = useRef<FocusState>({ key: '', lastX: null, lastY: null, lastAt: 0 });
  const backgroundPointerRef = useRef<BackgroundPointerState | null>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 400 });
  const { resolvedTheme } = useTheme();
  const { folderPaths, loading: pageListLoading, pages } = usePageList();

  const hasOverride = overrideGraph !== null;

  useEffect(() => {
    // Time-travel / diff mode owns the graph payload; skip the live fetch
    // entirely. The override-sync effect below mirrors the parent-supplied
    // graph into the same local state shape.
    if (hasOverride) return;

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
          const next = { nodes: nextNodes, links: nextLinks };
          graphDataRef.current = next;
          setGraphData(next);
          attributionTickRef.current += 1;
          setAttributionTick(attributionTickRef.current);
        } else {
          // Structural sig unchanged — merge only the lastEditedBy attribution
          // into the existing node objects so force-graph keeps its in-place
          // layout state. Touching a ref kicks off the halo animation loop.
          const nextById = new Map<string, GraphNode>();
          for (const n of nextNodes) nextById.set(n.id, n);
          let anyChange = false;
          for (const existing of graphDataRef.current.nodes) {
            if (existing.kind !== 'doc') continue;
            const next = nextById.get(existing.id);
            if (!next || next.kind !== 'doc') continue;
            const prevLe = existing.lastEditedBy;
            const nextLe = next.lastEditedBy;
            const prevTs = prevLe?.timestamp ?? 0;
            const nextTs = nextLe?.timestamp ?? 0;
            if (nextTs !== prevTs) {
              existing.lastEditedBy = nextLe ?? null;
              anyChange = true;
            }
          }
          if (anyChange) {
            attributionTickRef.current += 1;
            setAttributionTick(attributionTickRef.current);
          }
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
  }, [activeDocName, isFullscreen, hasOverride]);

  // Override sync: mirror the parent-supplied historical / diff-union graph
  // into the same local state the live path uses. Signatures change any time
  // the override identity or its structural content changes, which forces a
  // fresh force-graph layout — intentional for time-travel since layout is a
  // visual cue ("step to another checkpoint, graph re-settles").
  useEffect(() => {
    if (!overrideGraph) return;
    const nextNodes = overrideGraph.nodes;
    const nextLinks = overrideGraph.links;
    const nextNodeSig = nextNodes.map((n) => `${n.id}:${n.label}`).join(',');
    const nextLinkSig = nextLinks.map((l) => `${l.source}>${l.target}`).join(',');
    if (nextNodeSig !== lastSigRef.current.nodes || nextLinkSig !== lastSigRef.current.links) {
      lastSigRef.current = { nodes: nextNodeSig, links: nextLinkSig };
      setGraphSig({ nodes: nextNodeSig, links: nextLinkSig });
      const next = { nodes: nextNodes, links: nextLinks };
      graphDataRef.current = next;
      setGraphData(next);
      attributionTickRef.current += 1;
      setAttributionTick(attributionTickRef.current);
    }
    setError(overrideError);
    setLoading(overrideLoading);
  }, [overrideGraph, overrideLoading, overrideError]);

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

  // Halo animation loop: keep painting while any node has a recent edit.
  // The loop stops once all halos fade, avoiding idle rAF churn. Restarts
  // automatically when `attributionTick` bumps (via the deps array).
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    function docNodes(data: GraphData) {
      return data.nodes.filter((n): n is GraphNode & { kind: 'doc' } => n.kind === 'doc');
    }
    function tick() {
      if (cancelled) return;
      const fg = fgRef.current as unknown as { refresh?: () => void } | undefined;
      const data = graphDataRef.current;
      if (!fg || data.nodes.length === 0) return;
      const now = Date.now();
      if (typeof fg.refresh === 'function') fg.refresh();
      if (anyHaloActive(docNodes(data), now)) {
        raf = requestAnimationFrame(tick);
      }
    }
    const now = Date.now();
    if (anyHaloActive(docNodes(graphDataRef.current), now)) {
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const isDark = resolvedTheme === 'dark';
  const bgColor = isDark ? 'hsl(0 0% 4%)' : 'hsl(0 0% 100%)';
  const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
  const activeNodeColor = isDark ? '#69a3ff' : '#3784ff';
  const selectedNodeColor = isDark ? '#34d399' : '#059669';
  const activeSelectedNodeColor = isDark ? '#c084fc' : '#7c3aed';
  const externalNodeColor = isDark ? '#f59e0b' : '#c2410c';
  const folderNodeColor = isDark ? '#a78bfa' : '#7c3aed';
  const diffAddedColor = isDark ? '#34d399' : '#10b981';
  const diffRemovedColor = isDark ? '#f87171' : '#ef4444';
  const diffAddedLinkColor = isDark ? 'rgba(52,211,153,0.85)' : 'rgba(16,185,129,0.85)';
  const diffRemovedLinkColor = isDark ? 'rgba(248,113,113,0.85)' : 'rgba(239,68,68,0.85)';
  const diffActive = hasAnyDiff(diffMarks);
  const edgeColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)';
  const labelColor = isDark ? '#f3f4f6' : '#111827';
  const activeNodeRingColor = isDark ? 'rgba(105,163,255,0.45)' : 'rgba(55,132,255,0.3)';
  const folderNodeRingColor = isDark ? 'rgba(167,139,250,0.38)' : 'rgba(124,58,237,0.22)';
  const selectedNodeRingColor = isDark ? 'rgba(52,211,153,0.5)' : 'rgba(5,150,105,0.3)';
  const activeSelectedNodeRingColor = isDark ? 'rgba(192,132,252,0.5)' : 'rgba(124,58,237,0.35)';
  const labelChipColor = isDark ? 'rgba(3,7,18,0.92)' : 'rgba(255,255,255,0.94)';
  const labelChipBorderColor = isDark ? 'rgba(243,244,246,0.08)' : 'rgba(17,24,39,0.08)';
  const focusZoom = isFullscreen ? 1.6 : 2.35;
  const maxLabelWidthPx = isFullscreen ? 220 : 150;
  // Fullscreen shows the whole project graph, so it intentionally uses a tighter
  // label budget than the docked 2-hop neighborhood view to avoid flooding.
  const maxVisibleLabels = isFullscreen ? 10 : 18;

  const externalNodeIds = showUrlNodes
    ? null
    : new Set(graphData.nodes.filter((n) => n.kind === 'external').map((n) => n.id));
  const displayNodes = externalNodeIds
    ? graphData.nodes.filter((n) => n.kind !== 'external')
    : graphData.nodes;
  const displayLinks = externalNodeIds
    ? graphData.links.filter((l) => {
        // force-graph mutates source/target from string IDs to node object refs after the
        // first simulation tick, so we must handle both forms when checking for external nodes.
        const src = l.source as unknown;
        const tgt = l.target as unknown;
        const srcId =
          typeof src === 'string'
            ? src
            : src !== null && typeof src === 'object' && 'id' in src
              ? String((src as { id: unknown }).id)
              : '';
        const tgtId =
          typeof tgt === 'string'
            ? tgt
            : tgt !== null && typeof tgt === 'object' && 'id' in tgt
              ? String((tgt as { id: unknown }).id)
              : '';
        return !externalNodeIds.has(srcId) && !externalNodeIds.has(tgtId);
      })
    : graphData.links;
  const displayData: GraphData = externalNodeIds
    ? { nodes: displayNodes, links: displayLinks }
    : graphData;

  const layoutNodes = displayData.nodes as GraphLabelLayoutNode[];
  const layoutLinks = displayData.links as GraphLabelLayoutLink[];
  const labelDescriptors = buildGraphLabelDescriptors(displayData.nodes);
  const focusKey = `${activeDocName}|${focusZoom}|${graphSig.nodes}|${graphSig.links}`;
  const navigationIntentByNodeId = new Map(
    graphData.nodes.flatMap((node) => {
      if (node.kind !== 'doc') return [];
      const navigationIntent = pageListLoading
        ? {
            displayState: 'doc' as const,
            hashDocName: node.docName,
          }
        : resolveTargetNavigationIntent(node.docName, {
            pages,
            folderPaths,
          });
      return [[node.id, navigationIntent] as const];
    }),
  );

  // Stats feed a primitive-valued badge — depend on the COUNTS (primitives)
  // rather than the `displayData` object identity. When the time-travel
  // controller returns a fresh `overrideGraph` reference every render,
  // `displayData` gets a new identity every render even though the underlying
  // counts don't change; depending on the object would then feed `setStats`
  // in a loop via the parent re-render it triggers. See bug trace in
  // `specs/2026-04-16-graph-demo-iteration-loop/evidence/timetravel-render-loop.md`.
  const displayNodeCount = displayData.nodes.length;
  const displayLinkCount = displayData.links.length;
  useEffect(() => {
    onStatsChange?.(displayNodeCount, displayLinkCount, loading);
  }, [displayNodeCount, displayLinkCount, loading, onStatsChange]);

  useEffect(() => {
    if (!onClustersChange) return;
    const seen = new Set<string>();
    for (const node of graphData.nodes) {
      if (node.kind === 'doc' && node.cluster) {
        seen.add(node.cluster);
      }
    }
    onClustersChange(Array.from(seen).sort());
  }, [graphData, onClustersChange]);

  // Active-agent legend: recompute from the latest graphData and from a
  // 1-Hz ticker so pills disappear once they fall outside ACTIVE_AGENT_WINDOW_MS
  // even if no new edit arrives. attributionTick ensures halo-only updates also
  // refresh the legend.
  useEffect(() => {
    if (!onActiveAgentsChange) return;
    const emit = () => {
      const docs = graphData.nodes.filter(
        (n): n is GraphNode & { kind: 'doc' } => n.kind === 'doc',
      );
      onActiveAgentsChange(activeAgentsFromNodes(docs, Date.now()));
    };
    emit();
    const id = window.setInterval(emit, 1000);
    return () => window.clearInterval(id);
  }, [graphData, onActiveAgentsChange]);

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

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const harness = {
      clickDoc(docName: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'doc' } =>
            candidate.kind === 'doc' && candidate.docName === docName,
        );
        if (!node) return false;
        applyGraphNodeClick({
          node,
          docClickBehavior,
          onSelectNode,
        });
        return true;
      },
      clickBackground() {
        if (!onBackgroundClick) return false;
        onBackgroundClick();
        return true;
      },
      clickExternal(url: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'external' } =>
            candidate.kind === 'external' && candidate.url === url,
        );
        if (!node) return false;
        applyGraphNodeClick({
          node,
          docClickBehavior,
          onSelectNode,
        });
        return true;
      },
      getNodeVisualState(docName: string) {
        const node = displayData.nodes.find(
          (candidate): candidate is GraphNode & { kind: 'doc' } =>
            candidate.kind === 'doc' && candidate.docName === docName,
        );
        if (!node) return null;
        return getGraphNodeVisualState(node, {
          activeDocName,
          selectedNodeId,
        });
      },
      getNodeClickPoint(nodeKey: string) {
        const fg = fgRef.current;
        if (!fg) return null;

        const node = displayData.nodes.find(
          (candidate): candidate is NodeObject<GraphNode> =>
            ('docName' in candidate && candidate.docName === nodeKey) ||
            ('url' in candidate && candidate.url === nodeKey) ||
            candidate.id === nodeKey,
        );
        if (!node) return null;

        const hitbox = getGraphNodeHitbox({
          node,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
        });
        if (!hitbox) return null;

        return {
          x: hitbox.x,
          y: hitbox.y,
        };
      },
      getLayoutMetrics() {
        return {
          graphHeight:
            containerRef.current
              ?.querySelector<HTMLElement>('[role="img"]')
              ?.getBoundingClientRect().height ?? 0,
          containerHeight: containerRef.current?.getBoundingClientRect().height ?? 0,
          availableHeight: containerRef.current?.parentElement?.getBoundingClientRect().height ?? 0,
        };
      },
      getLinkClickPoint(sourceDocName: string, targetDocName: string) {
        const fg = fgRef.current;
        if (!fg) return null;

        const link = (displayData.links as LinkObject<GraphNode, GraphLink>[]).find((candidate) => {
          const source = getGraphLinkEndpointDocName({
            endpoint: candidate.source,
            nodes: displayData.nodes,
          });
          const target = getGraphLinkEndpointDocName({
            endpoint: candidate.target,
            nodes: displayData.nodes,
          });
          return source === sourceDocName && target === targetDocName;
        });
        if (!link) return null;

        const sourceNode =
          typeof link.source === 'object' && link.source !== null ? link.source : undefined;
        const targetNode =
          typeof link.target === 'object' && link.target !== null ? link.target : undefined;
        if (!sourceNode || !targetNode) return null;

        const sourceHitbox = getGraphNodeHitbox({
          node: sourceNode,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
        });
        const targetHitbox = getGraphNodeHitbox({
          node: targetNode,
          fg,
          activeDocName,
          selectedNodeId,
          globalScale: fg.zoom(),
        });
        if (!sourceHitbox || !targetHitbox) return null;

        const dx = targetHitbox.x - sourceHitbox.x;
        const dy = targetHitbox.y - sourceHitbox.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;

        const sourceOffset = sourceHitbox.radiusPx + 8;
        const targetOffset = targetHitbox.radiusPx + 8;
        const usableLength = Math.max(length - sourceOffset - targetOffset, 0);
        const distanceFromSource = sourceOffset + usableLength / 2;
        const unitX = dx / length;
        const unitY = dy / length;

        return {
          x: sourceHitbox.x + unitX * distanceFromSource,
          y: sourceHitbox.y + unitY * distanceFromSource,
        };
      },
    };

    window.__graphHarness = harness;
    return () => {
      if (window.__graphHarness === harness) {
        delete window.__graphHarness;
      }
    };
  }, [
    activeDocName,
    docClickBehavior,
    displayData.links,
    displayData.nodes,
    onBackgroundClick,
    onSelectNode,
    selectedNodeId,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full min-h-0 overflow-hidden', className)}
      onPointerCancel={() => {
        backgroundPointerRef.current = null;
      }}
      onPointerDownCapture={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          backgroundPointerRef.current = null;
          return;
        }
        backgroundPointerRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          target: (() => {
            const container = containerRef.current;
            const fg = fgRef.current;
            if (!container || !fg) {
              return { kind: 'background' } satisfies GraphPointerTarget;
            }

            const point = getLocalPointerPoint({
              clientX: event.clientX,
              clientY: event.clientY,
              container,
            });
            const node = getGraphNodeAtPoint({
              point,
              fg,
              nodes: displayData.nodes,
              activeDocName,
              selectedNodeId,
            });
            if (node) {
              return { kind: 'node', node } satisfies GraphPointerTarget;
            }
            if (
              isGraphLinkAtPoint({
                point,
                fg,
                links: displayData.links,
              })
            ) {
              return { kind: 'link' } satisfies GraphPointerTarget;
            }
            return { kind: 'background' } satisfies GraphPointerTarget;
          })(),
        };
      }}
      onPointerUpCapture={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          backgroundPointerRef.current = null;
          return;
        }

        const pointerDown = backgroundPointerRef.current;
        backgroundPointerRef.current = null;
        if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;

        const travelPx = Math.hypot(
          event.clientX - pointerDown.clientX,
          event.clientY - pointerDown.clientY,
        );
        if (travelPx > BACKGROUND_CLICK_TOLERANCE_PX) return;

        handleGraphPointerTapTarget({
          target: pointerDown.target,
          docClickBehavior,
          selectedNodeId,
          onSelectNode,
          onBackgroundClick,
        });
      }}
    >
      {error ? (
        <p className="p-4 text-sm text-destructive">{error}</p>
      ) : displayData.nodes.length === 0 && !loading ? (
        <p className="p-4 text-sm text-muted-foreground">
          No links yet. Add wiki links or markdown links to build a graph.
        </p>
      ) : (
        <div
          className="h-full min-h-0"
          role="img"
          aria-label="Graph visualization of document links"
        >
          <ForceGraph2D
            ref={fgRef}
            graphData={displayData}
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
            }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={bgColor}
            nodeId="id"
            nodeLabel={(node: NodeObject<GraphNode>) => {
              const label = getGraphNodeTooltipLabel(node);
              if (node.kind !== 'doc') return label;
              return navigationIntentByNodeId.get(node.id)?.displayState === 'folder'
                ? `Folder: ${label}`
                : label;
            }}
            nodeRelSize={4}
            nodeVal={(node: NodeObject<GraphNode>) => {
              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });

              if (state === 'active-selected') return 20;
              if (state === 'active') return 18;
              if (state === 'selected' || state === 'external-selected') return 12;
              return 6;
            }}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={(
              node: NodeObject<GraphNode>,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;

              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });
              const isFolderTarget =
                node.kind === 'doc' &&
                navigationIntentByNodeId.get(node.id)?.displayState === 'folder';
              const nodeRadius = getGraphNodeCanvasRadius(state);
              const pointerRadius = getGraphNodePointerRadius(state, globalScale);

              const docCluster = node.kind === 'doc' ? node.cluster : undefined;
              const clusterFill = docCluster ? clusterColor(docCluster, isDark) : defaultNodeColor;

              // Diff overlay: dim unchanged nodes so added/removed stand out.
              // Removed nodes fade further; added are full-opacity so they
              // visually "pop" as the thing that got introduced.
              const diffState = diffActive ? nodeDiffState(node.id, diffMarks) : 'none';
              ctx.save();
              if (diffState === 'unchanged') ctx.globalAlpha = 0.45;
              else if (diffState === 'removed') ctx.globalAlpha = 0.55;

              ctx.beginPath();
              ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
              ctx.fillStyle =
                state === 'active'
                  ? activeNodeColor
                  : state === 'selected'
                    ? selectedNodeColor
                    : state === 'active-selected'
                      ? activeSelectedNodeColor
                      : state === 'external' || state === 'external-selected'
                        ? externalNodeColor
                        : isFolderTarget
                          ? folderNodeColor
                          : clusterFill;
              ctx.fill();

              if (pointerRadius > nodeRadius) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, pointerRadius, 0, 2 * Math.PI, false);
                ctx.strokeStyle =
                  state === 'active'
                    ? activeNodeRingColor
                    : state === 'selected' || state === 'external-selected'
                      ? selectedNodeRingColor
                      : activeSelectedNodeRingColor;
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              } else if (isFolderTarget) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius + 2 / globalScale, 0, 2 * Math.PI, false);
                ctx.strokeStyle = folderNodeRingColor;
                ctx.lineWidth = 1.5 / globalScale;
                ctx.stroke();
              }

              // Agent-attribution halo (Stage 6). Rendered after the base
              // node + interaction rings so it overlays the other indicators.
              // Suppressed in diff mode so the green/red diff halos are not
              // visually drowned out by the agent colour ring.
              if (
                !diffActive &&
                node.kind === 'doc' &&
                isHaloActive(node.lastEditedBy, Date.now())
              ) {
                const le = node.lastEditedBy;
                if (le) {
                  const now = Date.now();
                  const alpha = haloAlpha(le, now);
                  const pulse = haloPulseScale(le, now);
                  const haloColor = colorFromSeed(le.colorSeed);
                  const baseInset = 4 / globalScale;
                  const haloRadius = nodeRadius + baseInset * pulse;
                  ctx.save();
                  ctx.globalAlpha = alpha;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, haloRadius, 0, 2 * Math.PI, false);
                  ctx.strokeStyle = haloColor;
                  ctx.lineWidth = 2.2 / globalScale;
                  ctx.stroke();
                  // Second, larger ring for a softer glow.
                  ctx.globalAlpha = alpha * 0.35;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, haloRadius + 2.5 / globalScale, 0, 2 * Math.PI, false);
                  ctx.lineWidth = 1.2 / globalScale;
                  ctx.stroke();
                  ctx.restore();
                }
              }

              ctx.restore();

              // Diff halo (Stage 7). Drawn OUTSIDE the dim-alpha save/restore
              // block so added/removed rings render at full opacity regardless
              // of the underlying node's diff fading.
              if (diffState === 'added' || diffState === 'removed') {
                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius + 3 / globalScale, 0, 2 * Math.PI, false);
                ctx.strokeStyle = diffState === 'added' ? diffAddedColor : diffRemovedColor;
                ctx.lineWidth = 2.2 / globalScale;
                if (diffState === 'removed') {
                  ctx.setLineDash([3 / globalScale, 2 / globalScale]);
                }
                ctx.stroke();
                ctx.restore();
              }
            }}
            nodePointerAreaPaint={(
              node: NodeObject<GraphNode>,
              color: string,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
              const state = getGraphNodeVisualState(node, {
                activeDocName,
                selectedNodeId,
              });
              ctx.beginPath();
              ctx.arc(
                node.x,
                node.y,
                getGraphNodePointerRadius(state, globalScale),
                0,
                2 * Math.PI,
                false,
              );
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              if (globalScale < 1.8) return;

              const fg = fgRef.current;
              if (!fg) return;

              ctx.save();
              // force-graph keeps the graph transform active during frame hooks; reset to
              // CSS-pixel space so placement math and text rendering share one coordinate system.
              const pxRatio = window.devicePixelRatio || 1;
              ctx.setTransform(pxRatio, 0, 0, pxRatio, 0, 0);
              ctx.font = '10px system-ui, sans-serif';

              const placements = planGraphLabels({
                nodes: layoutNodes,
                links: layoutLinks,
                activeDocName,
                viewport: dimensions,
                maxLabels: maxVisibleLabels,
                maxLabelWidthPx,
                labelDescriptors,
                measureTextWidthPx: (text) => ctx.measureText(text).width,
                projectToScreen: (x, y) => fg.graph2ScreenCoords(x, y),
                getNodeRadiusPx: (node) => {
                  const state = getGraphNodeVisualState(node, {
                    activeDocName,
                    selectedNodeId,
                  });
                  return getGraphNodePointerRadius(state, globalScale) * globalScale + 4;
                },
              });

              drawGraphLabelPlacements({
                ctx,
                placements,
                labelColor,
                chipColor: labelChipColor,
                chipBorderColor: labelChipBorderColor,
              });
              ctx.restore();
            }}
            linkColor={(link: GraphLink) => {
              if (!diffActive) return edgeColor;
              const state = linkDiffState(link, diffMarks);
              if (state === 'added') return diffAddedLinkColor;
              if (state === 'removed') return diffRemovedLinkColor;
              return edgeColor;
            }}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkWidth={(link: GraphLink) => {
              if (!diffActive) return 1;
              const state = linkDiffState(link, diffMarks);
              return state === 'added' || state === 'removed' ? 1.75 : 1;
            }}
            showPointerCursor={(obj) => Boolean(obj && 'kind' in obj)}
            onNodeClick={(node: NodeObject<GraphNode>) => {
              if (node.kind === 'external') {
                window.open(node.url, '_blank', 'noopener,noreferrer');
                return;
              }
              if (node.docName) {
                const navigationIntent = navigationIntentByNodeId.get(node.id);
                window.location.assign(
                  hashFromDocName(
                    navigationIntent?.hashDocName ?? node.docName,
                    node.anchor ?? null,
                  ),
                );
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
