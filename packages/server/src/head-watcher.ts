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
import { type AsyncSubscription, subscribe } from '@parcel/watcher';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BatchKind = 'within-branch' | 'cross-branch' | 'detached-head';

export interface BatchEndInfo {
  headMoved: boolean;
  oldHead: string | null;
  newHead: string | null;
  timeout: boolean;
  batchKind: BatchKind;
  oldBranch: string | null;
  newBranch: string | null;
}

export interface BatchBeginInfo {
  trigger: string;
}

export type OnBatchBegin = (info: BatchBeginInfo) => void;
export type OnBatchEnd = (info: BatchEndInfo) => void;

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
  let oldHead: string | null = readHeadSha(gitDir);
  let lastKnownBranch: string | null = readBranchFromHead(gitDir);

  async function emitBatchEnd(timeout: boolean): Promise<void> {
    if (!inBatch) return;
    inBatch = false;

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

    // Await callback before updating oldHead to prevent races with concurrent batches
    await onBatchEnd({
      headMoved,
      oldHead,
      newHead,
      timeout,
      batchKind,
      oldBranch,
      newBranch,
    });

    oldHead = newHead;
    lastKnownBranch = newBranch;
  }

  function resetQuietWindow(): void {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      emitBatchEnd(false).catch((e) => console.error('[head-watcher] batch end failed:', e));
    }, QUIET_WINDOW_MS);
  }

  function handleGitEvent(trigger: string): void {
    if (!inBatch) {
      inBatch = true;
      oldHead = readHeadSha(gitDir);
      onBatchBegin({ trigger });

      // Start timeout cap
      timeoutTimer = setTimeout(() => {
        timeoutTimer = null;
        emitBatchEnd(true).catch((e) =>
          console.error('[head-watcher] batch end (timeout) failed:', e),
        );
      }, BATCH_TIMEOUT_MS);
    }

    resetQuietWindow();
  }

  let subscription: AsyncSubscription;
  try {
    subscription = await subscribe(gitDir, (err, events) => {
      if (err) {
        console.error('[head-watcher]', err);
        return;
      }

      for (const event of events) {
        // Extract filename from path (last segment)
        const fileName = event.path.split('/').pop() ?? '';
        if (WATCHED_FILES.has(fileName)) {
          handleGitEvent(fileName);
          break; // One event per batch is enough to trigger
        }
      }
    });
  } catch (e) {
    console.error('[head-watcher] Failed to start watcher on', gitDir, e);
    return { unsubscribe: async () => {}, getLastKnownBranch: () => lastKnownBranch };
  }

  console.log(`[head-watcher] Watching ${gitDir} for HEAD changes`);

  return {
    unsubscribe: async () => {
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      await subscription.unsubscribe();
    },
    getLastKnownBranch: () => lastKnownBranch,
  };
}
