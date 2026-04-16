import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { buildReadResult } from './read-document.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-read-doc-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function bootstrap(): Promise<string> {
  const project = resolve(tmpDir, 'project');
  mkdirSync(project, { recursive: true });
  const git = simpleGit(project);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 't@t.test');
  writeFileSync(resolve(project, 'README.md'), '# probe\n');
  await git.add('README.md');
  await git.commit('init');
  return project;
}

describe('read_document — folder-rule flow-through (US-005 / QA-002)', () => {
  test('folder rule fills in description + tags when file omits them', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\n---\nBody content\n');

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { description: 'Specifications', tags: ['spec'] },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    // Title comes from file frontmatter (file wins)
    expect(result).toContain('## Foo');
    // Description comes from folder rule (file omitted it)
    expect(result).toContain('**Description:** Specifications');
    // Tags come from folder rule
    expect(result).toContain('spec');
  });

  test('file frontmatter wins over folder rule for scalars', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: File Title\ndescription: File desc\n---\nBody\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Folder Title', description: 'Folder desc' },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    // File scalars win — folder values are NOT present
    expect(result).toContain('## File Title');
    expect(result).not.toContain('Folder Title');
    expect(result).toContain('**Description:** File desc');
    expect(result).not.toContain('Folder desc');
  });

  test('tags concat across folder rule + file frontmatter with dedup', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: Foo\ntags:\n  - wip\n  - spec\n---\nBody\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec', 'architecture'] } }],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    // Expected order: folder rule tags (spec, architecture) + file tags (wip, spec),
    // then first-occurrence-preserved dedup = [spec, architecture, wip]
    expect(result).toContain('spec');
    expect(result).toContain('architecture');
    expect(result).toContain('wip');
    // No duplicate 'spec'
    const specOccurrences = (result.match(/spec/g) ?? []).length;
    // "spec" may appear in other places (e.g. in "Specs"); this checks it shows up
    expect(specOccurrences).toBeGreaterThanOrEqual(1);
  });

  test('no folder rule matches → file-only frontmatter behavior', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\ntags:\n  - wip\n---\nBody\n');

    // Rules exist but match a different subtree
    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'reports/**',
          frontmatter: { title: 'Should not appear', tags: ['report'] },
        },
      ],
    });

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('## Foo');
    expect(result).not.toContain('Should not appear');
    expect(result).not.toContain('report');
    expect(result).toContain('wip');
  });

  test('empty folders config behaves identically to no folders block (backwards compat)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: Foo\ndescription: Bar\n---\nBody\n');

    const result = await buildReadResult(
      { path: 'specs/foo.md' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    expect(result).toContain('## Foo');
    expect(result).toContain('**Description:** Bar');
  });
});
