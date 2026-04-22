export interface AwarenessUser {
  name: string;
  color: string;
  /**
   * Always `'human'`. Agents no longer publish per-doc awareness — their
   * presence lives on the `__system__` Y.Doc's `agentPresence` map instead
   * (multi-agent-presence SPEC FR-3 + FR-10, precedent #3).
   */
  type: 'human';
  icon?: string;
  coeditor?: string;
  tabId: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
  /**
   * Map of active-agent focus entries keyed by agentId. Only populated on the
   * `__system__` Y.Doc's awareness (not on content docs), published by the
   * server-side `AgentFocusBroadcaster` on a shared DirectConnection.
   *
   * Scope: per-write attribution (writeKind + doc the agent wrote to). Distinct
   * from `agentPresence` below, which carries sustained session state
   * (displayName, icon, color, mode, ts). Both fields coexist on `__system__`
   * — the identity-attribution spec owns `agentFocus`, the multi-agent-presence
   * spec owns `agentPresence`.
   */
  agentFocus?: Record<string, AgentFocusEntry>;
  /**
   * Map of active-agent presence entries keyed by agentId. Populated only on
   * the `__system__` Y.Doc's awareness (never on content docs — per-doc agent
   * awareness stomps across N concurrent agents because every Hocuspocus
   * `Document` has one shared `Awareness` clientID). Published by the
   * server-side `AgentPresenceBroadcaster` on a shared DirectConnection.
   * Clients filter stale entries (`now - ts >= AGENT_PRESENCE_STALE_MS`) and
   * skip entries with `currentDoc === null` (D8 — presence means "doing work
   * now"). Entries are cleared deterministically via the MCP keepalive WS
   * close event with the 5s TTL as a belt-and-suspenders fallback.
   */
  agentPresence?: Record<string, AgentPresenceEntry>;
}

/**
 * One active agent's current focus. Lives inside the map-valued `agentFocus`
 * field on `AwarenessState` and is refreshed on every agent write — `ts` is
 * how the client computes latest-wins over concurrent agents.
 */
export interface AgentFocusEntry {
  /** Human-readable name (e.g. 'claude-1'). */
  agentName: string;
  /** Path of the doc the agent most recently wrote to; null between writes. */
  currentDoc: string | null;
  /** Which MCP tool produced the update (D43). */
  writeKind: 'write' | 'edit' | 'undo' | 'rollback-apply' | null;
  /** `Date.now()` at publication time. Stale entries (>5s) are ignored. */
  ts: number;
}

/**
 * One active agent's presence. Lives inside the map-valued `agentPresence`
 * field on `AwarenessState` on the `__system__` Y.Doc's awareness (never on
 * content docs). Refreshed on every agent write.
 *
 * Clients filter stale entries where `now - ts >= AGENT_PRESENCE_STALE_MS`
 * (5_000ms) and skip entries
 * with `currentDoc === null` (D8 — "presence means doing work now"). The
 * primary cleanup signal is the MCP keepalive WS close event; TTL is a
 * belt-and-suspenders defense against clock skew / silent WS drops.
 */
export interface AgentPresenceEntry {
  /** Human-readable name (e.g. 'Claude', 'Cursor'). */
  displayName: string;
  /** Icon identifier (e.g. 'claude', 'cursor', 'openai'). */
  icon: string;
  /** Hex color string (e.g. '#D97757'). */
  color: string;
  /** Path of the doc the agent most recently wrote to; null between writes. */
  currentDoc: string | null;
  /**
   * Live-write state: `'writing'` during an HTTP write in-flight (setPresence
   * fires at handler entry, touchMode flips to `'idle'` in the finally), and
   * `'idle'` when quiescent. Distinct from `AwarenessState.mode` (whose
   * `'editing'` literal means "human has cursor active in WYSIWYG / source")
   * — agents don't edit, they batch-write, and sharing the `'editing'` token
   * was ambiguous when both flowed to the same `data-presence-mode` attr on
   * the avatar. `'writing'` is agent-only; CSS / test selectors can now
   * distinguish by value rather than needing parallel attr names.
   */
  mode: 'idle' | 'writing';
  /** `Date.now()` at publication time. Stale entries (>=AGENT_PRESENCE_STALE_MS) are filtered. */
  ts: number;
}

/** Entry in Y.Map('agent-flash') side-channel for agent write attribution. */
export interface AgentFlashEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}
