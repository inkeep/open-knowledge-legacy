import { describe, expect, mock, test } from 'bun:test';
import {
  type AppState,
  emptyState,
  type SchemaIncompatibilityDiagnostic,
  type UpdateChannel,
} from '../../src/main/state-store.ts';
import {
  applyConfirmDowngrade,
  applyResetIncompatible,
  applySetChannel,
  applyStateQuery,
  type UpdateStateHandlerDeps,
} from '../../src/main/update-state-handlers.ts';

interface Rig {
  state: AppState;
  pending: SchemaIncompatibilityDiagnostic | null;
  saveCalls: AppState[];
  saveResult: boolean;
  setUpdaterChannelCalls: UpdateChannel[];
  confirmDowngradeCalls: number;
  confirmDowngradeImpl: () => Promise<void>;
  clearPendingCalls: number;
  deps: UpdateStateHandlerDeps;
}

function makeRig(overrides?: {
  state?: AppState;
  pending?: SchemaIncompatibilityDiagnostic | null;
  saveResult?: boolean;
  confirmDowngradeImpl?: () => Promise<void>;
}): Rig {
  const rig: Rig = {
    state: overrides?.state ?? emptyState(),
    pending: overrides?.pending ?? null,
    saveCalls: [],
    saveResult: overrides?.saveResult ?? true,
    setUpdaterChannelCalls: [],
    confirmDowngradeCalls: 0,
    confirmDowngradeImpl: overrides?.confirmDowngradeImpl ?? (() => Promise.resolve()),
    clearPendingCalls: 0,
    deps: undefined as unknown as UpdateStateHandlerDeps,
  };
  rig.deps = {
    getAppState: () => rig.state,
    setAppState: (s) => {
      rig.state = s;
    },
    saveAppState: mock((next: AppState) => {
      rig.saveCalls.push(next);
      return rig.saveResult;
    }),
    setUpdaterChannel: (c) => {
      rig.setUpdaterChannelCalls.push(c);
    },
    confirmDowngrade: () => {
      rig.confirmDowngradeCalls++;
      return rig.confirmDowngradeImpl();
    },
    getPendingSchemaIncompatibility: () => rig.pending,
    clearPendingSchemaIncompatibility: () => {
      rig.clearPendingCalls++;
      rig.pending = null;
    },
  };
  return rig;
}

describe('applySetChannel — happy path', () => {
  test('persists, mirrors to updater, clears pending', async () => {
    const rig = makeRig({
      state: { ...emptyState(), updateChannel: 'latest' },
      pending: {
        currentBuild: '0.4.0',
        persistedSchemaVersion: 999,
        maxSupported: 1,
      },
    });

    await applySetChannel(rig.deps, { channel: 'beta' });

    expect(rig.state.updateChannel).toBe('beta');
    expect(rig.saveCalls).toHaveLength(1);
    expect(rig.saveCalls[0]?.updateChannel).toBe('beta');
    expect(rig.setUpdaterChannelCalls).toEqual(['beta']);
    expect(rig.clearPendingCalls).toBe(1);
    expect(rig.pending).toBeNull();
  });

  test('round-trip latest→beta→latest leaves consistent state', async () => {
    const rig = makeRig();
    await applySetChannel(rig.deps, { channel: 'beta' });
    await applySetChannel(rig.deps, { channel: 'latest' });

    expect(rig.state.updateChannel).toBe('latest');
    expect(rig.setUpdaterChannelCalls).toEqual(['beta', 'latest']);
  });
});

describe('applySetChannel — validation', () => {
  test('rejects invalid channel literal without persisting or mutating', async () => {
    const rig = makeRig();
    const before = rig.state;
    await expect(applySetChannel(rig.deps, { channel: 'rc' as UpdateChannel })).rejects.toThrow(
      /Invalid update channel/,
    );
    expect(rig.state).toBe(before);
    expect(rig.saveCalls).toHaveLength(0);
    expect(rig.setUpdaterChannelCalls).toHaveLength(0);
    expect(rig.clearPendingCalls).toBe(0);
  });
});

describe('applySetChannel — saveAppState rollback', () => {
  test('rollback restores in-memory state and rejects', async () => {
    const original: AppState = { ...emptyState(), updateChannel: 'latest' };
    const rig = makeRig({ state: original, saveResult: false });

    await expect(applySetChannel(rig.deps, { channel: 'beta' })).rejects.toThrow(
      /saveAppState failed/,
    );

    expect(rig.state).toBe(original);
    expect(rig.state.updateChannel).toBe('latest');
    expect(rig.setUpdaterChannelCalls).toHaveLength(0);
    expect(rig.clearPendingCalls).toBe(0);
  });
});

describe('applyConfirmDowngrade', () => {
  test('forwards to confirmDowngrade dep on happy path', async () => {
    const rig = makeRig();
    await applyConfirmDowngrade(rig.deps);
    expect(rig.confirmDowngradeCalls).toBe(1);
  });

  test('propagates downloadUpdate rejection', async () => {
    const rig = makeRig({
      confirmDowngradeImpl: () => Promise.reject(new Error('network drop')),
    });
    await expect(applyConfirmDowngrade(rig.deps)).rejects.toThrow('network drop');
  });
});

describe('applyResetIncompatible — happy path', () => {
  test('wipes state to defaults, mirrors latest channel, clears pending', async () => {
    const polluted: AppState = {
      ...emptyState(),
      updateChannel: 'beta',
      lastOpenedProject: '/tmp/some-project',
    };
    const rig = makeRig({
      state: polluted,
      pending: {
        currentBuild: '0.4.0',
        persistedSchemaVersion: 999,
        maxSupported: 1,
      },
    });

    await applyResetIncompatible(rig.deps);

    expect(rig.state).toEqual(emptyState());
    expect(rig.state.updateChannel).toBe('latest');
    expect(rig.setUpdaterChannelCalls).toEqual(['latest']);
    expect(rig.clearPendingCalls).toBe(1);
    expect(rig.pending).toBeNull();
  });
});

describe('applyResetIncompatible — saveAppState rollback', () => {
  test('rollback restores prior state and rejects', async () => {
    const before: AppState = { ...emptyState(), updateChannel: 'beta' };
    const rig = makeRig({ state: before, saveResult: false });

    await expect(applyResetIncompatible(rig.deps)).rejects.toThrow(/saveAppState failed/);

    expect(rig.state).toBe(before);
    expect(rig.state.updateChannel).toBe('beta');
    expect(rig.setUpdaterChannelCalls).toHaveLength(0);
    expect(rig.clearPendingCalls).toBe(0);
  });
});

describe('applyStateQuery', () => {
  test('returns channel + null when no pending diagnostic', async () => {
    const rig = makeRig({
      state: { ...emptyState(), updateChannel: 'beta' },
    });
    const snapshot = await applyStateQuery(rig.deps);
    expect(snapshot).toEqual({ channel: 'beta', schemaIncompatibility: null });
  });

  test('returns pending diagnostic when armed', async () => {
    const diagnostic: SchemaIncompatibilityDiagnostic = {
      currentBuild: '0.4.0',
      persistedSchemaVersion: 999,
      maxSupported: 1,
    };
    const rig = makeRig({ pending: diagnostic });
    const snapshot = await applyStateQuery(rig.deps);
    expect(snapshot.schemaIncompatibility).toEqual({
      currentBuild: '0.4.0',
      persistedSchemaVersion: 999,
      maxSupported: 1,
    });
  });
});
