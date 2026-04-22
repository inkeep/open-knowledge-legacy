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
  /** Count of per-writer fan-out commitWipFromTree failures (US-014, D38). */
  gitWriterCommitFailureCount: number;
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
  /** Bridge-correctness SPEC §6 R9 — count of Observer A Path B
   *  content-preservation post-condition violations. Calibration signal
   *  for the parallel single-CRDT-collapse exploration. */
  bridgeMergeContentLoss: number;
  /** Bridge-correctness SPEC §6 R9 — count of successful silent rescue
   *  checkpoints written via saveInMemoryCheckpoint. Bounds the rate a user
   *  might see in TimelinePanel; if high, R7c coalescing becomes worth adding. */
  bridgeMergeCheckpointCreated: number;
  /** Collab WebSocket upgrade sockets emitting EPIPE from `ws.send()` AFTER
   *  the call returned control — kernel-level TCP race against a peer that
   *  has sent FIN. Filtered at the socket-boundary listener per precedent
   *  §23 (known-safe at half-close). Counted for observability: a spike
   *  indicates upstream network load or peer-disconnect patterns worth
   *  investigating, even though individual events are expected. */
  collabSocketEpipeCount: number;
  /** Collab WebSocket upgrade sockets emitting ECONNRESET — peer-side
   *  unclean close (RST). Same precedent §23 filter boundary; same
   *  observability rationale as `collabSocketEpipeCount`. */
  collabSocketEconnresetCount: number;
  /** Count of legacy WIP refs deleted by the allowlist-based sweep in
   *  initShadowRepo on first run post-upgrade (US-018, NFR-6, D35). */
  shadowMigrationLegacyRefsDeleted: number;
  /** Count of captureEffect failures (US-022, D37). Prod swallows; dev/test throws. */
  effectDiffCaptureFailures: number;
  /** Count of awareness-mutation failures in `AgentPresenceBroadcaster`
   *  (setPresence / clearPresence / touchMode catching a throw from
   *  `awareness.setLocalState`). Each failure logs at ERROR but the call
   *  sites (HTTP handlers, keepalive close) swallow the return and move
   *  on, so the counter is the operator-visible signal that presence is
   *  silently dropping. A non-zero value means the badge state on clients
   *  may disagree with what the server thinks it published — investigate
   *  the correlated `[agent-presence] awareness mutation failed` log line. */
  agentPresenceMutationErrors: number;
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
  collabSocketEpipeCount: 0,
  collabSocketEconnresetCount: 0,
  shadowMigrationLegacyRefsDeleted: 0,
  effectDiffCaptureFailures: 0,
  agentPresenceMutationErrors: 0,
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

export function incrementBridgeMergeCheckpointCreated(): void {
  counters.bridgeMergeCheckpointCreated++;
}

/**
 * Record a filtered collab-socket error. Prefer `handleCollabSocketError`
 * at call sites — it pairs the classify + counter update atomically so the
 * two can't drift. This low-level function is exported for tests.
 */
export function incrementCollabSocketFilteredError(code: 'EPIPE' | 'ECONNRESET'): void {
  if (code === 'EPIPE') counters.collabSocketEpipeCount++;
  else counters.collabSocketEconnresetCount++;
}

/**
 * Classify a collab-socket error. Returns `true` if the error is a
 * known-safe kernel TCP-teardown signal (EPIPE or ECONNRESET) that should
 * be filtered out of logs per precedent §23. As a side effect, increments
 * the corresponding per-code metric counter so operators can see the rate
 * during incident triage.
 *
 * Returns `false` for any other error code — the caller surfaces those
 * via their normal logging path.
 *
 * Contract: callers MUST use this helper rather than re-implementing the
 * `code === 'EPIPE' || code === 'ECONNRESET'` check inline. Centralizing
 * the filter surface prevents future skew (e.g., if ETIMEDOUT or ECONNABORTED
 * become known-safe, the decision flips in one place).
 *
 * Usage shape:
 *
 *   socket.on('error', (err: NodeJS.ErrnoException) => {
 *     if (handleCollabSocketError(err)) return;
 *     log.error({ err }, 'Upgrade socket error');
 *   });
 *
 *   ws.on('error', (err: NodeJS.ErrnoException) => {
 *     if (!handleCollabSocketError(err)) {
 *       log.error({ err }, 'WebSocket error');
 *     }
 *     ws.terminate();
 *   });
 */
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
  counters.collabSocketEpipeCount = 0;
  counters.collabSocketEconnresetCount = 0;
  counters.shadowMigrationLegacyRefsDeleted = 0;
  counters.effectDiffCaptureFailures = 0;
  counters.agentPresenceMutationErrors = 0;
}
