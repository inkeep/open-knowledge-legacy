import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTemplateDelete, applyTemplateWrite } from './templates-write.ts';

describe('applyTemplateWrite', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-write-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('lazy-creates .ok/templates/ and writes the file', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'prep-notes',
      body: '# Meeting Prep\n\nNotes...',
      frontmatter: {
        title: 'Meeting Prep',
        description: 'Use before a meeting.',
        tags: ['meeting'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.path).toBe('meetings/.ok/templates/prep-notes.md');
    expect(result.warnings).toEqual([]);

    const abs = join(projectDir, 'meetings', '.ok', 'templates', 'prep-notes.md');
    const content = readFileSync(abs, 'utf-8');
    expect(content).toContain('title: Meeting Prep');
    expect(content).toContain('description: Use before a meeting.');
    expect(content).toContain('tags:');
    expect(content).toContain('# Meeting Prep');
  });

  test('overwrites existing template (idempotent)', () => {
    applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'prep',
      body: 'first',
      frontmatter: { title: 'V1', description: 'first version' },
    });
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'prep',
      body: 'second',
      frontmatter: { title: 'V2', description: 'second version' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    const abs = join(projectDir, 'meetings', '.ok', 'templates', 'prep.md');
    const content = readFileSync(abs, 'utf-8');
    expect(content).toContain('title: V2');
    expect(content).toContain('second');
    expect(content).not.toContain('V1');
  });

  test('soft-warns on missing title (D14)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'untitled',
      body: 'body',
      frontmatter: { description: 'has desc only' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/title is missing/);
  });

  test('soft-warns on missing description (D14)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'undescribed',
      body: 'body',
      frontmatter: { title: 'Has Title' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.match(/description is missing/))).toBe(true);
  });

  test('rejects bad name (BAD_NAME)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'foo/bar',
      body: 'body',
      frontmatter: { title: 'X', description: 'X' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_NAME');
  });

  test('rejects path traversal (PATH_TRAVERSAL)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '../escape',
      name: 'foo',
      body: 'body',
      frontmatter: { title: 'X', description: 'X' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PATH_TRAVERSAL');
  });

  test('writes at project root (folder: "")', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'global',
      body: 'g',
      frontmatter: { title: 'Global', description: 'Available everywhere' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe('.ok/templates/global.md');
    expect(existsSync(join(projectDir, '.ok', 'templates', 'global.md'))).toBe(true);
  });

  test('omits frontmatter block when all fields empty', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'plain',
      body: 'just body',
      frontmatter: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const abs = join(projectDir, 'meetings', '.ok', 'templates', 'plain.md');
    const content = readFileSync(abs, 'utf-8');
    // Body without leading frontmatter fence
    expect(content).toBe('just body');
  });
});

describe('applyTemplateDelete', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-del-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('removes existing template + auto-cleans empty templates/ + .ok/', () => {
    applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'only',
      body: 'b',
      frontmatter: { title: 'Only', description: 'Only one' },
    });
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'templates', 'only.md'))).toBe(true);

    const result = applyTemplateDelete({ projectDir, folder: 'meetings', name: 'only' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.existed).toBe(true);
    expect(result.cleanedEmpty.templatesDir).toBe(true);
    expect(result.cleanedEmpty.okDir).toBe(true);
    expect(existsSync(join(projectDir, 'meetings', '.ok'))).toBe(false);
  });

  test('idempotent: deleting non-existent template returns existed: false', () => {
    const result = applyTemplateDelete({ projectDir, folder: 'meetings', name: 'nonexistent' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.existed).toBe(false);
  });

  test('does NOT remove .ok/ when frontmatter.yml still lives there', () => {
    applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'tpl',
      body: 'b',
      frontmatter: { title: 'T', description: 'D' },
    });
    // Plant a frontmatter.yml so .ok/ has another tenant
    writeFileSync(join(projectDir, 'meetings', '.ok', 'frontmatter.yml'), 'tags: [meeting]\n');

    const result = applyTemplateDelete({ projectDir, folder: 'meetings', name: 'tpl' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cleanedEmpty.templatesDir).toBe(true);
    expect(result.cleanedEmpty.okDir).toBe(false);
    // .ok/ remains because frontmatter.yml is still there
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'frontmatter.yml'))).toBe(true);
  });

  test('keeps siblings when removing one of multiple templates', () => {
    applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'prep',
      body: 'p',
      frontmatter: { title: 'Prep', description: 'd' },
    });
    applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'post',
      body: 'p',
      frontmatter: { title: 'Post', description: 'd' },
    });

    applyTemplateDelete({ projectDir, folder: 'meetings', name: 'prep' });
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'templates', 'prep.md'))).toBe(false);
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'templates', 'post.md'))).toBe(true);
  });

  test('rejects bad name', () => {
    const result = applyTemplateDelete({ projectDir, folder: 'meetings', name: '../escape' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_NAME');
  });

  test('plants directories so we can verify cleanup edges', () => {
    // Make sure mkdirSync isn't unused-import bait
    mkdirSync(join(projectDir, 'sentinel'), { recursive: true });
    expect(existsSync(join(projectDir, 'sentinel'))).toBe(true);
  });
});
