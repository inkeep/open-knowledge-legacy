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

export interface GraphDocSelection {
  docName: string;
  label: string;
  anchor: string | null;
}

export type GraphDocClickBehavior = 'navigate' | 'select';

export type GraphNodeClickAction =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; hash: string }
  | { kind: 'select'; selection: GraphDocSelection };

export function getGraphNodeTooltipLabel(node: GraphNode): string {
  return node.kind === 'external' ? node.url : (node.label ?? node.id);
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
    hash: hashFromDocName(node.docName, node.anchor ?? null),
  };
}
