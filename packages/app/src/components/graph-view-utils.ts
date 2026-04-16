import { hashFromDocName } from '@/lib/doc-hash';

export interface DocGraphNode {
  kind: 'doc';
  id: string;
  label: string;
  docName: string;
  anchor: string | null;
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

export type GraphDocSelection = Pick<DocGraphNode, 'docName' | 'label' | 'anchor'>;

export type GraphDocClickBehavior = 'navigate' | 'select';
export type GraphNodeVisualState =
  | 'default'
  | 'active'
  | 'selected'
  | 'active-selected'
  | 'external';

export type GraphNodeClickAction =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; hash: string }
  | { kind: 'select'; selection: GraphDocSelection };

export function getGraphNodeTooltipLabel(node: GraphNode): string {
  return node.kind === 'external' ? node.url : (node.label ?? node.id);
}

export function getGraphNodeVisualState(
  node: GraphNode,
  {
    activeDocName,
    selectedDocName,
  }: {
    activeDocName: string;
    selectedDocName: string | null;
  },
): GraphNodeVisualState {
  if (node.kind === 'external') {
    return 'external';
  }

  const isActive = node.docName === activeDocName;
  const isSelected = selectedDocName !== null && node.docName === selectedDocName;

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

export function getHashForGraphDocSelection(selection: GraphDocSelection): string {
  return hashFromDocName(selection.docName, selection.anchor);
}

export function resolveGraphNodeClickAction(
  node: GraphNode,
  docClickBehavior: GraphDocClickBehavior,
): GraphNodeClickAction {
  if (node.kind === 'external') {
    return { kind: 'external', url: node.url };
  }

  if (docClickBehavior === 'select') {
    return {
      kind: 'select',
      selection: {
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
