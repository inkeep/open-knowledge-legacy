import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createContentFilter } from './content-filter.ts';
import {
  classifyEvents,
  contentHash,
  evictStaleTrackerEntries,
  isSelfWrite,
  lastKnownHash,
  pathToDocName,
  registerWrite,
  startWatcher,
  updateLastKnownHash,
  writeTracker,
} from './file-watcher';

describe('writeTracker', () => {
  beforeEach(() => {
    writeTracker.clear();
  });

  test('skips self-writes with matching hash', () => {
    const filePath = '/content/test-fixture.md';
    const content = '# Hello\n\nWorld\n';
    const hash = contentHash(content);

    registerWrite(filePath, hash);

    // Watcher detects the change — same content → same hash → skip
    const queue = writeTracker.get(filePath);
    expect(queue).toBeTruthy();
    expect(queue?.some((e) => e.hash === hash)).toBe(true);
  });

  test('does not skip external writes with different hash', () => {
    const filePath = '/content/test-fixture.md';
    const ourContent = '# Hello\n\nWorld\n';
    const externalContent = '# Hello\n\nExternal edit\n';

    registerWrite(filePath, contentHash(ourContent));

    const externalHash = contentHash(externalContent);
    const queue = writeTracker.get(filePath);
    expect(queue?.some((e) => e.hash === externalHash)).toBe(false);
  });

  test('does not skip writes when no tracked entry exists', () => {
    const filePath = '/content/new-file.md';
    expect(writeTracker.has(filePath)).toBe(false);
  });

  test('queue handles multiple rapid writes — each event consumes only its own entry', () => {
    const filePath = '/content/test-fixture.md';
    const hash1 = contentHash('write 1');
    const hash2 = contentHash('write 2');

    registerWrite(filePath, hash1);
    registerWrite(filePath, hash2);

    const queue = writeTracker.get(filePath);
    expect(queue).toHaveLength(2);

    // First event matches hash1 — remove it, hash2 should remain
    const idx1 = queue?.findIndex((e) => e.hash === hash1) ?? -1;
    expect(idx1).toBeGreaterThanOrEqual(0);
    queue?.splice(idx1, 1);
    expect(queue).toHaveLength(1);
    expect(queue?.[0].hash).toBe(hash2);
  });
});

describe('TTL eviction', () => {
  beforeEach(() => {
    writeTracker.clear();
  });

  test('evicts entries older than TTL (10s)', () => {
    const filePath = '/content/stale.md';
    writeTracker.set(filePath, [{ hash: 'abc123', timestamp: Date.now() - 11_000 }]);

    evictStaleTrackerEntries();
    expect(writeTracker.has(filePath)).toBe(false);
  });

  test('keeps entries within TTL', () => {
    const filePath = '/content/fresh.md';
    writeTracker.set(filePath, [{ hash: 'abc123', timestamp: Date.now() - 5_000 }]);

    evictStaleTrackerEntries();
    expect(writeTracker.has(filePath)).toBe(true);
  });

  test('mixed: evicts stale, keeps fresh', () => {
    writeTracker.set('/content/stale.md', [{ hash: 'old', timestamp: Date.now() - 15_000 }]);
    writeTracker.set('/content/fresh.md', [{ hash: 'new', timestamp: Date.now() - 2_000 }]);

    evictStaleTrackerEntries();
    expect(writeTracker.has('/content/stale.md')).toBe(false);
    expect(writeTracker.has('/content/fresh.md')).toBe(true);
  });

  test('evicts stale entries within a queue while keeping fresh ones', () => {
    writeTracker.set('/content/mixed.md', [
      { hash: 'old', timestamp: Date.now() - 15_000 },
      { hash: 'new', timestamp: Date.now() - 2_000 },
    ]);

    evictStaleTrackerEntries();
    const queue = writeTracker.get('/content/mixed.md');
    expect(queue).toHaveLength(1);
    expect(queue?.[0].hash).toBe('new');
  });
});

describe('pathToDocName', () => {
  test('maps absolute path to document name', () => {
    expect(pathToDocName('/app/content/test-fixture.md', '/app/content')).toBe('test-fixture');
  });

  test('handles nested paths', () => {
    expect(pathToDocName('/app/content/docs/guide.md', '/app/content')).toBe('docs/guide');
  });
});

