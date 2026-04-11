import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initContent } from './init.ts';

describe('initContent', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `content-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates full .open-knowledge/ structure from scratch', () => {
    const result = initContent(testDir);

    const okDir = join(testDir, '.open-knowledge');
    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'articles'))).toBe(true);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(true);
    expect(existsSync(join(okDir, 'research'))).toBe(true);
    expect(existsSync(join(okDir, 'cache'))).toBe(true);
    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(okDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yml'))).toBe(true);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBe(0);
  });

  it('is idempotent — does not clobber existing files', () => {
    // First init
    initContent(testDir);

    // Write custom content to AGENTS.md
    const agentsPath = join(testDir, '.open-knowledge', 'AGENTS.md');
    writeFileSync(agentsPath, 'custom content');

    // Second init
    const result = initContent(testDir);

    // Custom content should be preserved
    expect(readFileSync(agentsPath, 'utf-8')).toBe('custom content');
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates files with expected content', () => {
    initContent(testDir);

    const okDir = join(testDir, '.open-knowledge');

    // AGENTS.md has navigation instructions
    const agents = readFileSync(join(okDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('Content Lifecycle');

    // .gitignore excludes cache/
    const gitignore = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('cache/');

    // config.yml is the fully-commented starter — every section header
    // present, every key commented out so the file parses to a no-op.
    const configYml = readFileSync(join(okDir, 'config.yml'), 'utf-8');
    expect(configYml).toContain('Open Knowledge — workspace configuration');
    expect(configYml).toContain('# content:');
    expect(configYml).toContain('# persistence:');
    expect(configYml).toContain('include:');
    // No uncommented top-level keys — every non-empty, non-comment line
    // would mean we accidentally shipped an active override.
    const activeLines = configYml
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(activeLines).toEqual([]);
  });
});
