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
import { setTimeout as wait } from 'node:timers/promises';
import type { CC1Broadcaster } from './cc1-broadcast.ts';
import { ConflictStore } from './conflict-storage.ts';
import type { ContentFilter } from './content-filter.ts';
import { type ClassifiedError, classifyGitError } from './error-classification.ts';
import { createGitInstance, type GitHandle, withParentLock } from './git-handle.ts';
import { resolveGitIdentity } from './git-identity.ts';
import { getLogger } from './logger.ts';
import { computeRemainingMs } from './sync-timing.ts';

const log = getLogger('sync-engine');

const SHA_HEX_40 = /^[0-9a-f]{40}$/i;

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

interface SyncStatus {
  state: SyncState;
  lastSyncUtc: string | null;
  lastFetchUtc: string | null;
  lastPushedSha: string | null;
  ahead: number;
  behind: number;
  consecutiveFailures: number;
  conflictCount: number;
  hasRemote: boolean;
  syncEnabled: boolean;
  identityUnresolved: boolean;
  error?: string;
  pausedReason?: string;
}

interface ContentFileEntry {
  contentRelPath: string;
  projectRelPath: string;
}

interface PersistedSyncState {
  version: 1;
  lastSyncUtc: string | null;
  lastFetchUtc: string | null;
  lastPushedSha: string | null;
  consecutiveFailures: number;
  pausedReason?: string;
  pausedSinceUtc?: string;
  inflightConflicts: string[];
  syncEnabled?: boolean;
}

interface SyncEngineOptions {
  projectDir: string;
  contentDir: string;
  contentFilter: ContentFilter;
  contentRoot?: string;
  pullIntervalSeconds?: number;
  pushIntervalSeconds?: number;
  syncEnabled?: boolean;
  credentialArgs?: string[];
  cc1Broadcaster?: CC1Broadcaster | null;
  onStateChange?: (state: SyncState) => void;
  setBatchInProgress?: (value: boolean) => void;
}

function jitteredMs(seconds: number): number {
  const base = seconds * 1000;
  const jitter = base * 0.15 * (2 * Math.random() - 1); // ±15%
  return Math.round(base + jitter);
}

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

