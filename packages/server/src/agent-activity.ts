/**
 * Agent Activity Panel — server-side data synthesis.
 *
 * Reads per-session Y.UndoManager.undoStack to produce per-burst stats and
 * unified-diff text. No git, no disk — pure in-memory CRDT introspection.
 *
 * Data source rationale (D-P1 LOCKED):
 *   - Shadow repo: per-writer commits in the same L2 drain share a tree SHA;
 *     tree-level diff cannot isolate one writer's contribution.
 *   - Y.Map('agent-effects'): ephemeral 50-entry ring shared across agents;
 *     lacks deleted-text content.
 *   - Y.UndoManager.undoStack: origin-tagged, per-session, tombstone-safe.
 *     Y.UndoManager.keepItem(item, true) at capture guarantees content readable
 *     while StackItem is on the stack (Q-P4 RESOLVED).
 */
import { createPatch } from 'diff';
import type * as Y from 'yjs';
import type { AgentSessionManager } from './agent-sessions.ts';

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

// Y.js internal structural types — DeleteSet and StackItem are not re-exported
// from the public yjs API so we mirror their shapes here.
interface YjsDeleteSetRange {
  clock: number;
  len: number;
}
interface YjsDeleteSet {
  clients: Map<number, YjsDeleteSetRange[]>;
}
interface YjsStackItem {
  insertions: YjsDeleteSet;
  deletions: YjsDeleteSet;
  meta: Map<unknown, unknown>;
}

/**
 * Check whether a CRDT ID falls within a DeleteSet.
 * Equivalent to `isDeleted(ds, id)` from yjs internals but implemented
 * without importing private API — works by scanning the clients map.
 */
