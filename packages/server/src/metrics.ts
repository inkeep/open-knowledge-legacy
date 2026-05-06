import type { BridgeToleranceClass, CC1Channel } from '@inkeep/open-knowledge-core';

export interface ReconciliationMetrics {
  reconcileCount: number;
  conflictCount: number;
  batchCount: number;
  upstreamImportCount: number;
  rescueBufferCount: number;
  branchSwitchCount: number;
  parkCount: number;
  gitAutoSaveFailureCount: number;
  gitWriterCommitFailureCount: number;
  cc1BroadcastCount: number;
  cc1BroadcastDropCount: number;
  cc1SubscriberCount: number;
  cc1LastSeq: Partial<Record<CC1Channel, number>>;
  serverObserverFiresA: number;
  serverObserverFiresB: number;
  serverObserverErrorsA: number;
  serverObserverErrorsB: number;
  persistenceDiskWrites: number;
  bridgeMergeContentLoss: number;
  bridgeMergeCheckpointCreated: number;
  bridgeInvariantViolations: number;
  bridgeInvariantViolationsSuppressed: number;
  persistenceSkipNonQuiescent: number;
  persistenceForceFlushDuringBurst: number;
  collabSocketEpipeCount: number;
  collabSocketEconnresetCount: number;
  collabMessageTooLargeCount: number;
  shadowMigrationLegacyRefsDeleted: number;
  effectDiffCaptureFailures: number;
  agentPresenceMutationErrors: number;
  agentWriteCalls: number;
  summariesProvided: number;
  summariesTruncated: number;
  agentPatchFindMismatches: number;
  bridgeToleranceApplied: Partial<Record<BridgeToleranceClass, number>>;
  observerAPathBFires: number;
  persistenceReconciliationFailures: number;
  externalChangeHandlerErrors: number;
  persistenceSanityCheckSerializeFailures: number;
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
  gitWriterCommitFailureCount: 0,
  cc1BroadcastCount: 0,
  cc1BroadcastDropCount: 0,
  cc1SubscriberCount: 0,
  cc1LastSeq: {},
  serverObserverFiresA: 0,
  serverObserverFiresB: 0,
  serverObserverErrorsA: 0,
  serverObserverErrorsB: 0,
  persistenceDiskWrites: 0,
  bridgeMergeContentLoss: 0,
  bridgeMergeCheckpointCreated: 0,
  bridgeInvariantViolations: 0,
  bridgeInvariantViolationsSuppressed: 0,
  persistenceSkipNonQuiescent: 0,
  persistenceForceFlushDuringBurst: 0,
  collabSocketEpipeCount: 0,
  collabSocketEconnresetCount: 0,
  collabMessageTooLargeCount: 0,
  shadowMigrationLegacyRefsDeleted: 0,
  effectDiffCaptureFailures: 0,
  agentPresenceMutationErrors: 0,
  agentWriteCalls: 0,
  summariesProvided: 0,
  summariesTruncated: 0,
  agentPatchFindMismatches: 0,
  bridgeToleranceApplied: {},
  observerAPathBFires: 0,
  persistenceReconciliationFailures: 0,
  externalChangeHandlerErrors: 0,
  persistenceSanityCheckSerializeFailures: 0,
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

export function incrementGitWriterCommitFailure(): void {
  counters.gitWriterCommitFailureCount++;
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

export function incrementBridgeMergeContentLoss(): void {
  counters.bridgeMergeContentLoss++;
}

export function incrementAgentWriteCalls(): void {
  counters.agentWriteCalls++;
}

export function incrementSummariesProvided(): void {
  counters.summariesProvided++;
}

export function incrementSummariesTruncated(): void {
  counters.summariesTruncated++;
}

export function incrementBridgeMergeCheckpointCreated(): void {
  counters.bridgeMergeCheckpointCreated++;
}

export function incrementBridgeInvariantViolations(): void {
  counters.bridgeInvariantViolations++;
}

export function incrementBridgeInvariantViolationsSuppressed(): void {
  counters.bridgeInvariantViolationsSuppressed++;
}

export function incrementPersistenceSkipNonQuiescent(): void {
  counters.persistenceSkipNonQuiescent++;
}

export function incrementPersistenceForceFlushDuringBurst(): void {
  counters.persistenceForceFlushDuringBurst++;
}

export function incrementAgentPatchFindMismatches(): void {
  counters.agentPatchFindMismatches++;
}

export function incrementBridgeToleranceApplied(toleranceClass: BridgeToleranceClass): void {
  counters.bridgeToleranceApplied[toleranceClass] =
    (counters.bridgeToleranceApplied[toleranceClass] ?? 0) + 1;
}

export function incrementObserverAPathBFires(): void {
  counters.observerAPathBFires++;
}

export function incrementPersistenceReconciliationFailures(): void {
  counters.persistenceReconciliationFailures++;
}

export function incrementExternalChangeHandlerErrors(): void {
  counters.externalChangeHandlerErrors++;
}

export function incrementPersistenceSanityCheckSerializeFailures(): void {
  counters.persistenceSanityCheckSerializeFailures++;
}

export function incrementCollabSocketFilteredError(code: 'EPIPE' | 'ECONNRESET'): void {
  if (code === 'EPIPE') counters.collabSocketEpipeCount++;
  else counters.collabSocketEconnresetCount++;
}

export function incrementCollabMessageTooLarge(): void {
  counters.collabMessageTooLargeCount++;
}

export function incrementShadowMigrationLegacyRefsDeleted(count: number): void {
  counters.shadowMigrationLegacyRefsDeleted += count;
}

export function incrementEffectDiffCaptureFailures(): void {
  counters.effectDiffCaptureFailures++;
}

export function incrementAgentPresenceMutationError(): void {
  counters.agentPresenceMutationErrors++;
}

export function handleCollabSocketError(err: NodeJS.ErrnoException): boolean {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
    incrementCollabSocketFilteredError(err.code);
    return true;
  }
  return false;
}

export function setCC1LastSeq(channel: CC1Channel, seq: number): void {
  counters.cc1LastSeq[channel] = seq;
}

export function getMetrics(): ReconciliationMetrics {
  return {
    ...counters,
    cc1LastSeq: { ...counters.cc1LastSeq },
    bridgeToleranceApplied: { ...counters.bridgeToleranceApplied },
  };
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
  counters.gitWriterCommitFailureCount = 0;
  counters.cc1BroadcastCount = 0;
  counters.cc1BroadcastDropCount = 0;
  counters.cc1SubscriberCount = 0;
  counters.cc1LastSeq = {};
  counters.serverObserverFiresA = 0;
  counters.serverObserverFiresB = 0;
  counters.serverObserverErrorsA = 0;
  counters.serverObserverErrorsB = 0;
  counters.persistenceDiskWrites = 0;
  counters.bridgeMergeContentLoss = 0;
  counters.bridgeMergeCheckpointCreated = 0;
  counters.bridgeInvariantViolations = 0;
  counters.bridgeInvariantViolationsSuppressed = 0;
  counters.persistenceSkipNonQuiescent = 0;
  counters.persistenceForceFlushDuringBurst = 0;
  counters.collabSocketEpipeCount = 0;
  counters.collabSocketEconnresetCount = 0;
  counters.collabMessageTooLargeCount = 0;
  counters.shadowMigrationLegacyRefsDeleted = 0;
  counters.effectDiffCaptureFailures = 0;
  counters.agentPresenceMutationErrors = 0;
  counters.agentWriteCalls = 0;
  counters.summariesProvided = 0;
  counters.summariesTruncated = 0;
  counters.agentPatchFindMismatches = 0;
  counters.bridgeToleranceApplied = {};
  counters.observerAPathBFires = 0;
  counters.persistenceReconciliationFailures = 0;
  counters.externalChangeHandlerErrors = 0;
  counters.persistenceSanityCheckSerializeFailures = 0;
}
