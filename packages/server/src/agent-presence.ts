/**
 * `AgentPresenceBroadcaster` — publishes per-agent presence state on the
 * `__system__` Y.Doc's awareness so every connected client can render a
 * correct multi-agent presence bar.
 *
 * Why it lives here (spec §1, §9.2):
 *   - Every Hocuspocus `Document` has one shared server-side `Awareness` with
 *     a single `clientID`; per-content-doc agent state therefore stomps across
 *     N concurrent agents. Publishing a map-valued `agentPresence` field on
 *     `__system__` — keyed by `agentId` — sidesteps that constraint.
 *   - Reuses the existing server-wide `__system__` DirectConnection (opened
 *     by the CC1 broadcaster). Does NOT open its own DirectConnection and
 *     does NOT bypass the `isSystemDoc` guard in `AgentSessionManager`.
 *
 * API shape:
 *   - `setPresence(agentId, entry)` — upsert. Merges into the existing map;
 *     other agents' entries are preserved.
 *   - `clearPresence(agentId)` — remove exactly one entry. No-op if missing.
 *   - `touchMode(agentId, mode)` — update just the mode + ts of an existing
 *     entry. Graceful no-op when the agent has no existing entry (never
 *     creates a half-populated entry missing displayName/icon/color).
 *   - `getPresenceMap()` — diagnostic read.
 */
import type { Hocuspocus } from '@hocuspocus/server';
import { type AgentPresenceEntry, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { getLogger } from './logger.ts';

export class AgentPresenceBroadcaster {
  private readonly hocuspocus: Hocuspocus;
  private readonly log = getLogger('agent-presence');
  private warnedMissing = false;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  /** Upsert an agent's presence entry. Other agents' entries are preserved. */
  setPresence(agentId: string, entry: AgentPresenceEntry): void {
    const mutated = this.mutateAgentPresence((current) => ({ ...current, [agentId]: entry }));
    if (mutated) {
      this.log.info(
        { agentId, action: 'set', currentDoc: entry.currentDoc, ts: entry.ts },
        '[agent-presence] set',
      );
    }
  }

  /** Remove an agent's entry. No-op if the entry doesn't exist. */
  clearPresence(agentId: string): void {
    let removed = false;
    const mutated = this.mutateAgentPresence((current) => {
      if (!(agentId in current)) return current;
      removed = true;
      const { [agentId]: _dropped, ...rest } = current;
      return rest;
    });
    if (mutated && removed) {
      this.log.info(
        { agentId, action: 'clear', currentDoc: null, ts: Date.now() },
        '[agent-presence] clear',
      );
    }
  }

  /**
   * Update the mode + ts of an existing presence entry. Graceful no-op when
   * the agent has no existing entry — we must NEVER write a half-populated
   * entry because clients filter by `currentDoc === null` but do not defend
   * against missing displayName/icon/color.
   */
  touchMode(agentId: string, mode: AgentPresenceEntry['mode']): void {
    const touched: { currentDoc: string | null; ts: number }[] = [];
    const mutated = this.mutateAgentPresence((current) => {
      const existing = current[agentId];
      if (!existing) return current;
      const ts = Date.now();
      touched.push({ currentDoc: existing.currentDoc, ts });
      return { ...current, [agentId]: { ...existing, mode, ts } };
    });
    const record = touched[0];
    if (mutated && record) {
      this.log.info(
        { agentId, action: 'touchMode', currentDoc: record.currentDoc, ts: record.ts },
        '[agent-presence] touchMode',
      );
    }
  }

  /** Read the current map (diagnostics + tests). */
  getPresenceMap(): Record<string, AgentPresenceEntry> {
    const awareness = this.resolveAwareness();
    if (!awareness) return {};
    const state = awareness.getLocalState() as {
      agentPresence?: Record<string, AgentPresenceEntry>;
    };
    return state?.agentPresence ?? {};
  }

  private mutateAgentPresence(
    update: (current: Record<string, AgentPresenceEntry>) => Record<string, AgentPresenceEntry>,
  ): boolean {
    const awareness = this.resolveAwareness();
    if (!awareness) return false;
    try {
      // y-protocols awareness.setLocalStateField is a no-op when local state is
      // null (its source reads `getLocalState()` and guards `if (state !== null)`).
      // The server-side Document's awareness starts null, so we always go
      // through setLocalState with an explicit merge — bootstraps state on
      // the first call and preserves any non-agentPresence fields other
      // subsystems may set.
      const existing = (awareness.getLocalState() ?? {}) as {
        agentPresence?: Record<string, AgentPresenceEntry>;
      };
      const current = existing.agentPresence ?? {};
      const nextPresence = update(current);
      awareness.setLocalState({ ...existing, agentPresence: nextPresence });
      return true;
    } catch (err) {
      this.log.error({ err }, '[agent-presence] awareness mutation failed');
      return false;
    }
  }

  private resolveAwareness(): DocumentWithAwareness['awareness'] | null {
    const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
    if (!doc) {
      if (!this.warnedMissing) {
        this.log.warn(
          {},
          '[agent-presence] __system__ document not found — presence updates will be dropped until it is materialized',
        );
        this.warnedMissing = true;
      }
      return null;
    }
    // Recovery signal: log once when __system__ becomes available after a
    // miss so operators can confirm the broadcaster resumed.
    if (this.warnedMissing) {
      this.log.info(
        {},
        '[agent-presence] __system__ document now available — resuming presence updates',
      );
      this.warnedMissing = false;
    }
    return getAwareness(doc);
  }
}

type DocumentWithAwareness = {
  awareness: {
    getLocalState: () => Record<string, unknown> | null;
    setLocalState: (state: Record<string, unknown> | null) => void;
  };
};

function getAwareness(doc: unknown): DocumentWithAwareness['awareness'] | null {
  const awareness = (doc as DocumentWithAwareness | undefined)?.awareness;
  return awareness ?? null;
}
