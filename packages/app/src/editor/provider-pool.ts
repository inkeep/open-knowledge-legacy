import { HocuspocusProvider } from '@hocuspocus/provider';
import { MarkdownManager } from '@inkeep/open-knowledge-core';
import type {
  HocuspocusAuthRejectionReason,
  HocuspocusAuthToken,
} from '@inkeep/open-knowledge-server';
import { getSchema } from '@tiptap/core';
import * as Y from 'yjs';
import { mark } from '../lib/perf/mark';
import {
  type ClientPersistenceProvider,
  captureStateVector,
  computeUnsyncedUpdate,
  createClientPersistence,
  mergeStateVectors,
  UNKNOWN_BRANCH_SENTINEL,
} from './client-persistence';
import { appendTraceContextToCollabUrl } from './collab-otel';
import { sharedExtensions } from './extensions/shared.ts';
import { isSystemDoc } from './is-system-doc';
import { setupObservers } from './observers';
import { BridgeSetupError, invalidateSyncPromise, rejectSyncPromise } from './sync-promise';

export const TAB_REPLAY_ORIGIN = Object.freeze({ kind: 'tab-replay' } as const);

export type SyncState = 'connecting' | 'synced' | 'disconnected';
export type ServerRestartRecoveryState =
  | { kind: 'idle' }
  | {
      kind: 'recovering';
      phase: 'clearing-local-cache' | 'reconnecting';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
      clearFailureReason?: 'clear-data-failed' | 'clear-data-timeout';
    }
  | {
      kind: 'failed';
      reason: 'clear-data-failed' | 'clear-data-timeout';
      docNames: readonly string[];
      failedDocNames: readonly string[];
      startedAt: number;
    };

const IDLE_SERVER_RESTART_RECOVERY: ServerRestartRecoveryState = Object.freeze({ kind: 'idle' });

interface PoolEntryBase {
  provider: HocuspocusProvider;
  docName: string;
  lastAccessedAt: number;
  syncState: SyncState;
  hasSynced: boolean;
  bridgeSetupFailed: boolean;
  lastServerSyncedSV: Uint8Array | null;
  lastDiskAckedSV: Uint8Array | null;
}

interface ActivePoolEntry extends PoolEntryBase {
  kind: 'active';
  persistence: ClientPersistenceProvider | null;
  observerCleanup: (() => void) | null;
  pendingRecycleTimer: ReturnType<typeof setTimeout> | null;
}

interface TearingDownPoolEntry extends PoolEntryBase {
  kind: 'tearing-down';
  persistence: null;
  observerCleanup: null;
  pendingRecycleTimer: null;
}

type PoolEntry = ActivePoolEntry | TearingDownPoolEntry;

type PoolChangeCallback = () => void;

const editorSchema = getSchema(sharedExtensions);

const RECYCLE_DEBOUNCE_MS = 4_000;
const CLEAR_DATA_TIMEOUT_MS = 10_000;

type ClientPersistenceFactory = (args: {
  branch: string;
  serverInstanceId: string;
  docName: string;
  doc: Y.Doc;
}) => ClientPersistenceProvider;

class ClientPersistenceClearTimeoutError extends Error {
  constructor(
    readonly docName: string,
    readonly timeoutMs: number,
  ) {
    super(`client persistence clearData timed out for ${docName} after ${timeoutMs}ms`);
    this.name = 'ClientPersistenceClearTimeoutError';
  }
}

const LAST_OBSERVED_BRANCH_KEY = 'ok-last-observed-branch';

const FORCE_SYNC_INTERVAL_MS = 5_000;

const MAX_BUFFER_BYTES = 1 * 1024 * 1024;

export const MAX_POOL = 10;

export function buildAuthToken(
  tabIdentity: { principalId: string; tabSessionId: string } | null,
  expectedServerInstanceId: string | null,
  expectedBranch: string | null = null,
): string | undefined {
  const claim: HocuspocusAuthToken = {};
  if (tabIdentity !== null) {
    claim.principalId = tabIdentity.principalId;
    claim.tabSessionId = tabIdentity.tabSessionId;
  }
  if (expectedServerInstanceId !== null && expectedServerInstanceId.length > 0) {
    claim.expectedServerInstanceId = expectedServerInstanceId;
  }
  if (expectedBranch !== null && expectedBranch.length > 0) {
    claim.expectedBranch = expectedBranch;
  }
  if (Object.keys(claim).length === 0) return undefined;
  return JSON.stringify(claim);
}