describe('contentHash', () => {
  test('produces consistent SHA-256 hex digest', () => {
    const hash1 = contentHash('hello');
    const hash2 = contentHash('hello');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test('different content produces different hashes', () => {
    expect(contentHash('hello')).not.toBe(contentHash('world'));
  });
});

describe('isSelfWrite', () => {
  beforeEach(() => {
    writeTracker.clear();
  });

  test('returns true and consumes entry for matching hash', () => {
    const path = '/content/test.md';
    const hash = contentHash('hello');
    registerWrite(path, hash);

    expect(isSelfWrite(path, hash)).toBe(true);
    expect(writeTracker.has(path)).toBe(false);
  });

  test('returns false for non-matching hash', () => {
    const path = '/content/test.md';
    registerWrite(path, contentHash('hello'));

    expect(isSelfWrite(path, contentHash('world'))).toBe(false);
    expect(writeTracker.has(path)).toBe(true);
  });
});

// ─── classifyEvents ──────────────────────────────────────────────────────────

describe('classifyEvents', () => {
  let tmpDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-watcher-test-'));
    contentDir = resolve(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    lastKnownHash.clear();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('emits update event for modified file', async () => {
    const filePath = resolve(contentDir, 'doc.md');
    writeFileSync(filePath, '# Updated\n');

    const events = await classifyEvents([{ type: 'update', path: filePath }], contentDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('update');
    if (events[0].kind === 'update') {
      expect(events[0].docName).toBe('doc');
      expect(events[0].content).toBe('# Updated\n');
    }
  });

  test('emits create event for new file', async () => {
    const filePath = resolve(contentDir, 'new.md');
    writeFileSync(filePath, '# New\n');

    const events = await classifyEvents([{ type: 'create', path: filePath }], contentDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('create');
  });

  test('emits delete event for removed file', async () => {
    const filePath = resolve(contentDir, 'gone.md');

    const events = await classifyEvents([{ type: 'delete', path: filePath }], contentDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('delete');
    if (events[0].kind === 'delete') {
      expect(events[0].docName).toBe('gone');
    }
  });

  test('emits rename for delete+create with matching content hash', async () => {
    const oldPath = resolve(contentDir, 'old-name.md');
    const newPath = resolve(contentDir, 'new-name.md');
    const content = '# Same Content\n';

    // Pre-seed the last known hash for the old path
    updateLastKnownHash(oldPath, contentHash(content));

    // Write the new file
    writeFileSync(newPath, content);

    const events = await classifyEvents(
      [
        { type: 'delete', path: oldPath },
        { type: 'create', path: newPath },
      ],
      contentDir,
    );

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('rename');
    if (events[0].kind === 'rename') {
      expect(events[0].oldDocName).toBe('old-name');
      expect(events[0].newDocName).toBe('new-name');
      expect(events[0].content).toBe(content);
    }
  });

  test('emits separate delete+create when content hashes differ', async () => {
    const oldPath = resolve(contentDir, 'old.md');
    const newPath = resolve(contentDir, 'new.md');

    // Pre-seed with different content
    updateLastKnownHash(oldPath, contentHash('old content'));
    writeFileSync(newPath, 'different content');

    const events = await classifyEvents(
      [
        { type: 'delete', path: oldPath },
        { type: 'create', path: newPath },
      ],
      contentDir,
    );

    expect(events).toHaveLength(2);
    expect(events.some((e) => e.kind === 'delete')).toBe(true);
    expect(events.some((e) => e.kind === 'create')).toBe(true);
  });

  test('emits conflict event when file contains conflict markers', async () => {
    const filePath = resolve(contentDir, 'conflicted.md');
    writeFileSync(filePath, '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n');

    const events = await classifyEvents([{ type: 'update', path: filePath }], contentDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('conflict');
  });

  test('emits conflict event for create with conflict markers', async () => {
    const filePath = resolve(contentDir, 'new-conflicted.md');
    writeFileSync(filePath, '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n');

    const events = await classifyEvents([{ type: 'create', path: filePath }], contentDir);

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('conflict');
  });

  test('ignores non-.md files', async () => {
    const filePath = resolve(contentDir, 'readme.txt');
    writeFileSync(filePath, 'hello');

    const events = await classifyEvents([{ type: 'update', path: filePath }], contentDir);

    expect(events).toHaveLength(0);
  });

  test('filters events through ContentFilter when provided', async () => {
    // Create a filter that excludes dist/
    writeFileSync(resolve(tmpDir, '.gitignore'), 'dist/\n');
    const filter = createContentFilter({
      projectDir: tmpDir,
      contentDir,
      includePatterns: ['**/*.md'],
      excludePatterns: [],
    });

    // Create files in both included and excluded dirs
    mkdirSync(resolve(contentDir, 'dist'), { recursive: true });
    mkdirSync(resolve(contentDir, 'docs'), { recursive: true });
    writeFileSync(resolve(contentDir, 'dist', 'output.md'), '# Build Output\n');
    writeFileSync(resolve(contentDir, 'docs', 'guide.md'), '# Guide\n');

    const events = await classifyEvents(
      [
        { type: 'create', path: resolve(contentDir, 'dist', 'output.md') },
        { type: 'create', path: resolve(contentDir, 'docs', 'guide.md') },
      ],
      contentDir,
      filter,
    );

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('create');
    if (events[0].kind === 'create') {
      expect(events[0].docName).toBe('docs/guide');
    }
  });
});

// ─── startWatcher file index ────────────────────────────────────────────────

describe('startWatcher file index', () => {
  let tmpDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-watcher-index-'));
    contentDir = resolve(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    lastKnownHash.clear();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('initial scan populates file index with .md files', async () => {
    writeFileSync(resolve(contentDir, 'readme.md'), '# README\n');
    mkdirSync(resolve(contentDir, 'docs'));
    writeFileSync(resolve(contentDir, 'docs', 'guide.md'), '# Guide\n');
    writeFileSync(resolve(contentDir, 'script.js'), 'console.log("hi")');

    const handle = await startWatcher(contentDir, async () => {});
    try {
      const index = handle.getFileIndex();
      expect(index.size).toBe(2);
      expect(index.has('readme')).toBe(true);
      expect(index.has('docs/guide')).toBe(true);
      // Non-.md files are not in the index
      expect(index.has('script')).toBe(false);

      // Entries have size and modified
      const entry = index.get('readme');
      expect(entry).toBeTruthy();
      expect(entry?.size).toBeGreaterThan(0);
      expect(entry?.modified).toBeTruthy();
    } finally {
      await handle.unsubscribe();
    }
  });

  test('file index excludes files filtered by ContentFilter', async () => {
    writeFileSync(resolve(tmpDir, '.gitignore'), 'dist/\n');
    mkdirSync(resolve(contentDir, 'dist'), { recursive: true });
    mkdirSync(resolve(contentDir, 'docs'), { recursive: true });
    writeFileSync(resolve(contentDir, 'dist', 'output.md'), '# Build\n');
    writeFileSync(resolve(contentDir, 'docs', 'guide.md'), '# Guide\n');

    const filter = createContentFilter({
      projectDir: tmpDir,
      contentDir,
      includePatterns: ['**/*.md'],
      excludePatterns: [],
    });

    const handle = await startWatcher(contentDir, async () => {}, filter);
    try {
      const index = handle.getFileIndex();
      expect(index.size).toBe(1);
      expect(index.has('docs/guide')).toBe(true);
      expect(index.has('dist/output')).toBe(false);
    } finally {
      await handle.unsubscribe();
    }
  });

  test('file index excludes files matching config exclude patterns', async () => {
    mkdirSync(resolve(contentDir, 'archive'), { recursive: true });
    writeFileSync(resolve(contentDir, 'readme.md'), '# README\n');
    writeFileSync(resolve(contentDir, 'archive', 'old.md'), '# Old\n');

    const filter = createContentFilter({
      projectDir: tmpDir,
      contentDir,
      includePatterns: ['**/*.md'],
      excludePatterns: ['archive/**'],
    });

    const handle = await startWatcher(contentDir, async () => {}, filter);
    try {
      const index = handle.getFileIndex();
      expect(index.size).toBe(1);
      expect(index.has('readme')).toBe(true);
      expect(index.has('archive/old')).toBe(false);
    } finally {
      await handle.unsubscribe();
    }
  });

  test('file index updates on create event', () => {
    const { updateFileIndex, pathToDocName } = require('./file-watcher.ts');
    const index = new Map();
    const event = {
      kind: 'create' as const,
      path: resolve(contentDir, 'new-file.md'),
      docName: 'new-file',
      content: '# New File\n',
    };
    updateFileIndex(event, contentDir, index);
    expect(index.has('new-file')).toBe(true);
    expect(index.get('new-file')?.size).toBe(Buffer.byteLength('# New File\n', 'utf-8'));
    expect(index.get('new-file')?.modified).toBeTruthy();
  });

  test('file index removes entry on delete event', () => {
    const { updateFileIndex } = require('./file-watcher.ts');
    const index = new Map([['existing', { size: 10, modified: new Date().toISOString() }]]);
    const event = {
      kind: 'delete' as const,
      path: resolve(contentDir, 'existing.md'),
      docName: 'existing',
    };
    updateFileIndex(event, contentDir, index);
    expect(index.has('existing')).toBe(false);
  });

  test('file index updates size/modified on update event', () => {
    const { updateFileIndex } = require('./file-watcher.ts');
    const oldModified = '2020-01-01T00:00:00.000Z';
    const index = new Map([['doc', { size: 5, modified: oldModified }]]);
    const event = {
      kind: 'update' as const,
      path: resolve(contentDir, 'doc.md'),
      docName: 'doc',
      content: '# Updated content with more text\n',
    };
    updateFileIndex(event, contentDir, index);
    expect(index.get('doc')?.size).toBe(
      Buffer.byteLength('# Updated content with more text\n', 'utf-8'),
    );
    expect(index.get('doc')?.modified).not.toBe(oldModified);
  });

  test('file index handles rename event', () => {
    const { updateFileIndex } = require('./file-watcher.ts');
    const index = new Map([['old-name', { size: 10, modified: new Date().toISOString() }]]);
    const event = {
      kind: 'rename' as const,
      oldPath: resolve(contentDir, 'old-name.md'),
      newPath: resolve(contentDir, 'new-name.md'),
      oldDocName: 'old-name',
      newDocName: 'new-name',
      content: '# Renamed\n',
    };
    updateFileIndex(event, contentDir, index);
    expect(index.has('old-name')).toBe(false);
    expect(index.has('new-name')).toBe(true);
    expect(index.get('new-name')?.size).toBe(Buffer.byteLength('# Renamed\n', 'utf-8'));
  });

  test('getFileIndex returns empty map when no .md files exist', async () => {
    const handle = await startWatcher(contentDir, async () => {});
    try {
      expect(handle.getFileIndex().size).toBe(0);
    } finally {
      await handle.unsubscribe();
    }
  });
});
