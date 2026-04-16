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
    this.conflictStore = new ConflictStore(this.contentDir, this.projectDir, 'main');
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
      this.hasRemote = hasRemote;

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
      hasRemote: this.hasRemote,
      error: this.error,
      pausedReason: this.pausedReason,
    };
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
        let headSha: string;
        try {
          headSha = (await handle.git.revparse('HEAD')).trim();
        } catch (e) {
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

        // ── 7. Skip if tree is identical to what was last pushed (D33 diff) ────
        if (this.lastPushedSha) {
          let prevTreeSha = '';
          try {
            prevTreeSha = (
              await handle.git.raw(['rev-parse', `${this.lastPushedSha}^{tree}`])
            ).trim();
          } catch {
            // lastPushedSha may no longer exist — treat as changed
          }
          if (prevTreeSha && prevTreeSha === newTreeSha) {
            this.transitionTo('idle');
            return; // nothing to push
          }
        }

        // ── 8. Build commit message ────────────────────────────────────────────
        const message = this.buildCommitMessage(contentFiles.map((f) => f.contentRelPath));

        // ── 9. Author identity from git config (D29) ───────────────────────────
        let authorName = '';
        let authorEmail = '';
        try {
          authorName = (await handle.git.raw(['config', 'user.name'])).trim();
        } catch {}
        try {
          authorEmail = (await handle.git.raw(['config', 'user.email'])).trim();
        } catch {}
        if (!authorName) authorName = 'Open Knowledge';
        if (!authorEmail) authorEmail = 'sync@open-knowledge.local';

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
          // Skip git internals and open-knowledge config dir
          if (entry.name === '.git' || entry.name === '.open-knowledge') continue;
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
        log.warn({ err: e }, '[sync] failed to commit after auto-resolving conflicts');
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
      { class: classified.class, subclass: classified.subclass, retryable: classified.retryable },
      `[sync-error] ${classified.message}`,
    );

    if (classified.class === 'auth') {
      this.transitionTo('auth-error');
      this.pausedReason = 'auth-error';
    } else if (classified.class === 'semantic' && classified.subclass === 'protected-branch') {
      this.syncEnabled = false; // Disable permanently — user must change branch or permissions
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
        // Persist file paths of any in-flight conflicts so they survive restart
        inflightConflicts: this.conflictStore.list().map((c) => c.file),
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
