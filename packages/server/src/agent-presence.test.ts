import { beforeEach, describe, expect, test } from 'bun:test';
import type { Hocuspocus } from '@hocuspocus/server';
import { type AgentPresenceEntry, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import { AgentPresenceBroadcaster } from './agent-presence.ts';

function makeMockAwareness() {
  let state: Record<string, unknown> | null = null;
  return {
    getLocalState: () => state,
    setLocalState: (next: Record<string, unknown> | null) => {
      state = next;
    },
    _read: () => state,
  };
}

function makeMockHocuspocus(awareness: ReturnType<typeof makeMockAwareness> | null) {
  const docs = new Map<string, { awareness: typeof awareness }>();
  if (awareness) docs.set(SYSTEM_DOC_NAME, { awareness });
  return { documents: docs } as unknown as Hocuspocus;
}

function entry(over: Partial<AgentPresenceEntry> = {}): AgentPresenceEntry {
  return {
    displayName: 'Claude',
    icon: 'claude',
    color: '#D97757',
    currentDoc: 'foo.md',
    mode: 'editing',
    ts: 100,
    ...over,
  };
}

describe('AgentPresenceBroadcaster', () => {
  let awareness: ReturnType<typeof makeMockAwareness>;
  let broadcaster: AgentPresenceBroadcaster;

  beforeEach(() => {
    awareness = makeMockAwareness();
    broadcaster = new AgentPresenceBroadcaster(makeMockHocuspocus(awareness));
  });

  test('getPresenceMap starts empty', () => {
    expect(broadcaster.getPresenceMap()).toEqual({});
  });

  test('setPresence writes a keyed entry', () => {
    broadcaster.setPresence('uuid-A', entry({ displayName: 'Claude', currentDoc: 'a.md' }));
    expect(broadcaster.getPresenceMap()).toEqual({
      'uuid-A': entry({ displayName: 'Claude', currentDoc: 'a.md' }),
    });
  });

  test('setPresence upserts existing agentId without clobbering other agents', () => {
    broadcaster.setPresence(
      'uuid-A',
      entry({ displayName: 'Claude', currentDoc: 'a.md', ts: 100 }),
    );
    broadcaster.setPresence(
      'uuid-B',
      entry({ displayName: 'Cursor', icon: 'cursor', currentDoc: 'b.md', ts: 200 }),
    );

    broadcaster.setPresence(
      'uuid-A',
      entry({ displayName: 'Claude', currentDoc: 'a2.md', ts: 300, mode: 'idle' }),
    );

    const map = broadcaster.getPresenceMap();
    expect(Object.keys(map).sort()).toEqual(['uuid-A', 'uuid-B']);
    expect(map['uuid-A'].currentDoc).toBe('a2.md');
    expect(map['uuid-A'].mode).toBe('idle');
    expect(map['uuid-A'].ts).toBe(300);
    expect(map['uuid-B'].currentDoc).toBe('b.md');
    expect(map['uuid-B'].displayName).toBe('Cursor');
  });

  test('clearPresence removes only the target agentId', () => {
    broadcaster.setPresence('uuid-A', entry({ currentDoc: 'a.md', ts: 100 }));
    broadcaster.setPresence('uuid-B', entry({ currentDoc: 'b.md', ts: 200 }));

    broadcaster.clearPresence('uuid-A');

    const map = broadcaster.getPresenceMap();
    expect(Object.keys(map)).toEqual(['uuid-B']);
    expect(map['uuid-B'].currentDoc).toBe('b.md');
  });

  test('clearPresence on unknown agentId is a no-op', () => {
    broadcaster.setPresence('uuid-A', entry({ currentDoc: 'a.md', ts: 100 }));
    broadcaster.clearPresence('never-existed');

    expect(broadcaster.getPresenceMap()).toEqual({
      'uuid-A': entry({ currentDoc: 'a.md', ts: 100 }),
    });
  });

  test('touchMode updates mode + ts but preserves other fields', () => {
    broadcaster.setPresence(
      'uuid-A',
      entry({
        displayName: 'Claude',
        icon: 'claude',
        color: '#D97757',
        currentDoc: 'a.md',
        mode: 'editing',
        ts: 100,
      }),
    );

    const before = Date.now();
    broadcaster.touchMode('uuid-A', 'idle');
    const after = Date.now();

    const map = broadcaster.getPresenceMap();
    expect(map['uuid-A'].displayName).toBe('Claude');
    expect(map['uuid-A'].icon).toBe('claude');
    expect(map['uuid-A'].color).toBe('#D97757');
    expect(map['uuid-A'].currentDoc).toBe('a.md');
    expect(map['uuid-A'].mode).toBe('idle');
    expect(map['uuid-A'].ts).toBeGreaterThanOrEqual(before);
    expect(map['uuid-A'].ts).toBeLessThanOrEqual(after);
  });

  test('touchMode is a no-op when the agent has no existing entry (never creates half-populated)', () => {
    // Seed another agent's entry so the map isn't trivially empty.
    broadcaster.setPresence('uuid-A', entry({ displayName: 'Claude', currentDoc: 'a.md' }));

    broadcaster.touchMode('uuid-ghost', 'editing');

    const map = broadcaster.getPresenceMap();
    expect(Object.keys(map)).toEqual(['uuid-A']);
    expect(map['uuid-ghost']).toBeUndefined();
  });

  test('graceful no-op when __system__ document is missing', () => {
    const noopBroadcaster = new AgentPresenceBroadcaster(makeMockHocuspocus(null));
    // None of these should throw, and all reads return empty.
    noopBroadcaster.setPresence('uuid-A', entry({ currentDoc: 'foo.md' }));
    noopBroadcaster.clearPresence('uuid-A');
    noopBroadcaster.touchMode('uuid-A', 'idle');
    expect(noopBroadcaster.getPresenceMap()).toEqual({});
  });

  test('two agents coexist as separate map entries (bug-fix premise)', () => {
    broadcaster.setPresence(
      'uuid-A',
      entry({ displayName: 'Claude', icon: 'claude', currentDoc: 'a.md', ts: 100 }),
    );
    broadcaster.setPresence(
      'uuid-B',
      entry({ displayName: 'Cursor', icon: 'cursor', currentDoc: 'b.md', ts: 150 }),
    );

    const map = broadcaster.getPresenceMap();
    expect(Object.keys(map).length).toBe(2);
    expect(map['uuid-A'].displayName).toBe('Claude');
    expect(map['uuid-A'].currentDoc).toBe('a.md');
    expect(map['uuid-B'].displayName).toBe('Cursor');
    expect(map['uuid-B'].currentDoc).toBe('b.md');
  });

  test('setPresence preserves unrelated awareness fields on __system__ state', () => {
    // Simulate the CC1 broadcaster or another subsystem seeding state first.
    awareness.setLocalState({ someOtherField: { v: 1 } });

    broadcaster.setPresence('uuid-A', entry({ currentDoc: 'a.md' }));

    const state = awareness._read() as {
      someOtherField?: { v: number };
      agentPresence?: Record<string, AgentPresenceEntry>;
    };
    expect(state.someOtherField).toEqual({ v: 1 });
    expect(state.agentPresence?.['uuid-A']).toBeDefined();
  });
});
