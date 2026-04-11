/**
 * Disk bridge — watches content directory for external .md file changes.
 *
 * External editor saves (VS Code, Cursor, vim) are detected via @parcel/watcher
 * and emitted as typed DiskEvent unions. Self-write detection prevents
 * feedback loops.
 *
 * Two-layer feedback prevention:
 *   Layer 1 (content hash): writeTracker records hashes of our own persistence writes.
 *     Watcher skips events matching a tracked hash (self-write detection).
 *   Layer 2 (skipStoreHooks): External changes are applied with Hocuspocus v4
 *     LocalTransactionOrigin { skipStoreHooks: true }, preventing persistence
 *     from re-writing the file we just loaded.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
import type { ContentFilter } from './content-filter.ts';
import { containsConflictMarkers } from './reconciliation.ts';

export type { AsyncSubscription };

// ─── DiskEvent taxonomy ──────────────────────────────────────────────────────

export type DiskEvent =
  | { kind: 'create'; path: string; docName: string; content: string }
  | { kind: 'update'; path: string; docName: string; content: string }
  | { kind: 'delete'; path: string; docName: string }
  | {
      kind: 'rename';
      oldPath: string;
      newPath: string;
      oldDocName: string;
      newDocName: string;
      content: string;
    }
  | { kind: 'conflict'; path: string; docName: string; content: string };

// ─── File index ─────────────────────────────────────────────────────────────

export interface FileIndexEntry {
  size: number;
  modified: string;
}

export interface WatcherHandle {
  /** Stop watching (unsubscribe from @parcel/watcher). */
  unsubscribe: () => Promise<void>;
  /** Read the current file index — filtered snapshot of known content files. */
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
}

// ─── Write tracker ───────────────────────────────────────────────────────────

// Content-hash tracker — persistence layer registers writes via registerWrite().
// Watcher checks this to skip self-writes. TTL cleanup prevents unbounded growth.
// Stores a QUEUE of hashes per path so rapid sequential writes (e.g., XmlFragment
// change followed by Observer A's Y.Text change) don't race: each filesystem event
// consumes only its matching entry, leaving others intact for subsequent events.
// Exported for test access; production code should use registerWrite().
export const writeTracker = new Map<string, Array<{ hash: string; timestamp: number }>>();
const WRITE_TRACKER_TTL_MS = 10_000;

/** Register an upcoming persistence write so the watcher skips the resulting FSEvent. */
export function registerWrite(filePath: string, hash: string): void {
  const queue = writeTracker.get(filePath) ?? [];
  queue.push({ hash, timestamp: Date.now() });
  writeTracker.set(filePath, queue);
}

