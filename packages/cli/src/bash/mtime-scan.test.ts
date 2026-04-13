import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { diffMtimes, snapshotMtimes } from './mtime-scan.ts';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(resolve(tmpdir(), 'ok-mtime-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('snapshotMtimes', () => {
  test('captures files at the root and subdirs', async () => {
    writeFileSync(resolve(tmp, 'a.md'), 'a');
    mkdirSync(resolve(tmp, 'sub'), { recursive: true });
    writeFileSync(resolve(tmp, 'sub/b.md'), 'b');

    const { snapshot, truncated } = await snapshotMtimes(tmp);
    expect(truncated).toBe(false);
    expect(snapshot.size).toBe(2);
    expect(snapshot.has('a.md')).toBe(true);
    expect(snapshot.has('sub/b.md')).toBe(true);
  });

  test('skips known OK/system dirs', async () => {
    writeFileSync(resolve(tmp, 'keep.md'), 'k');
    mkdirSync(resolve(tmp, '.git'), { recursive: true });
    writeFileSync(resolve(tmp, '.git/HEAD'), 'ref');
    mkdirSync(resolve(tmp, 'node_modules'), { recursive: true });
    writeFileSync(resolve(tmp, 'node_modules/x.js'), 'x');

    const { snapshot } = await snapshotMtimes(tmp);
    expect(snapshot.size).toBe(1);
    expect(snapshot.has('keep.md')).toBe(true);
  });

  test('returns empty snapshot for an empty dir', async () => {
    const { snapshot, truncated } = await snapshotMtimes(tmp);
    expect(truncated).toBe(false);
    expect(snapshot.size).toBe(0);
  });
});

describe('diffMtimes', () => {
  test('empty before + empty after → no changes', () => {
    const result = diffMtimes(new Map(), new Map());
    expect(result.changed).toEqual([]);
  });

  test('identical snapshots → no changes', () => {
    const snap = new Map([
      ['a.md', 1234],
      ['b.md', 5678],
    ]);
    const result = diffMtimes(snap, new Map(snap));
    expect(result.changed).toEqual([]);
  });

  test('mtime change → reported', () => {
    const before = new Map([['a.md', 1000]]);
    const after = new Map([['a.md', 2000]]);
    expect(diffMtimes(before, after).changed).toEqual(['a.md']);
  });

  test('new file → reported', () => {
    const before = new Map([['a.md', 1000]]);
    const after = new Map([
      ['a.md', 1000],
      ['b.md', 2000],
    ]);
    expect(diffMtimes(before, after).changed).toEqual(['b.md']);
  });

  test('deleted file → reported', () => {
    const before = new Map([
      ['a.md', 1000],
      ['b.md', 2000],
    ]);
    const after = new Map([['a.md', 1000]]);
    expect(diffMtimes(before, after).changed).toEqual(['b.md']);
  });

  test('full round-trip: write → snapshot → touch → snapshot → diff', async () => {
    const tmp2 = await mkdtemp(resolve(tmpdir(), 'ok-mtime-rt-'));
    try {
      writeFileSync(resolve(tmp2, 'a.md'), 'v1');
      const before = (await snapshotMtimes(tmp2)).snapshot;
      await new Promise((r) => setTimeout(r, 15)); // ensure mtime differs
      writeFileSync(resolve(tmp2, 'a.md'), 'v2');
      const after = (await snapshotMtimes(tmp2)).snapshot;
      expect(diffMtimes(before, after).changed).toEqual(['a.md']);
    } finally {
      await rm(tmp2, { recursive: true, force: true });
    }
  });
});
