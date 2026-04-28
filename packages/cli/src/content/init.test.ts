import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
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

  it('creates config-only .open-knowledge/ scaffold from scratch', () => {
    const result = initContent(testDir);

    const okDir = join(testDir, OK_DIR);
    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'cache'))).toBe(true);
    expect(existsSync(join(okDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yml'))).toBe(true);

    // Per SPEC 2026-04-22 (FR2 / NG1): the internal .open-knowledge/AGENTS.md
    // README is no longer scaffolded — behavioral guidance ships via the
    // user-global Agent Skill + MCP instructions + per-tool descriptions.
    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(false);

    // Content subdirs are NOT scaffolded per V0-24.2 catalog teardown —
    // wiki content lives wherever `content.dir` points (project root by default),
    // not in opinionated subfolders.
    expect(existsSync(join(okDir, 'articles'))).toBe(false);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(false);
    expect(existsSync(join(okDir, 'research'))).toBe(false);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBe(0);
  });

  it('is idempotent — does not clobber existing files', () => {
    // First init
    initContent(testDir);

    // Write custom content to config.yml
    const configPath = join(testDir, OK_DIR, 'config.yml');
    writeFileSync(configPath, 'custom content');

    // Second init
    const result = initContent(testDir);

    // Custom content should be preserved
    expect(readFileSync(configPath, 'utf-8')).toBe('custom content');
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates files with expected content', () => {
    initContent(testDir);

    const okDir = join(testDir, OK_DIR);

    // .gitignore is the single source of truth for OK-internal ignores —
    // every per-machine runtime path lives here so the project root
    // .gitignore stays free of OK-internal entries.
    const gitignore = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('cache/');
    expect(gitignore).toContain('server.lock');
    expect(gitignore).toContain('ui.lock');
    expect(gitignore).toContain('sync-state.json');
    expect(gitignore).toContain('principal.json');
    expect(gitignore).toContain('last-spawn-error.log');

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

  it('config.yml scaffold includes Karpathy starter + picomatch nuance doc (US-006 / QA-009)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    // Folders block documented
    expect(configYml).toContain('Folders:');
    expect(configYml).toContain('# folders:');
    // Karpathy three-layer starter (matches `ok seed` output — US-006 rewrite)
    expect(configYml).toContain("#   - match: 'external-sources/**'");
    expect(configYml).toContain("#   - match: 'research/**'");
    expect(configYml).toContain("#   - match: 'articles/**'");
    // Points at `ok seed` as the command that writes this structure for real
    expect(configYml).toContain('ok seed');
    // Picomatch globstar nuance explicitly flagged
    expect(configYml).toMatch(/foo-\*\*/);
    expect(configYml).toMatch(/foo-\*\/\*\*/);
    // Last-match-wins ordering documented
    expect(configYml).toMatch(/LATER rules.*override/i);
  });

  it('config.yml scaffold describes the suggested three-tier lifecycle (SPEC 2026-04-22 D12 / Q9=C)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    expect(configYml).toContain('Suggested lifecycle');
    expect(configYml).toContain('external-sources');
    expect(configYml).toContain('research');
    expect(configYml).toContain('articles');
  });
});