export class ProviderPool {
  private readonly _entries = new Map<string, PoolEntry>();
  get entries(): ReadonlyMap<string, PoolEntry> {
    return this._entries;
  }
  private lruOrder: string[] = [];
  private activeDocName: string | null = null;
  private readonly maxSize: number;
  private readonly wsUrl: string;
  private readonly recycleDebounceMs: number;
  private readonly clearDataTimeoutMs: number;
  private onChange: PoolChangeCallback | null = null;
  private tabIdentity: { principalId: string; tabSessionId: string } | null = null;
  private serverRestartRecoveryState: ServerRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
  private cachedServerInstanceId: string | null = null;
  private pendingServerInstanceKnown: {
    promise: Promise<string>;
    resolve: (id: string) => void;
  } | null = null;
  private recoveryMismatchStaleClaim: string | undefined;
  private readonly bufferedUpdates = new Map<string, Uint8Array>();
  private readonly persistenceFactory: ClientPersistenceFactory;

  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

  constructor(
    maxSize: number,
    wsUrl: string,
    options?: {
      recycleDebounceMs?: number;
      clearDataTimeoutMs?: number;
      storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
      persistenceFactory?: ClientPersistenceFactory;
    },
  ) {
    this.maxSize = maxSize;
    this.wsUrl = wsUrl;
    this.recycleDebounceMs = options?.recycleDebounceMs ?? RECYCLE_DEBOUNCE_MS;
    this.clearDataTimeoutMs = options?.clearDataTimeoutMs ?? CLEAR_DATA_TIMEOUT_MS;
    this.persistenceFactory = options?.persistenceFactory ?? createClientPersistence;
    if (options?.storage !== undefined) {
      this.storage = options.storage;
    } else {
      this.storage =
        typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
    }
  }

  setTabIdentity(identity: { principalId: string; tabSessionId: string }): void {
    this.tabIdentity = identity;
  }

  setExpectedServerInstanceId(id: string | null): void {
    this.cachedServerInstanceId = id;
    if (id === null || id.length === 0) return;
    if (this.pendingServerInstanceKnown !== null) {
      const pending = this.pendingServerInstanceKnown;
      this.pendingServerInstanceKnown = null;
      pending.resolve(id);
    }
    this.attachDeferredPersistence(id);
  }

  whenServerInstanceKnown(): Promise<string> {
    if (this.cachedServerInstanceId !== null && this.cachedServerInstanceId.length > 0) {
      return Promise.resolve(this.cachedServerInstanceId);
    }
    if (this.pendingServerInstanceKnown !== null) {
      return this.pendingServerInstanceKnown.promise;
    }
    let resolve!: (id: string) => void;
    const promise = new Promise<string>((res) => {
      resolve = res;
    });
    this.pendingServerInstanceKnown = { promise, resolve };
    return promise;
  }

  private buildPersistence(
    serverInstanceId: string,
    docName: string,
    doc: Y.Doc,
  ): ClientPersistenceProvider {
    return this.persistenceFactory({
      branch: this.getOrInitObservedBranch() ?? UNKNOWN_BRANCH_SENTINEL,
      serverInstanceId,
      docName,
      doc,
    });
  }

