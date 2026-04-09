import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initWiki } from './init.ts';

describe('initWiki', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `wiki-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates full .openknowledge/ structure from scratch', () => {
    const result = initWiki(testDir);

    const okDir = join(testDir, '.openknowledge');
    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'articles'))).toBe(true);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(true);
    expect(existsSync(join(okDir, 'research'))).toBe(true);
    expect(existsSync(join(okDir, 'cache'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yaml'))).toBe(true);
    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(okDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(okDir, 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'articles', 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'external-sources', 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'research', 'INDEX.md'))).toBe(true);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBe(0);
  });

  it('is idempotent — does not clobber existing files', () => {
    // First init
    initWiki(testDir);

    // Write custom content to AGENTS.md
    const agentsPath = join(testDir, '.openknowledge', 'AGENTS.md');
    writeFileSync(agentsPath, 'custom content');

    // Second init
    const result = initWiki(testDir);

    // Custom content should be preserved
    expect(readFileSync(agentsPath, 'utf-8')).toBe('custom content');
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates files with expected content', () => {
    initWiki(testDir);

    const okDir = join(testDir, '.openknowledge');

    // config.yaml has default paths
    const config = readFileSync(join(okDir, 'config.yaml'), 'utf-8');
    expect(config).toContain('articles_path');
    expect(config).toContain('./articles');

    // AGENTS.md has navigation instructions
    const agents = readFileSync(join(okDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('INDEX.md');
    expect(agents).toContain('Content Lifecycle');

    // .gitignore excludes cache/
    const gitignore = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('cache/');

    // Root INDEX.md has sections
    const rootIndex = readFileSync(join(okDir, 'INDEX.md'), 'utf-8');
    expect(rootIndex).toContain('## Sections');
    expect(rootIndex).toContain('Knowledge Articles');
    expect(rootIndex).toContain('generated: true');
  });
});
