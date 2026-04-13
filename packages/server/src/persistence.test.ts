import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, realpath, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { contentHash, isSelfWrite, registerWrite } from './file-watcher';
import { isWithinContentDir, safeContentPath } from './persistence';

describe('safeContentPath', () => {
  const contentDir = '/app/content';

  test('allows simple document names', () => {
    const result = safeContentPath('test-doc', contentDir);
    expect(result).toBe(resolve(contentDir, 'test-doc.md'));
  });

  test('rejects path traversal with ../', () => {
    expect(() => safeContentPath('../etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects absolute path injection', () => {
    expect(() => safeContentPath('/etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects traversal to parent directory', () => {
    expect(() => safeContentPath('../../package.json', contentDir)).toThrow(
      'Invalid document name',
    );
  });

  test('allows subdirectory within content', () => {
    const result = safeContentPath('sub/nested', contentDir);
    expect(result).toBe(resolve(contentDir, 'sub/nested.md'));
  });
});

describe('isWithinContentDir', () => {
  test('returns true for path equal to contentDir', () => {
    expect(isWithinContentDir('/app/content', '/app/content')).toBe(true);
  });

  test('returns true for path inside contentDir', () => {
    expect(isWithinContentDir(`/app/content${sep}file.md`, '/app/content')).toBe(true);
  });

  test('returns true for nested path inside contentDir', () => {
    expect(isWithinContentDir(`/app/content${sep}sub${sep}file.md`, '/app/content')).toBe(true);
  });

  test('returns false for path outside contentDir', () => {
    expect(isWithinContentDir('/tmp/outside.md', '/app/content')).toBe(false);
  });

  test('returns false for path that is a prefix but not a child', () => {
    expect(isWithinContentDir('/app/content-extra/file.md', '/app/content')).toBe(false);
  });
});

describe('symlink-safe atomic write', () => {
  let tmpDir: string;
  let contentDir: string;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'persistence-test-')));
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function simulateWrite(documentName: string, markdown: string, cd: string) {
    const requestedPath = safeContentPath(documentName, cd);
    await mkdir(dirname(requestedPath), { recursive: true });

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(requestedPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        canonicalPath = requestedPath;
      } else if (code === 'ELOOP') {
        throw new Error(`Symlink cycle detected at ${requestedPath}`);
      } else {
        throw e;
      }
    }

    if (!isWithinContentDir(canonicalPath, cd)) {
      throw new Error(
        `symlink-escape: ${requestedPath} resolves to ${canonicalPath} outside ${cd}`,
      );
    }

    const tmpPath = `${canonicalPath}.tmp`;
    await writeFile(tmpPath, markdown, 'utf-8');
    await rename(tmpPath, canonicalPath);
    registerWrite(canonicalPath, contentHash(markdown));
  }

  test('preserves symlink when writing to symlinked file', async () => {
    const targetPath = join(contentDir, 'target.md');
    const linkPath = join(contentDir, 'link.md');

    writeFileSync(targetPath, '# Original');
    symlinkSync(targetPath, linkPath);

    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);

    await simulateWrite('link', '# Updated via symlink', contentDir);

    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(linkPath, 'utf-8')).toBe('# Updated via symlink');
    expect(readFileSync(targetPath, 'utf-8')).toBe('# Updated via symlink');
  });

  test('regular file write is unchanged', async () => {
    const filePath = join(contentDir, 'regular.md');
    writeFileSync(filePath, '# Original');

    await simulateWrite('regular', '# Updated', contentDir);

    expect(readFileSync(filePath, 'utf-8')).toBe('# Updated');
    expect(lstatSync(filePath).isSymbolicLink()).toBe(false);
  });

  test('new file write works (ENOENT fallback)', async () => {
    await simulateWrite('new-file', '# New content', contentDir);

    const filePath = join(contentDir, 'new-file.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('# New content');
  });

  test('broken symlink falls back to direct write at original path', async () => {
    const linkPath = join(contentDir, 'orphan.md');
    symlinkSync(join(contentDir, 'nonexistent.md'), linkPath);

    await simulateWrite('orphan', '# Broken link content', contentDir);

    expect(existsSync(linkPath)).toBe(true);
    expect(readFileSync(linkPath, 'utf-8')).toBe('# Broken link content');
  });

  test('cyclic symlink throws ELOOP error', async () => {
    const aPath = join(contentDir, 'cycle-a.md');
    const bPath = join(contentDir, 'cycle-b.md');
    symlinkSync(bPath, aPath);
    symlinkSync(aPath, bPath);

    await expect(simulateWrite('cycle-a', '# Content', contentDir)).rejects.toThrow(
      'Symlink cycle detected',
    );
  });

  test('symlink escaping contentDir is refused', async () => {
    const outsideDir = join(tmpDir, 'outside');
    mkdirSync(outsideDir, { recursive: true });
    const outsideTarget = join(outsideDir, 'secret.md');
    writeFileSync(outsideTarget, '# Secret');

    const escapePath = join(contentDir, 'escape.md');
    symlinkSync(outsideTarget, escapePath);

    await expect(simulateWrite('escape', '# Hacked', contentDir)).rejects.toThrow('symlink-escape');

    expect(lstatSync(escapePath).isSymbolicLink()).toBe(true);
    expect(readFileSync(outsideTarget, 'utf-8')).toBe('# Secret');
  });

  test('tmpPath is colocated with canonical path, not requested path', async () => {
    const subDir = join(contentDir, 'sub');
    mkdirSync(subDir, { recursive: true });
    const targetPath = join(subDir, 'target.md');
    writeFileSync(targetPath, '# Target');

    const linkPath = join(contentDir, 'link.md');
    symlinkSync(targetPath, linkPath);

    await simulateWrite('link', '# Updated', contentDir);

    expect(existsSync(`${linkPath}.tmp`)).toBe(false);
    expect(existsSync(`${targetPath}.tmp`)).toBe(false);
    expect(readFileSync(targetPath, 'utf-8')).toBe('# Updated');
  });

  test('registerWrite uses canonical path for self-write detection', async () => {
    const targetPath = join(contentDir, 'target.md');
    const linkPath = join(contentDir, 'link.md');
    writeFileSync(targetPath, '# Original');
    symlinkSync(targetPath, linkPath);

    const markdown = '# Self-write test';
    await simulateWrite('link', markdown, contentDir);

    const hash = contentHash(markdown);
    expect(isSelfWrite(targetPath, hash)).toBe(true);
    expect(isSelfWrite(linkPath, hash)).toBe(false);
  });
});
