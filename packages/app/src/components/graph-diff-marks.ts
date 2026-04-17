/**
 * Pure helpers for rendering graph-time-travel diff overlays.
 *
 * Used by GraphView to tint added/removed nodes and edges when viewing a diff
 * between two historical snapshots. Kept React-free and canvas-math-shaped so
 * the logic can be unit-tested without a DOM.
 *
 * Paired with `specs/2026-04-16-graph-demo-iteration-loop/SPEC.md §10 S7`.
 */

import type { GraphLink, GraphNode } from './graph-view-utils';

/**
 * Opaque marks carried across the boundary from the owning panel into
 * GraphView. Empty sets are explicitly allowed (and cheap) — callers pass an
 * empty sets object for "historical view, no diff overlay".
 */
export interface GraphDiffMarks {
  addedNodeIds: Set<string>;
  removedNodeIds: Set<string>;
  addedLinkKeys: Set<string>;
  removedLinkKeys: Set<string>;
}

/** Empty marks sentinel for the "no diff" case. Stable reference so React
 * effect dependency arrays don't churn. */
export const EMPTY_DIFF_MARKS: GraphDiffMarks = {
  addedNodeIds: new Set(),
  removedNodeIds: new Set(),
  addedLinkKeys: new Set(),
  removedLinkKeys: new Set(),
};

/**
 * Normalize a link endpoint (which force-graph mutates from string id → node
 * object ref after the first simulation tick) back to a stable string id.
 */
export function linkEndpointId(endpoint: unknown): string {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint !== null && typeof endpoint === 'object' && 'id' in endpoint) {
    return String((endpoint as { id: unknown }).id);
  }
  return '';
}

/** Canonical key for a link, resilient to force-graph's in-place mutation. */
export function linkKey(link: Pick<GraphLink, 'source' | 'target'>): string {
  return `${linkEndpointId(link.source)}>${linkEndpointId(link.target)}`;
}

/**
 * Compute the union of two graphs plus the diff marks between them.
 *
 * The display graph is the union so removed nodes/links remain visible with
 * the "removed" decoration; added nodes/links are drawn from the newer
 * snapshot with the "added" decoration. Callers that don't want a union can
 * pass only one side (nothing will be marked removed).
 *
 * Input nodes/links can be any shape that extends GraphNode/GraphLink — this
 * is used with both the live `/api/link-graph` shape and the simpler
 * `/api/graph-at` shape (historical nodes lack cluster/category/tags).
 */
export function mergeGraphsWithDiff(
  from: { nodes: GraphNode[]; links: GraphLink[] },
  to: { nodes: GraphNode[]; links: GraphLink[] },
): { nodes: GraphNode[]; links: GraphLink[]; marks: GraphDiffMarks } {
  const fromNodeIds = new Set(from.nodes.map((n) => n.id));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));
  const fromLinkKeys = new Set(from.links.map(linkKey));
  const toLinkKeys = new Set(to.links.map(linkKey));

  const addedNodeIds = new Set<string>();
  const removedNodeIds = new Set<string>();
  for (const id of toNodeIds) if (!fromNodeIds.has(id)) addedNodeIds.add(id);
  for (const id of fromNodeIds) if (!toNodeIds.has(id)) removedNodeIds.add(id);

  const addedLinkKeys = new Set<string>();
  const removedLinkKeys = new Set<string>();
  for (const key of toLinkKeys) if (!fromLinkKeys.has(key)) addedLinkKeys.add(key);
  for (const key of fromLinkKeys) if (!toLinkKeys.has(key)) removedLinkKeys.add(key);

  // Union of nodes, preferring "to" (newer) node data for shared ids.
  const unionNodes: GraphNode[] = [];
  const seen = new Set<string>();
  for (const n of to.nodes) {
    unionNodes.push(n);
    seen.add(n.id);
  }
  for (const n of from.nodes) {
    if (!seen.has(n.id)) unionNodes.push(n);
  }

  // Union of links by canonical key. Preserve order: newer links first, then
  // older links that aren't in newer.
  const unionLinks: GraphLink[] = [];
  const seenLinks = new Set<string>();
  for (const l of to.links) {
    const k = linkKey(l);
    unionLinks.push(l);
    seenLinks.add(k);
  }
  for (const l of from.links) {
    const k = linkKey(l);
    if (!seenLinks.has(k)) unionLinks.push(l);
  }

  return {
    nodes: unionNodes,
    links: unionLinks,
    marks: { addedNodeIds, removedNodeIds, addedLinkKeys, removedLinkKeys },
  };
}

/** Diff-mark decoration kind for a single node. */
export type NodeDiffState = 'added' | 'removed' | 'unchanged' | 'none';

export function nodeDiffState(
  nodeId: string,
  marks: GraphDiffMarks | null | undefined,
): NodeDiffState {
  if (!marks) return 'none';
  if (marks.addedNodeIds.has(nodeId)) return 'added';
  if (marks.removedNodeIds.has(nodeId)) return 'removed';
  // If there's any diff active (non-empty marks) and the node is in neither
  // side of the diff, treat it as "unchanged" so callers can dim it.
  if (
    marks.addedNodeIds.size > 0 ||
    marks.removedNodeIds.size > 0 ||
    marks.addedLinkKeys.size > 0 ||
    marks.removedLinkKeys.size > 0
  ) {
    return 'unchanged';
  }
  return 'none';
}

export type LinkDiffState = 'added' | 'removed' | 'unchanged' | 'none';

export function linkDiffState(
  link: Pick<GraphLink, 'source' | 'target'>,
  marks: GraphDiffMarks | null | undefined,
): LinkDiffState {
  if (!marks) return 'none';
  const k = linkKey(link);
  if (marks.addedLinkKeys.has(k)) return 'added';
  if (marks.removedLinkKeys.has(k)) return 'removed';
  if (
    marks.addedNodeIds.size > 0 ||
    marks.removedNodeIds.size > 0 ||
    marks.addedLinkKeys.size > 0 ||
    marks.removedLinkKeys.size > 0
  ) {
    return 'unchanged';
  }
  return 'none';
}

/** True when the marks set has any non-empty side. */
export function hasAnyDiff(marks: GraphDiffMarks | null | undefined): boolean {
  if (!marks) return false;
  return (
    marks.addedNodeIds.size > 0 ||
    marks.removedNodeIds.size > 0 ||
    marks.addedLinkKeys.size > 0 ||
    marks.removedLinkKeys.size > 0
  );
}
