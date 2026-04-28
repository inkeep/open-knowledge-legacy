import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildStaticSite, defaultPublishManifest, docNameToPublicUrl } from './builder.ts';

describe('buildStaticSite', () => {
  let root: string;

  beforeEach(() => {
    root = resolve(tmpdir(), `ok-publish-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function build(overrides: Partial<Parameters<typeof buildStaticSite>[0]> = {}) {
    return buildStaticSite({
      projectDir: root,
      contentDir: root,
      include: ['**/*.md', '**/*.mdx'],
      contentExclude: [],
      manifest: defaultPublishManifest(),
      ...overrides,
    });
  }

  test('renders markdown documents to path-based static pages', async () => {
    mkdirSync(join(root, 'guide'));
    writeFileSync(join(root, 'index.md'), '# Home\n\nSee [Guide](guide/setup.md).');
    writeFileSync(join(root, 'guide', 'setup.md'), '---\ntitle: Setup\n---\n\n## Install');

    const result = await build();

    expect(result.pages.map((page) => page.url)).toEqual(['/', '/guide/setup/']);
    const home = readFileSync(join(result.outputDir, 'index.html'), 'utf-8');
    expect(home).toContain('href="/guide/setup/"');
    expect(home).toContain('Home · Open Knowledge');
    expect(existsSync(join(result.outputDir, 'guide', 'setup', 'index.html'))).toBe(true);
    expect(existsSync(join(result.outputDir, 'search-index.json'))).toBe(true);
  });

  test('warns but continues when internal links are broken', async () => {
    writeFileSync(join(root, 'index.md'), '# Home\n\n[[Missing]]');

    const result = await build();

    expect(result.pages).toHaveLength(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ kind: 'dead-link', source: 'index', target: 'Missing' }),
    );
    expect(existsSync(join(result.outputDir, 'index.html'))).toBe(true);
  });

  test('treats links to excluded docs as warnings', async () => {
    mkdirSync(join(root, 'private'));
    writeFileSync(join(root, 'index.md'), '# Home\n\nSee [Secret](private/secret.md).');
    writeFileSync(join(root, 'private', 'secret.md'), '# Secret');

    const result = await build({
      manifest: { ...defaultPublishManifest(), exclude: ['private/**'] },
    });

    expect(result.pages.map((page) => page.docName)).toEqual(['index']);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ kind: 'dead-link', source: 'index', target: 'private/secret' }),
    );
  });

  test('rewrites mdx links to extensionless public URLs', async () => {
    writeFileSync(join(root, 'index.md'), '# Home\n\n[MDX](page.mdx)');
    writeFileSync(join(root, 'page.mdx'), '# MDX Page');

    const result = await build();

    expect(result.warnings).toEqual([]);
    expect(readFileSync(join(result.outputDir, 'index.html'), 'utf-8')).toContain('href="/page/"');
  });

  test('applies manifest exclusions without requiring per-file frontmatter', async () => {
    mkdirSync(join(root, 'private'));
    writeFileSync(join(root, 'index.md'), '# Public');
    writeFileSync(join(root, 'private', 'secret.md'), '# Secret');

    const result = await build({
      manifest: { ...defaultPublishManifest(), exclude: ['private/**'] },
    });

    expect(result.pages.map((page) => page.docName)).toEqual(['index']);
    expect(existsSync(join(result.outputDir, 'private', 'secret', 'index.html'))).toBe(false);
  });

  test('copies admitted sibling assets', async () => {
    writeFileSync(join(root, 'index.md'), '# Home\n\n![Logo](logo.png)');
    writeFileSync(join(root, 'logo.png'), 'png-bytes');

    const result = await build();

    expect(result.assets).toEqual(['logo.png']);
    expect(readFileSync(join(result.outputDir, 'logo.png'), 'utf-8')).toBe('png-bytes');
  });
});

describe('docNameToPublicUrl', () => {
  test('preserves document path shape', () => {
    expect(docNameToPublicUrl('index')).toBe('/');
    expect(docNameToPublicUrl('docs/setup')).toBe('/docs/setup/');
    expect(docNameToPublicUrl('docs/index')).toBe('/docs/');
    expect(docNameToPublicUrl('docs/setup', '/kb', 'install')).toBe('/kb/docs/setup/#install');
  });
});
