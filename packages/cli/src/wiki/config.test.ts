import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadWikiConfig } from './config.ts';

describe('loadWikiConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `wiki-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns defaults when config.yaml is missing', () => {
    const result = loadWikiConfig(testDir);

    expect(result.raw.articles_path).toBe('./articles');
    expect(result.raw.external_sources_path).toBe('./external-sources');
    expect(result.raw.research_path).toBe('./research');
    expect(result.articlesDir).toBe(resolve(testDir, 'articles'));
    expect(result.externalSourcesDir).toBe(resolve(testDir, 'external-sources'));
    expect(result.researchDir).toBe(resolve(testDir, 'research'));
  });

  it('reads valid config.yaml and resolves paths', () => {
    writeFileSync(
      resolve(testDir, 'config.yaml'),
      'articles_path: ../docs\nexternal_sources_path: ./sources\nresearch_path: ./findings\n',
    );

    const result = loadWikiConfig(testDir);

    expect(result.raw.articles_path).toBe('../docs');
    expect(result.articlesDir).toBe(resolve(testDir, '..', 'docs'));
    expect(result.externalSourcesDir).toBe(resolve(testDir, 'sources'));
    expect(result.researchDir).toBe(resolve(testDir, 'findings'));
  });

  it('applies defaults for missing fields in partial config', () => {
    writeFileSync(resolve(testDir, 'config.yaml'), 'articles_path: ./wiki\n');

    const result = loadWikiConfig(testDir);

    expect(result.raw.articles_path).toBe('./wiki');
    expect(result.raw.external_sources_path).toBe('./external-sources');
    expect(result.raw.research_path).toBe('./research');
  });

  it('throws descriptive error for invalid config', () => {
    writeFileSync(resolve(testDir, 'config.yaml'), 'articles_path: 42\n');

    expect(() => loadWikiConfig(testDir)).toThrow(/Invalid wiki config/);
  });
});
