/**
 * SyncEngine — background fetch/merge/push with typed state machine.
 *
 * US-011: Core state machine + remote detection + lifecycle.
 * US-012: Pull cycle (fetch + merge + timers + backoff).
 * US-013: Push cycle (squash-before-push + content-scope).
 * US-015: Conflict + error handling integration.
 * US-016: State persistence + restart recovery.
 */

import {
  type Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import type { CC1Broadcaster } from './cc1-broadcast.ts';
import { ConflictStore } from './conflict-storage.ts';
import type { ContentFilter } from './content-filter.ts';
import { type ClassifiedError, classifyGitError } from './error-classification.ts';
import { createGitInstance, withParentLock } from './git-handle.ts';
import { resolveGitIdentity } from './git-identity.ts';
import { getLogger } from './logger.ts';
import { computeRemainingMs } from './sync-timing.ts';

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
  /** True when a git remote exists, even if sync is dormant/disabled. */
  hasRemote: boolean;
  /** User's sync toggle preference. False by default (disabled for safety). */
  syncEnabled: boolean;
  /**
   * Soft signal (FR20a): `resolveGitIdentity()` returned null on the last probe.
   * The push cycle still commits under the "Open Knowledge" default — this flag
   * tells the UI to surface a non-blocking nudge to set a real identity.
   */
  identityUnresolved: boolean;
  error?: string;
  pausedReason?: string;
}

/** A single content-scoped file entry used during push-cycle tree building. */
interface ContentFileEntry {
  /** Path relative to contentDir — used for commit messages. */
  contentRelPath: string;
  /** Path relative to projectDir (git root) — used for git add/rm commands. */
  projectRelPath: string;
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
  /** User's sync toggle. Absent/false = disabled (default); true = sync active. */
  syncEnabled?: boolean;
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
  /** Callback to gate batch-in-progress during merge operations.
   *  Prevents HEAD watcher from firing reconciliation mid-merge. */
  setBatchInProgress?: (value: boolean) => void;
}

// ─── Jitter helper ───────────────────────────────────────────────────────────

