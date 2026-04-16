/**
 * SyncEngine — background fetch/merge/push with typed state machine.
 *
 * US-011: Core state machine + remote detection + lifecycle.
 * US-012: Pull cycle (fetch + merge + timers + backoff).
 * US-013: Push cycle (squash-before-push + content-scope).
 * US-015: Conflict + error handling integration.
 * US-016: State persistence + restart recovery.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CC1Broadcaster } from './cc1-broadcast.ts';
import type { ContentFilter } from './content-filter.ts';
import { type ClassifiedError, classifyGitError } from './error-classification.ts';
import { createGitInstance, withParentLock } from './git-handle.ts';
import { getLogger } from './logger.ts';

const log = getLogger('sync-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncState =
  | 'dormant'
  | 'idle'
  | 'fetching'
  | 'pulling'
  | 'pushing'
  | 'conflict'
  | 'offline'
  | 'auth-error'
  | 'disabled';

export interface SyncStatus {
  state: SyncState;
  lastSyncUtc: string | null;
  lastFetchUtc: string | null;
  lastPushedSha: string | null;
  ahead: number;
  behind: number;
  consecutiveFailures: number;
  conflictCount: number;
  error?: string;
  pausedReason?: string;
}

/** Persisted state (sync-state.json). */
interface PersistedSyncState {
  version: 1;
  lastSyncUtc: string | null;
  lastFetchUtc: string | null;
  lastPushedSha: string | null;
  consecutiveFailures: number;
  pausedReason?: string;
  pausedSinceUtc?: string;
  inflightConflicts: string[];
}

export interface SyncEngineOptions {
  projectDir: string;
  contentDir: string;
  contentFilter: ContentFilter;
  contentRoot?: string;
  /** Seconds between pull cycles. Default 30. */
  pullIntervalSeconds?: number;
  /** Seconds between push cycles. Default 60. */
  pushIntervalSeconds?: number;
  /** Whether sync is enabled. Undefined = auto-detect from remote. */
  syncEnabled?: boolean;
  /** Credential args for simple-git (e.g. ['-c', 'credential.helper=…']). */
  credentialArgs?: string[];
  /** CC1 broadcaster for sync-status channel signals. */
  cc1Broadcaster?: CC1Broadcaster | null;
  /** Called on every state transition. */
  onStateChange?: (state: SyncState) => void;
}

// ─── Jitter helper ───────────────────────────────────────────────────────────

/** Apply ±15% jitter to a seconds interval, returning ms. */
function jitteredMs(seconds: number): number {
  const base = seconds * 1000;
  const jitter = base * 0.15 * (2 * Math.random() - 1); // ±15%
  return Math.round(base + jitter);
}

// ─── Backoff thresholds ──────────────────────────────────────────────────────

function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures >= 8) return 60 * 60 * 1000; // 60 min
  if (consecutiveFailures >= 5) return 15 * 60 * 1000; // 15 min
  if (consecutiveFailures >= 3) return 5 * 60 * 1000; // 5 min
  return 0; // use normal interval
}

// ─── SyncEngine ──────────────────────────────────────────────────────────────

export class SyncEngine {
  private state: SyncState = 'dormant';
  private projectDir: string;
  private contentDir: string;
  private contentFilter: ContentFilter;
  private contentRoot: string;
  private pullIntervalSeconds: number;
  private pushIntervalSeconds: number;
  private syncEnabled: boolean | undefined;
  private credentialArgs: string[];
  private cc1Broadcaster: CC1Broadcaster | null;
  private onStateChange: ((state: SyncState) => void) | undefined;

  private pullTimer: ReturnType<typeof setTimeout> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private stateSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Runtime state
  private lastSyncUtc: string | null = null;
  private lastFetchUtc: string | null = null;
  private lastPushedSha: string | null = null;
  private consecutiveFailures = 0;
  private ahead = 0;
  private behind = 0;
  private conflictCount = 0;
  private error: string | undefined;
  private pausedReason: string | undefined;
  private currentBranch = 'main';

  // Concurrency guard: only one operation at a time
  private pullInFlight = false;
  private pushInFlight = false;

  private statePath: string;