function isInDeleteSet(ds: YjsDeleteSet, id: Y.ID): boolean {
  const ranges = ds.clients.get(id.client);
  if (!ranges) return false;
  for (const range of ranges) {
    if (range.clock <= id.clock && id.clock < range.clock + range.len) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------
// Exported pure functions
// ------------------------------------------------------------------

export interface DiffSpan {
  position: number;
  content: string;
  length: number;
}

export interface StackItemDiff {
  insertions: DiffSpan[];
  deletions: DiffSpan[];
}

/**
 * Walk the Y.Text Item linked list once and classify each ContentString Item
 * against a StackItem's insertions/deletions DeleteSets.
 *
 * Algorithm (SPEC §8 Q-P5):
 *   for each Item in ytext._start chain:
 *     isInserted = isInDeleteSet(stackItem.insertions, item.id)
 *     isDeleted  = isInDeleteSet(stackItem.deletions,  item.id)
 *
 *     contributed to `after` string: item that is NOT currently tombstoned
 *       (i.e. !item.deleted) — this is the post-burst state.
 *     contributed to `before` string: present in before if
 *       isDeleted || (!item.deleted && !isInserted)
 *       — items that existed before the burst (either were deleted by it, or
 *         were never inserted by it and still exist now).
 *
 * Returns raw insertion/deletion spans as well as `before` and `after` strings
 * so callers can produce unified diffs without a second pass.
 */
export function synthesizeStackItemDiff(
  stackItem: YjsStackItem,
  ytext: Y.Text,
): StackItemDiff & { before: string; after: string } {
  const insertions: DiffSpan[] = [];
  const deletions: DiffSpan[] = [];

  let beforeStr = '';
  let afterStr = '';

  // posInBefore / posInAfter track character offset in the reconstructed strings.
  let posInBefore = 0;
  let posInAfter = 0;

  // Walk the linked list from _start.
  // biome-ignore lint/suspicious/noExplicitAny: accessing internal Y.js linked list
  let item: any = (ytext as unknown as { _start: unknown })._start;
  while (item !== null) {
    // Only ContentString items carry user text.
    if (item.content && typeof item.content.str === 'string') {
      const str: string = item.content.str;
      const len: number = str.length;
      const id: Y.ID = item.id;

      const isInserted = isInDeleteSet(stackItem.insertions, id);
      const isDeletedInBurst = isInDeleteSet(stackItem.deletions, id);

      // Contribute to `after` (current state): item is live (not tombstoned).
      if (!item.deleted) {
        afterStr += str;
        if (!isInserted) {
          // Not inserted by this burst → existed before → part of `before` too.
          beforeStr += str;
          posInBefore += len;
        }
        posInAfter += len;
      } else {
        // Item is tombstoned (deleted overall).
        if (isDeletedInBurst) {
          // This burst deleted it → it was present before the burst.
          deletions.push({ position: posInBefore, content: str, length: len });
          beforeStr += str;
          posInBefore += len;
          // posInAfter unchanged — not in after.
        }
        // If deleted before this burst and not by this burst: skip (not in before or after).
      }

      // Inserted by this burst → not in before, but in after (already added above).
      if (isInserted && !item.deleted) {
        insertions.push({ position: posInAfter - len, content: str, length: len });
      }
    }
    // Skip non-ContentString items (ContentFormat, ContentAny, etc).
    item = item.right;
  }

  return { insertions, deletions, before: beforeStr, after: afterStr };
}

/**
 * Produce a unified-diff string for a single StackItem using the `diff` package.
 * Returns an empty string if before === after (no net change).
 */
export function synthesizeStackItemDiffText(
  stackItem: YjsStackItem,
  ytext: Y.Text,
  docName: string,
): string {
  const { before, after } = synthesizeStackItemDiff(stackItem, ytext);
  if (before === after) return '';
  return createPatch(docName, before, after, undefined, undefined, { context: 3 });
}

// ------------------------------------------------------------------
// Activity listing
// ------------------------------------------------------------------

export interface BurstStat {
  /** Index into undoStack (0 = oldest, undoStack.length-1 = newest). */
  stackIndex: number;
  /** Capture timestamp in ms. Y.UndoManager sets stackItem.meta.get('time') at capture. */
  ts: number;
  additions: number;
  deletions: number;
}

export interface AgentFileStat {
  docName: string;
  additionsTotal: number;
  deletionsTotal: number;
  lastTs: number;
  bursts: BurstStat[];
}

export interface AgentActivityResult {
  sessionAlive: boolean;
  agent: { displayName: string; color: string; icon?: string; connectionId: string } | null;
  files: AgentFileStat[];
}

/** Read the capture timestamp from a StackItem. Y.UndoManager stores it in meta. */
function getBurstTs(stackItem: YjsStackItem): number {
  const meta = stackItem.meta;
  if (meta instanceof Map) {
    const t = meta.get('time');
    if (typeof t === 'number') return t;
  }
  return Date.now();
}

/**
 * Count total additions and deletions for a StackItem by walking its DeleteSets.
 * This is faster than synthesizeStackItemDiff when we only need counts.
 */
function countStackItemChanges(
  stackItem: YjsStackItem,
  ytext: Y.Text,
): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  // biome-ignore lint/suspicious/noExplicitAny: accessing internal Y.js linked list
  let item: any = (ytext as unknown as { _start: unknown })._start;
  while (item !== null) {
    if (item.content && typeof item.content.str === 'string') {
      const len: number = item.content.str.length;
      const id: Y.ID = item.id;
      const isInserted = isInDeleteSet(stackItem.insertions, id);
      const isDeletedInBurst = isInDeleteSet(stackItem.deletions, id);
      if (isInserted && !item.deleted) additions += len;
      if (isDeletedInBurst) deletions += len;
    }
    item = item.right;
  }
  return { additions, deletions };
}

/**
 * Enumerate all AgentSessionManager sessions for a given connectionId and
 * aggregate per-file + per-burst stats from Y.UndoManager.undoStack.
 *
 * connectionId IS the agentId in this repo (the `agent-` prefix is added by
 * extractAgentIdentity; sessions are keyed as `${docName}\0${agentId}`).
 *
 * Files ordered by most-recent-burst DESC; bursts by stackIndex DESC (newest first).
 */
export function listAgentActivity(
  sessionManager: AgentSessionManager,
  connectionId: string,
): AgentActivityResult {
  // Access the internal sessions map (package-internal — same package boundary).
  // biome-ignore lint/suspicious/noExplicitAny: accessing internal AgentSessionManager sessions
  const sessionsMap: Map<string, any> = (sessionManager as any).sessions;

  // AgentSessionManager.sessionKey uses the agentId as-passed; all call sites
  // pass the broadcaster-key form (`agent-<raw>` via `extractAgentIdentity`
  // in api-extension.ts), so session keys have shape `${docName}\0agent-<raw>`.
  // Clients (presence bar, direct callers) pass the same broadcaster-key form
  // to listAgentActivity — match directly without normalization.
  const suffix = `\0${connectionId}`;
  const matchingKeys = [...sessionsMap.keys()].filter((k) => k.endsWith(suffix));

  if (matchingKeys.length === 0) {
    return { sessionAlive: false, agent: null, files: [] };
  }

  const fileStats: AgentFileStat[] = [];
  let agentInfo: AgentActivityResult['agent'] = null;

  for (const key of matchingKeys) {
    const session = sessionsMap.get(key);
    if (!session) continue;

    // Extract agent identity from origin context (frozen at session creation).
    if (!agentInfo) {
      const ctx = session.origin?.context as Record<string, unknown> | undefined;
      agentInfo = {
        displayName: (ctx?.displayName as string) || (ctx?.agent_type as string) || connectionId,
        color: (ctx?.color as string) || '#888888',
        icon: ctx?.icon as string | undefined,
        connectionId,
      };
    }

    const docName: string = session.docName;
    const um: Y.UndoManager = session.um;
    const ytext: Y.Text = session.dc.document.getText('source');

    const bursts: BurstStat[] = [];

    for (let i = 0; i < um.undoStack.length; i++) {
      const stackItem = um.undoStack[i];
      const ts = getBurstTs(stackItem);
      const { additions, deletions } = countStackItemChanges(stackItem, ytext);
      bursts.push({ stackIndex: i, ts, additions, deletions });
    }

    if (bursts.length === 0) continue; // Skip sessions with no recorded bursts.

    // Sort bursts newest first (highest stackIndex first).
    bursts.sort((a, b) => b.stackIndex - a.stackIndex);

    const additionsTotal = bursts.reduce((sum, b) => sum + b.additions, 0);
    const deletionsTotal = bursts.reduce((sum, b) => sum + b.deletions, 0);
    const lastTs = Math.max(...bursts.map((b) => b.ts));

    fileStats.push({ docName, additionsTotal, deletionsTotal, lastTs, bursts });
  }

  // Sort files by most-recent burst DESC.
  fileStats.sort((a, b) => b.lastTs - a.lastTs);

  return {
    sessionAlive: true,
    agent: agentInfo,
    files: fileStats,
  };
}
