import { beforeEach, describe, expect, test } from 'bun:test';
import {
  contentHash,
  evictStaleTrackerEntries,
  pathToDocName,
  registerWrite,
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
