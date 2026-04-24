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
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import { isSystemDoc } from './cc1-broadcast.ts';
import type { ContentFilter } from './content-filter.ts';
import {
  type DocExtension,
  forgetDocExtension,
  isSupportedAssetFile,
  isSupportedDocFile,
  registerDocExtension,
  stripDocExtension,
} from './doc-extensions.ts';
import { classifyFsPath, normalizeFsPath } from './fs-traced.ts';
import { getLogger } from './logger.ts';
import { isWithinContentDir } from './persistence.ts';
import { containsConflictMarkers } from './reconciliation.ts';
import { getMeter, withSpan } from './telemetry.ts';

/** Subscription handle compatible with both @parcel/watcher and chokidar backends. */
export interface AsyncSubscription {
  unsubscribe(): Promise<void>;
}

type WatcherBackend = 'parcel' | 'chokidar';

// ─── DiskEvent taxonomy ──────────────────────────────────────────────────────

// Subset of DiskEvent that classifyEvents emits — markdown-only.
export type MarkdownDiskEvent =
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

// SPEC §6 FR-6 / D-H Option A. Asset events carry contentDir-relative
// paths instead of docNames — assets aren't documents in the CRDT layer.
// No content payload (binary) and no rename detection — Finder renames
// surface as delete+create pair, and the basename index is idempotent
// under add/remove so the end state matches. Rename-via-inode-pairing
// was scoped out to keep hot-path binary handling simple (would require
// hashing to correlate delete+create pairs).
export type AssetDiskEvent =
  | { kind: 'asset-create'; path: string; relativePath: string }
  | { kind: 'asset-delete'; path: string; relativePath: string };

export type DiskEvent = MarkdownDiskEvent | AssetDiskEvent;

/**
 * Exhaustiveness guard for DiskEvent dispatch sites. Every consumer that
 * pattern-matches on `event.kind` should terminate with
 * `assertNeverDiskEvent(event)` so a new variant produces a TypeScript
 * error at every consumer until they explicitly handle it. The new
 * variant is discovered at compile time, not by silent drop-on-floor at
 * runtime.
 */
export function assertNeverDiskEvent(event: never): never {
  throw new Error(`[DiskEvent] unhandled variant: ${JSON.stringify(event)}`);
}

// ─── File index ─────────────────────────────────────────────────────────────

export interface FileIndexEntry {
  size: number;
  modified: string;
  canonicalPath: string;
  inode: number;
  aliases: string[];
}

export interface WatcherHandle {
  /** Stop watching (unsubscribe from @parcel/watcher). */
  unsubscribe: () => Promise<void>;
  /** Read the current file index — filtered snapshot of known content files. */
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
  /** Map from alias docName → canonical docName (only symlink entries). */
  getAliasMap: () => ReadonlyMap<string, string>;
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
  return stripDocExtension(rel);
}

/**
 * Extract the supported doc extension from a path, or null if the path does
 * not end in a supported extension. Used when registering a freshly-observed
 * file with `doc-extensions`.
 */
