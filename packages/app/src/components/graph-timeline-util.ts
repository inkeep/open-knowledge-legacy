/**
 * Pure helpers that adapt historical-graph API payloads into the shapes the
 * live `GraphView` renders, and provide display-friendly derived values for
 * the Stage 7 timeline strip. Kept in a separate module so
 * `GraphTimeline.tsx` and `useGraphTimeline.ts` stay render- / state-focused
 * and stay unit-testable.
 */

import type {
  CheckpointEntry,
  HistoricalExternalNode,
  HistoricalNode,
  LinkGraphLink,
} from '@inkeep/open-knowledge-core';
import type { DocGraphNode, ExternalGraphNode, GraphLink, GraphNode } from './graph-view-utils';

/**
 * Normalize a historical node into the live `GraphNode` shape so `GraphView`
 * can render it uniformly. Historical nodes do NOT carry cluster / category /
 * tags / lastEditedBy — those fields stay undefined, and `GraphView` already
 * handles their absence gracefully.
 *
 * External-node labels can be `null` in historical payloads but the live
 * `ExternalGraphNode` requires a string; we fall back to the URL so the
 * tooltip and label logic stay stable across both paths.
 */
export function normalizeHistoricalNode(node: HistoricalNode): GraphNode {
  if (node.kind === 'external') return normalizeExternalNode(node);
  const doc: DocGraphNode = {
    kind: 'doc',
    id: node.id,
    docName: node.docName,
    label: node.label,
    anchor: node.anchor,
  };
  return doc;
}

function normalizeExternalNode(node: HistoricalExternalNode): ExternalGraphNode {
  return {
    kind: 'external',
    id: node.id,
    url: node.url,
    label: node.label ?? node.url,
  };
}

export function normalizeHistoricalNodes(nodes: HistoricalNode[]): GraphNode[] {
  return nodes.map(normalizeHistoricalNode);
}

/** Historical and live edges are structurally identical today. */
export function normalizeHistoricalLinks(links: LinkGraphLink[]): GraphLink[] {
  return links.map((l) => ({ source: l.source, target: l.target }));
}

/**
 * Short, dev-friendly SHA. Only used for display — the full SHA stays the
 * canonical identifier everywhere else (fetch URLs, cache keys, state).
 */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Best-effort display label for a checkpoint chip. Prefers the save-version
 * user message (everything after `checkpoint: `), falling back to the short
 * SHA. Timestamps are formatted separately by `formatCheckpointTime` and
 * shown as a secondary line.
 */
export function checkpointDisplayLabel(entry: CheckpointEntry): string {
  const prefix = 'checkpoint: ';
  const msg = entry.message.trim();
  const body = msg.toLowerCase().startsWith(prefix) ? msg.slice(prefix.length).trim() : msg;
  if (body.length > 0) return body;
  return shortSha(entry.sha);
}

/**
 * Locale-aware short time for the checkpoint chip. Uses date when the entry
 * is more than 24h old, time-of-day otherwise. Returns empty string when the
 * timestamp is unparseable so callers can skip rendering the secondary line.
 */
export function formatCheckpointTime(entry: CheckpointEntry, now: Date = new Date()): string {
  const ts = new Date(entry.timestamp);
  if (Number.isNaN(ts.getTime())) return '';
  const msAgo = now.getTime() - ts.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (msAgo < oneDay && msAgo >= 0) {
    return ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
