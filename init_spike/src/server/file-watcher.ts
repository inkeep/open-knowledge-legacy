/**
 * Disk bridge — watches content directory for external .md file changes.
 *
 * External editor saves (VS Code, Cursor, vim) are detected via @parcel/watcher
 * and applied to open Hocuspocus Y.Docs via updateYFragment.
 *
 * Two-layer feedback prevention:
 *   Layer 1 (content hash): writeTracker records hashes of our own persistence writes.
 *     Watcher skips events matching a tracked hash (self-write detection).
 *   Layer 2 (skipStoreHooks): External changes are applied with Hocuspocus v4
 *     LocalTransactionOrigin { skipStoreHooks: true }, preventing persistence
 *     from re-writing the file we just loaded.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';

// Content-hash tracker — populated by persistence layer before disk writes.
// TTL cleanup prevents unbounded growth from missed watcher events.
export const writeTracker = new Map<string, { hash: string; timestamp: number }>();
const WRITE_TRACKER_TTL_MS = 10_000;

export function evictStaleTrackerEntries(): void {
  const now = Date.now();
  for (const [path, entry] of writeTracker) {
    if (now - entry.timestamp > WRITE_TRACKER_TTL_MS) {
      writeTracker.delete(path);
    }
  }
}

/** Compute SHA-256 hex hash of content string. */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Map absolute file path to Hocuspocus document name (e.g., 'test-fixture'). */
export function pathToDocName(absPath: string, contentDir: string): string {
  const rel = relative(contentDir, absPath);
  return rel.replace(/\.md$/, '');
}

/**
 * Start watching a content directory for external .md file changes.
 * Calls onExternalChange for each external write (not our own persistence writes).
 *
 * Returns the @parcel/watcher subscription (call .unsubscribe() to stop).
 */
export async function startWatcher(
  contentDir: string,
  onExternalChange: (docName: string, content: string) => Promise<void>,
): Promise<AsyncSubscription> {
  // Run TTL eviction periodically
  const evictionInterval = setInterval(evictStaleTrackerEntries, WRITE_TRACKER_TTL_MS);

  const subscription = await subscribe(contentDir, async (err, events) => {
    if (err) {
      console.error('[file-watcher]', err);
      return;
    }

    for (const event of events) {
      // Filter to .md files only
      if (!event.path.endsWith('.md')) continue;

      if (event.type === 'delete') {
        console.warn(`[file-watcher] File deleted: ${event.path} — ignoring (doc stays open)`);
        continue;
      }

      try {
        const content = await readFile(event.path, 'utf-8');
        const hash = contentHash(content);

        // Self-write check (Layer 1)
        const tracked = writeTracker.get(event.path);
        if (tracked && tracked.hash === hash) {
          writeTracker.delete(event.path);
          continue; // Our own persistence write — skip
        }

        const docName = pathToDocName(event.path, contentDir);
        await onExternalChange(docName, content);
      } catch (readErr) {
        console.error(`[file-watcher] Failed to read ${event.path}:`, readErr);
      }
    }
  });

  // Wrap unsubscribe to also clear the eviction interval
  const originalUnsubscribe = subscription.unsubscribe.bind(subscription);
  subscription.unsubscribe = async () => {
    clearInterval(evictionInterval);
    return originalUnsubscribe();
  };

  console.log(`[file-watcher] Watching ${contentDir} for external .md changes`);
  return subscription;
}
