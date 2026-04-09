/**
 * Reconciliation metrics — in-memory counters for observability.
 *
 * Exposed via GET /api/metrics/reconciliation.
 */

export interface ReconciliationMetrics {
  reconcileCount: number;
  conflictCount: number;
  batchCount: number;
  upstreamImportCount: number;
  rescueBufferCount: number;
  branchSwitchCount: number;
  parkCount: number;
}

const counters: ReconciliationMetrics = {
  reconcileCount: 0,
  conflictCount: 0,
  batchCount: 0,
  upstreamImportCount: 0,
  rescueBufferCount: 0,
  branchSwitchCount: 0,
  parkCount: 0,
};

export function incrementReconcile(): void {
  counters.reconcileCount++;
}

export function incrementConflict(): void {
  counters.conflictCount++;
}

export function incrementBatch(): void {
  counters.batchCount++;
}

export function incrementUpstreamImport(): void {
  counters.upstreamImportCount++;
}

export function incrementRescueBuffer(): void {
  counters.rescueBufferCount++;
}

export function incrementBranchSwitch(): void {
  counters.branchSwitchCount++;
}

export function incrementPark(): void {
  counters.parkCount++;
}

export function getMetrics(): ReconciliationMetrics {
  return { ...counters };
}

export function resetMetrics(): void {
  counters.reconcileCount = 0;
  counters.conflictCount = 0;
  counters.batchCount = 0;
  counters.upstreamImportCount = 0;
  counters.rescueBufferCount = 0;
  counters.branchSwitchCount = 0;
  counters.parkCount = 0;
}
