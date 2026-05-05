import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
import {
  buildConfigYmlContent,
  initContent,
  OK_OKIGNORE_TEMPLATE,
  packageVersionMajorMinor,
} from './init.ts';

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

  it('creates config-only .ok/ scaffold from scratch', () => {
    const result = initContent(testDir);

    const okDir = join(testDir, OK_DIR);
    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'local'))).toBe(false);
    expect(existsSync(join(okDir, 'cache'))).toBe(false);
    expect(existsSync(join(okDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yml'))).toBe(true);

    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(false);

    expect(existsSync(join(okDir, 'articles'))).toBe(false);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(false);
    expect(existsSync(join(okDir, 'research'))).toBe(false);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBe(0);
  });

  it('is idempotent — does not clobber existing files', () => {
    initContent(testDir);

    const configPath = join(testDir, OK_DIR, 'config.yml');
    writeFileSync(configPath, 'custom content');

    const result = initContent(testDir);

    expect(readFileSync(configPath, 'utf-8')).toBe('custom content');
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates files with expected content', () => {
    initContent(testDir);

    const okDir = join(testDir, OK_DIR);

    const gitignore = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('local/');

    const configYml = readFileSync(join(okDir, 'config.yml'), 'utf-8');
    expect(configYml).toContain('Open Knowledge — project configuration');
    expect(configYml).toContain('# content:');
    expect(configYml).toContain('# appearance:');
    const activeLines = configYml
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(activeLines).toEqual([]);
  });

  it('config.yml first line is the schema-version-pinned $schema magic comment (FR-17)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    const firstLine = configYml.split('\n')[0];
    expect(firstLine).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/unpkg\.com\/@inkeep\/open-knowledge@latest\/dist\/schemas\/v\d+\/config\.project\.schema\.json$/,
    );
    expect(configYml.split('\n')[1]).toBe('# Open Knowledge — project configuration');
    expect(configYml).toContain('# Schema reference: packages/cli/src/config/schema.ts');
  });

  it('config.yml scaffold includes Karpathy starter + picomatch nuance doc (US-006 / QA-009)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    expect(configYml).toContain('Folders:');
    expect(configYml).toContain('# folders:');
    expect(configYml).toContain("#   - match: 'external-sources/**'");
    expect(configYml).toContain("#   - match: 'research/**'");
    expect(configYml).toContain("#   - match: 'articles/**'");
    expect(configYml).toContain('ok seed');
    expect(configYml).toMatch(/foo-\*\*/);
    expect(configYml).toMatch(/foo-\*\/\*\*/);
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

  it('appends `local/` to a stale legacy .gitignore (upgrade path)', () => {
    const okDir = join(testDir, OK_DIR);
    mkdirSync(okDir, { recursive: true });
    const stale = `cache/\nserver.lock\nui.lock\nsync-state.json\n`;
    writeFileSync(join(okDir, '.gitignore'), stale, 'utf-8');

    const result = initContent(testDir);

    const after = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(after).toBe(`cache/\nserver.lock\nui.lock\nsync-state.json\nlocal/\n`);
    expect(result.updated).toContain('.gitignore');
    expect(result.created).not.toContain('.gitignore');
  });

  it('preserves user-added .gitignore entries during scaffold merge', () => {
    const okDir = join(testDir, OK_DIR);
    mkdirSync(okDir, { recursive: true });
    const userCustomized = `cache/\nserver.lock\nmy-custom-ignore.tmp\n`;
    writeFileSync(join(okDir, '.gitignore'), userCustomized, 'utf-8');

    initContent(testDir);

    const after = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(after).toContain('my-custom-ignore.tmp');
    expect(after).toContain('local/');
  });

  it('does not duplicate .gitignore entries on repeated initContent calls', () => {
    initContent(testDir);
    initContent(testDir);
    initContent(testDir);

    const gitignore = readFileSync(join(testDir, OK_DIR, '.gitignore'), 'utf-8');
    const matches = gitignore.split('\n').filter((l) => l.trim() === 'local/').length;
    expect(matches).toBe(1);
  });
});

describe('committed .ok/.gitignore matches scaffold output', () => {
  it('matches OK_GITIGNORE_CONTENT byte-for-byte', () => {
    const tmp = resolve(
      tmpdir(),
      `gitignore-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmp, { recursive: true });
    try {
      initContent(tmp);
      const scaffolded = readFileSync(join(tmp, OK_DIR, '.gitignore'), 'utf-8');

      let dir = dirname(import.meta.path);
      while (dir !== '/' && !existsSync(join(dir, '.ok', '.gitignore'))) {
        dir = dirname(dir);
      }
      if (dir === '/') {
        throw new Error(
          `drift-guard: could not locate .ok/.gitignore by walking up from ${import.meta.path}`,
        );
      }
      const committedPath = join(dir, '.ok', '.gitignore');
      const committed = readFileSync(committedPath, 'utf-8');

      expect(committed).toBe(scaffolded);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('committed .okignore matches scaffold output', () => {
  it('matches OK_OKIGNORE_TEMPLATE byte-for-byte', () => {
    const tmp = resolve(
      tmpdir(),
      `okignore-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmp, { recursive: true });
    try {
      initContent(tmp);
      const scaffolded = readFileSync(join(tmp, '.okignore'), 'utf-8');
      expect(scaffolded).toBe(OK_OKIGNORE_TEMPLATE);

      let dir = dirname(import.meta.path);
      while (dir !== '/' && !existsSync(join(dir, '.okignore'))) {
        dir = dirname(dir);
      }
      if (dir === '/') {
        throw new Error(
          `drift-guard: could not locate .okignore by walking up from ${import.meta.path}`,
        );
      }
      const committed = readFileSync(join(dir, '.okignore'), 'utf-8');
      expect(committed).toBe(OK_OKIGNORE_TEMPLATE);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('packageVersionMajorMinor', () => {
  it('extracts MAJOR.MINOR from a 3-part semver', () => {
    expect(packageVersionMajorMinor('1.2.3')).toBe('1.2');
    expect(packageVersionMajorMinor('0.2.0')).toBe('0.2');
    expect(packageVersionMajorMinor('10.20.30')).toBe('10.20');
  });

  it('drops prerelease suffixes from the minor segment (split-on-dot only consumes the first two)', () => {
    expect(packageVersionMajorMinor('1.2.0-rc.1')).toBe('1.2');
  });

  it('falls back to 0.0 when the input is malformed', () => {
    expect(packageVersionMajorMinor('')).toBe('0.0');
  });
});

describe('buildConfigYmlContent', () => {
  it('templates the magic comment with @latest + schema-major path', () => {
    const out = buildConfigYmlContent('3.5.0');
    expect(out.split('\n')[0]).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/unpkg\.com\/@inkeep\/open-knowledge@latest\/dist\/schemas\/v\d+\/config\.project\.schema\.json$/,
    );
  });

  it('produces a file with NO uncommented top-level keys (idempotent at parse)', () => {
    const out = buildConfigYmlContent('1.0.0');
    const activeLines = out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(activeLines).toEqual([]);
  });
});