/** Apply ±15% jitter to a seconds interval, returning ms. */
function jitteredMs(seconds: number): number {
  const base = seconds * 1000;
  const jitter = base * 0.15 * (2 * Math.random() - 1); // ±15%
  return Math.round(base + jitter);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the project repo has an unborn HEAD (git init with no
 * commits yet). Checks both loose refs (`.git/refs/heads/<branch>`) and
 * packed refs (`.git/packed-refs`) to avoid misclassifying a fully-committed
 * repo whose refs happen to be packed.
 */
function isUnbornHead(projectDir: string): boolean {
  try {
    const headPath = join(projectDir, '.git', 'HEAD');
    if (!existsSync(headPath)) return false;
    const headContent = readFileSync(headPath, 'utf-8').trim();
    const match = /^ref:\s+(refs\/.+)$/.exec(headContent);
    if (!match) return false;
    const refName = match[1] as string;
    if (existsSync(join(projectDir, '.git', refName))) return false;
    const packedRefsPath = join(projectDir, '.git', 'packed-refs');
    if (existsSync(packedRefsPath)) {
      const packed = readFileSync(packedRefsPath, 'utf-8');
      if (new RegExp(`^[0-9a-f]+\\s+${refName}$`, 'm').test(packed)) return false;
    }
    return true;
  } catch {
    return false;
  }
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
  private setBatchInProgress: ((value: boolean) => void) | undefined;

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

  /** True once a git remote has been confirmed present. */
  private hasRemote = false;

  /** Latest known state of the FR20a identity chain (null-return on resolveGitIdentity). */
  private identityUnresolved = false;

  private statePath: string;
  private conflictStore: ConflictStore;

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
    this.setBatchInProgress = options.setBatchInProgress;
    this.statePath = resolve(this.contentDir, '.open-knowledge', 'sync-state.json');
    // ConflictStore branch is set lazily in start() after branch detection.
    // Use a placeholder here; setBranch() updates it before any conflict operations.
    this.conflictStore = new ConflictStore(this.contentDir, this.projectDir, this.currentBranch);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state !== 'dormant') return;

    // Restore persisted state (may populate this.syncEnabled)
    this.loadState();

    // Detect remote + branch regardless of enabled state so status is accurate.
    let hasRemote = false;
    try {
      const handle = createGitInstance(this.projectDir, {
        credentialArgs: this.credentialArgs,
      });
      const remoteOutput = await handle.git.raw('remote', '-v');
      hasRemote = remoteOutput.trim().length > 0;
      this.hasRemote = hasRemote;

      try {
        const b = (await handle.git.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
        if (b && b !== 'HEAD') {
          this.currentBranch = b;
          this.conflictStore.setBranch(b);
        }
      } catch {
        // detached HEAD — will pause when push/pull fires
      }
    } catch (e) {
      log.warn({ err: e }, '[sync] remote detection failed');
    }

    // Disabled by default: sync only runs when the user has explicitly opted in.
    // Protects real git repos (production code) from being mutated automatically.
    if (this.syncEnabled !== true) {
      if (hasRemote) this.transitionTo('disabled');
      log.info(
        { hasRemote, syncEnabled: this.syncEnabled },
        '[sync] sync not enabled — staying inactive',
      );
      return;
    }

    if (!hasRemote) {
      log.info({}, '[sync] no remote detected — staying dormant');
      return;
    }

    this.transitionTo('idle');

    // Clean up stale merge state: if MERGE_HEAD exists but no conflicts are tracked,
    // a previous crash left the repo in a half-merged state — abort to recover.
    const mergeHeadPath = join(this.projectDir, '.git', 'MERGE_HEAD');
    if (existsSync(mergeHeadPath) && this.conflictCount === 0) {
      log.warn({}, '[sync] stale MERGE_HEAD detected with no tracked conflicts — aborting merge');
      try {
        const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });
        await handle.git.raw(['merge', '--abort']);
      } catch (e) {
        log.warn({ err: e }, '[sync] git merge --abort for stale MERGE_HEAD failed');
      }
    }

    // If we restored in-flight conflicts, re-enter conflict state (timers paused)
    if (this.conflictCount > 0) {
      this.transitionTo('conflict');
      log.warn(
        { count: this.conflictCount },
        '[sync] restarted with active conflicts — sync paused',
      );
      return;
    }

    // Schedule with restart-aware remaining delay (FR: max(0, lastFetchUtc+interval - now))
    const pullRemainingMs = computeRemainingMs(this.lastFetchUtc, this.pullIntervalSeconds);
    const pushRemainingMs = computeRemainingMs(this.lastSyncUtc, this.pushIntervalSeconds);
    this.schedulePull(pullRemainingMs > 0 ? pullRemainingMs : undefined);
    this.schedulePush(pushRemainingMs > 0 ? pushRemainingMs : undefined);
    log.info(
      { branch: this.currentBranch, pullDelayMs: pullRemainingMs, pushDelayMs: pushRemainingMs },
      '[sync] started',
    );
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

  // ─── User-controlled enable/disable ────────────────────────────────────────

  /**
   * Toggle sync on/off. Soft disable — cancels scheduled cycles but lets an
   * in-flight pull/push finish cleanly to avoid leaving a partial merge.
   * Persisted to sync-state.json so it survives restart.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (this.syncEnabled === enabled) return;
    this.syncEnabled = enabled;

    if (!enabled) {
      if (this.pullTimer !== null) {
        clearTimeout(this.pullTimer);
        this.pullTimer = null;
      }
      if (this.pushTimer !== null) {
        clearTimeout(this.pushTimer);
        this.pushTimer = null;
      }
      while (this.pullInFlight || this.pushInFlight) {
        await new Promise((r) => setTimeout(r, 50));
      }
      this.pausedReason = undefined;
      this.error = undefined;
      this.transitionTo(this.hasRemote ? 'disabled' : 'dormant');
      this.saveStateNow();
      return;
    }

    // Re-detect remote in case it was added while sync was off.
    try {
      const handle = createGitInstance(this.projectDir, {
        credentialArgs: this.credentialArgs,
      });
      const remoteOutput = await handle.git.raw('remote', '-v');
      this.hasRemote = remoteOutput.trim().length > 0;
    } catch (e) {
      log.warn({ err: e }, '[sync] remote detection failed during enable');
    }

    this.pausedReason = undefined;
    this.error = undefined;
    this.consecutiveFailures = 0;

    if (!this.hasRemote) {
      this.transitionTo('dormant');
      this.saveStateNow();
      return;
    }

    this.transitionTo('idle');
    this.schedulePull(0);
    this.schedulePush();
    this.saveStateNow();
  }

  // ─── Manual trigger ────────────────────────────────────────────────────────

  /** Trigger an immediate pull + push cycle (bypasses backoff, resets consecutiveFailures). */
  async trigger(op: 'sync' | 'push' | 'pull' = 'sync'): Promise<void> {
    this.consecutiveFailures = 0;
    // Retry clears transient paused reasons; protected-branch etc. stay set.
    if (this.pausedReason === 'dirty-tree' || this.pausedReason === 'external-changes-pending') {
      this.pausedReason = undefined;
      this.error = undefined;
    }
    if (op === 'push') {
      await this.runPushCycle();
    } else if (op === 'pull') {
      await this.runPullCycle();
    } else {
      // Push first so pending working-tree edits get committed via the
      // isolated-index path. A subsequent merge then has a clean tree
      // instead of refusing with "working tree has uncommitted changes".
      await this.runPushCycle();
      await this.runPullCycle();
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
      hasRemote: this.hasRemote,
      syncEnabled: this.syncEnabled === true,
      identityUnresolved: this.identityUnresolved,
      error: this.error,
      pausedReason: this.pausedReason,
    };
  }

  /**
   * Re-run the FR20a identity chain and broadcast if the unresolved flag
   * changed. Called from the set-identity endpoint so the UI nudge clears
   * immediately instead of waiting for the next push cycle.
   */
  async refreshIdentity(): Promise<void> {
    const identity = await resolveGitIdentity(this.projectDir);
    const next = identity === null;
    if (this.identityUnresolved !== next) {
      this.identityUnresolved = next;
      this.cc1Broadcaster?.signal('sync-status');
    }
  }

  /** Return all current conflict entries. */
  getConflicts(): import('./conflict-storage.ts').ConflictEntry[] {
    return this.conflictStore.list();
  }

  /**
   * Resolve a conflict by file path and strategy.
   * Delegates to ConflictStore.resolveConflict.
   */
  async resolveConflict(
    file: string,
    strategy: import('./conflict-storage.ts').ResolveStrategy,
    content?: string,
  ): Promise<void> {
    await this.conflictStore.resolveConflict(file, strategy, content);
    this.conflictCount = this.conflictStore.count();
    if (this.conflictCount === 0 && this.state === 'conflict') {
      this.transitionTo('idle');
      this.pausedReason = undefined;
      this.schedulePull();
      this.schedulePush();
    }
    this.scheduleSaveState();
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
      this.conflictStore.setBranch(branch);
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

  private schedulePull(overrideDelayMs?: number): void {
    if (this.pullTimer !== null) clearTimeout(this.pullTimer);
    const delayMs = overrideDelayMs ?? this.effectivePullDelayMs();
    this.pullTimer = setTimeout(() => {
      this.pullTimer = null;
      this.runPullCycle().catch((e) => {
        log.error({ err: e }, '[sync] pull cycle uncaught error');
      });
    }, delayMs);
  }

  private schedulePush(overrideDelayMs?: number): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    const delayMs = overrideDelayMs ?? jitteredMs(this.pushIntervalSeconds);
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
    // Skip cleanly if the project repo has no commits yet — nothing to pull
    // against and `rev-parse HEAD` would otherwise throw an ambiguous-argument
    // error that's classified as a generic unknown-local failure.
    if (isUnbornHead(this.projectDir)) {
      this.schedulePull();
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
      // Gate batch to suppress HEAD watcher reconciliation during SyncEngine merge
      this.setBatchInProgress?.(true);
      try {
        // Commit content-scoped dirty files first so `git merge` doesn't
        // refuse with dirty-tree. Non-content dirty files are the user's
        // responsibility — pause if any remain.
        await this.commitDirtyContentFilesToHead(handle);
        if (!(await this.pauseIfNonContentDirty(handle))) {
          return;
        }
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
      } finally {
        this.setBatchInProgress?.(false);
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
    if (isUnbornHead(this.projectDir)) {
      this.schedulePush();
      return;
    }

    this.pushInFlight = true;
    try {
      await this.doPushCycle(1);
    } finally {
      this.pushInFlight = false;
      this.schedulePush(); // chain: schedule next after current completes
    }
  }

  /** @param retriesLeft - Max inline fetch+merge+retry attempts on non-fast-forward. */
  private async doPushCycle(retriesLeft = 0): Promise<void> {
    // Gather content-filtered files that exist on disk (D35: never git add .)
    const contentFiles = this.gatherContentFilesSync();

    // Temp index file for GIT_INDEX_FILE isolation (D32 / D33)
    const tmpIndexPath = join(tmpdir(), `ok-sync-idx-${process.pid}-${Date.now()}.idx`);
    let commitSha: string | null = null;

    this.transitionTo('pushing');

    try {
      await withParentLock(async () => {
        // Create handle with isolated index so we never disturb the user's real index
        const handle = createGitInstance(this.projectDir, {
          credentialArgs: this.credentialArgs,
          gitIndexFile: tmpIndexPath,
        });

        // ── 1. Get current HEAD SHA ────────────────────────────────────────────
        // Short-circuit unborn HEAD by checking .git/HEAD directly — more
        // reliable than catching revparse's error, since simple-git surfaces
        // the same error message for several unrelated failure modes.
        if (isUnbornHead(this.projectDir)) {
          log.info({}, '[sync] repo has no commits yet — skipping push cycle');
          this.transitionTo('idle');
          return;
        }
        let headSha: string;
        try {
          headSha = (await handle.git.revparse('HEAD')).trim();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const raw = (e as { git?: unknown }).git?.toString() ?? msg;
          const combined = `${msg}\n${raw}`;
          if (
            /unknown revision or path not in the working tree/i.test(combined) ||
            /ambiguous argument 'HEAD'/i.test(combined) ||
            /does not have any commits yet/i.test(combined)
          ) {
            log.info({}, '[sync] repo has no commits yet — skipping push cycle');
            this.transitionTo('idle');
            return;
          }
          this.handleError(classifyGitError(e instanceof Error ? e : new Error(String(e))));
          return; // early exit from lock
        }

        // ── 2. Seed isolated index from HEAD tree ──────────────────────────────
        await handle.git.raw(['read-tree', headSha]);

        // ── 3. Identify deleted content files (in HEAD but no longer on disk) ──
        const headContentSet = new Set<string>(); // projectDir-relative paths
        try {
          const lsOut = (await handle.git.raw(['ls-tree', '-r', '--name-only', headSha])).trim();
          for (const line of lsOut ? lsOut.split('\n') : []) {
            const projRelPath = line.trim();
            if (!projRelPath) continue;
            const absPath = join(this.projectDir, projRelPath);
            const contentRelPath = relative(this.contentDir, absPath);
            if (
              !contentRelPath.startsWith('..') &&
              !this.contentFilter.isExcluded(contentRelPath)
            ) {
              headContentSet.add(projRelPath);
            }
          }
        } catch {
          // Non-fatal: proceed without deletion tracking
        }

        // ── 4. Stage working-tree content files into isolated index ────────────
        if (contentFiles.length > 0) {
          const BATCH = 100; // avoid ARG_MAX
          for (let i = 0; i < contentFiles.length; i += BATCH) {
            const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
            await handle.git.raw(['add', '--', ...batch]);
          }
        }

        // ── 5. Remove deleted content files from isolated index ────────────────
        const onDiskSet = new Set(contentFiles.map((f) => f.projectRelPath));
        const deleted = [...headContentSet].filter((f) => !onDiskSet.has(f));
        if (deleted.length > 0) {
          await handle.git.raw(['rm', '--cached', '--', ...deleted]);
        }

        // ── 6. Write the tree from the isolated index ──────────────────────────
        const newTreeSha = (await handle.git.raw(['write-tree'])).trim();

        // ── 7. Skip if tree is identical to HEAD's tree (prevents empty commits) ─
        //       Authoritative "nothing changed" check: compare against HEAD
        //       rather than `lastPushedSha`, since (a) `lastPushedSha` is null
        //       on first start / fresh sync-state, and (b) HEAD may have moved
        //       via pull or external commit, in which case `lastPushedSha^{tree}`
        //       no longer reflects the parent we'd be committing on top of.
        let headTreeSha = '';
        try {
          headTreeSha = (await handle.git.raw(['rev-parse', `${headSha}^{tree}`])).trim();
        } catch {
          // Non-fatal: fall through and let commit-tree handle it
        }
        if (headTreeSha && headTreeSha === newTreeSha) {
          // Nothing to commit — mark this cycle's SHA as last-pushed so subsequent
          // no-op cycles short-circuit via the same path and the UI settles.
          this.lastPushedSha = headSha;
          this.transitionTo('idle');
          return;
        }

        // ── 8. Build commit message from files that actually changed in this
        //       commit (HEAD tree vs new tree), not from every tracked file.
        let changedContentRelPaths: string[] = [];
        try {
          const diffOut = (
            await handle.git.raw(['diff-tree', '--name-only', '-r', headSha, newTreeSha])
          ).trim();
          if (diffOut) {
            const contentFileByProjRel = new Map(
              contentFiles.map((f) => [f.projectRelPath, f.contentRelPath]),
            );
            for (const line of diffOut.split('\n')) {
              const projRelPath = line.trim();
              if (!projRelPath) continue;
              const contentRelPath =
                contentFileByProjRel.get(projRelPath) ??
                relative(this.contentDir, join(this.projectDir, projRelPath));
              if (contentRelPath && !contentRelPath.startsWith('..')) {
                changedContentRelPaths.push(contentRelPath);
              }
            }
          }
        } catch {
          // Non-fatal: fall back to all-files message so we still commit.
          changedContentRelPaths = contentFiles.map((f) => f.contentRelPath);
        }
        const message = this.buildCommitMessage(changedContentRelPaths);

        // ── 9. Author identity (FR20a: resolveGitIdentity chain, soft fallback) ─
        // Chain: repo-local → global → (OAuth profile, when tokenStore plumbed) →
        // hard-coded "Open Knowledge" default. We never error on unresolved
        // identity — attribution silently degrades to the default and the UI
        // surfaces a non-blocking nudge via `status.identityUnresolved`.
        const identity = await resolveGitIdentity(this.projectDir);
        const nextUnresolved = identity === null;
        if (this.identityUnresolved !== nextUnresolved) {
          this.identityUnresolved = nextUnresolved;
          this.cc1Broadcaster?.signal('sync-status');
        }
        const authorName = identity?.name ?? 'Open Knowledge';
        const authorEmail = identity?.email ?? 'sync@open-knowledge.local';

        // Set author/committer env vars on the handle for commit-tree
        handle.git.env({
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_COMMITTER_NAME: authorName,
          GIT_COMMITTER_EMAIL: authorEmail,
        });

        // ── 10. Create squash commit (one parent per push cycle — D33) ─────────
        const newCommitSha = (
          await handle.git.raw(['commit-tree', newTreeSha, '-p', headSha, '-m', message])
        ).trim();

        if (!newCommitSha) {
          this.transitionTo('idle');
          return;
        }

        // ── 11. Update branch ref atomically (CAS: old=headSha prevents races) ─
        await handle.git.raw([
          'update-ref',
          `refs/heads/${this.currentBranch}`,
          newCommitSha,
          headSha,
        ]);

        // ── 11b. Sync the real index with new HEAD for the content paths we
        //        just committed. Uses a handle WITHOUT the isolated GIT_INDEX_FILE
        //        so the reset targets `.git/index`, not our tmp index. Without
        //        this, the real index keeps the old HEAD's tree entries and
        //        `git status` reports phantom "M" in the index column. Scoped
        //        to content paths only so user WIP staging on non-content
        //        files is preserved.
        if (contentFiles.length > 0) {
          const realIndexHandle = createGitInstance(this.projectDir, {
            credentialArgs: this.credentialArgs,
          });
          const BATCH = 100;
          for (let i = 0; i < contentFiles.length; i += BATCH) {
            const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
            try {
              await realIndexHandle.git.raw(['reset', 'HEAD', '--', ...batch]);
            } catch {
              // Non-fatal: worst case is phantom MM until next sync cycle.
            }
          }
        }

        // ── 12. Push — set upstream if branch has none ─────────────────────────
        let hasUpstream = false;
        try {
          await handle.git.raw(['rev-parse', '--abbrev-ref', `${this.currentBranch}@{u}`]);
          hasUpstream = true;
        } catch {}

        if (hasUpstream) {
          await handle.git.raw(['push', 'origin', this.currentBranch]);
        } else {
          await handle.git.raw(['push', '--set-upstream', 'origin', this.currentBranch]);
        }

        commitSha = newCommitSha;
      });

      if (commitSha) {
        this.lastPushedSha = commitSha;
        this.lastSyncUtc = new Date().toISOString();
        this.ahead = 0;
        if (this.state === 'pushing') {
          this.transitionTo('idle');
        }
        // If we were paused on dirty-tree, the commit we just made cleared
        // the working tree relative to HEAD. Clear the paused reason and
        // schedule an immediate pull so any pending merge (behind>0) lands
        // now that the tree is clean.
        if (this.pausedReason === 'dirty-tree') {
          this.pausedReason = undefined;
          this.error = undefined;
          this.schedulePull(0);
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const classified = classifyGitError(err);
      if (classified.class === 'semantic' && classified.subclass === 'non-fast-forward') {
        if (retriesLeft > 0) {
          // Inline fetch + merge + retry (one attempt)
          log.info({}, '[sync] push rejected (non-fast-forward) — fetching, merging, retrying');
          const retryHandle = createGitInstance(this.projectDir, {
            credentialArgs: this.credentialArgs,
          });
          this.setBatchInProgress?.(true);
          try {
            await retryHandle.git.fetch('origin');
            // Commit content-scoped dirty files before merging so the editor
            // racing against the outer push's `update-ref` doesn't cause
            // `git merge` to refuse with dirty-tree. Files outside the
            // content scope are the user's to handle — pause if any remain.
            await this.commitDirtyContentFilesToHead(retryHandle);
            if (!(await this.pauseIfNonContentDirty(retryHandle))) {
              this.setBatchInProgress?.(false);
              return;
            }
            await retryHandle.git.merge([`origin/${this.currentBranch}`]);
          } catch (mergeErr) {
            const mc = classifyGitError(
              mergeErr instanceof Error ? mergeErr : new Error(String(mergeErr)),
            );
            if (mc.class === 'semantic' && mc.subclass === 'merge-conflict') {
              await this.handleMergeConflict();
            } else {
              this.handleError(mc);
            }
            this.scheduleSaveState();
            return;
          } finally {
            this.setBatchInProgress?.(false);
          }
          // Merge succeeded — retry push once (retriesLeft=0 prevents recursion)
          await this.doPushCycle(0);
          return;
        }
        // Retry exhausted — let the next pull cycle handle it
        log.info({}, '[sync] push still rejected after retry — waiting for next pull cycle');
        this.consecutiveFailures++;
        if (this.state === 'pushing') this.transitionTo('idle');
      } else {
        this.handleError(classified);
      }
    } finally {
      // Always clean up the temporary index file
      try {
        unlinkSync(tmpIndexPath);
      } catch {}
    }

    this.scheduleSaveState();
  }

  // ─── Push cycle helpers ───────────────────────────────────────────────────

  /**
   * Stage the current working tree's **content** files against HEAD and, if
   * the result differs from HEAD's tree, create a commit + fast-forward
   * `refs/heads/<branch>`. Content scope matches the main push cycle — only
   * files returned by `gatherContentFilesSync()` are staged.
   *
   * Returns the new commit SHA, or null if there was nothing content-scoped
   * to commit.
   *
   * Note: this does not clean the tree entirely — files outside the content
   * scope (e.g. package.json, untracked config) remain dirty. Callers that
   * need a truly clean tree (e.g. before `git merge`) must also call
   * `checkTreeCleanAfterContentCommit` and pause if it's not.
   */
  private async commitDirtyContentFilesToHead(
    handle: import('./git-handle.ts').GitHandle,
  ): Promise<string | null> {
    const status = await handle.git.status();
    if (status.files.length === 0) return null;

    const headSha = (await handle.git.revparse('HEAD')).trim();
    const contentFiles = this.gatherContentFilesSync();
    if (contentFiles.length === 0) return null;

    const tmpIndex = join(tmpdir(), `ok-sync-retry-idx-${process.pid}-${Date.now()}.idx`);
    const isoHandle = createGitInstance(this.projectDir, {
      credentialArgs: this.credentialArgs,
      gitIndexFile: tmpIndex,
    });
    try {
      await isoHandle.git.raw(['read-tree', headSha]);
      const BATCH = 100;
      for (let i = 0; i < contentFiles.length; i += BATCH) {
        const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
        await isoHandle.git.raw(['add', '--', ...batch]);
      }
      const newTreeSha = (await isoHandle.git.raw(['write-tree'])).trim();
      const headTreeSha = (await isoHandle.git.raw(['rev-parse', `${headSha}^{tree}`])).trim();
      if (newTreeSha === headTreeSha) return null;

      const identity = await resolveGitIdentity(this.projectDir);
      const authorName = identity?.name ?? 'Open Knowledge';
      const authorEmail = identity?.email ?? 'sync@open-knowledge.local';
      isoHandle.git.env({
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
      });

      const message = 'Auto-save: interim before merge';
      const newCommitSha = (
        await isoHandle.git.raw(['commit-tree', newTreeSha, '-p', headSha, '-m', message])
      ).trim();
      if (!newCommitSha) return null;

      await handle.git.raw([
        'update-ref',
        `refs/heads/${this.currentBranch}`,
        newCommitSha,
        headSha,
      ]);

      // Sync the real index with new HEAD for the paths we just committed
      // (see push-cycle step 11b for the full rationale). `handle` has no
      // isolated GIT_INDEX_FILE — resets the real `.git/index`.
      for (let i = 0; i < contentFiles.length; i += BATCH) {
        const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
        try {
          await handle.git.raw(['reset', 'HEAD', '--', ...batch]);
        } catch {
          // Non-fatal: phantom MM until next cycle, but merge will still work.
        }
      }

      return newCommitSha;
    } finally {
      try {
        unlinkSync(tmpIndex);
      } catch {}
    }
  }

  /**
   * After committing content-scoped dirty files, verify the tree is truly
   * clean. If any files remain dirty (outside the content scope), set
   * `pausedReason = 'external-changes-pending'` with up to 3 paths in
   * `error`, transition to idle, and return false — caller must NOT proceed
   * with the merge.
   */
  private async pauseIfNonContentDirty(
    handle: import('./git-handle.ts').GitHandle,
  ): Promise<boolean> {
    // `diff-index --name-only HEAD` lists only TRACKED files whose working-
    // tree content differs from HEAD's. Untracked files are intentionally
    // excluded: `git merge` only refuses on untracked files when the merge
    // commit adds the same path, which git itself will surface at merge time
    // with a specific error — we don't need to pre-pause for every untracked
    // file (they're common: build artifacts, IDE state, scratch notes).
    let out = '';
    try {
      out = (await handle.git.raw(['diff-index', '--name-only', 'HEAD'])).trim();
    } catch {
      return true; // can't diff — don't block the merge attempt
    }
    if (!out) return true;
    const paths = out
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length === 0) return true;
    const display = paths.slice(0, 3).join(', ');
    const rest = paths.length > 3 ? `, +${paths.length - 3} more` : '';
    this.error = `External changes pending: ${display}${rest}`;
    this.pausedReason = 'external-changes-pending';
    this.consecutiveFailures = 0;
    this.transitionTo('idle');
    this.scheduleSaveState();
    log.warn({ files: paths }, '[sync] paused — non-content tracked files dirty');
    return false;
  }

  /**
   * Recursively walk contentDir and return all files that pass ContentFilter.
   * Uses synchronous FS because this runs under the parentGitMutex.
   */
  private gatherContentFilesSync(): ContentFileEntry[] {
    const results: ContentFileEntry[] = [];

    const walk = (dir: string) => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip git internals, node_modules, and hidden dirs. `.open-knowledge`
          // used to be skipped wholesale, but its config.yml / AGENTS.md /
          // catalogs are legitimately user-content that should sync; runtime
          // state (cache/, server.lock, sync-state.json) is gitignored and
          // will be filtered out by `contentFilter.isExcluded` below.
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            (entry.name.startsWith('.') && entry.name !== '.open-knowledge')
          )
            continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const contentRelPath = relative(this.contentDir, fullPath);
          // Only include files inside contentDir that pass the filter
          if (!contentRelPath.startsWith('..') && !this.contentFilter.isExcluded(contentRelPath)) {
            const projectRelPath = relative(this.projectDir, fullPath);
            results.push({ contentRelPath, projectRelPath });
          }
        }
      }
    };

    if (existsSync(this.contentDir)) {
      walk(this.contentDir);
    }
    return results;
  }

  /**
   * Build the auto-save commit message.
   * ≤3 files: "Auto-save: Updated a.md, b.md"
   * >3 files: "Auto-save: N files changed"
   */
  private buildCommitMessage(contentRelPaths: string[]): string {
    if (contentRelPaths.length === 0) {
      return 'Auto-save: changes saved';
    }
    if (contentRelPaths.length <= 3) {
      return `Auto-save: Updated ${contentRelPaths.join(', ')}`;
    }
    return `Auto-save: ${contentRelPaths.length} files changed`;
  }

  // ─── Conflict handling ────────────────────────────────────────────────────

  private async handleMergeConflict(): Promise<void> {
    const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });

    // List all conflicted files (those with U status in git's unmerged index)
    let conflictedFiles: string[] = [];
    try {
      const out = (await handle.git.raw(['diff', '--name-only', '--diff-filter=U'])).trim();
      conflictedFiles = out
        ? out
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    } catch (e) {
      log.warn(
        { err: e },
        '[sync] failed to list conflicted files — treating all as content conflicts',
      );
    }

    // Partition: content files pause sync; non-content files are auto-resolved with theirs
    const contentConflicts: string[] = [];
    const nonContentConflicts: string[] = [];

    for (const file of conflictedFiles) {
      const absPath = join(this.projectDir, file);
      const contentRelPath = relative(this.contentDir, absPath);
      if (!contentRelPath.startsWith('..') && !this.contentFilter.isExcluded(contentRelPath)) {
        contentConflicts.push(file);
      } else {
        nonContentConflicts.push(file);
      }
    }

    // Auto-resolve non-content files with 'theirs' strategy
    for (const file of nonContentConflicts) {
      try {
        await handle.git.raw(['checkout', '--theirs', '--', file]);
        await handle.git.raw(['add', '--', file]);
        log.info({ file }, '[sync] auto-resolved non-content conflict with theirs');
      } catch (e) {
        // If auto-resolve fails, escalate to content conflict
        log.warn({ err: e, file }, '[sync] auto-resolve failed — escalating to content conflict');
        contentConflicts.push(file);
      }
    }

    if (contentConflicts.length > 0) {
      // Record in ConflictStore
      for (const file of contentConflicts) {
        this.conflictStore.addConflict({ file, detectedAt: new Date().toISOString() });
      }
      this.conflictCount = this.conflictStore.count();

      // Pause timers — sync resumes only after manual resolution or abort
      if (this.pullTimer !== null) {
        clearTimeout(this.pullTimer);
        this.pullTimer = null;
      }
      if (this.pushTimer !== null) {
        clearTimeout(this.pushTimer);
        this.pushTimer = null;
      }

      this.transitionTo('conflict');
      log.warn(
        { files: contentConflicts },
        '[sync] content conflicts — sync paused until resolved',
      );
    } else {
      // All conflicts auto-resolved — complete the merge
      try {
        await handle.git.raw(['commit', '--no-edit']);
        this.lastSyncUtc = new Date().toISOString();
        this.behind = 0;
        this.transitionTo('idle');
        log.info({}, '[sync] all conflicts auto-resolved — merge committed');
      } catch (e) {
        // Commit failed after partial auto-resolve — abort merge to clean up git index
        log.warn(
          { err: e },
          '[sync] failed to commit after auto-resolving conflicts — aborting merge',
        );
        try {
          await handle.git.raw(['merge', '--abort']);
        } catch (abortErr) {
          log.warn({ err: abortErr }, '[sync] git merge --abort failed during cleanup');
        }
        this.transitionTo('idle');
      }
    }
  }

  /**
   * Abort the current merge, clear all recorded conflicts, and pause sync.
   * Sync remains paused until `trigger()` is called manually.
   */
  async abortMerge(): Promise<void> {
    const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });
    try {
      await handle.git.raw(['merge', '--abort']);
      log.info({}, '[sync] merge aborted');
    } catch (e) {
      log.warn({ err: e }, '[sync] git merge --abort failed — conflicts.json still cleared');
    }
    this.conflictStore.clear();
    this.conflictCount = 0;
    // Transition to idle but leave timers cleared — sync paused until manual trigger
    this.transitionTo('idle');
    this.scheduleSaveState();
  }

  // ─── Error handling ───────────────────────────────────────────────────────

  private handleError(classified: ClassifiedError): void {
    this.error = classified.message;
    log.warn(
      {
        class: classified.class,
        subclass: classified.subclass,
        retryable: classified.retryable,
        rawStderr: classified.rawStderr,
      },
      `[sync-error] ${classified.message}`,
    );

    if (classified.class === 'auth') {
      this.transitionTo('auth-error');
      this.pausedReason = 'auth-error';
    } else if (classified.class === 'semantic' && classified.subclass === 'protected-branch') {
      this.syncEnabled = false; // Disable permanently — user must change branch or permissions
      this.transitionTo('disabled');
      this.pausedReason = 'protected-branch';
    } else if (classified.class === 'local' && classified.subclass === 'dirty-tree') {
      // Self-heal: schedule an immediate push. The push cycle commits
      // working-tree edits via an isolated index, which reconciles the
      // tree against HEAD and lets the subsequent merge proceed.
      this.consecutiveFailures++;
      this.transitionTo('idle');
      this.pausedReason = 'dirty-tree';
      this.schedulePush(0);
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
        // Persist file paths of any in-flight conflicts so they survive restart
        inflightConflicts: this.conflictStore.list().map((c) => c.file),
        syncEnabled: this.syncEnabled,
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
      if (data.syncEnabled !== undefined) this.syncEnabled = data.syncEnabled;

      // Restore in-flight conflicts into the ConflictStore
      const inflightFiles = data.inflightConflicts ?? [];
      if (inflightFiles.length > 0) {
        for (const file of inflightFiles) {
          // Only add if not already present (ConflictStore.load() may have populated it)
          if (!this.conflictStore.list().some((c) => c.file === file)) {
            this.conflictStore.addConflict({ file, detectedAt: new Date().toISOString() });
          }
        }
        this.conflictCount = this.conflictStore.count();
      }
    } catch (e) {
      log.warn({ err: e }, '[sync] failed to load sync state');
    }
  }
}