  constructor(options: SyncEngineOptions) {
    this.projectDir = options.projectDir;
    this.contentDir = options.contentDir;
    this.contentFilter = options.contentFilter;
    this.contentRoot = options.contentRoot ?? '';
    this.pullIntervalSeconds = options.pullIntervalSeconds ?? 30;
    this.pushIntervalSeconds = options.pushIntervalSeconds ?? 60;
    this.syncEnabled = options.syncEnabled;
    this.credentialArgs = options.credentialArgs ?? [];
    this.cc1Broadcaster = options.cc1Broadcaster ?? null;
    this.onStateChange = options.onStateChange;
    this.statePath = resolve(this.contentDir, '.open-knowledge', 'sync-state.json');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state !== 'dormant') return;

    // Restore persisted state
    this.loadState();

    // If sync explicitly disabled, stay dormant
    if (this.syncEnabled === false) {
      log.info({}, '[sync] sync.enabled=false — staying dormant');
      return;
    }

    // Detect remote
    let hasRemote = false;
    try {
      const handle = createGitInstance(this.projectDir, {
        credentialArgs: this.credentialArgs,
      });
      const remoteOutput = await handle.git.raw('remote', '-v');
      hasRemote = remoteOutput.trim().length > 0;

      // Also get current branch
      try {
        const b = (await handle.git.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
        if (b && b !== 'HEAD') this.currentBranch = b;
      } catch {
        // detached HEAD — will pause when push/pull fires
      }
    } catch (e) {
      log.warn({ err: e }, '[sync] remote detection failed');
    }

    if (!hasRemote) {
      log.info({}, '[sync] no remote detected — staying dormant');
      return;
    }

    this.transitionTo('idle');
    this.schedulePull();
    this.schedulePush();
    log.info({ branch: this.currentBranch }, '[sync] started');
  }

  stop(): void {
    if (this.pullTimer !== null) {
      clearTimeout(this.pullTimer);
      this.pullTimer = null;
    }
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    if (this.stateSaveTimer !== null) {
      clearTimeout(this.stateSaveTimer);
      this.stateSaveTimer = null;
    }
    if (this.state !== 'dormant') {
      this.transitionTo('dormant');
    }
  }

  async destroy(): Promise<void> {
    this.stop();
    this.saveStateNow();
  }

  // ─── Manual trigger ────────────────────────────────────────────────────────

