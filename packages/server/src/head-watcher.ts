/**
 * HEAD watcher — detects coordinated git operations (pull, checkout, merge, rebase).
 *
 * Watches .git/HEAD, MERGE_HEAD, ORIG_HEAD, and index.lock for changes.
 * Emits BatchBegin when activity starts and BatchEnd after a quiet window.
 *
 * BatchEnd includes headMoved (whether HEAD SHA changed) and old/new SHAs.
 * A timeout cap prevents indefinite batching (e.g., long rebase).
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

type BatchKind = 'within-branch' | 'cross-branch' | 'detached-head';

interface BatchEndInfo {
  headMoved: boolean;
  oldHead: string | null;
  newHead: string | null;
  timeout: boolean;
  batchKind: BatchKind;
  oldBranch: string | null;
  newBranch: string | null;
}

interface BatchBeginInfo {
  trigger: string;
}

type OnBatchBegin = (info: BatchBeginInfo) => void | Promise<void>;
type OnBatchEnd = (info: BatchEndInfo) => void | Promise<void>;

export interface HeadWatcherHandle {
  unsubscribe: () => Promise<void>;
  /** Current known branch name (or 'detached-<sha12>'). */
  getLastKnownBranch: () => string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUIET_WINDOW_MS = 100;
const BATCH_TIMEOUT_MS = 30_000;

/** Files within .git/ that signal coordinated operations. */
const WATCHED_FILES = new Set(['HEAD', 'MERGE_HEAD', 'ORIG_HEAD', 'index.lock']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the actual .git directory.
 * In worktrees, .git is a file containing "gitdir: /path/to/real/gitdir".
 */
export function resolveGitDir(projectRoot: string): string | null {
  const gitPath = resolve(projectRoot, '.git');
  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory()) return gitPath;
    if (stat.isFile()) {
      // Worktree: .git is a pointer file
      const content = readFileSync(gitPath, 'utf-8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) {
        const resolved = resolve(projectRoot, match[1]);
        return resolved;
      }
    }
  } catch {
    // No .git
  }
  return null;
}

/** Read current HEAD SHA, or null if unreadable. */
function readHeadSha(gitDir: string): string | null {
  try {
    const headContent = readFileSync(resolve(gitDir, 'HEAD'), 'utf-8').trim();
    // HEAD may be a ref (ref: refs/heads/main) or a detached SHA
    if (headContent.startsWith('ref: ')) {
      const refPath = resolve(gitDir, headContent.slice(5));
      try {
        return readFileSync(refPath, 'utf-8').trim();
      } catch {
        // Ref file may not exist (empty repo)
        // Try packed-refs
        try {
          const packed = readFileSync(resolve(gitDir, 'packed-refs'), 'utf-8');
          const refName = headContent.slice(5);
          const line = packed.split('\n').find((l) => l.endsWith(` ${refName}`));
          if (line) return line.split(' ')[0];
        } catch {
          // No packed-refs
        }
        return null;
      }
    }
    // Detached HEAD — the content is the SHA
    return headContent.length >= 40 ? headContent.slice(0, 40) : null;
  } catch {
    return null;
  }
}

/**
 * Read the branch name from .git/HEAD.
 *
 * Returns the branch name (e.g. "main") for a symref,
 * "detached-<sha12>" for a raw SHA, or null if unreadable.
 */
