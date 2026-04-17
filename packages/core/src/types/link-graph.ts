/**
 * Shared types for the backlink graph — the same shapes are returned by
 * the live `/api/link-graph` endpoint and by the historical
 * `/api/graph-at` / `/api/graph-diff` endpoints. Exposing them from core
 * keeps server and client in lockstep.
 */

/**
 * Live attribution metadata attached to each doc node on the live link-graph.
 * `null` when no agent edit has been recorded for the doc in this server's
 * lifetime. The client decides what's "recent" for halo purposes by comparing
 * `timestamp` against the current time against the constants in
 * `./constants/graph-attribution.ts`.
 */
export interface LastEditedBy {
  agentName: string;
  /** Stable seed (usually the agentId) feeding `colorFromSeed`. */
  colorSeed: string;
  /** ms since epoch. */
  timestamp: number;
}

/** Doc node on the live link graph (with frontmatter metadata + attribution). */
export interface LinkGraphDocNode {
  kind: 'doc';
  id: string;
  docName: string;
  label: string;
  anchor?: string | null;
  cluster?: string | null;
  category?: string | null;
  tags?: string[] | null;
  lastEditedBy?: LastEditedBy | null;
}

/** External URL node on the link graph. */
export interface LinkGraphExternalNode {
  kind: 'external';
  id: string;
  url: string;
  label: string | null;
}

export type LinkGraphNode = LinkGraphDocNode | LinkGraphExternalNode;

/** Edge on the link graph. */
export interface LinkGraphLink {
  source: string;
  target: string;
}

/** Response from GET /api/link-graph. */
export interface LinkGraphResponse {
  ok: true;
  nodes: LinkGraphNode[];
  links: LinkGraphLink[];
}

/**
 * Historical doc node — the shape returned by `/api/graph-at` and the
 * `{added,removed}Nodes` arrays on `/api/graph-diff`. Historical nodes carry
 * label + anchor but no cluster/category/tags (frontmatter metadata is NOT
 * reconstructed from historical commits in this iteration — labels come from
 * each commit's H1/frontmatter-title via `extractPageTitle`).
 */
export interface HistoricalDocNode {
  kind: 'doc';
  id: string;
  docName: string;
  label: string;
  anchor: string | null;
}

export interface HistoricalExternalNode {
  kind: 'external';
  id: string;
  url: string;
  label: string | null;
}

export type HistoricalNode = HistoricalDocNode | HistoricalExternalNode;

/** Response from GET /api/graph-at. */
export interface GraphAtResponse {
  ok: true;
  sha: string;
  nodes: HistoricalNode[];
  links: LinkGraphLink[];
}

/** A single checkpoint entry. */
export interface CheckpointEntry {
  sha: string;
  /** ISO 8601 author date. */
  timestamp: string;
  /** Commit subject — usually `checkpoint: <user message>`. */
  message: string;
  author: string;
  /** Always `'checkpoint'` from `/api/checkpoints`. */
  type: 'checkpoint';
}

/** Response from GET /api/checkpoints. */
export interface CheckpointsResponse {
  ok: true;
  entries: CheckpointEntry[];
}

/** Response from GET /api/graph-diff. */
export interface GraphDiffResponse {
  ok: true;
  from: string;
  to: string;
  addedNodes: HistoricalNode[];
  removedNodes: HistoricalNode[];
  addedLinks: LinkGraphLink[];
  removedLinks: LinkGraphLink[];
}