function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures >= 8) return 60 * 60 * 1000; // 60 min
  if (consecutiveFailures >= 5) return 15 * 60 * 1000; // 15 min
  if (consecutiveFailures >= 3) return 5 * 60 * 1000; // 5 min
  return 0; // use normal interval
}

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

  private pullInFlight = false;
  private pushInFlight = false;

  private hasRemote = false;

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
    this.statePath = resolve(this.contentDir, '.ok', 'sync-state.json');
    this.conflictStore = new ConflictStore(this.contentDir, this.projectDir, this.currentBranch);
  }

  async start(): Promise<void> {
    if (this.state !== 'dormant') return;

    this.loadState();

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
      } catch {}
    } catch (e) {
      log.warn({ err: e }, '[sync] remote detection failed');
    }

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

    const mergeHeadPath = join(this.projectDir, '.git', 'MERGE_HEAD');
    const mergeInProgress = existsSync(mergeHeadPath);

    if (this.conflictCount > 0 && !mergeInProgress) {
      log.warn(
        { count: this.conflictCount },
        '[sync] persisted conflicts but no MERGE_HEAD — clearing stale state',
      );
      this.conflictStore.clear();
      this.conflictCount = 0;
    } else if (this.conflictCount > 0 && mergeInProgress) {
      try {
        const handle = createGitInstance(this.projectDir, {
          credentialArgs: this.credentialArgs,
        });
        const out = (await handle.git.raw(['diff', '--name-only', '--diff-filter=U'])).trim();
        const stillUnmerged = new Set(
          out
            ? out
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        );
        const before = this.conflictCount;
        for (const entry of this.conflictStore.list()) {
          if (!stillUnmerged.has(entry.file)) {
            this.conflictStore.removeConflict(entry.file);
          }
        }
        this.conflictCount = this.conflictStore.count();
        if (this.conflictCount < before) {
          log.info(
            { cleared: before - this.conflictCount, remaining: this.conflictCount },
            '[sync] reconciled conflicts.json against git unmerged index',
          );
        }
      } catch (e) {
        log.warn({ err: e }, '[sync] failed to reconcile conflicts with git index');
      }
    }

    if (mergeInProgress && this.conflictCount === 0) {
      log.warn({}, '[sync] stale MERGE_HEAD detected with no tracked conflicts — aborting merge');
      try {
        const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });
        await handle.git.raw(['merge', '--abort']);
      } catch (e) {
        log.warn({ err: e }, '[sync] git merge --abort for stale MERGE_HEAD failed');
      }
    }

    if (this.conflictCount > 0) {
      this.transitionTo('conflict');
      log.warn(
        { count: this.conflictCount },
        '[sync] restarted with active conflicts — sync paused',
      );
      return;
    }

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
      const DRAIN_TIMEOUT_MS = 30_000;
      const drainStartMs = Date.now();
      while (this.pullInFlight || this.pushInFlight) {
        if (Date.now() - drainStartMs > DRAIN_TIMEOUT_MS) {
          log.warn(
            { pullInFlight: this.pullInFlight, pushInFlight: this.pushInFlight },
            '[sync] setEnabled(false): timed out waiting for in-flight cycle to drain',
          );
          break;
        }
        await wait(50);
      }
      this.pausedReason = undefined;
      this.error = undefined;
      this.transitionTo(this.hasRemote ? 'disabled' : 'dormant');
      this.saveStateNow();
      return;
    }

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

  async trigger(op: 'sync' | 'push' | 'pull' = 'sync'): Promise<void> {
    this.consecutiveFailures = 0;
    if (this.pausedReason === 'dirty-tree' || this.pausedReason === 'external-changes-pending') {
      this.pausedReason = undefined;
      this.error = undefined;
    }
    if (
      this.state === 'dormant' ||
      this.state === 'disabled' ||
      this.state === 'conflict' ||
      this.state === 'auth-error'
    ) {
      log.warn(
        {
          op,
          state: this.state,
          syncEnabled: this.syncEnabled,
          hasRemote: this.hasRemote,
          pausedReason: this.pausedReason,
          conflictCount: this.conflictCount,
        },
        `[sync] trigger(${op}) ignored — state=${this.state}`,
      );
    } else {
      log.info({ op, state: this.state }, `[sync] trigger(${op}) running`);
    }
    if (op === 'push') {
      await this.runPushCycle();
    } else if (op === 'pull') {
      await this.runPullCycle();
    } else {
      await this.runPushCycle();
      await this.runPullCycle();
    }
  }

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

  async refreshIdentity(): Promise<void> {
    const identity = await resolveGitIdentity(this.projectDir);
    const next = identity === null;
    if (this.identityUnresolved !== next) {
      this.identityUnresolved = next;
      this.cc1Broadcaster?.signal('sync-status');
    }
  }

  getConflicts(): import('./conflict-storage.ts').ConflictEntry[] {
    return this.conflictStore.list();
  }

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

  updateCurrentBranch(branch: string | null): void {
    if (branch === null) {
      if (this.state !== 'dormant' && this.state !== 'disabled') {
        this.transitionTo('disabled');
        this.pausedReason = 'detached-head';
        this.scheduleSaveState();
      }
    } else if (this.currentBranch !== branch) {
      this.currentBranch = branch;
      this.conflictStore.setBranch(branch);
      if (this.state === 'disabled' && this.pausedReason === 'detached-head') {
        this.pausedReason = undefined;
        this.transitionTo('idle');
        this.schedulePull();
        this.schedulePush();
      }
    }
  }

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

  private async runPullCycle(): Promise<void> {
    if (this.pullInFlight) return;
    if (this.state === 'dormant' || this.state === 'disabled') return;
    if (this.state === 'conflict') {
      this.schedulePull(); // retry after interval but don't fetch while conflicted
      return;
    }
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

    try {
      const status = await handle.git.status();
      this.ahead = status.ahead;
      this.behind = status.behind;
    } catch {}

    if (this.behind > 0 && this.conflictCount === 0) {
      this.transitionTo('pulling');
      this.setBatchInProgress?.(true);
      try {
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

  private async doPushCycle(retriesLeft = 0): Promise<void> {
    const contentFiles = this.gatherContentFilesSync();

    const tmpIndexPath = join(tmpdir(), `ok-sync-idx-${process.pid}-${Date.now()}.idx`);
    let commitSha: string | null = null;

    this.transitionTo('pushing');

    try {
      await withParentLock(async () => {
        const handle = createGitInstance(this.projectDir, {
          credentialArgs: this.credentialArgs,
          gitIndexFile: tmpIndexPath,
        });

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

        await handle.git.raw(['read-tree', headSha]);

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
        } catch {}

        if (contentFiles.length > 0) {
          const BATCH = 100; // avoid ARG_MAX
          for (let i = 0; i < contentFiles.length; i += BATCH) {
            const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
            await handle.git.raw(['add', '--', ...batch]);
          }
        }

        const onDiskSet = new Set(contentFiles.map((f) => f.projectRelPath));
        const deleted = [...headContentSet].filter((f) => !onDiskSet.has(f));
        if (deleted.length > 0) {
          await handle.git.raw(['rm', '--cached', '--', ...deleted]);
        }

        const newTreeSha = (await handle.git.raw(['write-tree'])).trim();

        let headTreeSha = '';
        try {
          headTreeSha = (await handle.git.raw(['rev-parse', `${headSha}^{tree}`])).trim();
        } catch {}
        if (headTreeSha && headTreeSha === newTreeSha) {
          let upstreamSha: string | null = null;
          try {
            upstreamSha = (
              await handle.git.raw(['rev-parse', `origin/${this.currentBranch}`])
            ).trim();
          } catch {}

          if (upstreamSha === headSha) {
            log.info(
              { contentFileCount: contentFiles.length, headSha },
              '[sync] push cycle: nothing to commit (tree unchanged, origin matches HEAD)',
            );
            this.lastPushedSha = headSha;
            this.transitionTo('idle');
            return;
          }

          log.info(
            { headSha, upstreamSha },
            '[sync] push cycle: tree unchanged but local ahead of origin — pushing existing commits',
          );

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

          commitSha = headSha;
          return;
        }

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
          changedContentRelPaths = contentFiles.map((f) => f.contentRelPath);
        }
        const message = this.buildCommitMessage(changedContentRelPaths);

        const identity = await resolveGitIdentity(this.projectDir);
        const nextUnresolved = identity === null;
        if (this.identityUnresolved !== nextUnresolved) {
          this.identityUnresolved = nextUnresolved;
          this.cc1Broadcaster?.signal('sync-status');
        }
        const authorName = identity?.name ?? 'Open Knowledge';
        const authorEmail = identity?.email ?? 'sync@open-knowledge.local';

        handle.git.env({
          GIT_AUTHOR_NAME: authorName,
          GIT_AUTHOR_EMAIL: authorEmail,
          GIT_COMMITTER_NAME: authorName,
          GIT_COMMITTER_EMAIL: authorEmail,
        });

        const newCommitSha = (
          await handle.git.raw(['commit-tree', newTreeSha, '-p', headSha, '-m', message])
        ).trim();

        if (!newCommitSha || !SHA_HEX_40.test(newCommitSha)) {
          log.warn(
            { raw: newCommitSha },
            '[sync] commit-tree returned invalid SHA — aborting push',
          );
          this.transitionTo('idle');
          return;
        }

        await handle.git.raw([
          'update-ref',
          `refs/heads/${this.currentBranch}`,
          newCommitSha,
          headSha,
        ]);

        if (contentFiles.length > 0) {
          const realIndexHandle = createGitInstance(this.projectDir, {
            credentialArgs: this.credentialArgs,
          });
          const BATCH = 100;
          for (let i = 0; i < contentFiles.length; i += BATCH) {
            const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
            try {
              await realIndexHandle.git.raw(['reset', 'HEAD', '--', ...batch]);
            } catch {}
          }
        }

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
          log.info({}, '[sync] push rejected (non-fast-forward) — fetching, merging, retrying');
          const retryHandle = createGitInstance(this.projectDir, {
            credentialArgs: this.credentialArgs,
          });
          this.setBatchInProgress?.(true);
          try {
            await retryHandle.git.fetch('origin');
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
          await this.doPushCycle(0);
          return;
        }
        log.info({}, '[sync] push still rejected after retry — waiting for next pull cycle');
        this.consecutiveFailures++;
        if (this.state === 'pushing') this.transitionTo('idle');
      } else {
        this.handleError(classified);
      }
    } finally {
      try {
        unlinkSync(tmpIndexPath);
      } catch {}
    }

    this.scheduleSaveState();
  }

  private async commitDirtyContentFilesToHead(handle: GitHandle): Promise<string | null> {
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
      if (!newCommitSha || !SHA_HEX_40.test(newCommitSha)) {
        log.warn(
          { raw: newCommitSha },
          '[sync] commit-tree returned invalid SHA in commitDirtyContentFilesToHead',
        );
        return null;
      }

      await handle.git.raw([
        'update-ref',
        `refs/heads/${this.currentBranch}`,
        newCommitSha,
        headSha,
      ]);

      for (let i = 0; i < contentFiles.length; i += BATCH) {
        const batch = contentFiles.slice(i, i + BATCH).map((f) => f.projectRelPath);
        try {
          await handle.git.raw(['reset', 'HEAD', '--', ...batch]);
        } catch {}
      }

      return newCommitSha;
    } finally {
      try {
        unlinkSync(tmpIndex);
      } catch {}
    }
  }

  private async pauseIfNonContentDirty(handle: GitHandle): Promise<boolean> {
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
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            (entry.name.startsWith('.') && entry.name !== '.ok')
          )
            continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const contentRelPath = relative(this.contentDir, fullPath);
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

  private buildCommitMessage(contentRelPaths: string[]): string {
    if (contentRelPaths.length === 0) {
      return 'Auto-save: changes saved';
    }
    if (contentRelPaths.length <= 3) {
      return `Auto-save: Updated ${contentRelPaths.join(', ')}`;
    }
    return `Auto-save: ${contentRelPaths.length} files changed`;
  }

  private async handleMergeConflict(): Promise<void> {
    const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });

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
      log.error(
        { err: e },
        '[sync] failed to list conflicted files — aborting merge to avoid committing unresolved state',
      );
      try {
        await handle.git.raw(['merge', '--abort']);
      } catch (abortErr) {
        log.warn({ err: abortErr }, '[sync] git merge --abort failed during cleanup');
      }
      this.error = 'Failed to detect conflict files — merge aborted';
      this.pausedReason = undefined;
      this.transitionTo('idle');
      return;
    }

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

    for (const file of nonContentConflicts) {
      try {
        await handle.git.raw(['checkout', '--theirs', '--', file]);
        await handle.git.raw(['add', '--', file]);
        log.info({ file }, '[sync] auto-resolved non-content conflict with theirs');
      } catch (e) {
        log.warn({ err: e, file }, '[sync] auto-resolve failed — escalating to content conflict');
        contentConflicts.push(file);
      }
    }

    if (contentConflicts.length > 0) {
      for (const file of contentConflicts) {
        this.conflictStore.addConflict({ file, detectedAt: new Date().toISOString() });
      }
      this.conflictCount = this.conflictStore.count();

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
      try {
        await handle.git.raw(['commit', '--no-edit']);
        this.lastSyncUtc = new Date().toISOString();
        this.behind = 0;
        this.transitionTo('idle');
        log.info({}, '[sync] all conflicts auto-resolved — merge committed');
      } catch (e) {
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
    this.transitionTo('idle');
    this.scheduleSaveState();
  }

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

  private transitionTo(newState: SyncState): void {
    if (this.state === newState) return;
    const prev = this.state;
    this.state = newState;
    log.info({ from: prev, to: newState }, `[sync] state: ${prev} → ${newState}`);
    this.onStateChange?.(newState);
    this.cc1Broadcaster?.signal('sync-status');
  }

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

      const inflightFiles = data.inflightConflicts ?? [];
      if (inflightFiles.length > 0) {
        for (const file of inflightFiles) {
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
