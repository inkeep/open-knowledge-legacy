import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { AgentPresenceEntry } from '@inkeep/open-knowledge-core';
import { useEffect, useState } from 'react';
import { type AgentPresenceAwareness, pickAgentsForDoc } from '@/lib/agent-presence';
import type { AwarenessState, AwarenessUser } from './identity.ts';

/**
 * A human participant — publishes per-doc awareness (name, color, icon,
 * cursor position, mode). Cursors are rendered by `@tiptap/extension-
 * collaboration-cursor`.
 */
export interface HumanParticipant {
  kind: 'human';
  clientId: number;
  user: AwarenessUser;
  mode: AwarenessState['mode'];
}

/**
 * An agent participant — publishes presence via the `__system__` Y.Doc's
 * `agentPresence` map (never per-doc awareness; see FR-3 + precedent #3).
 * `presence` carries everything the bar needs: displayName, icon, color,
 * currentDoc, mode, ts.
 */
export interface AgentParticipant {
  kind: 'agent';
  agentId: string;
  presence: AgentPresenceEntry;
}

export type Participant = HumanParticipant | AgentParticipant;

/**
 * 1s cadence is a compromise. Awareness-change events fan out on every
 * server-side `setPresence` / `touchMode` / `clearPresence` — that's the
 * primary signal. The interval tick exists as a backup so TTL-based
 * staleness (§13 R2 — silent WS close / clock skew) ages entries out even
 * when no awareness-change fires. Not user-visible; small enough to catch
 * a 5s-stale entry within ~1s of its real expiry, big enough to keep the
 * re-render cost negligible.
 */
const TTL_TICK_MS = 1_000;

/**
 * Two-source presence reader for the sectioned PresenceBar.
 *
 * Humans come from the **per-doc** `activeProvider.awareness` (each human
 * has their own Y.Doc clientID; cursor positions + name/color live here).
 * Agents come from the **`__system__`-scoped** `systemProvider.awareness`
 * map-valued field `agentPresence`, bucketed into `current` (same-doc as
 * `activeDocName`) vs `crossDoc` (different doc).
 *
 * Returns two arrays:
 *   - `current`: humans + agents whose `currentDoc === activeDocName`
 *   - `crossDoc`: agents whose `currentDoc !== activeDocName` (and non-null)
 *
 * Ordering: humans first in `current` (they're the active user's peers on
 * this doc), then same-doc agents. Within each group, stable insertion
 * order (awareness state map iteration order).
 */
export function usePresence(
  activeProvider: HocuspocusProvider | null,
  systemProvider: HocuspocusProvider | null,
  activeDocName: string | null,
): { current: Participant[]; crossDoc: Participant[] } {
  const [state, setState] = useState<{ current: Participant[]; crossDoc: Participant[] }>({
    current: [],
    crossDoc: [],
  });

  useEffect(() => {
    const activeAwareness = activeProvider?.awareness;
    const systemAwareness = systemProvider?.awareness as unknown as
      | AgentPresenceAwareness
      | undefined;

    const compute = (): void => {
      const humans: HumanParticipant[] = [];
      if (activeAwareness) {
        for (const [clientId, rawState] of activeAwareness.getStates().entries()) {
          const s = rawState as Record<string, unknown>;
          if (!s.user || typeof s.user !== 'object') continue;
          const user = s.user as AwarenessUser;
          // Defensive: AwarenessUser.type is narrowed to 'human' by the type
          // system but a stale bundled client could still emit 'agent'. Skip
          // that shape — SystemDocSubscriber already logs the warning.
          if (user.type !== 'human') continue;
          humans.push({
            kind: 'human',
            clientId,
            user,
            mode: (s.mode as HumanParticipant['mode']) ?? 'wysiwyg',
          });
        }
      }

      const now = Date.now();
      const { current: currentAgents, crossDoc: crossDocAgents } = systemAwareness
        ? pickAgentsForDoc(systemAwareness, activeDocName, now)
        : { current: [], crossDoc: [] };

      const currentAgentParticipants: AgentParticipant[] = currentAgents.map((presence) => ({
        kind: 'agent',
        agentId: agentIdFromPresence(presence, systemAwareness),
        presence,
      }));
      const crossDocAgentParticipants: AgentParticipant[] = crossDocAgents.map((presence) => ({
        kind: 'agent',
        agentId: agentIdFromPresence(presence, systemAwareness),
        presence,
      }));

      setState({
        current: [...humans, ...currentAgentParticipants],
        crossDoc: crossDocAgentParticipants,
      });
    };

    compute();

    const handleActive = (): void => compute();
    const handleSystem = (): void => compute();
    activeAwareness?.on('change', handleActive);
    systemProvider?.awareness?.on('change', handleSystem);

    // TTL refresh — see TTL_TICK_MS above for rationale.
    const interval = setInterval(compute, TTL_TICK_MS);

    return () => {
      activeAwareness?.off('change', handleActive);
      systemProvider?.awareness?.off('change', handleSystem);
      clearInterval(interval);
    };
  }, [activeProvider, systemProvider, activeDocName]);

  return state;
}

/**
 * Recover the `agentId` key for an entry by walking the awareness map.
 * `pickAgentsForDoc` returns values only — we need the key so React can
 * use it as a stable list key. If the entry is not found (shouldn't
 * happen in production but defensive), falls back to a content-hash-ish
 * string so avatars don't all share a React key.
 */
function agentIdFromPresence(
  entry: AgentPresenceEntry,
  awareness: AgentPresenceAwareness | undefined,
): string {
  if (!awareness) return `${entry.displayName}:${entry.ts}`;
  for (const state of awareness.getStates().values()) {
    const map = state.agentPresence;
    if (!map) continue;
    for (const [id, e] of Object.entries(map)) {
      if (e === entry) return id;
    }
  }
  return `${entry.displayName}:${entry.ts}`;
}
