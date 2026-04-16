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

export function getGraphNodeTooltipLabel(node: GraphNode): string {
  return node.kind === 'external' ? node.url : (node.label ?? node.id);
}
