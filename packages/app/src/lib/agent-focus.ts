/**
 * Client-side helpers for observing agent focus on `__system__` awareness.
 *
 * The server publishes a map-valued `agentFocus?: Record<agentId, entry>`
 * field on its local awareness state. Clients walk every awareness peer
 * (there's only ever one producer — the server-side `__system__`
 * DirectConnection — but walking is defensive against future producers),
 * collect agentFocus map entries, filter stale ones, and return the
 * latest-ts's `currentDoc`.
 *
 * Decisions: SPEC.md D2 (latest-wins + debounce), D10 (shared server DC with
 * map-keyed entries), D12 (Path A single-agent for v1).
 */
import type { AgentFocusEntry } from '@inkeep/open-knowledge-core';

/** Awareness entries older than this are ignored. */
export const AGENT_FOCUS_STALE_MS = 5_000;

/** Debounce window applied to awareness change events before picking primary. */
export const AGENT_FOCUS_DEBOUNCE_MS = 300;

/**
 * Minimal Yjs awareness shape needed by `pickPrimary` — keeps the helper
 * testable without importing the full `y-protocols/awareness` module.
 */
export interface AgentFocusAwareness {
  getStates(): ReadonlyMap<number, AgentFocusState>;
}

export interface AgentFocusState {
  agentFocus?: Record<string, AgentFocusEntry>;
}

/**
 * Pick the single doc the browser should navigate to, given the current
 * awareness snapshot and a "now" timestamp. Aggregates `agentFocus` entries
 * across every awareness peer, filters stale entries (ts older than
 * `AGENT_FOCUS_STALE_MS`) and entries without a `currentDoc`, then returns
 * the latest-ts's `currentDoc`. Returns `null` when no live focus exists.
 */
export function pickPrimary(awareness: AgentFocusAwareness, now: number): string | null {
  const entries: AgentFocusEntry[] = [];
  for (const state of awareness.getStates().values()) {
    const focus = state.agentFocus;
    if (!focus) continue;
    for (const entry of Object.values(focus)) {
      if (!entry.currentDoc) continue;
      if (now - entry.ts >= AGENT_FOCUS_STALE_MS) continue;
      entries.push(entry);
    }
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.ts - a.ts);
  return entries[0].currentDoc;
}
