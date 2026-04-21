import { describe, expect, test } from 'bun:test';
import type { AgentPresenceEntry } from '@inkeep/open-knowledge-core';
import {
  AGENT_PRESENCE_STALE_MS,
  type AgentPresenceAwareness,
  type AgentPresenceState,
  pickAgentsForDoc,
  pickPrimary,
} from './agent-presence';

function makeAwareness(states: AgentPresenceState[]): AgentPresenceAwareness {
  const map = new Map<number, AgentPresenceState>();
  for (const [i, s] of states.entries()) {
    map.set(i, s);
  }
  return { getStates: () => map };
}

function entry(over: Partial<AgentPresenceEntry> = {}): AgentPresenceEntry {
  return {
    displayName: 'Claude',
    icon: 'claude',
    color: '#D97757',
    currentDoc: 'foo.md',
    mode: 'editing',
    ts: 10_000,
    ...over,
  };
}

describe('pickPrimary', () => {
  const NOW = 10_000;

  test('returns null when awareness is empty', () => {
    expect(pickPrimary(makeAwareness([]), NOW)).toBeNull();
  });

  test('returns null when no peers have agentPresence', () => {
    expect(pickPrimary(makeAwareness([{}]), NOW)).toBeNull();
  });

  test('returns null when all entries have no currentDoc (D8)', () => {
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-A': entry({ currentDoc: null, ts: NOW }) } },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });

  test('returns currentDoc for a single fresh entry', () => {
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-A': entry({ currentDoc: 'foo.md', ts: NOW }) } },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('foo.md');
  });

  test('returns latest-ts across multiple agents (latest-wins)', () => {
    const awareness = makeAwareness([
      {
        agentPresence: {
          'uuid-A': entry({ currentDoc: 'a.md', ts: NOW - 500 }),
          'uuid-B': entry({ currentDoc: 'b.md', ts: NOW - 200 }),
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('b.md');
  });

  test('filters stale entries (older than AGENT_PRESENCE_STALE_MS)', () => {
    const stale = NOW - AGENT_PRESENCE_STALE_MS - 1;
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-A': entry({ currentDoc: 'a.md', ts: stale }) } },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });

  test('live agent overrides stale agent', () => {
    const stale = NOW - AGENT_PRESENCE_STALE_MS - 1;
    const awareness = makeAwareness([
      {
        agentPresence: {
          'uuid-old': entry({ currentDoc: 'old.md', ts: stale }),
          'uuid-new': entry({ currentDoc: 'new.md', ts: NOW - 100 }),
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('new.md');
  });

  test('aggregates across multiple awareness peers (defensive)', () => {
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-A': entry({ currentDoc: 'peer0.md', ts: NOW - 300 }) } },
      { agentPresence: { 'uuid-B': entry({ currentDoc: 'peer1.md', ts: NOW - 100 }) } },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('peer1.md');
  });

  test('stale filter uses strict >= boundary', () => {
    const exactly = NOW - AGENT_PRESENCE_STALE_MS;
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-A': entry({ currentDoc: 'a.md', ts: exactly }) } },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });
});

describe('pickAgentsForDoc', () => {
  const NOW = 10_000;

  test('returns two empty arrays when awareness is empty', () => {
    expect(pickAgentsForDoc(makeAwareness([]), 'foo.md', NOW)).toEqual({
      current: [],
      crossDoc: [],
    });
  });

  test('single agent on active doc lands in current', () => {
    const e = entry({ currentDoc: 'foo.md', ts: NOW });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-A': e } }]);
    expect(pickAgentsForDoc(awareness, 'foo.md', NOW)).toEqual({
      current: [e],
      crossDoc: [],
    });
  });

  test('single agent on different doc lands in crossDoc', () => {
    const e = entry({ currentDoc: 'bar.md', ts: NOW });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-A': e } }]);
    expect(pickAgentsForDoc(awareness, 'foo.md', NOW)).toEqual({
      current: [],
      crossDoc: [e],
    });
  });

  test('two agents, one per doc, split by active doc', () => {
    const onFoo = entry({ currentDoc: 'foo.md', ts: NOW });
    const onBar = entry({ currentDoc: 'bar.md', ts: NOW, displayName: 'Cursor', icon: 'cursor' });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-A': onFoo, 'uuid-B': onBar } }]);
    const { current, crossDoc } = pickAgentsForDoc(awareness, 'foo.md', NOW);
    expect(current).toEqual([onFoo]);
    expect(crossDoc).toEqual([onBar]);
  });

  test('activeDocName === null puts all non-null-currentDoc agents in crossDoc', () => {
    const a = entry({ currentDoc: 'foo.md', ts: NOW });
    const b = entry({ currentDoc: 'bar.md', ts: NOW });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-A': a, 'uuid-B': b } }]);
    const { current, crossDoc } = pickAgentsForDoc(awareness, null, NOW);
    expect(current).toEqual([]);
    // Non-null-asserting here would trip Biome; sort by currentDoc ?? '' instead.
    const byDoc = (x: AgentPresenceEntry, y: AgentPresenceEntry): number =>
      (x.currentDoc ?? '').localeCompare(y.currentDoc ?? '');
    expect([...crossDoc].sort(byDoc)).toEqual([a, b].sort(byDoc));
  });

  test('currentDoc === null agents are dropped (D8)', () => {
    const ghost = entry({ currentDoc: null, ts: NOW });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-ghost': ghost } }]);
    expect(pickAgentsForDoc(awareness, 'foo.md', NOW)).toEqual({
      current: [],
      crossDoc: [],
    });
  });

  test('stale entries are dropped before bucketing', () => {
    const stale = NOW - AGENT_PRESENCE_STALE_MS - 1;
    const live = entry({ currentDoc: 'foo.md', ts: NOW });
    const old = entry({ currentDoc: 'foo.md', ts: stale });
    const awareness = makeAwareness([{ agentPresence: { 'uuid-live': live, 'uuid-stale': old } }]);
    expect(pickAgentsForDoc(awareness, 'foo.md', NOW)).toEqual({
      current: [live],
      crossDoc: [],
    });
  });

  test('mixed peers aggregate across states map', () => {
    const local = entry({ currentDoc: 'foo.md', ts: NOW });
    const remote = entry({
      currentDoc: 'bar.md',
      ts: NOW,
      displayName: 'Cursor',
      icon: 'cursor',
    });
    const awareness = makeAwareness([
      { agentPresence: { 'uuid-local': local } },
      { agentPresence: { 'uuid-remote': remote } },
    ]);
    const { current, crossDoc } = pickAgentsForDoc(awareness, 'foo.md', NOW);
    expect(current).toEqual([local]);
    expect(crossDoc).toEqual([remote]);
  });
});
