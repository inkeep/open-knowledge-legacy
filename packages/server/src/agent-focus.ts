/**
 * `AgentFocusBroadcaster` — publishes per-agent focus state on the `__system__`
 * Y.Doc's awareness so every connected client can follow the active agent.
 *
 * Transport decision (SPEC.md §6.1, D10):
 *   - Reuses the existing server-wide `__system__` DirectConnection owned by
 *     the CC1 broadcaster. Does NOT open its own DirectConnection and does NOT
 *     bypass the `isSystemDoc` guard in `AgentSessionManager`.
 *   - State is a map-valued awareness field keyed by `agentId`, so N concurrent
 *     agents coexist under the single shared `clientID` without stomping.
 *
 * Path A scope (SPEC.md §6.2.1, D12):
 *   - Path A callers pass the hardcoded `DEFAULT_AGENT_ID`; only one entry ever
 *     lives in the map. Path B (FW-7) will route distinct agent IDs per MCP
 *     session through `readAgentIdentity(req)` — the broadcaster API is already
 *     shaped for it (agentId is a first-class parameter).
 *   - `clearFocus(agentId)` exists for forward-compatibility. No Path A caller
 *     uses it today; Path B session-end logic will.
 */
import type { Hocuspocus } from '@hocuspocus/server';
import { type AgentFocusEntry, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { getLogger } from './logger.ts';

export type { AgentFocusEntry };

export class AgentFocusBroadcaster {
  private readonly hocuspocus: Hocuspocus;
  private readonly log = getLogger('agent-focus');
  private warnedMissing = false;

  constructor(hocuspocus: Hocuspocus) {
    this.hocuspocus = hocuspocus;
  }

  /** Upsert an agent's focus entry. Merges into the existing map — other agents' entries are preserved. */
  setFocus(agentId: string, entry: AgentFocusEntry): void {
    this.mutateAgentFocus((current) => ({ ...current, [agentId]: entry }));
  }

  /** Remove an agent's entry. No-op if the entry doesn't exist. */
  clearFocus(agentId: string): void {
    this.mutateAgentFocus((current) => {
      if (!(agentId in current)) return current;
      const { [agentId]: _dropped, ...rest } = current;
      return rest;
    });
  }

  /** Read the current map (diagnostics + tests). */
  getFocusMap(): Record<string, AgentFocusEntry> {
    const awareness = this.resolveAwareness();
    if (!awareness) return {};
    const state = awareness.getLocalState() as { agentFocus?: Record<string, AgentFocusEntry> };
    return state?.agentFocus ?? {};
  }

  private mutateAgentFocus(
    update: (current: Record<string, AgentFocusEntry>) => Record<string, AgentFocusEntry>,
  ): void {
    const awareness = this.resolveAwareness();
    if (!awareness) return;
    try {
      const state = awareness.getLocalState() as { agentFocus?: Record<string, AgentFocusEntry> };
      const current = state?.agentFocus ?? {};
      const next = update(current);
      awareness.setLocalStateField('agentFocus', next);
    } catch (err) {
      this.log.error({ err }, '[agent-focus] awareness mutation failed');
    }
  }

  private resolveAwareness(): ReturnType<typeof getAwareness> | null {
    const doc = this.hocuspocus.documents.get(SYSTEM_DOC_NAME);
    if (!doc) {
      if (!this.warnedMissing) {
        this.log.warn(
          {},
          '[agent-focus] __system__ document not found — focus updates will be dropped until it is materialized',
        );
        this.warnedMissing = true;
      }
      return null;
    }
    return getAwareness(doc);
  }
}

type DocumentWithAwareness = {
  awareness: {
    getLocalState: () => Record<string, unknown> | null;
    setLocalStateField: (field: string, value: unknown) => void;
  };
};

function getAwareness(doc: unknown): DocumentWithAwareness['awareness'] | null {
  const awareness = (doc as DocumentWithAwareness | undefined)?.awareness;
  return awareness ?? null;
}