export function evictStaleTrackerEntries(): void {
  const now = Date.now();
  for (const [path, queue] of writeTracker) {
    const fresh = queue.filter((e) => now - e.timestamp <= WRITE_TRACKER_TTL_MS);
    if (fresh.length === 0) {
      writeTracker.delete(path);
    } else if (fresh.length !== queue.length) {
      writeTracker.set(path, fresh);
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

// ─── Last known hash map — for rename detection ─────────────────────────────

/**
 * Tracks the last known content hash for each watched .md file path.
 * Used to detect renames: when a delete+create pair in the same batch
 * has matching content hashes, it's emitted as a single Rename event.
 */
export const lastKnownHash = new Map<string, string>();

/** Update last known hash after reading a file. */
export function updateLastKnownHash(filePath: string, hash: string): void {
  lastKnownHash.set(filePath, hash);
}

/** Remove last known hash (on delete). Returns the removed hash if any. */
export function removeLastKnownHash(filePath: string): string | undefined {
  const hash = lastKnownHash.get(filePath);
  lastKnownHash.delete(filePath);
  return hash;
}

// ─── Batch classification ────────────────────────────────────────────────────

interface RawFileEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

/**
 * Classify a batch of raw parcel events into typed DiskEvents.
 *
 * Rename detection: if a delete+create pair in the same batch has matching
 * content hashes, emit a single Rename event instead of Delete + Create.
 *
 * When a ContentFilter is provided, events for excluded paths are silently dropped.
 */
export async function classifyEvents(
  rawEvents: RawFileEvent[],
  contentDir: string,
  contentFilter?: ContentFilter,
): Promise<DiskEvent[]> {
  const deletes: RawFileEvent[] = [];
  const creates: RawFileEvent[] = [];
  const updates: RawFileEvent[] = [];

  for (const event of rawEvents) {
    if (!event.path.endsWith('.md')) continue;

    // Apply content filter if provided
    if (contentFilter) {
      const relPath = relative(contentDir, event.path);
      if (contentFilter.isExcluded(relPath)) continue;
    }

    switch (event.type) {
      case 'delete':
        deletes.push(event);
        break;
      case 'create':
        // Editors like VS Code do atomic saves (write tmp → rename over original).
        // @parcel/watcher reports this as 'create' even though the file existed.
        // If we already have a hash for this path, it's an update, not a create.
        if (lastKnownHash.has(event.path)) {
          updates.push(event);
        } else {
          creates.push(event);
        }
        break;
      case 'update':
        updates.push(event);
        break;
    }
  }

  // Read content for creates and updates
  const createContents = new Map<string, string>();
  const updateContents = new Map<string, string>();
  for (const event of creates) {
    try {
      createContents.set(event.path, await readFile(event.path, 'utf-8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[file-watcher] Failed to read ${event.path}:`, e);
      }
    }
  }
  for (const event of updates) {
    try {
      updateContents.set(event.path, await readFile(event.path, 'utf-8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[file-watcher] Failed to read ${event.path}:`, e);
      }
    }
  }

  const results: DiskEvent[] = [];
  const pairedCreates = new Set<string>();
  const pairedDeletes = new Set<string>();

  // Rename detection: match deletes to creates by content hash
  for (const del of deletes) {
    const deletedHash = removeLastKnownHash(del.path);
    if (!deletedHash) continue;

    // Look for a create in the same batch with matching hash
    for (const create of creates) {
      if (pairedCreates.has(create.path)) continue;
      const content = createContents.get(create.path);
      if (!content) continue;
      const hash = contentHash(content);
      if (hash === deletedHash) {
        // Rename detected
        pairedCreates.add(create.path);
        pairedDeletes.add(del.path);
        updateLastKnownHash(create.path, hash);
        results.push({
          kind: 'rename',
          oldPath: del.path,
          newPath: create.path,
          oldDocName: pathToDocName(del.path, contentDir),
          newDocName: pathToDocName(create.path, contentDir),
          content,
        });
        break;
      }
    }
  }

  // Emit remaining deletes (not paired as renames)
  for (const del of deletes) {
    if (pairedDeletes.has(del.path)) continue;
    removeLastKnownHash(del.path);
    results.push({
      kind: 'delete',
      path: del.path,
      docName: pathToDocName(del.path, contentDir),
    });
  }

  // Emit remaining creates (not paired as renames)
  for (const create of creates) {
    if (pairedCreates.has(create.path)) continue;
    const content = createContents.get(create.path);
    if (!content) continue;
    const hash = contentHash(content);
    updateLastKnownHash(create.path, hash);

    if (containsConflictMarkers(content)) {
      results.push({
        kind: 'conflict',
        path: create.path,
        docName: pathToDocName(create.path, contentDir),
        content,
      });
    } else {
      results.push({
        kind: 'create',
        path: create.path,
        docName: pathToDocName(create.path, contentDir),
        content,
      });
    }
  }

  // Emit updates
  for (const update of updates) {
    const content = updateContents.get(update.path);
    if (!content) continue;
    const hash = contentHash(content);
    updateLastKnownHash(update.path, hash);

    if (containsConflictMarkers(content)) {
      results.push({
        kind: 'conflict',
        path: update.path,
        docName: pathToDocName(update.path, contentDir),
        content,
      });
    } else {
      results.push({
        kind: 'update',
        path: update.path,
        docName: pathToDocName(update.path, contentDir),
        content,
      });
    }
  }

  return results;
}

// ─── Self-write check ────────────────────────────────────────────────────────

/**
 * Check if an event is a self-write (our own persistence write).
 * If so, consume the tracker entry and return true.
 */
export function isSelfWrite(filePath: string, hash: string): boolean {
  const queue = writeTracker.get(filePath);
  if (!queue) return false;
  const idx = queue.findIndex((e) => e.hash === hash);
  if (idx < 0) return false;
  queue.splice(idx, 1);
  if (queue.length === 0) writeTracker.delete(filePath);
  return true;
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

/**
 * Seed lastKnownHash with existing .md files so first edits classify as 'update'
 * not 'create'. Also populates the in-memory file index.
 *
 * When a ContentFilter is provided, excluded files are skipped.
 */
function seedLastKnownHashes(
  dir: string,
  contentDir: string,
  contentFilter: ContentFilter | undefined,
  fileIndex: Map<string, FileIndexEntry>,
): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip directories the content filter excludes (gitignore/config only, not include patterns)
        if (contentFilter) {
          const relPath = relative(contentDir, fullPath);
          if (contentFilter.isDirExcluded(relPath)) continue;
        }
        seedLastKnownHashes(fullPath, contentDir, contentFilter, fileIndex);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip files the content filter excludes
        if (contentFilter) {
          const relPath = relative(contentDir, fullPath);
          if (contentFilter.isExcluded(relPath)) continue;
        }
        try {
          const content = readFileSync(fullPath, 'utf-8');
          lastKnownHash.set(fullPath, contentHash(content));

          // Populate file index
          const docName = pathToDocName(fullPath, contentDir);
          const stat = statSync(fullPath);
          fileIndex.set(docName, {
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EACCES') {
            console.warn(
              `[file-watcher] Permission denied reading ${fullPath}, file excluded from index`,
            );
          } else if (code !== 'ENOENT') {
            console.warn(`[file-watcher] Failed to seed hash for ${fullPath}:`, err);
          }
        }
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`[file-watcher] Failed to read directory ${dir}:`, err);
    }
  }
}

/**
 * Update the file index after a disk event.
 * Called unconditionally for every classified event (including self-writes)
 * to keep the index in sync with actual disk state.
 */
export function updateFileIndex(
  event: DiskEvent,
  contentDir: string,
  fileIndex: Map<string, FileIndexEntry>,
): void {
  switch (event.kind) {
    case 'create':
    case 'update':
    case 'conflict': {
      const docName = pathToDocName(event.path, contentDir);
      fileIndex.set(docName, {
        size: Buffer.byteLength(event.content, 'utf-8'),
        modified: new Date().toISOString(),
      });
      break;
    }
    case 'delete': {
      const docName = pathToDocName(event.path, contentDir);
      fileIndex.delete(docName);
      break;
    }
    case 'rename': {
      const oldDocName = pathToDocName(event.oldPath, contentDir);
      const newDocName = pathToDocName(event.newPath, contentDir);
      fileIndex.delete(oldDocName);
      fileIndex.set(newDocName, {
        size: Buffer.byteLength(event.content, 'utf-8'),
        modified: new Date().toISOString(),
      });
      break;
    }
  }
}

/**
 * Start watching a content directory for external .md file changes.
 * Calls onDiskEvent for each classified event (not our own persistence writes).
 *
 * When a ContentFilter is provided:
 * - Excluded files are skipped during the initial scan
 * - Excluded events are dropped in classifyEvents
 * - Best-effort ignore globs are passed to @parcel/watcher
 *
 * Returns a WatcherHandle with unsubscribe() and getFileIndex().
 */
export async function startWatcher(
  contentDir: string,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  contentFilter?: ContentFilter,
): Promise<WatcherHandle> {
  // Allocate file index per watcher instance — each handle owns its index
  const fileIndex = new Map<string, FileIndexEntry>();

  // Seed hashes and populate file index (filtered if contentFilter provided)
  seedLastKnownHashes(contentDir, contentDir, contentFilter, fileIndex);

  // Run TTL eviction periodically
  const evictionInterval = setInterval(evictStaleTrackerEntries, WRITE_TRACKER_TTL_MS);

  // Build subscribe options — pass watcher ignore globs as best-effort optimization
  const subscribeOpts = contentFilter
    ? { ignore: contentFilter.getWatcherIgnoreGlobs() }
    : undefined;

  let subscription: AsyncSubscription;
  try {
    subscription = await subscribe(
      contentDir,
      async (err, events) => {
        if (err) {
          console.error('[file-watcher]', err);
          return;
        }

        // Filter to .md and classify (content filter applied inside classifyEvents)
        const mdEvents = events.filter((e) => e.path.endsWith('.md'));
        if (mdEvents.length === 0) return;

        const diskEvents = await classifyEvents(
          mdEvents.map((e) => ({ type: e.type, path: e.path })),
          contentDir,
          contentFilter,
        );

        for (const event of diskEvents) {
          let isSelf = false;

          // Self-write check for events that carry content
          if (event.kind !== 'delete' && event.kind !== 'rename') {
            const hash = contentHash(event.content);
            isSelf = isSelfWrite(event.path, hash);
          } else if (event.kind === 'rename') {
            const hash = contentHash(event.content);
            isSelf = isSelfWrite(event.newPath, hash);
          }

          // Always keep index in sync — self-writes still represent real disk state
          updateFileIndex(event, contentDir, fileIndex);

          if (isSelf) {
            console.log(
              `[file-watcher] Skipped self-write: ${event.kind} ${event.kind === 'rename' ? event.newPath : event.path}`,
            );
            continue;
          }

          console.log(
            `[file-watcher] Dispatching: ${event.kind} ${event.kind === 'rename' ? event.newPath : event.path}`,
          );
          await onDiskEvent(event);
        }
      },
      subscribeOpts,
    );
  } catch (e) {
    clearInterval(evictionInterval);
    throw e;
  }

  // Wrap unsubscribe to also clear the eviction interval
  const originalUnsubscribe = subscription.unsubscribe.bind(subscription);

  console.log(`[file-watcher] Watching ${contentDir} for external .md changes`);

  return {
    async unsubscribe() {
      clearInterval(evictionInterval);
      return originalUnsubscribe();
    },
    getFileIndex() {
      return fileIndex;
    },
  };
}
