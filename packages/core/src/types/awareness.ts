export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human' | 'agent';
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
   * server-side `AgentFocusBroadcaster` on a shared DirectConnection. Clients
   * aggregate across all awareness states to compute the primary focus that
   * the browser should navigate to.
   */
  agentFocus?: Record<string, AgentFocusEntry>;
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
  /** Which MCP tool produced the update. */
  writeKind: 'write' | 'edit' | null;
  /** `Date.now()` at publication time. Stale entries (>5s) are ignored. */
  ts: number;
}

/** Entry in Y.Map('activity') side-channel for agent write attribution. */
export interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}
