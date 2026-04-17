import { describe, expect, test } from 'bun:test';
import {
  AGENT_FOCUS_STALE_MS,
  type AgentFocusAwareness,
  type AgentFocusState,
  pickPrimary,
} from './agent-focus';

function makeAwareness(states: AgentFocusState[]): AgentFocusAwareness {
  const map = new Map<number, AgentFocusState>();
  for (const [i, s] of states.entries()) {
    map.set(i, s);
  }
  return { getStates: () => map };
}

describe('pickPrimary', () => {
  const NOW = 10_000;

  test('returns null when awareness is empty', () => {
    expect(pickPrimary(makeAwareness([]), NOW)).toBeNull();
  });

  test('returns null when no peers have agentFocus', () => {
    expect(pickPrimary(makeAwareness([{}]), NOW)).toBeNull();
  });

  test('returns null when all entries have no currentDoc', () => {
    const awareness = makeAwareness([
      {
        agentFocus: {
          'claude-1': { agentName: 'Claude', currentDoc: null, writeKind: null, ts: NOW },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });

  test('returns currentDoc for a single fresh entry', () => {
    const awareness = makeAwareness([
      {
        agentFocus: {
          'claude-1': { agentName: 'Claude', currentDoc: 'foo.md', writeKind: 'write', ts: NOW },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('foo.md');
  });

  test('returns latest-ts across multiple agents (latest-wins)', () => {
    const awareness = makeAwareness([
      {
        agentFocus: {
          'claude-1': {
            agentName: 'Claude',
            currentDoc: 'a.md',
            writeKind: 'write',
            ts: NOW - 500,
          },
          'claude-2': {
            agentName: 'Claude-B',
            currentDoc: 'b.md',
            writeKind: 'write',
            ts: NOW - 200,
          },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('b.md');
  });

  test('filters stale entries (older than 5s)', () => {
    const stale = NOW - AGENT_FOCUS_STALE_MS - 1;
    const awareness = makeAwareness([
      {
        agentFocus: {
          'claude-1': { agentName: 'Claude', currentDoc: 'a.md', writeKind: 'write', ts: stale },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });

  test('live agent overrides stale agent', () => {
    const stale = NOW - AGENT_FOCUS_STALE_MS - 1;
    const awareness = makeAwareness([
      {
        agentFocus: {
          stale: { agentName: 'Old', currentDoc: 'old.md', writeKind: 'write', ts: stale },
          live: { agentName: 'New', currentDoc: 'new.md', writeKind: 'write', ts: NOW - 100 },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('new.md');
  });

  test('aggregates across multiple awareness peers (defensive)', () => {
    // In practice only the server publishes agentFocus, but the helper should
    // still work if multiple peers did. Two peers, each with one agent.
    const awareness = makeAwareness([
      {
        agentFocus: {
          'a-1': { agentName: 'A', currentDoc: 'peer0.md', writeKind: 'write', ts: NOW - 300 },
        },
      },
      {
        agentFocus: {
          'b-1': { agentName: 'B', currentDoc: 'peer1.md', writeKind: 'write', ts: NOW - 100 },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBe('peer1.md');
  });

  test('stale filter uses strict >= boundary', () => {
    // Exactly AGENT_FOCUS_STALE_MS old is considered stale.
    const exactly = NOW - AGENT_FOCUS_STALE_MS;
    const awareness = makeAwareness([
      {
        agentFocus: {
          'claude-1': { agentName: 'Claude', currentDoc: 'a.md', writeKind: 'write', ts: exactly },
        },
      },
    ]);
    expect(pickPrimary(awareness, NOW)).toBeNull();
  });
});
