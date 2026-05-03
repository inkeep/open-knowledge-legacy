import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBasenameIndex } from '@inkeep/open-knowledge-core';
import { seedBasenameIndex } from './asset-walk.ts';
import { createContentFilter } from './content-filter.ts';

let baseDir: string;
let contentDir: string;

function write(rel: string, body = 'bytes'): void {
  const full = join(contentDir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, body, 'utf-8');
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'asset-walk-'));
  contentDir = join(baseDir, 'vault');
  mkdirSync(contentDir, { recursive: true });
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('seedBasenameIndex — initial walk (no filter)', () => {
  test('admits asset extensions; ignores markdown and unknown', () => {
    write('docs/meeting.md');
    write('docs/photo.png');
    write('docs/diagram.svg');
    write('docs/arbitrary.xyz');
    write('archive/old.png');

    const idx = createBasenameIndex();
    seedBasenameIndex({ contentDir, basenameIndex: idx });

    expect(idx.resolveEmbed('photo.png', 'docs/meeting.md')).toBe('docs/photo.png');
    expect(idx.resolveEmbed('diagram.svg', 'docs/meeting.md')).toBe('docs/diagram.svg');
    expect(idx.resolveEmbed('old.png', 'archive/anything.md')).toBe('archive/old.png');
    expect(idx.resolveEmbed('meeting.md', 'docs/meeting.md')).toBeNull();
    expect(idx.resolveEmbed('arbitrary.xyz', 'docs/meeting.md')).toBeNull();
  });

  test('empty contentDir produces empty index without throwing', () => {
    const idx = createBasenameIndex();
    seedBasenameIndex({ contentDir, basenameIndex: idx });
    expect(idx.size()).toBe(0);
  });
});

describe('seedBasenameIndex — initial walk (with ContentFilter sibling-asset admission)', () => {
  test('admits assets only in markdown-neighbored directories', () => {
    write('docs/meeting.md');
    write('docs/photo.png');
    write('no-md-here/orphan.png'); // no sibling .md → excluded

    const idx = createBasenameIndex();
    const contentFilter = createContentFilter({
      projectDir: baseDir,
      contentDir,
    });
    contentFilter.incrementMdDir('docs');
    seedBasenameIndex({ contentDir, contentFilter, basenameIndex: idx });

    expect(idx.resolveEmbed('photo.png', 'docs/meeting.md')).toBe('docs/photo.png');
    expect(idx.resolveEmbed('orphan.png', 'docs/meeting.md')).toBeNull();
  });

  test('respects .okignore exclusion patterns', () => {
    write('docs/meeting.md');
    write('docs/photo.png');
    write('secret/hidden.png');
    writeFileSync(join(contentDir, '.okignore'), 'secret/\n', 'utf-8');

    const idx = createBasenameIndex();
    const contentFilter = createContentFilter({
      projectDir: baseDir,
      contentDir,
    });
    contentFilter.incrementMdDir('docs');
    seedBasenameIndex({ contentDir, contentFilter, basenameIndex: idx });

    expect(idx.resolveEmbed('photo.png', 'docs/meeting.md')).toBe('docs/photo.png');
    expect(idx.resolveEmbed('hidden.png', 'docs/meeting.md')).toBeNull();
  });
});

describe('seedBasenameIndex — symlink safety', () => {
  test('follows symlinks inside contentDir but rejects escapes', () => {
    write('docs/meeting.md');
    write('docs/real.png');
    const outside = join(baseDir, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'evil.png'), 'bytes', 'utf-8');
    symlinkSync(outside, join(contentDir, 'docs', 'linked-outside'));
    mkdirSync(join(contentDir, 'alias-target'), { recursive: true });
    writeFileSync(join(contentDir, 'alias-target', 'aliased.png'), 'bytes', 'utf-8');
    symlinkSync(join(contentDir, 'alias-target'), join(contentDir, 'docs', 'alias'));

    const idx = createBasenameIndex();
    seedBasenameIndex({ contentDir, basenameIndex: idx });

    expect(idx.resolveEmbed('real.png', 'docs/meeting.md')).toBe('docs/real.png');
    expect(idx.resolveEmbed('aliased.png', 'docs/meeting.md')).not.toBeNull();
    expect(idx.resolveEmbed('evil.png', 'docs/meeting.md')).toBeNull();
  });
});