function extractDocExtension(path: string): DocExtension | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mdx')) return '.mdx';
  if (lower.endsWith('.md')) return '.md';
  return null;
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
  aliasMap?: Map<string, string>,
): Promise<MarkdownDiskEvent[]> {
  const deletes: RawFileEvent[] = [];
  const creates: RawFileEvent[] = [];
  const updates: RawFileEvent[] = [];

  for (const event of rawEvents) {
    if (!isSupportedDocFile(event.path)) continue;

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

  function resolveDocName(rawPath: string): string {
    const raw = pathToDocName(rawPath, contentDir);
    if (!aliasMap) return raw;

    // Live lstat + realpath for unknown paths (new symlinks post-startup)
    // or repointed aliases (existing alias whose target changed).
    let lst: ReturnType<typeof lstatSync> | null = null;
    try {
      lst = lstatSync(rawPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`[file-watcher] resolveDocName lstat failed for ${rawPath}:`, e);
      }
      if (aliasMap.has(raw)) {
        aliasMap.delete(raw);
        return raw;
      }
      return raw;
    }

    if (!lst.isSymbolicLink()) {
      // Regular file: if it was previously an alias that got replaced, clear the stale entry
      if (aliasMap.has(raw)) aliasMap.delete(raw);
      return raw;
    }

    // Symlink: resolve canonical, update aliasMap (handles both new and repointed)
    let canonical: string;
    try {
      canonical = realpathSync(rawPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ELOOP') {
        console.warn(`[file-watcher] resolveDocName realpath failed for ${rawPath}:`, e);
      }
      aliasMap.delete(raw);
      return raw;
    }

    if (!isWithinContentDir(canonical, contentDir)) {
      aliasMap.delete(raw);
      return raw;
    }

    const canonicalDocName = pathToDocName(canonical, contentDir);
    if (canonicalDocName === raw) return raw;
    aliasMap.set(raw, canonicalDocName);
    return canonicalDocName;
  }

  const results: MarkdownDiskEvent[] = [];
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
          oldDocName: resolveDocName(del.path),
          newDocName: resolveDocName(create.path),
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
      docName: resolveDocName(del.path),
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
        docName: resolveDocName(create.path),
        content,
      });
    } else {
      results.push({
        kind: 'create',
        path: create.path,
        docName: resolveDocName(create.path),
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
        docName: resolveDocName(update.path),
        content,
      });
    } else {
      results.push({
        kind: 'update',
        path: update.path,
        docName: resolveDocName(update.path),
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
  aliasMap: Map<string, string>,
  visitedInodes?: Set<number>,
): void {
  const visited = visitedInodes ?? new Set<number>();
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      let lst: ReturnType<typeof lstatSync>;
      try {
        lst = lstatSync(fullPath);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.warn(`[file-watcher] Failed to lstat ${fullPath}, skipping:`, e);
        }
        continue;
      }

      if (lst.isSymbolicLink()) {
        let canonical: string;
        try {
          canonical = realpathSync(fullPath);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ENOENT' || code === 'ELOOP') {
            console.warn(`[file-watcher] Broken/cyclic symlink at ${fullPath}, skipping`);
          } else {
            console.warn(`[file-watcher] Failed to resolve symlink ${fullPath}:`, e);
          }
          continue;
        }

        if (!isWithinContentDir(canonical, contentDir)) {
          console.warn(`[file-watcher] Symlink escape: ${fullPath} → ${canonical}, skipping`);
          continue;
        }

        try {
          const canonStat = statSync(canonical);
          if (visited.has(canonStat.ino)) {
            // Inode already visited — register alias if it's a file
            if (canonStat.isFile() && isSupportedDocFile(entry.name)) {
              const aliasDocName = pathToDocName(fullPath, contentDir);
              const canonicalDocName = pathToDocName(canonical, contentDir);
              aliasMap.set(aliasDocName, canonicalDocName);
              const existing = fileIndex.get(canonicalDocName);
              if (existing && !existing.aliases.includes(aliasDocName)) {
                existing.aliases.push(aliasDocName);
              }
            }
            continue;
          }
          visited.add(canonStat.ino);

          if (canonStat.isDirectory()) {
            if (contentFilter) {
              const relPath = relative(contentDir, canonical);
              if (contentFilter.isDirExcluded(relPath)) continue;
            }
            seedLastKnownHashes(canonical, contentDir, contentFilter, fileIndex, aliasMap, visited);
          } else if (canonStat.isFile() && isSupportedDocFile(entry.name)) {
            if (contentFilter) {
              const relPath = relative(contentDir, canonical);
              if (contentFilter.isExcluded(relPath)) continue;
            }
            const aliasDocName = pathToDocName(fullPath, contentDir);
            const canonicalDocName = pathToDocName(canonical, contentDir);
            aliasMap.set(aliasDocName, canonicalDocName);

            try {
              const content = readFileSync(canonical, 'utf-8');
              const hash = contentHash(content);
              lastKnownHash.set(canonical, hash);
              const ext = extractDocExtension(canonical);
              if (ext) {
                const reg = registerDocExtension(canonicalDocName, ext);
                if (reg.shadowed) {
                  console.warn(
                    `[file-watcher] docName "${canonicalDocName}" has both "${reg.effective}" and "${reg.shadowed}" on disk; "${reg.effective}" wins (industry convention). Rename or delete one to disambiguate.`,
                  );
                  if (!reg.changed) continue;
                }
              }
              fileIndex.set(canonicalDocName, {
                size: canonStat.size,
                modified: canonStat.mtime.toISOString(),
                canonicalPath: canonical,
                inode: canonStat.ino,
                aliases: [aliasDocName],
              });
            } catch (err) {
              const code = (err as NodeJS.ErrnoException).code;
              if (code !== 'ENOENT') {
                console.warn(`[file-watcher] Failed to seed hash for ${canonical}:`, err);
              }
            }
          }
        } catch (e) {
          console.warn(`[file-watcher] Failed to stat symlink target ${canonical}:`, e);
        }
      } else if (lst.isDirectory()) {
        if (contentFilter) {
          const relPath = relative(contentDir, fullPath);
          if (contentFilter.isDirExcluded(relPath)) continue;
        }
        seedLastKnownHashes(fullPath, contentDir, contentFilter, fileIndex, aliasMap, visited);
      } else if (lst.isFile() && isSupportedDocFile(entry.name)) {
        if (visited.has(lst.ino)) continue;
        visited.add(lst.ino);

        if (contentFilter) {
          const relPath = relative(contentDir, fullPath);
          if (contentFilter.isExcluded(relPath)) continue;
        }
        try {
          const content = readFileSync(fullPath, 'utf-8');
          lastKnownHash.set(fullPath, contentHash(content));

          const docName = pathToDocName(fullPath, contentDir);
          const ext = extractDocExtension(fullPath);
          if (ext) {
            const reg = registerDocExtension(docName, ext);
            if (reg.shadowed) {
              console.warn(
                `[file-watcher] docName "${docName}" has both "${reg.effective}" and "${reg.shadowed}" on disk; "${reg.effective}" wins (industry convention). Rename or delete one to disambiguate.`,
              );
              // When .md is shadowed by an already-registered .mdx (or vice-versa),
              // skip registering this file in the index — the winning entry remains.
              if (!reg.changed) continue;
            }
          }
          fileIndex.set(docName, {
            size: lst.size,
            modified: lst.mtime.toISOString(),
            canonicalPath: fullPath,
            inode: lst.ino,
            aliases: [],
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
export function updateFileIndex(event: DiskEvent, fileIndex: Map<string, FileIndexEntry>): void {
  // Asset events are tracked by the basename index in standalone.ts, not by
  // the docName-keyed file index — short-circuit here.
  if (event.kind === 'asset-create' || event.kind === 'asset-delete') {
    return;
  }
  const docName = event.kind === 'rename' ? event.newDocName : event.docName;
  if (isSystemDoc(docName)) return;
  switch (event.kind) {
    case 'create':
    case 'update':
    case 'conflict': {
      const docName = event.docName;
      const existing = fileIndex.get(docName);
      const ext = extractDocExtension(event.path);
      if (ext) registerDocExtension(docName, ext);
      fileIndex.set(docName, {
        size: Buffer.byteLength(event.content, 'utf-8'),
        modified: new Date().toISOString(),
        canonicalPath: existing?.canonicalPath ?? event.path,
        inode: existing?.inode ?? 0,
        aliases: existing?.aliases ?? [],
      });
      break;
    }
    case 'delete': {
      if (fileIndex.has(event.docName)) {
        fileIndex.delete(event.docName);
        forgetDocExtension(event.docName);
      } else {
        for (const [, entry] of fileIndex) {
          const idx = entry.aliases.indexOf(event.docName);
          if (idx !== -1) {
            entry.aliases.splice(idx, 1);
            break;
          }
        }
      }
      break;
    }
    case 'rename': {
      const existing = fileIndex.get(event.oldDocName);
      fileIndex.delete(event.oldDocName);
      forgetDocExtension(event.oldDocName);
      const ext = extractDocExtension(event.newPath);
      if (ext) registerDocExtension(event.newDocName, ext);
      fileIndex.set(event.newDocName, {
        size: Buffer.byteLength(event.content, 'utf-8'),
        modified: new Date().toISOString(),
        canonicalPath: existing?.canonicalPath ?? event.newPath,
        inode: existing?.inode ?? 0,
        aliases: existing?.aliases ?? [],
      });
      break;
    }
  }
}

// ─── Shared event handler ───────────────────────────────────────────────────

/**
 * Process a batch of raw file events through the classification + self-write
 * detection pipeline. Shared by both @parcel/watcher and chokidar backends.
 */
async function handleRawEvents(
  rawEvents: Array<{ type: 'create' | 'update' | 'delete'; path: string }>,
  contentDir: string,
  contentFilter: ContentFilter | undefined,
  fileIndex: Map<string, FileIndexEntry>,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  aliasMap?: Map<string, string>,
): Promise<void> {
  const mdEvents = rawEvents.filter((e) => isSupportedDocFile(e.path));
  const assetEvents = rawEvents.filter((e) => isSupportedAssetFile(e.path, ASSET_EXTENSIONS));
  if (mdEvents.length === 0 && assetEvents.length === 0) return;

  // SPEC §6 FR-6: emit asset events independently. Skip content reading
  // (binary), reconciliation, and rename-via-hash detection — basename
  // index is idempotent on add/remove/rename so a Finder rename surfacing
  // as delete+create produces the correct end state.
  for (const raw of assetEvents) {
    if (contentFilter) {
      const relPath = relative(contentDir, raw.path);
      if (contentFilter.isExcluded(relPath)) continue;
    }
    const relativePath = relative(contentDir, raw.path);
    const event: DiskEvent =
      raw.type === 'delete'
        ? { kind: 'asset-delete', path: raw.path, relativePath }
        : { kind: 'asset-create', path: raw.path, relativePath };
    await onDiskEvent(event);
  }

  if (mdEvents.length === 0) return;

  const diskEvents = await classifyEvents(mdEvents, contentDir, contentFilter, aliasMap);

  for (const event of diskEvents) {
    let isSelf = false;

    if (event.kind !== 'delete' && event.kind !== 'rename') {
      const hash = contentHash(event.content);
      let checkPath = event.path;
      try {
        checkPath = realpathSync(event.path);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.warn(
            `[file-watcher] realpathSync failed for self-write check on ${event.path} (${code})`,
          );
        }
      }
      isSelf = isSelfWrite(checkPath, hash);
    } else if (event.kind === 'rename') {
      const hash = contentHash(event.content);
      let checkPath = event.newPath;
      try {
        checkPath = realpathSync(event.newPath);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.warn(
            `[file-watcher] realpathSync failed for self-write check on ${event.newPath} (${code})`,
          );
        }
      }
      isSelf = isSelfWrite(checkPath, hash);
    }

    updateFileIndex(event, fileIndex);

    // Update the content filter's dirCount only for external changes. Self-
    // writes (e.g. `/api/create-page`, agent-write, persistence store) call
    // `contentFilter.incrementMdDir` synchronously at their own write site
    // so sibling assets dropped immediately after can pass the filter's
    // `ASSET_EXTENSIONS + dirCount > 0` rule without racing this async
    // watcher callback. Incrementing here on self-writes would double-count.
    if (contentFilter && !isSelf) {
      switch (event.kind) {
        case 'create':
          contentFilter.incrementMdDir(dirname(event.docName));
          break;
        case 'delete':
          contentFilter.decrementMdDir(dirname(event.docName));
          break;
        case 'rename':
          contentFilter.decrementMdDir(dirname(event.oldDocName));
          contentFilter.incrementMdDir(dirname(event.newDocName));
          break;
      }
    }

    if (isSelf) {
      getLogger('file-watcher').debug(
        {
          kind: event.kind,
          path: event.kind === 'rename' ? event.newPath : event.path,
          self: true,
        },
        `[file-watcher] Skipped self-write: ${event.kind}`,
      );
      _fileWatcherEventsCounter().add(1, { 'disk.kind': event.kind, self: true });
      continue;
    }

    getLogger('file-watcher').debug(
      {
        kind: event.kind,
        path: event.kind === 'rename' ? event.newPath : event.path,
      },
      `[file-watcher] Dispatching: ${event.kind}`,
    );
    _fileWatcherEventsCounter().add(1, { 'disk.kind': event.kind, self: false });
    // Normalize + classify the path to bound span-attribute cardinality
    // (AGENTS.md STOP rule — raw paths blow up the trace index).
    const rawPath = event.kind === 'rename' ? event.newPath : event.path;
    await withSpan(
      'file_watcher.process_event',
      {
        attributes: {
          'disk.kind': event.kind,
          'disk.path': normalizeFsPath(rawPath),
          'disk.path.role': classifyFsPath(rawPath),
        },
      },
      async () => onDiskEvent(event),
    );
  }
}

let _fwEventsCounterCache: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;
function _fileWatcherEventsCounter() {
  if (!_fwEventsCounterCache) {
    _fwEventsCounterCache = getMeter().createCounter('ok.file_watcher.events', {
      description: 'Number of file-watcher events classified by kind',
    });
  }
  return _fwEventsCounterCache;
}

// ─── Backend: @parcel/watcher ───────────────────────────────────────────────

async function startParcelWatcher(
  contentDir: string,
  contentFilter: ContentFilter | undefined,
  fileIndex: Map<string, FileIndexEntry>,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  aliasMap: Map<string, string>,
): Promise<AsyncSubscription | null> {
  let parcel: typeof import('@parcel/watcher');
  try {
    parcel = await import('@parcel/watcher');
  } catch (err) {
    console.warn(
      '[file-watcher] @parcel/watcher import failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  try {
    const subscribeOpts = contentFilter
      ? { ignore: contentFilter.getWatcherIgnoreGlobs() }
      : undefined;

    const subscription = await parcel.subscribe(
      contentDir,
      async (err, events) => {
        if (err) {
          console.error('[file-watcher]', err);
          return;
        }
        try {
          await handleRawEvents(
            events.map((e) => ({ type: e.type, path: e.path })),
            contentDir,
            contentFilter,
            fileIndex,
            onDiskEvent,
            aliasMap,
          );
        } catch (handleErr) {
          console.error('[file-watcher] parcel batch error:', handleErr);
        }
      },
      subscribeOpts,
    );

    return subscription;
  } catch (err) {
    console.warn('[file-watcher] @parcel/watcher subscribe failed, falling back to chokidar:', err);
    return null;
  }
}

// ─── Backend: chokidar ──────────────────────────────────────────────────────

async function startChokidarWatcher(
  contentDir: string,
  contentFilter: ContentFilter | undefined,
  fileIndex: Map<string, FileIndexEntry>,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  aliasMap: Map<string, string>,
): Promise<AsyncSubscription> {
  const { watch } = await import('chokidar');
  console.warn('[file-watcher] @parcel/watcher unavailable, using chokidar fallback');

  const watcher = watch(contentDir, {
    ignoreInitial: true,
    ignored: contentFilter
      ? (filePath: string, stats?: import('node:fs').Stats) => {
          const rel = relative(contentDir, filePath);
          if (rel === '' || rel === '.') return false;
          if (stats?.isDirectory()) return contentFilter.isDirExcluded(rel);
          return contentFilter.isExcluded(rel);
        }
      : undefined,
  });

  watcher.on('error', (err) => console.error('[file-watcher] chokidar error:', err));

  // Batch chokidar events to match @parcel/watcher's coalescing behavior.
  // Without batching, a file rename (mv old.md new.md) produces separate
  // delete + create calls, breaking classifyEvents' rename detection which
  // requires both events in the same batch.
  const BATCH_WINDOW_MS = 50;
  let pendingEvents: Array<{ type: 'create' | 'update' | 'delete'; path: string }> = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  function queueEvent(type: 'create' | 'update' | 'delete', path: string) {
    pendingEvents.push({ type, path });
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        const batch = pendingEvents;
        pendingEvents = [];
        batchTimer = null;
        handleRawEvents(batch, contentDir, contentFilter, fileIndex, onDiskEvent, aliasMap).catch(
          (err) => console.error('[file-watcher] chokidar batch error:', err),
        );
      }, BATCH_WINDOW_MS);
    }
  }

  watcher.on('add', (path) => queueEvent('create', path));
  watcher.on('change', (path) => queueEvent('update', path));
  watcher.on('unlink', (path) => queueEvent('delete', path));

  return {
    unsubscribe: () => {
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
        pendingEvents = [];
      }
      return watcher.close();
    },
  };
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

/**
 * Start watching a content directory for external .md file changes.
 * Calls onDiskEvent for each classified event (not our own persistence writes).
 *
 * Uses @parcel/watcher when available, falls back to chokidar otherwise.
 *
 * When a ContentFilter is provided:
 * - Excluded files are skipped during the initial scan
 * - Excluded events are dropped in classifyEvents
 * - Best-effort ignore globs are passed to @parcel/watcher
 *
 * Returns a WatcherHandle with unsubscribe() and getFileIndex().
 */
export async function startWatcher(
  contentDirRaw: string,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  contentFilter?: ContentFilter,
): Promise<WatcherHandle> {
  let contentDir: string;
  try {
    contentDir = realpathSync(contentDirRaw);
  } catch {
    contentDir = contentDirRaw;
  }

  const fileIndex = new Map<string, FileIndexEntry>();
  const aliasMap = new Map<string, string>();

  seedLastKnownHashes(contentDir, contentDir, contentFilter, fileIndex, aliasMap);

  const evictionInterval = setInterval(evictStaleTrackerEntries, WRITE_TRACKER_TTL_MS);

  let subscription: AsyncSubscription;
  let backend: WatcherBackend;
  try {
    const parcelSub = await startParcelWatcher(
      contentDir,
      contentFilter,
      fileIndex,
      onDiskEvent,
      aliasMap,
    );
    if (parcelSub) {
      subscription = parcelSub;
      backend = 'parcel';
    } else {
      subscription = await startChokidarWatcher(
        contentDir,
        contentFilter,
        fileIndex,
        onDiskEvent,
        aliasMap,
      );
      backend = 'chokidar';
    }
  } catch (e) {
    clearInterval(evictionInterval);
    throw e;
  }

  const originalUnsubscribe = subscription.unsubscribe.bind(subscription);

  console.log(
    `[file-watcher] Watching ${contentDir} for external .md changes (backend: ${backend})`,
  );

  return {
    async unsubscribe() {
      clearInterval(evictionInterval);
      // Clear the module-level writeTracker on unsubscribe so test suites
      // that spin up successive watchers don't accumulate stale entries
      // across instances. Production: unsubscribe = shutdown, no consumers
      // remain. Tests: next startWatcher sees an empty tracker, which is
      // the correct starting state for a fresh isolation boundary.
      writeTracker.clear();
      lastKnownHash.clear();
      return originalUnsubscribe();
    },
    getFileIndex() {
      return fileIndex;
    },
    getAliasMap() {
      return aliasMap;
    },
  };
}
