import { beforeEach, describe, expect, test } from 'bun:test';
import { contentHash, evictStaleTrackerEntries, pathToDocName, writeTracker } from './file-watcher';

describe('writeTracker', () => {
  beforeEach(() => {
    writeTracker.clear();
  });

  test('skips self-writes with matching hash', () => {
    const filePath = '/content/test-fixture.md';
    const content = '# Hello\n\nWorld\n';
    const hash = contentHash(content);

    // Persistence records the hash before writing
    writeTracker.set(filePath, { hash, timestamp: Date.now() });

    // Watcher detects the change — same content → same hash → skip
    const tracked = writeTracker.get(filePath);
    expect(tracked).toBeTruthy();
    expect(tracked?.hash).toBe(hash);

    // After skipping, entry is cleaned up
    writeTracker.delete(filePath);
    expect(writeTracker.has(filePath)).toBe(false);
  });

  test('does not skip external writes with different hash', () => {
    const filePath = '/content/test-fixture.md';
    const ourContent = '# Hello\n\nWorld\n';
    const externalContent = '# Hello\n\nExternal edit\n';

    writeTracker.set(filePath, { hash: contentHash(ourContent), timestamp: Date.now() });

    // External write has different content → different hash → not skipped
    const externalHash = contentHash(externalContent);
    const tracked = writeTracker.get(filePath);
    expect(tracked?.hash).not.toBe(externalHash);
  });

  test('does not skip writes when no tracked entry exists', () => {
    const filePath = '/content/new-file.md';
    expect(writeTracker.has(filePath)).toBe(false);
  });
});

describe('TTL eviction', () => {
  beforeEach(() => {
    writeTracker.clear();
  });

  test('evicts entries older than TTL (10s)', () => {
    const filePath = '/content/stale.md';
    writeTracker.set(filePath, {
      hash: 'abc123',
      timestamp: Date.now() - 11_000, // 11 seconds ago
    });

    evictStaleTrackerEntries();
    expect(writeTracker.has(filePath)).toBe(false);
  });

  test('keeps entries within TTL', () => {
    const filePath = '/content/fresh.md';
    writeTracker.set(filePath, {
      hash: 'abc123',
      timestamp: Date.now() - 5_000, // 5 seconds ago
    });

    evictStaleTrackerEntries();
    expect(writeTracker.has(filePath)).toBe(true);
  });

  test('mixed: evicts stale, keeps fresh', () => {
    writeTracker.set('/content/stale.md', {
      hash: 'old',
      timestamp: Date.now() - 15_000,
    });
    writeTracker.set('/content/fresh.md', {
      hash: 'new',
      timestamp: Date.now() - 2_000,
    });

    evictStaleTrackerEntries();
    expect(writeTracker.has('/content/stale.md')).toBe(false);
    expect(writeTracker.has('/content/fresh.md')).toBe(true);
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