  private attachDeferredPersistence(serverInstanceId: string): void {
    for (const entry of this._entries.values()) {
      if (entry.kind !== 'active') continue;
      if (entry.persistence !== null) continue;
      try {
        entry.persistence = this.buildPersistence(
          serverInstanceId,
          entry.docName,
          entry.provider.document,
        );
      } catch (err: unknown) {
        const errorName = err instanceof Error ? err.name : 'non-error-throw';
        this.emitStructuredClientRecoveryEvent({
          event: 'ok-client-persistence-attach-failed',
          ...this.recoveryTelemetryBase(entry.docName),
          errorName,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  getServerRestartRecoveryState(): ServerRestartRecoveryState {
    return this.serverRestartRecoveryState;
  }

  observeDiskAck(docName: string, sv: Uint8Array): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;
    entry.lastDiskAckedSV = mergeStateVectors(entry.lastDiskAckedSV, sv);
  }

  observeDiskAckBatch(svsByDocName: Record<string, Uint8Array>): void {
    for (const [docName, sv] of Object.entries(svsByDocName)) {
      this.observeDiskAck(docName, sv);
    }
  }

  private lastObservedBranch: string | null = null;
  private lastObservedBranchInitialized = false;

  private getOrInitObservedBranch(): string | null {
    if (this.lastObservedBranchInitialized) return this.lastObservedBranch;
    this.lastObservedBranchInitialized = true;
    try {
      const stored = this.storage?.getItem(LAST_OBSERVED_BRANCH_KEY) ?? null;
      if (stored !== null && stored.length > 0) {
        this.lastObservedBranch = stored;
      }
    } catch {
    }
    return this.lastObservedBranch;
  }

  private persistObservedBranch(branch: string | null): void {
    this.lastObservedBranch = branch;
    this.lastObservedBranchInitialized = true;
    try {
      if (branch === null || branch.length === 0) {
        this.storage?.removeItem(LAST_OBSERVED_BRANCH_KEY);
      } else {
        this.storage?.setItem(LAST_OBSERVED_BRANCH_KEY, branch);
      }
    } catch {
    }
  }

  private withClearDataTimeout(docName: string, promise: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ClientPersistenceClearTimeoutError(docName, this.clearDataTimeoutMs));
      }, this.clearDataTimeoutMs);
      promise.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (err: unknown) => {
          clearTimeout(timeout);
          reject(err);
        },
      );
    });
  }

  private recoveryTelemetryBase(
    docName: string,
    staleClaimOverride?: string | undefined,
  ): { docName: string; branch: string; serverInstanceId?: string } {
    const branch = this.getOrInitObservedBranch() ?? UNKNOWN_BRANCH_SENTINEL;
    const base: { docName: string; branch: string; serverInstanceId?: string } = {
      docName,
      branch,
    };
    const stale =
      staleClaimOverride !== undefined ? staleClaimOverride : this.recoveryMismatchStaleClaim;
    if (stale !== undefined && stale.length > 0) {
      base.serverInstanceId = stale;
    }
    return base;
  }

  private emitStructuredClientRecoveryEvent(parts: Record<string, string | number>): void {
    console.warn(JSON.stringify(parts));
  }

  private clearRecoveryMismatchStaleClaimIfTerminal(): void {
    const kind = this.serverRestartRecoveryState.kind;
    if (kind === 'idle' || kind === 'failed') {
      this.recoveryMismatchStaleClaim = undefined;
    }
  }

  private beginServerRestartRecovery(docNames: readonly string[], startedAt: number): void {
    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'clearing-local-cache',
      docNames,
      failedDocNames: [],
      startedAt,
    };
    for (const docName of docNames) {
      invalidateSyncPromise(docName);
    }
    this.notify();
  }

  private enterServerRestartReconnect(
    docNames: readonly string[],
    failedDocNames: readonly string[],
    startedAt: number,
    failureReason: 'clear-data-failed' | 'clear-data-timeout',
  ): void {
    if (docNames.length === 0) {
      this.serverRestartRecoveryState =
        failedDocNames.length === 0
          ? IDLE_SERVER_RESTART_RECOVERY
          : {
              kind: 'failed',
              reason: failureReason,
              docNames: failedDocNames,
              failedDocNames,
              startedAt,
            };
      this.clearRecoveryMismatchStaleClaimIfTerminal();
      this.notify();
      return;
    }

    this.serverRestartRecoveryState = {
      kind: 'recovering',
      phase: 'reconnecting',
      docNames,
      failedDocNames,
      startedAt,
      ...(failedDocNames.length > 0 ? { clearFailureReason: failureReason } : {}),
    };
    this.notify();
  }

  private markServerRestartRecoverySynced(docName: string): void {
    const state = this.serverRestartRecoveryState;
    if (state.kind !== 'recovering' || state.phase !== 'reconnecting') return;
    if (!state.docNames.includes(docName)) return;

    const remaining = state.docNames.filter((candidate) => candidate !== docName);
    if (remaining.length > 0) {
      this.serverRestartRecoveryState = { ...state, docNames: remaining };
      return;
    }

    if (state.failedDocNames.length > 0) {
      this.serverRestartRecoveryState = {
        kind: 'failed',
        reason: state.clearFailureReason ?? 'clear-data-failed',
        docNames: state.failedDocNames,
        failedDocNames: state.failedDocNames,
        startedAt: state.startedAt,
      };
      this.clearRecoveryMismatchStaleClaimIfTerminal();
      return;
    }

    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
    this.clearRecoveryMismatchStaleClaimIfTerminal();
  }

  setObservedBranch(branch: string): void {
    this.persistObservedBranch(branch);
  }

  compareAndUpdateObservedBranch(branch: string): boolean {
    const prior = this.getOrInitObservedBranch();
    this.persistObservedBranch(branch);
    return prior !== null && prior !== branch;
  }

  private onBranchMismatch: (() => void) | null = null;
  private branchMismatchInFlight: Promise<void> | null = null;
  private mismatchInFlight: Promise<void> | null = null;
  setOnBranchMismatch(cb: (() => Promise<void>) | null): void {
    if (cb === null) {
      this.onBranchMismatch = null;
      return;
    }
    this.onBranchMismatch = () => {
      if (this.branchMismatchInFlight !== null) return;
      const inflight = Promise.resolve()
        .then(cb)
        .finally(() => {
          if (this.branchMismatchInFlight === inflight) {
            this.branchMismatchInFlight = null;
          }
        });
      this.branchMismatchInFlight = inflight;
    };
  }

  setOnChange(cb: PoolChangeCallback | null): void {
    this.onChange = cb;
  }

  private notify(): void {
    this.onChange?.();
  }

  private evictListeners = new Set<(docName: string) => void>();

  onEvict(cb: (docName: string) => void): () => void {
    this.evictListeners.add(cb);
    return () => {
      this.evictListeners.delete(cb);
    };
  }

  private fireEvict(docName: string): void {
    for (const listener of this.evictListeners) {
      try {
        listener(docName);
      } catch (err) {
        console.warn(`[ProviderPool] evict listener threw for ${docName}:`, err);
      }
    }
  }

  private touch(docName: string): void {
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(docName);
  }

  open(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;

    const existing = this.entries.get(docName);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      this.touch(docName);
      this.notify();
      return existing;
    }

    if (this.entries.size >= this.maxSize) {
      this.evictLru();
    }

    const expectedServerInstanceId = this.cachedServerInstanceId;
    const token = buildAuthToken(
      this.tabIdentity,
      expectedServerInstanceId,
      this.getOrInitObservedBranch(),
    );
    const provider = new HocuspocusProvider({
      url: appendTraceContextToCollabUrl(this.wsUrl),
      name: docName,
      forceSyncInterval: FORCE_SYNC_INTERVAL_MS,
      ...(token !== undefined ? { token } : {}),
    });

    const persistenceServerInstanceId = this.cachedServerInstanceId;
    const persistence: ClientPersistenceProvider | null =
      persistenceServerInstanceId !== null && persistenceServerInstanceId.length > 0
        ? this.buildPersistence(persistenceServerInstanceId, docName, provider.document)
        : null;

    const entry: ActivePoolEntry = {
      kind: 'active',
      provider,
      persistence,
      lastServerSyncedSV: null,
      lastDiskAckedSV: null,
      observerCleanup: null,
      syncState: 'connecting',
      docName,
      lastAccessedAt: Date.now(),
      hasSynced: false,
      pendingRecycleTimer: null,
      bridgeSetupFailed: false,
    };

    const onStatus = ({ status }: { status: string }) => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
      }
    };
    const onSynced = () => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      entry.syncState = 'synced';
      entry.hasSynced = true;
      entry.lastServerSyncedSV = captureStateVector(provider.document);
      if (entry.pendingRecycleTimer) {
        clearTimeout(entry.pendingRecycleTimer);
        entry.pendingRecycleTimer = null;
      }
      this.markServerRestartRecoverySynced(docName);
      this.notify();

      if (!entry.observerCleanup) {
        try {
          const doc = provider.document;
          const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
          entry.observerCleanup = setupObservers({
            doc,
            xmlFragment: doc.getXmlFragment('default'),
            ytext: doc.getText('source'),
            mdManager: mdMgr,
            schema: editorSchema,
            onSyncError: (direction, error) => {
              console.warn(`[Sync] ${direction} failed for ${docName}:`, error.message);
            },
          });
        } catch (err) {
          console.error(`[ProviderPool] setupObservers init failed for ${docName}:`, err);
          entry.bridgeSetupFailed = true;
          rejectSyncPromise(docName, new BridgeSetupError(docName, err));
        }
      }
    };
    const onDisconnect = () => {
      if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
      entry.syncState = 'disconnected';
      this.notify();

      if (entry.hasSynced && provider.unsyncedChanges === 0 && !entry.pendingRecycleTimer) {
        entry.pendingRecycleTimer = setTimeout(() => {
          if (entry.kind !== 'active') return;
          entry.pendingRecycleTimer = null;
          if (this.entries.get(docName) !== entry) return;
          this.recycleDisconnectedEntry(docName);
        }, this.recycleDebounceMs);
      }
    };

    const onAuthenticationFailed = ({ reason }: { reason: string }): void => {
      const KNOWN = [
        'server-instance-mismatch',
        'branch-mismatch',
      ] as const satisfies readonly HocuspocusAuthRejectionReason[];
      type _AssertCovers = HocuspocusAuthRejectionReason extends (typeof KNOWN)[number]
        ? true
        : never;
      const _assertCovers: _AssertCovers = true;
      void _assertCovers;
      if (!(KNOWN as readonly string[]).includes(reason)) {
        console.warn(JSON.stringify({ event: 'ok-auth-failed-unknown-reason', reason }));
        return;
      }
      const typed = reason as HocuspocusAuthRejectionReason;
      if (typed === 'server-instance-mismatch') {
        if (expectedServerInstanceId === null) {
          return;
        }
        if (this.cachedServerInstanceId !== expectedServerInstanceId) {
          return;
        }
        const staleClaimFromToken = expectedServerInstanceId;
        this.cachedServerInstanceId = null;
        this.handleServerInstanceMismatch(staleClaimFromToken);
        return;
      }
      if (typed === 'branch-mismatch') {
        this.onBranchMismatch?.();
        return;
      }
      const _never: never = typed;
      void _never;
    };

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('disconnect', onDisconnect);
    provider.on('authenticationFailed', onAuthenticationFailed);

    const buffered = this.bufferedUpdates.get(docName);
    if (buffered !== undefined) {
      const staleClaimAtReplayInstall = this.recoveryMismatchStaleClaim;
      const replayOnce = (): void => {
        provider.off('synced', replayOnce);
        if (entry.kind !== 'active' || this.entries.get(docName) !== entry) return;
        const current = this.bufferedUpdates.get(docName);
        if (current === undefined) return;
        this.bufferedUpdates.delete(docName);
        try {
          Y.applyUpdate(provider.document, current, TAB_REPLAY_ORIGIN);
        } catch (err: unknown) {
          const errorName = err instanceof Error ? err.name : 'non-error-throw';
          this.emitStructuredClientRecoveryEvent({
            event: 'ok-buffer-replay-failed',
            ...this.recoveryTelemetryBase(docName, staleClaimAtReplayInstall),
            replayByteLength: current.byteLength,
            errorName,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      };
      provider.on('synced', replayOnce);
    }

    this._entries.set(docName, entry);
    this.touch(docName);
    this.notify();

    return entry;
  }

  private handleServerInstanceMismatch(staleClaimedServerInstanceId: string): void {
    this.recoveryMismatchStaleClaim =
      staleClaimedServerInstanceId.length > 0 ? staleClaimedServerInstanceId : undefined;

    const snapshot = Array.from(this.entries.entries());
    const startedAt = Date.now();
    const recoveryActiveDocName = this.activeDocName;
    const activeRecoveryDocNames =
      recoveryActiveDocName !== null &&
      snapshot.some(
        ([docName, poolEntry]) => docName === recoveryActiveDocName && poolEntry.kind === 'active',
      )
        ? [recoveryActiveDocName]
        : [];

    const telemetryDocName =
      recoveryActiveDocName ??
      snapshot.find(([, poolEntry]) => poolEntry.kind === 'active')?.[0] ??
      '';
    if (telemetryDocName.length > 0) {
      this.emitStructuredClientRecoveryEvent({
        event: 'ok-client-cache-epoch-mismatch',
        ...this.recoveryTelemetryBase(telemetryDocName),
      });
    }

    this.beginServerRestartRecovery(activeRecoveryDocNames, startedAt);
    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind === 'active' && !activeRecoveryDocNames.includes(docName)) {
        invalidateSyncPromise(docName);
      }
    }

    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind !== 'active') continue;
      const baseline = poolEntry.lastDiskAckedSV ?? poolEntry.lastServerSyncedSV;
      if (baseline === null) {
        this.emitStructuredClientRecoveryEvent({
          event: 'ok-buffer-replay-skipped-no-baseline',
          ...this.recoveryTelemetryBase(docName),
          reason: 'no-disk-ack-or-server-sync-vector',
        });
        continue;
      }
      const unsynced = computeUnsyncedUpdate(poolEntry.provider.document, baseline);
      if (unsynced.byteLength > MAX_BUFFER_BYTES) {
        mark('ok/pool/buffer-overflow', { docName, bytes: unsynced.byteLength });
        continue;
      }
      if (unsynced.byteLength > 0) {
        this.bufferedUpdates.set(docName, unsynced);
      }
    }

    const clears: { docName: string; promise: Promise<void> }[] = [];
    for (const [docName, poolEntry] of snapshot) {
      if (poolEntry.kind !== 'active') continue;
      if (poolEntry.persistence === null) continue;
      clears.push({
        docName,
        promise: this.withClearDataTimeout(docName, poolEntry.persistence.clearData()),
      });
    }

    const inflight: Promise<void> = Promise.allSettled(clears.map((c) => c.promise))
      .then((results) => {
        const failed: string[] = [];
        const cleared: string[] = [];
        let sawClearTimeout = false;
        results.forEach((result, i) => {
          const row = clears[i];
          if (!row) return;
          const docName = row.docName;
          if (result.status === 'rejected') {
            failed.push(docName);
            const isClearTimeout = result.reason instanceof ClientPersistenceClearTimeoutError;
            if (isClearTimeout) {
              sawClearTimeout = true;
            }
            if (isClearTimeout) {
              this.emitStructuredClientRecoveryEvent({
                event: 'ok-client-cache-clear-failed',
                ...this.recoveryTelemetryBase(docName),
                failureKind: 'timeout',
              });
            } else {
              const errorName = result.reason instanceof Error ? result.reason.name : 'unknown';
              this.emitStructuredClientRecoveryEvent({
                event: 'ok-client-cache-clear-failed',
                ...this.recoveryTelemetryBase(docName),
                failureKind: 'rejected',
                errorName,
                errorMessage:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              });
            }
          } else {
            cleared.push(docName);
          }
        });
        const reconnectDocNames = cleared.filter((docName) => docName === recoveryActiveDocName);
        if (failed.length > 0) {
          const failureReason: 'clear-data-failed' | 'clear-data-timeout' = sawClearTimeout
            ? 'clear-data-timeout'
            : 'clear-data-failed';
          console.warn(
            JSON.stringify({
              event: 'ok-mismatch-recycle-partial-clears-failed',
              failedDocs: failed,
              clearedDocs: cleared,
            }),
          );
          this.enterServerRestartReconnect(reconnectDocNames, failed, startedAt, failureReason);
          for (const docName of cleared) {
            this.recycleDisconnectedEntry(docName);
          }
          return;
        }
        this.enterServerRestartReconnect(reconnectDocNames, [], startedAt, 'clear-data-failed');
        this.recycleAllEntries();
      })
      .finally(() => {
        if (this.mismatchInFlight === inflight) {
          this.mismatchInFlight = null;
        }
      });
    this.mismatchInFlight = inflight;
  }

  awaitMismatchSettled(): Promise<void> {
    return this.mismatchInFlight ?? Promise.resolve();
  }

  recycleAllEntries(): void {
    const docNames = Array.from(this.entries.keys());
    for (const docName of docNames) {
      this.recycleDisconnectedEntry(docName);
    }
  }

  prewarm(docName: string): PoolEntry | null {
    if (isSystemDoc(docName)) return null;
    const existing = this.entries.get(docName);
    if (existing) {
      return existing;
    }
    const entry = this.open(docName);
    if (!entry) return null;
    const idx = this.lruOrder.indexOf(docName);
    if (idx !== -1) {
      this.lruOrder.splice(idx, 1);
      this.lruOrder.unshift(docName);
    }
    return entry;
  }

  close(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) return;

    this.destroyEntry(entry);
    this._entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);
    this.bufferedUpdates.delete(docName);

    if (this.activeDocName === docName) {
      this.activeDocName = null;
    }
    this.notify();
  }

  async closeAndClearPersistence(docName: string): Promise<void> {
    const entry = this.entries.get(docName);
    if (entry?.kind === 'active' && entry.persistence !== null) {
      try {
        await entry.persistence.clearData();
      } catch (err) {
        console.warn(`[ProviderPool] clearData on rename failed for ${docName}:`, err);
      }
      this.close(docName);
      return;
    }
    if (entry) {
      this.close(docName);
    }

    const branch = this.getOrInitObservedBranch();
    const serverInstanceId = this.cachedServerInstanceId;
    if (branch === null || serverInstanceId === null) return;

    const dbName = `ok-ydoc:${branch}:${serverInstanceId}:${docName}`;
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          console.warn(`[ProviderPool] IDB delete blocked for ${dbName}`);
          reject(new Error(`idb-clear-blocked: ${dbName}`));
        };
      });
    } catch (err) {
      console.warn(`[ProviderPool] IDB delete on rename failed for ${dbName}:`, err);
    }
  }

  clearBufferedUpdates(): void {
    this.bufferedUpdates.clear();
  }

  __test_seedBufferedUpdate(docName: string, update: Uint8Array): void {
    this.bufferedUpdates.set(docName, update);
  }
  __test_bufferedUpdatesSize(): number {
    return this.bufferedUpdates.size;
  }
  __test_hasBufferedUpdate(docName: string): boolean {
    return this.bufferedUpdates.has(docName);
  }
  __test_getBufferedUpdate(docName: string): Uint8Array | undefined {
    return this.bufferedUpdates.get(docName);
  }

  setActive(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry) {
      throw new Error(`[ProviderPool] Cannot setActive — "${docName}" is not open`);
    }
    entry.lastAccessedAt = Date.now();
    this.touch(docName);
    this.activeDocName = docName;
    this.notify();
  }

  clearActive(): void {
    if (this.activeDocName === null) return;
    this.activeDocName = null;
    this.notify();
  }

  getActive(): PoolEntry | null {
    if (!this.activeDocName) return null;
    return this.entries.get(this.activeDocName) ?? null;
  }

  getActiveDocName(): string | null {
    return this.activeDocName;
  }

  has(docName: string): boolean {
    return this.entries.has(docName);
  }

  recycle(docName: string): void {
    this.recycleDisconnectedEntry(docName);
  }

  dispose(): void {
    for (const entry of this._entries.values()) {
      this.destroyEntry(entry);
    }
    this._entries.clear();
    this.lruOrder = [];
    this.activeDocName = null;
    this.onChange = null;
    this.bufferedUpdates.clear();
    this.onBranchMismatch = null;
    this.branchMismatchInFlight = null;
    this.evictListeners.clear();
    this.serverRestartRecoveryState = IDLE_SERVER_RESTART_RECOVERY;
    this.cachedServerInstanceId = null;
    this.pendingServerInstanceKnown = null;
    this.tabIdentity = null;
    this.recoveryMismatchStaleClaim = undefined;
  }

  private evictLru(): void {
    for (const docName of this.lruOrder) {
      if (docName !== this.activeDocName) {
        mark('ok/pool/evict-lru', { docName });
        this.close(docName);
        return;
      }
    }
  }

  private destroyEntry(entry: PoolEntry): void {
    if (entry.kind === 'tearing-down') return;

    const observerCleanup = entry.observerCleanup;
    const persistence = entry.persistence;
    const pendingRecycleTimer = entry.pendingRecycleTimer;
    const docName = entry.docName;

    const torn = entry as unknown as TearingDownPoolEntry;
    torn.kind = 'tearing-down';
    torn.persistence = null;
    torn.observerCleanup = null;
    torn.pendingRecycleTimer = null;

    if (pendingRecycleTimer) clearTimeout(pendingRecycleTimer);

    invalidateSyncPromise(docName);
    this.fireEvict(docName);
    observerCleanup?.();

    if (persistence !== null) {
      const pendingPersistenceDestroy = persistence.destroy();
      pendingPersistenceDestroy.catch((err) => {
        console.warn(`[ProviderPool] persistence destroy failed for ${docName}:`, err);
      });
    }

    try {
      torn.provider.destroy(); // destroy() disconnects + removes all listeners + awareness cleanup
    } catch (err) {
      console.warn(`[ProviderPool] Provider destroy failed for ${docName}:`, err);
    }
  }

  private recycleDisconnectedEntry(docName: string): void {
    const entry = this.entries.get(docName);
    if (!entry || entry.kind !== 'active') return;

    const wasActive = this.activeDocName === docName;
    mark('ok/pool/recycle-disconnected', { docName, wasActive });

    this.destroyEntry(entry);
    this._entries.delete(docName);
    this.lruOrder = this.lruOrder.filter((n) => n !== docName);

    if (wasActive) {
      const reopened = this.open(docName);
      if (reopened) this.setActive(docName);
      return;
    }

    this.notify();
  }
}
