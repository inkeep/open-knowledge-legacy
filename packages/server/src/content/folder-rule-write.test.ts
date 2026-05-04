import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyNestedFolderRulesUpsert } from './folder-rule-write.ts';

describe('applyNestedFolderRulesUpsert', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'folder-rule-write-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('writes a single-folder rule to <folder>/.ok/frontmatter.yml', () => {
    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: 'meetings/**',
          frontmatter: { title: 'Meetings', tags: ['meeting'] },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toEqual([
      { match: 'meetings/**', path: 'meetings/.ok/frontmatter.yml', action: 'written' },
    ]);

    const abs = join(projectDir, 'meetings', '.ok', 'frontmatter.yml');
    expect(existsSync(abs)).toBe(true);
    const content = readFileSync(abs, 'utf-8');
    expect(content).toContain('title: Meetings');
    expect(content).toContain('- meeting');
  });

  test('rejects multi-folder globs with MULTI_FOLDER_GLOB', () => {
    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: 'specs/*/evidence/**',
          frontmatter: { title: 'Evidence' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MULTI_FOLDER_GLOB');
  });

  test('rejects parent-traversal `match` with PATH_ESCAPE — target folder cannot escape projectDir', () => {
    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: '../escape/**',
          frontmatter: { title: 'X' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PATH_ESCAPE');
    expect(result.error.rule).toBe('../escape/**');
    expect(existsSync(join(projectDir, '..', 'escape', '.ok', 'frontmatter.yml'))).toBe(false);
  });

  test('rejects parent-traversal `new_match` with PATH_ESCAPE — source-folder rename cannot escape projectDir', () => {
    mkdirSync(join(projectDir, 'meetings', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'meetings', '.ok', 'frontmatter.yml'),
      'title: Meetings\n',
      'utf-8',
    );

    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: 'meetings/**',
          new_match: '../escape/**',
          frontmatter: { title: 'X' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PATH_ESCAPE');
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'frontmatter.yml'))).toBe(true);
  });

  test('rejects relative projectDir with BAD_PROJECT_DIR', () => {
    const result = applyNestedFolderRulesUpsert({
      projectDir: 'relative/path',
      rules: [{ match: 'foo/**', frontmatter: { title: 'X' } }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_PROJECT_DIR');
  });

  test('malformed existing YAML surfaces as WRITE_ERROR — does not silently drop existing keys', () => {
    const fmDir = join(projectDir, 'meetings', '.ok');
    mkdirSync(fmDir, { recursive: true });
    writeFileSync(
      join(fmDir, 'frontmatter.yml'),
      'title: "unterminated\ndescription: also broken: : :',
      'utf-8',
    );

    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: 'meetings/**',
          frontmatter: { tags: ['meeting'] },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('WRITE_ERROR');
    expect(result.error.rule).toBe('meetings/**');

    const content = readFileSync(join(fmDir, 'frontmatter.yml'), 'utf-8');
    expect(content).toContain('unterminated');
  });

  test('an empty patch ({}) deletes the file and auto-cleans .ok/', () => {
    const fmDir = join(projectDir, 'meetings', '.ok');
    mkdirSync(fmDir, { recursive: true });
    writeFileSync(join(fmDir, 'frontmatter.yml'), 'title: Meetings\n', 'utf-8');

    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [{ match: 'meetings/**', frontmatter: {} }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied[0]?.action).toBe('deleted');
    expect(existsSync(join(fmDir, 'frontmatter.yml'))).toBe(false);
    expect(existsSync(fmDir)).toBe(false);
  });

  test('preserves existing keys when patch only sets one scalar', () => {
    const fmDir = join(projectDir, 'meetings', '.ok');
    mkdirSync(fmDir, { recursive: true });
    writeFileSync(
      join(fmDir, 'frontmatter.yml'),
      'title: Old Title\ndescription: Old desc\ntags:\n  - keep\n',
      'utf-8',
    );

    const result = applyNestedFolderRulesUpsert({
      projectDir,
      rules: [
        {
          match: 'meetings/**',
          frontmatter: { title: 'New Title' },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const content = readFileSync(join(fmDir, 'frontmatter.yml'), 'utf-8');
    expect(content).toContain('title: New Title');
    expect(content).toContain('Old desc');
    expect(content).toContain('- keep');
  });
});