export function readBranchFromHead(gitDir: string): string | null {
  try {
    const headContent = readFileSync(resolve(gitDir, 'HEAD'), 'utf-8').trim();
    if (headContent.startsWith('ref: refs/heads/')) {
      return headContent.slice('ref: refs/heads/'.length);
    }
    // Detached HEAD — raw SHA
    if (headContent.length >= 40) {
      return `detached-${headContent.slice(0, 12)}`;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

/**
 * Start watching .git/ for coordinated operations.
 *
 * Returns a handle to stop watching. If projectGitDir is null (standalone mode),
 * returns a no-op handle.
 */
export async function startHeadWatcher(
  projectRoot: string,
  onBatchBegin: OnBatchBegin,
  onBatchEnd: OnBatchEnd,
): Promise<HeadWatcherHandle> {
  const resolvedGitDir = resolveGitDir(projectRoot);
  if (!resolvedGitDir) {
    // Standalone mode — no .git to watch
    return { unsubscribe: async () => {}, getLastKnownBranch: () => null };
  }
  const gitDir: string = resolvedGitDir;

  let inBatch = false;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let oldHead: string | null = null;
  let lastKnownBranch: string | null = null;

  async function emitBatchEnd(timeout: boolean): Promise<void> {
    // Wait for onBatchBegin to finish before proceeding
    if (beginInFlight) await beginInFlight;
    if (!inBatch) return;

    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }

    const newHead = readHeadSha(gitDir);
    const headMoved = oldHead !== newHead;
    const newBranch = readBranchFromHead(gitDir);

    // Classify batch kind
    let batchKind: BatchKind;
    if (newBranch?.startsWith('detached-')) {
      batchKind = 'detached-head';
    } else if (lastKnownBranch !== newBranch) {
      batchKind = 'cross-branch';
    } else {
      batchKind = 'within-branch';
    }

    const oldBranch = lastKnownBranch;

    try {
      await onBatchEnd({
        headMoved,
        oldHead,
        newHead,
        timeout,
        batchKind,
        oldBranch,
        newBranch,
      });
    } catch (e) {
      console.error('[head-watcher] onBatchEnd callback failed:', e);
    } finally {
      // Set inBatch = false AFTER the async callback completes
      // so new file events stay buffered during branch-switch orchestration
      inBatch = false;
      oldHead = newHead;
      lastKnownBranch = newBranch;
    }
  }

  function resetQuietWindow(): void {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      void emitBatchEnd(false);
    }, QUIET_WINDOW_MS);
  }

  let beginInFlight: Promise<void> | null = null;

  async function handleGitEvent(trigger: string): Promise<void> {
    if (!inBatch) {
      inBatch = true;
      oldHead = readHeadSha(gitDir);
      const beginPromise = (async () => {
        try {
          await onBatchBegin({ trigger });
        } catch (e) {
          console.error('[head-watcher] onBatchBegin callback failed:', e);
        }
      })();
      beginInFlight = beginPromise;
      await beginPromise;
      beginInFlight = null;

      // Start timeout cap only after begin completes
      timeoutTimer = setTimeout(() => {
        timeoutTimer = null;
        void emitBatchEnd(true);
      }, BATCH_TIMEOUT_MS);
    }

    resetQuietWindow();
  }

  let unsubscribeFn: () => Promise<void>;
  let parcel: typeof import('@parcel/watcher');
  try {
    parcel = await import('@parcel/watcher');
  } catch (err) {
    throw new Error(
      `@parcel/watcher unavailable for HEAD watching: ${err instanceof Error ? err.message : err}`,
    );
  }

  try {
    const subscription = await parcel.subscribe(gitDir, (err, events) => {
      if (err) {
        console.error('[head-watcher]', err);
        return;
      }

      for (const event of events) {
        const fileName = event.path.split('/').pop() ?? '';
        if (WATCHED_FILES.has(fileName)) {
          void handleGitEvent(fileName);
          break;
        }
      }
    });
    unsubscribeFn = () => subscription.unsubscribe();
  } catch (err) {
    // parcel.subscribe() can fail on rarer scenarios: permission errors,
    // inotify watcher-limit exhaustion, EACCES on the .git directory, etc.
    // Throw to align with the import-failure path above — the caller's
    // catch in standalone.ts pushes 'head-watcher' to degraded so
    // consumers can detect the subsystem is non-functional.
    throw new Error(
      `@parcel/watcher subscribe failed for HEAD watching: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  // Read initial state AFTER subscription is active to avoid missing
  // events that occur between the read and subscribe() completing.
  oldHead = readHeadSha(gitDir);
  lastKnownBranch = readBranchFromHead(gitDir);

  console.log(`[head-watcher] Watching ${gitDir} for HEAD changes`);

  return {
    unsubscribe: async () => {
      if (inBatch) {
        await emitBatchEnd(false);
      }
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      await unsubscribeFn();
    },
    getLastKnownBranch: () => lastKnownBranch,
  };
}
