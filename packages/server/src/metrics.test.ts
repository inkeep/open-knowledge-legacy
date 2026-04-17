import { describe, expect, test } from 'bun:test';
import {
  getMetrics,
  incrementBatch,
  incrementBranchSwitch,
  incrementBridgeMergeCheckpointCreated,
  incrementBridgeMergeContentLoss,
  incrementConflict,
  incrementPark,
  incrementReconcile,
  incrementRescueBuffer,
  incrementUpstreamImport,
  resetMetrics,
} from './metrics';

describe('reconciliation metrics', () => {
  test('starts with zero counters', () => {
    resetMetrics();
    const m = getMetrics();
    expect(m.reconcileCount).toBe(0);
    expect(m.conflictCount).toBe(0);
    expect(m.batchCount).toBe(0);
    expect(m.upstreamImportCount).toBe(0);
    expect(m.rescueBufferCount).toBe(0);
    expect(m.branchSwitchCount).toBe(0);
    expect(m.parkCount).toBe(0);
    expect(m.bridgeMergeContentLoss).toBe(0);
    expect(m.bridgeMergeCheckpointCreated).toBe(0);
  });

  test('bridge-correctness counters increment independently (SPEC §6 R9)', () => {
    resetMetrics();
    incrementBridgeMergeContentLoss();
    incrementBridgeMergeContentLoss();
    incrementBridgeMergeContentLoss();
    incrementBridgeMergeCheckpointCreated();
    incrementBridgeMergeCheckpointCreated();
    const m = getMetrics();
    expect(m.bridgeMergeContentLoss).toBe(3);
    expect(m.bridgeMergeCheckpointCreated).toBe(2);
  });

  test('increments each counter independently', () => {
    resetMetrics();
    incrementReconcile();
    incrementReconcile();
    incrementConflict();
    incrementBatch();
    incrementBatch();
    incrementBatch();
    incrementUpstreamImport();
    incrementRescueBuffer();
    incrementBranchSwitch();
    incrementPark();
    incrementPark();

    const m = getMetrics();
    expect(m.reconcileCount).toBe(2);
    expect(m.conflictCount).toBe(1);
    expect(m.batchCount).toBe(3);
    expect(m.upstreamImportCount).toBe(1);
    expect(m.rescueBufferCount).toBe(1);
    expect(m.branchSwitchCount).toBe(1);
    expect(m.parkCount).toBe(2);
  });

  test('getMetrics returns a snapshot (not a reference)', () => {
    resetMetrics();
    incrementReconcile();
    const snapshot = getMetrics();
    incrementReconcile();
    expect(snapshot.reconcileCount).toBe(1);
    expect(getMetrics().reconcileCount).toBe(2);
  });

  test('resetMetrics clears all counters', () => {
    incrementReconcile();
    incrementConflict();
    incrementBatch();
    incrementBranchSwitch();
    incrementPark();
    resetMetrics();
    const m = getMetrics();
    for (const [key, value] of Object.entries(m)) {
      if (key === 'cc1LastSeq') {
        expect(value).toEqual({});
      } else {
        expect(value).toBe(0);
      }
    }
  });
});
