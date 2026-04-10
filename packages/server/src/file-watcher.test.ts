import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  classifyEvents,
  contentHash,
  evictStaleTrackerEntries,
  isSelfWrite,
  lastKnownHash,
  pathToDocName,
  registerWrite,
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
});
