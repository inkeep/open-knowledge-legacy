import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { buildSearchResult } from './search.ts';

const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-search-test-'));
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

describe('search — folder-rule flow-through (US-005)', () => {
  test('search results include folder-rule-derived tags', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '# Foo\n\nsearchterm is in the body\n');

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec'] } }],
    });

    const result = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('specs/foo.md');
    expect(result).toContain('Tags: spec');
  });

  test('folder-rule title appears in search result heading when file has no title', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), 'searchterm in body, no frontmatter\n');

    const config: Config = ConfigSchema.parse({
      folders: [
        {
          match: 'specs/**',
          frontmatter: { title: 'Specifications', description: 'Spec docs' },
        },
      ],
    });

    const result = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    // Heading pattern: `### <title> (<path>)`
    expect(result).toContain('### Specifications (specs/foo.md)');
    expect(result).toContain('Spec docs');
  });

  test('file title wins over folder-rule title for scalar precedence', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(resolve(specs, 'foo.md'), '---\ntitle: File Title\n---\n\nsearchterm here\n');

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { title: 'Folder Title' } }],
    });

    const result = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    expect(result).toContain('### File Title (specs/foo.md)');
    expect(result).not.toContain('Folder Title');
  });

  test('folder-rule tags concatenate with file tags and dedup', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: Foo\ntags:\n  - wip\n  - spec\n---\n\nsearchterm here\n',
    );

    const config: Config = ConfigSchema.parse({
      folders: [{ match: 'specs/**', frontmatter: { tags: ['spec', 'architecture'] } }],
    });

    const result = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config },
    );

    // Tags row: "Tags: spec, architecture, wip" (folder rule first; file last; dedup first-seen)
    expect(result).toContain('Tags: spec, architecture, wip');
  });

  test('empty folders config behaves identically to no folders block (backwards compat)', async () => {
    const project = await bootstrap();
    const specs = resolve(project, 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(
      resolve(specs, 'foo.md'),
      '---\ntitle: File Title\ntags:\n  - wip\n---\n\nsearchterm here\n',
    );

    const result = await buildSearchResult(
      { query: 'searchterm' },
      { resolveCwd: async () => project, serverUrl: undefined, config: DEFAULT_CONFIG },
    );

    expect(result).toContain('### File Title (specs/foo.md)');
    expect(result).toContain('Tags: wip');
    // No folder-derived fields in the absence of rules
    expect(result).not.toContain('Folder');
    expect(result).not.toContain('spec,');
  });
});
