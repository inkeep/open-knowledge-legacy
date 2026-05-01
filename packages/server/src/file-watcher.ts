
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { ASSET_EXTENSIONS } from '@inkeep/open-knowledge-core';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
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

export interface AsyncSubscription {
  unsubscribe(): Promise<void>;
}

type WatcherBackend = 'parcel' | 'chokidar';


type MarkdownDiskEvent =
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

type AssetDiskEvent =
  | { kind: 'asset-create'; path: string; relativePath: string }
  | { kind: 'asset-delete'; path: string; relativePath: string };

export type DiskEvent = MarkdownDiskEvent | AssetDiskEvent;

export function assertNeverDiskEvent(event: never): never {
  throw new Error(`[DiskEvent] unhandled variant: ${JSON.stringify(event)}`);
}


export interface FileIndexEntry {
  size: number;
  modified: string;
  canonicalPath: string;
  inode: number;
  aliases: string[];
}

export interface WatcherHandle {
  unsubscribe: () => Promise<void>;
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
  getAliasMap: () => ReadonlyMap<string, string>;
}


export const writeTracker = new Map<string, Array<{ hash: string; timestamp: number }>>();
const WRITE_TRACKER_TTL_MS = 10_000;

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

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function pathToDocName(absPath: string, contentDir: string): string {
  const rel = relative(contentDir, absPath);
  return stripDocExtension(rel);
}

function extractDocExtension(path: string): DocExtension | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mdx')) return '.mdx';
  if (lower.endsWith('.md')) return '.md';
  return null;
}


export const lastKnownHash = new Map<string, string>();

export function updateLastKnownHash(filePath: string, hash: string): void {
  lastKnownHash.set(filePath, hash);
}

export function removeLastKnownHash(filePath: string): string | undefined {
  const hash = lastKnownHash.get(filePath);
  lastKnownHash.delete(filePath);
  return hash;
}


interface RawFileEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

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

    if (contentFilter) {
      const relPath = relative(contentDir, event.path);
      if (contentFilter.isExcluded(relPath)) continue;
    }

    switch (event.type) {
      case 'delete':
        deletes.push(event);
        break;
      case 'create':
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
      if (aliasMap.has(raw)) aliasMap.delete(raw);
      return raw;
    }

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

  for (const del of deletes) {
    const deletedHash = removeLastKnownHash(del.path);
    if (!deletedHash) continue;

    for (const create of creates) {
      if (pairedCreates.has(create.path)) continue;
      const content = createContents.get(create.path);
      if (content === undefined) continue;
      const hash = contentHash(content);
      if (hash === deletedHash) {
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

  for (const del of deletes) {
    if (pairedDeletes.has(del.path)) continue;
    removeLastKnownHash(del.path);
    results.push({
      kind: 'delete',
      path: del.path,
      docName: resolveDocName(del.path),
    });
  }

  for (const create of creates) {
    if (pairedCreates.has(create.path)) continue;
    const content = createContents.get(create.path);
    if (content === undefined) continue;
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

  for (const update of updates) {
    const content = updateContents.get(update.path);
    if (content === undefined) continue;
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


export function isSelfWrite(filePath: string, hash: string): boolean {
  const queue = writeTracker.get(filePath);
  if (!queue) return false;
  const idx = queue.findIndex((e) => e.hash === hash);
  if (idx < 0) return false;
  queue.splice(idx, 1);
  if (queue.length === 0) writeTracker.delete(filePath);
  return true;
}


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

export function updateFileIndex(event: DiskEvent, fileIndex: Map<string, FileIndexEntry>): void {
  if (event.kind === 'asset-create' || event.kind === 'asset-delete') {
    return;
  }
  const docName = event.kind === 'rename' ? event.newDocName : event.docName;
  if (isSystemDoc(docName) || isConfigDoc(docName)) return;
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


export async function handleRawEvents(
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

  const diskEvents =
    mdEvents.length > 0 ? await classifyEvents(mdEvents, contentDir, contentFilter, aliasMap) : [];

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
