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
  if (node.kind === 'external') return node.url;

  const title = node.label ?? node.id;
  const hasMetadata = node.cluster || node.category || (node.tags && node.tags.length > 0);
  if (!hasMetadata) return title;

  const lines: string[] = [
    `<div style="font-weight:600;font-size:13px;margin-bottom:4px">${escapeHtml(title)}</div>`,
  ];

  if (node.cluster) {
    lines.push(
      `<div style="font-size:11px;color:#9ca3af"><span style="opacity:0.7">cluster:</span> ${escapeHtml(node.cluster)}</div>`,
    );
  }
  if (node.category) {
    lines.push(
      `<div style="font-size:11px;color:#9ca3af"><span style="opacity:0.7">category:</span> ${escapeHtml(node.category)}</div>`,
    );
  }
  if (node.tags && node.tags.length > 0) {
    lines.push(
      `<div style="font-size:11px;color:#9ca3af"><span style="opacity:0.7">tags:</span> ${node.tags.map(escapeHtml).join(', ')}</div>`,
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
