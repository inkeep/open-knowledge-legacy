import { hashFromDocName } from '@/lib/doc-hash';

export interface DocGraphNode {
  kind: 'doc';
  id: string;
  label: string;
  docName: string;
  anchor: string | null;
  cluster?: string | null;
  category?: string | null;
  tags?: string[] | null;
}

export interface ExternalGraphNode {
  kind: 'external';
  id: string;
  label: string;
  url: string;
}

export type GraphNode = DocGraphNode | ExternalGraphNode;

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

type GraphDocSelection = Pick<DocGraphNode, 'docName' | 'label' | 'anchor'>;
export type GraphNodeSelection =
  | ({
      kind: 'doc';
    } & Pick<DocGraphNode, 'id' | 'docName' | 'label' | 'anchor'>)
  | ({
      kind: 'external';
    } & Pick<ExternalGraphNode, 'id' | 'label' | 'url'>);

export type GraphDocClickBehavior = 'navigate' | 'select';
export type GraphNodeVisualState =
  | 'default'
  | 'active'
  | 'selected'
  | 'active-selected'
  | 'external-selected'
  | 'external';

const DEFAULT_GRAPH_NODE_RADIUS = 5;
const SELECTED_GRAPH_NODE_RADIUS = 7;
const ACTIVE_GRAPH_NODE_RADIUS = 8;

type GraphNodeClickAction =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; hash: string }
  | { kind: 'select'; selection: GraphNodeSelection };

export function getGraphNodeTooltipLabel(node: GraphNode): string {
  if (node.kind === 'external') return node.url;

  const title = node.label ?? node.id;
  const hasMetadata = node.cluster || node.category || (node.tags && node.tags.length > 0);
  if (!hasMetadata) return title;

  const lines: string[] = [
    `<div style="font-weight:600;font-size:14px;color:#f1f5f9;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(148,163,184,0.3)">${escapeHtml(title)}</div>`,
  ];

  if (node.cluster) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9;margin-bottom:2px"><span style="color:#cbd5e1">cluster:</span> ${escapeHtml(node.cluster)}</div>`,
    );
  }
  if (node.category) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9;margin-bottom:2px"><span style="color:#cbd5e1">category:</span> ${escapeHtml(node.category)}</div>`,
    );
  }
  if (node.tags && node.tags.length > 0) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9"><span style="color:#cbd5e1">tags:</span> ${node.tags.map(escapeHtml).join(', ')}</div>`,
    );
  }

  return lines.join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getGraphNodeVisualState(
  node: GraphNode,
  {
    activeDocName,
    selectedNodeId,
  }: {
    activeDocName: string;
    selectedNodeId: string | null;
  },
): GraphNodeVisualState {
  const isSelected = selectedNodeId !== null && node.id === selectedNodeId;

  if (node.kind === 'external') {
    return isSelected ? 'external-selected' : 'external';
  }

  const isActive = node.docName === activeDocName;

  if (isActive && isSelected) {
    return 'active-selected';
  }
  if (isActive) {
    return 'active';
  }
  if (isSelected) {
    return 'selected';
  }
  return 'default';
}

export function getGraphNodeCanvasRadius(state: GraphNodeVisualState): number {
  if (state === 'active' || state === 'active-selected') {
    return ACTIVE_GRAPH_NODE_RADIUS;
  }
  if (state === 'selected' || state === 'external-selected') {
    return SELECTED_GRAPH_NODE_RADIUS;
  }
  return DEFAULT_GRAPH_NODE_RADIUS;
}

export function getGraphNodePointerRadius(
  state: GraphNodeVisualState,
  globalScale: number,
): number {
  const baseRadius = getGraphNodeCanvasRadius(state);
  if (
    state === 'active' ||
    state === 'selected' ||
    state === 'active-selected' ||
    state === 'external-selected'
  ) {
    return baseRadius + 2 / Math.max(globalScale, 0.01);
  }
  return baseRadius;
}

export function getHashForGraphDocSelection(selection: GraphDocSelection): string {
  return hashFromDocName(selection.docName, selection.anchor);
}

export function resolveGraphNodeClickAction(
  node: GraphNode,
  docClickBehavior: GraphDocClickBehavior,
): GraphNodeClickAction {
  if (node.kind === 'external') {
    if (docClickBehavior === 'select') {
      return {
        kind: 'select',
        selection: {
          kind: 'external',
          id: node.id,
          label: node.label,
          url: node.url,
        },
      };
    }
    return { kind: 'external', url: node.url };
  }

  if (docClickBehavior === 'select') {
    return {
      kind: 'select',
      selection: {
        kind: 'doc',
        id: node.id,
        docName: node.docName,
        label: node.label,
        anchor: node.anchor ?? null,
      },
    };
  }

  return {
    kind: 'navigate',
    hash: getHashForGraphDocSelection({
      docName: node.docName,
      label: node.label,
      anchor: node.anchor ?? null,
    }),
  };
}
