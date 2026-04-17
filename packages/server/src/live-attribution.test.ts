import { afterEach, describe, expect, test } from 'bun:test';
import {
  getLiveEdit,
  liveAttributionSize,
  recentAgents,
  recordLiveEdit,
  resetLiveAttribution,
  snapshotLiveEdits,
} from './live-attribution.ts';

afterEach(() => {
  resetLiveAttribution();
});

describe('live-attribution', () => {
  test('record + get round-trip', () => {
    recordLiveEdit('doc-a', {
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 1000,
    });
    expect(getLiveEdit('doc-a')).toEqual({
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 1000,
    });
  });

  test('get returns null for unknown doc', () => {
    expect(getLiveEdit('missing')).toBeNull();
  });

  test('record overwrites previous entry for the same doc', () => {
    recordLiveEdit('doc-a', {
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 1000,
    });
    recordLiveEdit('doc-a', {
      agentId: 'agent-2',
      agentName: 'Bob',
      colorSeed: 'bob',
      timestamp: 2000,
    });
    expect(getLiveEdit('doc-a')?.agentId).toBe('agent-2');
    expect(liveAttributionSize()).toBe(1);
  });

  test('snapshot returns a decoupled copy', () => {
    recordLiveEdit('doc-a', {
      agentId: 'a',
      agentName: 'A',
      colorSeed: 'a',
      timestamp: 1,
    });
    const snap = snapshotLiveEdits();
    recordLiveEdit('doc-b', {
      agentId: 'b',
      agentName: 'B',
      colorSeed: 'b',
      timestamp: 2,
    });
    expect(snap.has('doc-a')).toBe(true);
    expect(snap.has('doc-b')).toBe(false);
  });

  test('recentAgents dedupes by agentId and picks the most recent timestamp', () => {
    recordLiveEdit('doc-a', {
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 1000,
    });
    recordLiveEdit('doc-b', {
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 2000,
    });
    recordLiveEdit('doc-c', {
      agentId: 'agent-2',
      agentName: 'Bob',
      colorSeed: 'bob',
      timestamp: 1500,
    });
    const result = recentAgents(10_000, 3000);
    expect(result).toHaveLength(2);
    expect(result[0].agentId).toBe('agent-1');
    expect(result[0].timestamp).toBe(2000);
    expect(result[1].agentId).toBe('agent-2');
  });

  test('recentAgents respects window', () => {
    recordLiveEdit('doc-a', {
      agentId: 'agent-1',
      agentName: 'Alice',
      colorSeed: 'alice',
      timestamp: 1000,
    });
    const result = recentAgents(500, 2000);
    expect(result).toHaveLength(0);
  });
});
