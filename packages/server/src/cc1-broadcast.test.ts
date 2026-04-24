import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Hocuspocus } from '@hocuspocus/server';
import {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CONTRACT_VERSION,
  CC1BranchSwitchedPayloadSchema,
  CC1DerivedViewPayloadSchema,
  SYSTEM_DOC_NAME,
} from '@inkeep/open-knowledge-core';
import { CC1Broadcaster, isSystemDoc } from './cc1-broadcast.ts';
import { getMetrics, resetMetrics } from './metrics.ts';

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('isSystemDoc', () => {
  test('returns true for __system__', () => {
    expect(isSystemDoc('__system__')).toBe(true);
  });

  test('returns false for regular doc names', () => {
    expect(isSystemDoc('foo')).toBe(false);
    expect(isSystemDoc('__system__.md')).toBe(false);
    expect(isSystemDoc('')).toBe(false);
    expect(isSystemDoc('test-doc')).toBe(false);
  });

  test('SYSTEM_DOC_NAME matches expected value', () => {
    expect(SYSTEM_DOC_NAME).toBe('__system__');
  });

  test('CC1_CONTRACT_VERSION is 1', () => {
    expect(CC1_CONTRACT_VERSION).toBe(1);
  });
});

describe('CC1Broadcaster', () => {
  let broadcaster: CC1Broadcaster;
  let broadcasts: string[];
  let mockDoc: { broadcastStateless: (p: string) => void; getConnectionsCount: () => number };
  let mockHocuspocus: { documents: Map<string, typeof mockDoc> };

  beforeEach(() => {
    resetMetrics();
    broadcasts = [];
    mockDoc = {
      broadcastStateless: (payload: string) => {
        broadcasts.push(payload);
      },
      getConnectionsCount: () => 2,
    };
    mockHocuspocus = {
      documents: new Map([[SYSTEM_DOC_NAME, mockDoc]]),
    };
    broadcaster = new CC1Broadcaster(mockHocuspocus as unknown as Hocuspocus);
  });

  afterEach(() => {
    broadcaster.destroy();
  });

  test('debounce collapses 10 rapid signal() calls into 1 broadcast', async () => {
    for (let i = 0; i < 10; i++) {
      broadcaster.signal('files');
    }
    await wait(150);
    expect(broadcasts).toHaveLength(1);
    const payload = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[0]));
    expect(payload).toEqual({ v: 1, ch: 'files', seq: 1 });
  });

  test('debounce per-channel independence', async () => {
    broadcaster.signal('files');
    await wait(50);
    broadcaster.signal('backlinks');
    await wait(70);

    // 'files' should have fired at ~100ms, 'backlinks' not yet
    expect(broadcasts).toHaveLength(1);
    const first = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[0]));
    expect(first.ch).toBe('files');

    await wait(50);
    // 'backlinks' should have fired by now (~120ms after its signal)
    expect(broadcasts).toHaveLength(2);
    const second = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[1]));
    expect(second.ch).toBe('backlinks');
    expect(second.seq).toBe(1);
  });

  test('seq monotonicity per channel', async () => {
    broadcaster.signal('files');
    await wait(120);
    broadcaster.signal('files');
    await wait(120);
    broadcaster.signal('files');
    await wait(120);

    expect(broadcasts).toHaveLength(3);
    const seqs = broadcasts.map((b) => CC1DerivedViewPayloadSchema.parse(JSON.parse(b)).seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  test('seq is independent per channel', async () => {
    broadcaster.signal('files');
    await wait(120);
    broadcaster.signal('backlinks');
    await wait(120);
    broadcaster.signal('files');
    await wait(120);

    expect(broadcasts).toHaveLength(3);
    const payloads = broadcasts.map((b) => CC1DerivedViewPayloadSchema.parse(JSON.parse(b)));
    expect(payloads[0]).toEqual({ v: 1, ch: 'files', seq: 1 });
    expect(payloads[1]).toEqual({ v: 1, ch: 'backlinks', seq: 1 });
    expect(payloads[2]).toEqual({ v: 1, ch: 'files', seq: 2 });
  });

  test('graceful no-op when Document missing', async () => {
    mockHocuspocus.documents.clear();
    broadcaster.signal('files');
    await wait(150);
    expect(broadcasts).toHaveLength(0);
  });

  test('destroy clears pending timers', async () => {
    broadcaster.signal('files');
    broadcaster.destroy();
    await wait(150);
    expect(broadcasts).toHaveLength(0);
  });

  test('subscriberCount returns connection count', () => {
    expect(broadcaster.subscriberCount).toBe(2);
  });

  test('subscriberCount returns 0 when document missing', () => {
    mockHocuspocus.documents.clear();
    expect(broadcaster.subscriberCount).toBe(0);
  });

  test('metrics updated on broadcast', async () => {
    broadcaster.signal('files');
    await wait(120);
    broadcaster.signal('files');
    await wait(120);
    broadcaster.signal('files');
    await wait(120);

    const m = getMetrics();
    expect(m.cc1BroadcastCount).toBe(3);
    expect(m.cc1LastSeq.files).toBe(3);
    expect(m.cc1SubscriberCount).toBe(2);
  });

  test('payload shape matches CC1 contract v1', async () => {
    broadcaster.signal('files');
    await wait(150);
    const payload = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[0]));
    expect(payload).toEqual({ v: 1, ch: 'files', seq: 1 });
    expect(Object.keys(payload).sort()).toEqual(['ch', 'seq', 'v']);
  });

  test('CC1_CHANNEL_BRANCH_SWITCHED exported as "branch-switched"', () => {
    expect(CC1_CHANNEL_BRANCH_SWITCHED).toBe('branch-switched');
  });

  test('emitBranchSwitched publishes payload with branch + seq=1 on first call', () => {
    broadcaster.emitBranchSwitched('main');
    expect(broadcasts).toHaveLength(1);
    const payload = CC1BranchSwitchedPayloadSchema.parse(JSON.parse(broadcasts[0]));
    expect(payload).toEqual({
      v: 1,
      ch: CC1_CHANNEL_BRANCH_SWITCHED,
      seq: 1,
      branch: 'main',
    });
  });

  test('emitBranchSwitched emits synchronously — no debounce', () => {
    broadcaster.emitBranchSwitched('feature-x');
    // No wait — branch switches are discrete events, emit immediately.
    expect(broadcasts).toHaveLength(1);
  });

  test('emitBranchSwitched seq increments monotonically across calls', () => {
    broadcaster.emitBranchSwitched('main');
    broadcaster.emitBranchSwitched('feature-x');
    broadcaster.emitBranchSwitched('feature-y');
    expect(broadcasts).toHaveLength(3);
    const seqs = broadcasts.map((b) => CC1BranchSwitchedPayloadSchema.parse(JSON.parse(b)).seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  test('emitBranchSwitched carries the supplied branch name', () => {
    broadcaster.emitBranchSwitched('main');
    broadcaster.emitBranchSwitched('detached-abc123');
    broadcaster.emitBranchSwitched('feature/user-auth');
    const branches = broadcasts.map(
      (b) => CC1BranchSwitchedPayloadSchema.parse(JSON.parse(b)).branch,
    );
    expect(branches).toEqual(['main', 'detached-abc123', 'feature/user-auth']);
  });

  test('emitBranchSwitched broadcasts on __system__ doc', () => {
    // Remove __system__ — emit must be a no-op (graceful degradation like signal()).
    mockHocuspocus.documents.clear();
    broadcaster.emitBranchSwitched('main');
    expect(broadcasts).toHaveLength(0);
  });

  test('emitBranchSwitched updates cc1LastSeq metric for branch-switched channel', () => {
    broadcaster.emitBranchSwitched('main');
    broadcaster.emitBranchSwitched('feature-x');
    const m = getMetrics();
    expect(m.cc1LastSeq[CC1_CHANNEL_BRANCH_SWITCHED]).toBe(2);
    expect(m.cc1BroadcastCount).toBe(2);
  });

  test('emitBranchSwitched seq independent from signal()-driven channels', async () => {
    broadcaster.signal('files');
    await wait(120);
    broadcaster.emitBranchSwitched('main');
    broadcaster.signal('files');
    await wait(120);

    // First + third broadcasts are derived-view ('files'); second is branch-switched.
    const derived0 = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[0]));
    const branchSwitch = CC1BranchSwitchedPayloadSchema.parse(JSON.parse(broadcasts[1]));
    const derived2 = CC1DerivedViewPayloadSchema.parse(JSON.parse(broadcasts[2]));
    expect(derived0).toMatchObject({ ch: 'files', seq: 1 });
    expect(branchSwitch).toMatchObject({ ch: CC1_CHANNEL_BRANCH_SWITCHED, seq: 1, branch: 'main' });
    expect(derived2).toMatchObject({ ch: 'files', seq: 2 });
  });
});
