import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyTemplateDelete, applyTemplateWrite } from './templates-write.ts';
import { __resetUserHomeProviderForTest, __setUserHomeProviderForTest } from './user-home.ts';

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

  test('hard-errors on missing title with TEMPLATE_TITLE_REQUIRED (D14)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'untitled',
      body: 'body',
      frontmatter: { description: 'has desc only' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_TITLE_REQUIRED');
  });

  test('hard-errors on empty title with TEMPLATE_TITLE_REQUIRED (D14)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'empty-title',
      body: 'body',
      frontmatter: { title: '', description: 'desc' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_TITLE_REQUIRED');
  });

  test('rejects unknown substitution tokens with TEMPLATE_UNKNOWN_VARIABLE (D5 / FR17)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'bad-tokens',
      body: 'Today is {{date}}, but {{name}} is unknown.',
      frontmatter: { title: 'OK', description: 'tests rejection' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_UNKNOWN_VARIABLE');
    expect(result.error.message).toContain('name');
  });

  test('accepts allowlisted substitution tokens (D5 / FR17)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'good-tokens',
      body: 'Date: {{date}}\nUser: {{user}}',
      frontmatter: { title: 'OK', description: 'allowlist passes' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
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

  test('writes a minimal-frontmatter template (title only — description optional)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'minimal',
      body: 'just body',
      frontmatter: { title: 'Minimal' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const abs = join(projectDir, 'meetings', '.ok', 'templates', 'minimal.md');
    const content = readFileSync(abs, 'utf-8');
    expect(content).toContain('---\ntitle: Minimal\n---');
    expect(content).toContain('just body');
    expect(result.warnings.some((w) => w.match(/description is missing/))).toBe(true);
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
    writeFileSync(join(projectDir, 'meetings', '.ok', 'frontmatter.yml'), 'tags: [meeting]\n');

    const result = applyTemplateDelete({ projectDir, folder: 'meetings', name: 'tpl' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cleanedEmpty.templatesDir).toBe(true);
    expect(result.cleanedEmpty.okDir).toBe(false);
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
    mkdirSync(join(projectDir, 'sentinel'), { recursive: true });
    expect(existsSync(join(projectDir, 'sentinel'))).toBe(true);
  });
});

describe('applyTemplateWrite — target: "user"', () => {
  let projectDir: string;
  let userHome: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-write-user-proj-'));
    userHome = await mkdtemp(join(tmpdir(), 'tpl-write-user-home-'));
    __setUserHomeProviderForTest(() => userHome);
  });

  afterEach(async () => {
    __resetUserHomeProviderForTest();
    await rm(projectDir, { recursive: true, force: true });
    await rm(userHome, { recursive: true, force: true });
  });

  test('writes to ~/.ok/templates/<name>.md and ignores folder argument', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'this-is-ignored',
      name: 'weekly-review',
      body: 'My weekly review template',
      frontmatter: {
        title: 'Weekly Review',
        description: 'Personal template',
        tags: ['personal', 'review'],
      },
      target: 'user',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.path).toBe('~/.ok/templates/weekly-review.md');

    const abs = join(userHome, '.ok', 'templates', 'weekly-review.md');
    expect(existsSync(abs)).toBe(true);
    const content = readFileSync(abs, 'utf-8');
    expect(content).toContain('title: Weekly Review');
    expect(content).toContain('My weekly review template');

    expect(existsSync(join(projectDir, '.ok', 'templates', 'weekly-review.md'))).toBe(false);
  });

  test('user-target overwrites existing user template (idempotent)', () => {
    applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'daily',
      body: 'v1',
      frontmatter: { title: 'Daily v1', description: 'first' },
      target: 'user',
    });
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'daily',
      body: 'v2',
      frontmatter: { title: 'Daily v2', description: 'second' },
      target: 'user',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    const content = readFileSync(join(userHome, '.ok', 'templates', 'daily.md'), 'utf-8');
    expect(content).toContain('Daily v2');
    expect(content).toContain('v2');
    expect(content).not.toContain('Daily v1');
  });

  test('user-target rejects path-escape names with BAD_NAME', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: '../etc/passwd',
      body: 'malicious',
      frontmatter: { title: 'Malicious', description: 'attempts escape' },
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_NAME');
    expect(existsSync(join(userHome, '..', 'etc'))).toBe(false);
  });

  test('user-target rejects names with separators (defense-in-depth)', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'foo/bar',
      body: 'b',
      frontmatter: { title: 'X', description: 'X' },
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_NAME');
  });

  test('user-target enforces title-required identically to project', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'untitled-user',
      body: 'b',
      frontmatter: { description: 'no title' },
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_TITLE_REQUIRED');
  });

  test('user-target enforces substitution allowlist identically to project', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'bad-tokens',
      body: 'Today: {{date}}, but {{custom}} is bad.',
      frontmatter: { title: 'OK', description: 'should reject' },
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TEMPLATE_UNKNOWN_VARIABLE');
  });

  test('returns USER_HOME_UNAVAILABLE when home cannot be resolved', () => {
    __setUserHomeProviderForTest(() => null);
    const result = applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'cant-write',
      body: 'b',
      frontmatter: { title: 'Title', description: 'd' },
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('USER_HOME_UNAVAILABLE');
  });

  test('default target is "project" — backward compat preserved', () => {
    const result = applyTemplateWrite({
      projectDir,
      folder: 'meetings',
      name: 'classic',
      body: 'b',
      frontmatter: { title: 'Classic', description: 'd' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe('meetings/.ok/templates/classic.md');
    expect(existsSync(join(projectDir, 'meetings', '.ok', 'templates', 'classic.md'))).toBe(true);
    expect(existsSync(join(userHome, '.ok', 'templates', 'classic.md'))).toBe(false);
  });
});

describe('applyTemplateDelete — target: "user"', () => {
  let projectDir: string;
  let userHome: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-del-user-proj-'));
    userHome = await mkdtemp(join(tmpdir(), 'tpl-del-user-home-'));
    __setUserHomeProviderForTest(() => userHome);
  });

  afterEach(async () => {
    __resetUserHomeProviderForTest();
    await rm(projectDir, { recursive: true, force: true });
    await rm(userHome, { recursive: true, force: true });
  });

  test('removes user template and auto-cleans empty .ok/templates/ + .ok/', () => {
    applyTemplateWrite({
      projectDir,
      folder: '',
      name: 'orphan',
      body: 'b',
      frontmatter: { title: 'Orphan', description: 'd' },
      target: 'user',
    });
    const abs = join(userHome, '.ok', 'templates', 'orphan.md');
    expect(existsSync(abs)).toBe(true);

    const result = applyTemplateDelete({
      projectDir,
      folder: '',
      name: 'orphan',
      target: 'user',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.existed).toBe(true);
    expect(existsSync(abs)).toBe(false);
    expect(result.cleanedEmpty.templatesDir).toBe(true);
    expect(result.cleanedEmpty.okDir).toBe(true);
    expect(existsSync(join(userHome, '.ok'))).toBe(false);
  });

  test('idempotent: deleting non-existent user template returns existed: false', () => {
    const result = applyTemplateDelete({
      projectDir,
      folder: '',
      name: 'nope',
      target: 'user',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.existed).toBe(false);
  });

  test('user-delete returns USER_HOME_UNAVAILABLE when home is null', () => {
    __setUserHomeProviderForTest(() => null);
    const result = applyTemplateDelete({
      projectDir,
      folder: '',
      name: 'whatever',
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('USER_HOME_UNAVAILABLE');
  });

  test('user-delete rejects path-escape with BAD_NAME', () => {
    const result = applyTemplateDelete({
      projectDir,
      folder: '',
      name: '../escape',
      target: 'user',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BAD_NAME');
  });
});