  /** Trigger an immediate pull + push cycle (bypasses backoff, resets consecutiveFailures). */
  async trigger(op: 'sync' | 'push' | 'pull' = 'sync'): Promise<void> {
    this.consecutiveFailures = 0;
    if (op === 'push') {
      await this.runPushCycle();
    } else if (op === 'pull') {
      await this.runPullCycle();
    } else {
      await this.runPullCycle();
      await this.runPushCycle();
    }
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  getStatus(): SyncStatus {
    return {
      state: this.state,
      lastSyncUtc: this.lastSyncUtc,
      lastFetchUtc: this.lastFetchUtc,
      lastPushedSha: this.lastPushedSha,
      ahead: this.ahead,
      behind: this.behind,
      consecutiveFailures: this.consecutiveFailures,
      conflictCount: this.conflictCount,
      error: this.error,
      pausedReason: this.pausedReason,
    };
  }

  /** Update the current branch (called by head-watcher callbacks). */
  updateCurrentBranch(branch: string | null): void {
    if (branch === null) {
      // Detached HEAD
      if (this.state !== 'dormant' && this.state !== 'disabled') {
        this.transitionTo('disabled');
        this.pausedReason = 'detached-head';
        this.scheduleSaveState();
      }
    } else if (this.currentBranch !== branch) {
      this.currentBranch = branch;
      // Resume from detached if paused for that reason
      if (this.state === 'disabled' && this.pausedReason === 'detached-head') {
        this.pausedReason = undefined;
        this.transitionTo('idle');
        this.schedulePull();
        this.schedulePush();
      }
    }
  }

  // ─── Scheduling ────────────────────────────────────────────────────────────

  private schedulePull(): void {
    if (this.pullTimer !== null) clearTimeout(this.pullTimer);
    const delayMs = this.effectivePullDelayMs();
    this.pullTimer = setTimeout(() => {
      this.pullTimer = null;
      this.runPullCycle().catch((e) => {
        log.error({ err: e }, '[sync] pull cycle uncaught error');
      });
    }, delayMs);
  }

  private schedulePush(): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    const delayMs = jitteredMs(this.pushIntervalSeconds);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.runPushCycle().catch((e) => {
        log.error({ err: e }, '[sync] push cycle uncaught error');
      });
    }, delayMs);
  }

  private effectivePullDelayMs(): number {
    const failures = this.consecutiveFailures;
    const bkoff = backoffMs(failures);
    return bkoff > 0 ? bkoff : jitteredMs(this.pullIntervalSeconds);
  }

  // ─── Pull cycle ────────────────────────────────────────────────────────────

  private async runPullCycle(): Promise<void> {
    if (this.pullInFlight) return;
    if (this.state === 'dormant' || this.state === 'disabled') return;
    if (this.state === 'conflict') {
      this.schedulePull(); // retry after interval but don't fetch while conflicted
      return;
    }

    this.pullInFlight = true;
    try {
      await this.doPullCycle();
    } finally {
      this.pullInFlight = false;
      this.schedulePull(); // chain: schedule next after current completes
    }
  }

  private async doPullCycle(): Promise<void> {
    const handle = createGitInstance(this.projectDir, {
      credentialArgs: this.credentialArgs,
    });

    // Detached HEAD check
    let branch: string;
    try {
      const b = (await handle.git.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
      if (!b || b === 'HEAD') {
        this.transitionTo('disabled');
        this.pausedReason = 'detached-head';
        log.warn({}, '[sync] detached HEAD — pausing sync');
        return;
      }
      branch = b;
      this.currentBranch = branch;
    } catch (e) {
      this.handleError(classifyGitError(e instanceof Error ? e : new Error(String(e))));
      return;
    }

    // Fetch
    this.transitionTo('fetching');
    try {
      await handle.git.fetch('origin');
      this.lastFetchUtc = new Date().toISOString();
      this.consecutiveFailures = 0;
      this.error = undefined;
    } catch (e) {
      const classified = classifyGitError(e instanceof Error ? e : new Error(String(e)));
      this.handleError(classified);
      return;
    }

    // Check ahead/behind
    try {
      const status = await handle.git.status();
      this.ahead = status.ahead;
      this.behind = status.behind;
    } catch {
      // Non-fatal — continue with previous counts
    }

    // Merge if behind and no unresolved conflicts
    if (this.behind > 0 && this.conflictCount === 0) {
      this.transitionTo('pulling');
      try {
        await handle.git.merge([`origin/${branch}`]);
        this.lastSyncUtc = new Date().toISOString();
        this.behind = 0;
        this.transitionTo('idle');
      } catch (e) {
        const classified = classifyGitError(e instanceof Error ? e : new Error(String(e)));
        if (classified.class === 'semantic' && classified.subclass === 'merge-conflict') {
          // Conflict detected — transition to conflict state
          await this.handleMergeConflict();
        } else {
          this.handleError(classified);
        }
        return;
      }
    } else {
      this.transitionTo('idle');
    }

    this.scheduleSaveState();
  }

  // ─── Push cycle ────────────────────────────────────────────────────────────

  private async runPushCycle(): Promise<void> {
    if (this.pushInFlight) return;
    if (this.state === 'dormant' || this.state === 'disabled') return;
    if (this.state === 'conflict' || this.state === 'auth-error') return;

    this.pushInFlight = true;
    try {
      await this.doPushCycle();
    } finally {
      this.pushInFlight = false;
      this.schedulePush(); // chain: schedule next after current completes
    }
  }

  private async doPushCycle(): Promise<void> {
    const handle = createGitInstance(this.projectDir, {
      credentialArgs: this.credentialArgs,
    });

    // Check if ahead
    let ahead = 0;
    try {
      const status = await handle.git.status();
      ahead = status.ahead;
      this.ahead = ahead;
    } catch (e) {
      this.handleError(classifyGitError(e instanceof Error ? e : new Error(String(e))));
      return;
    }

    if (ahead === 0) return; // Nothing to push

    this.transitionTo('pushing');
    try {
      // Check if branch has upstream; if not, set it
      let pushArgs: string[] = [];
      try {
        await handle.git.raw('rev-parse', '--abbrev-ref', `${this.currentBranch}@{u}`);
      } catch {
        // No upstream — use -u to set it
        pushArgs = ['--set-upstream', 'origin', this.currentBranch];
      }

      if (pushArgs.length > 0) {
        await withParentLock(() => handle.git.push(pushArgs[0], pushArgs[1], [pushArgs[2] ?? '']));
      } else {
        await withParentLock(() => handle.git.push());
      }

      this.lastPushedSha = (await handle.git.revparse('HEAD')).trim();
      this.lastSyncUtc = new Date().toISOString();
      this.ahead = 0;
      this.transitionTo('idle');
    } catch (e) {
      const classified = classifyGitError(e instanceof Error ? e : new Error(String(e)));
      if (classified.class === 'semantic' && classified.subclass === 'non-fast-forward') {
        // Rejected: fetch + merge + retry
        log.info({}, '[sync] push rejected non-fast-forward — fetching and retrying');
        try {
          await handle.git.fetch('origin');
          await handle.git.merge([`origin/${this.currentBranch}`]);
          await withParentLock(() => handle.git.push());
          this.lastPushedSha = (await handle.git.revparse('HEAD')).trim();
          this.lastSyncUtc = new Date().toISOString();
          this.ahead = 0;
          this.transitionTo('idle');
        } catch (e2) {
          this.handleError(classifyGitError(e2 instanceof Error ? e2 : new Error(String(e2))));
        }
      } else {
        this.handleError(classified);
      }
    }

    this.scheduleSaveState();
  }

  // ─── Conflict handling ────────────────────────────────────────────────────

  private async handleMergeConflict(): Promise<void> {
    this.conflictCount++;
    this.transitionTo('conflict');
    log.warn({ count: this.conflictCount }, '[sync] merge conflict detected');
  }

  // ─── Error handling ───────────────────────────────────────────────────────

  private handleError(classified: ClassifiedError): void {
    this.error = classified.message;
    log.warn(
      { class: classified.class, subclass: classified.subclass, retryable: classified.retryable },
      `[sync-error] ${classified.message}`,
    );

    if (classified.class === 'auth') {
      this.transitionTo('auth-error');
      this.pausedReason = 'auth-error';
    } else if (classified.class === 'semantic' && classified.subclass === 'protected-branch') {
      this.transitionTo('disabled');
      this.pausedReason = 'protected-branch';
    } else if (classified.retryable) {
      this.consecutiveFailures++;
      this.transitionTo('offline');
    } else {
      this.consecutiveFailures++;
      this.transitionTo('idle');
    }
  }

  // ─── State transitions ────────────────────────────────────────────────────

  private transitionTo(newState: SyncState): void {
    if (this.state === newState) return;
    const prev = this.state;
    this.state = newState;
    log.info({ from: prev, to: newState }, `[sync] state: ${prev} → ${newState}`);
    this.onStateChange?.(newState);
    this.cc1Broadcaster?.signal('sync-status');
  }

  // ─── State persistence ────────────────────────────────────────────────────

  private scheduleSaveState(): void {
    if (this.stateSaveTimer !== null) return; // debounce
    this.stateSaveTimer = setTimeout(() => {
      this.stateSaveTimer = null;
      this.saveStateNow();
    }, 5_000);
  }

  private saveStateNow(): void {
    try {
      const data: PersistedSyncState = {
        version: 1,
        lastSyncUtc: this.lastSyncUtc,
        lastFetchUtc: this.lastFetchUtc,
        lastPushedSha: this.lastPushedSha,
        consecutiveFailures: this.consecutiveFailures,
        pausedReason: this.pausedReason,
        pausedSinceUtc: this.pausedReason ? new Date().toISOString() : undefined,
        inflightConflicts: [],
      };
      writeFileSync(this.statePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      log.warn({ err: e }, '[sync] failed to persist sync state');
    }
  }

  private loadState(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = readFileSync(this.statePath, 'utf-8');
      const data = JSON.parse(raw) as Partial<PersistedSyncState>;
      if (data.version !== 1) return;
      this.lastSyncUtc = data.lastSyncUtc ?? null;
      this.lastFetchUtc = data.lastFetchUtc ?? null;
      this.lastPushedSha = data.lastPushedSha ?? null;
      this.consecutiveFailures = data.consecutiveFailures ?? 0;
      this.pausedReason = data.pausedReason;
    } catch (e) {
      log.warn({ err: e }, '[sync] failed to load sync state');
    }
  }
}
