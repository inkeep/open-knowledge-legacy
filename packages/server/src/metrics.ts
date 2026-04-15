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
  gitAutoSaveFailureCount: number;
  cc1BroadcastCount: number;
  cc1BroadcastDropCount: number;
  cc1SubscriberCount: number;
  cc1LastSeq: Record<string, number>;
  serverObserverFiresA: number;
  serverObserverFiresB: number;
  serverObserverErrorsA: number;
  serverObserverErrorsB: number;
  /** Count of successful atomic disk writes from persistence.onStoreDocument.
   *  Used as the Mutation F regression gate: if OBSERVER_SYNC_ORIGIN drops
   *  skipStoreHooks, onStoreDocument fires on every observer write and
   *  produces amplified disk I/O. Under skipStoreHooks: true, a single
   *  agent-write produces exactly one persistence disk write. */
  persistenceDiskWrites: number;
}

const counters: ReconciliationMetrics = {
  reconcileCount: 0,
  conflictCount: 0,
  batchCount: 0,
  upstreamImportCount: 0,
  rescueBufferCount: 0,
  branchSwitchCount: 0,
  parkCount: 0,
  gitAutoSaveFailureCount: 0,
  cc1BroadcastCount: 0,
  cc1BroadcastDropCount: 0,
  cc1SubscriberCount: 0,
  cc1LastSeq: {},
  serverObserverFiresA: 0,
  serverObserverFiresB: 0,
  serverObserverErrorsA: 0,
  serverObserverErrorsB: 0,
  persistenceDiskWrites: 0,
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

export function incrementGitAutoSaveFailure(): void {
  counters.gitAutoSaveFailureCount++;
}

export function incrementCC1Broadcast(): void {
  counters.cc1BroadcastCount++;
}

export function incrementCC1BroadcastDrop(): void {
  counters.cc1BroadcastDropCount++;
}

export function setCC1SubscriberCount(count: number): void {
  counters.cc1SubscriberCount = count;
}

export function incrementServerObserverFire(direction: 'a' | 'b'): void {
  if (direction === 'a') counters.serverObserverFiresA++;
  else counters.serverObserverFiresB++;
}

export function incrementPersistenceDiskWrite(): void {
  counters.persistenceDiskWrites++;
}

export function incrementServerObserverError(direction: 'a' | 'b'): void {
  if (direction === 'a') counters.serverObserverErrorsA++;
  else counters.serverObserverErrorsB++;
}

export function setCC1LastSeq(channel: string, seq: number): void {
  counters.cc1LastSeq[channel] = seq;
}

export function getMetrics(): ReconciliationMetrics {
  return { ...counters, cc1LastSeq: { ...counters.cc1LastSeq } };
}

export function resetMetrics(): void {
  counters.reconcileCount = 0;
  counters.conflictCount = 0;
  counters.batchCount = 0;
  counters.upstreamImportCount = 0;
  counters.rescueBufferCount = 0;
  counters.branchSwitchCount = 0;
  counters.parkCount = 0;
  counters.gitAutoSaveFailureCount = 0;
  counters.cc1BroadcastCount = 0;
  counters.cc1BroadcastDropCount = 0;
  counters.cc1SubscriberCount = 0;
  counters.cc1LastSeq = {};
  counters.serverObserverFiresA = 0;
  counters.serverObserverFiresB = 0;
  counters.serverObserverErrorsA = 0;
  counters.serverObserverErrorsB = 0;
  counters.persistenceDiskWrites = 0;
}
