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

export interface BatchEndInfo {
  headMoved: boolean;
  oldHead: string | null;
  newHead: string | null;
  timeout: boolean;
}

export type OnBatchBegin = () => void;
export type OnBatchEnd = (info: BatchEndInfo) => void | Promise<void>;

export interface HeadWatcherHandle {
  unsubscribe: () => Promise<void>;
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
    return { unsubscribe: async () => {} };
  }
  const gitDir: string = resolvedGitDir;

  let inBatch = false;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let oldHead: string | null = readHeadSha(gitDir);

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

    // Await callback before updating oldHead to prevent races with concurrent batches
    await onBatchEnd({
      headMoved,
      oldHead,
      newHead,
      timeout,
    });

    oldHead = newHead;
  }

  function resetQuietWindow(): void {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      quietTimer = null;
      emitBatchEnd(false).catch((e) => console.error('[head-watcher] batch end failed:', e));
    }, QUIET_WINDOW_MS);
  }

  function handleGitEvent(): void {
    if (!inBatch) {
      inBatch = true;
      // oldHead already holds the correct pre-batch value (initialized at
      // watcher start, updated after each batch ends). Re-reading here would
      // capture the post-change value because @parcel/watcher fires after
      // .git/HEAD has already been written.
      onBatchBegin();

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
          handleGitEvent();
          break; // One event per batch is enough to trigger
        }
      }
    });
  } catch (e) {
    console.error('[head-watcher] Failed to start watcher on', gitDir, e);
    return { unsubscribe: async () => {} };
  }

  console.log(`[head-watcher] Watching ${gitDir} for HEAD changes`);

  return {
    unsubscribe: async () => {
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      await subscription.unsubscribe();
    },
  };
}
