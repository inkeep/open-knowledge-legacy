import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { OK_DIR, PACKAGE_VERSION } from '../constants.ts';
import { buildConfigYmlContent, initContent, packageVersionMajorMinor } from './init.ts';

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
    expect(configYml).toContain('# appearance:');
    expect(configYml).toContain('include:');
    // No uncommented top-level keys — every non-empty, non-comment line
    // would mean we accidentally shipped an active override.
    const activeLines = configYml
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(activeLines).toEqual([]);
  });

  it('config.yml first line is the version-pinned $schema magic comment (FR-17)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    const firstLine = configYml.split('\n')[0];
    // AC #6: line 1 matches the FR-17 contract verbatim — version pinned to
    // running CLI's MAJOR.MINOR; URL is unpkg-hosted; ends in the workspace
    // per-scope schema (so workspace YAML autocomplete only suggests
    // workspace-valid fields).
    expect(firstLine).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/unpkg\.com\/@inkeep\/open-knowledge@\d+\.\d+\/dist\/config\.workspace\.schema\.json$/,
    );
    // Embedded MAJOR.MINOR matches the running PACKAGE_VERSION's first two segments.
    const expectedMajorMinor = packageVersionMajorMinor(PACKAGE_VERSION);
    expect(firstLine).toContain(`@inkeep/open-knowledge@${expectedMajorMinor}/`);
    // Existing # Open Knowledge — workspace configuration header is preserved
    // immediately below the magic comment.
    expect(configYml.split('\n')[1]).toBe('# Open Knowledge — workspace configuration');
    // Existing schema-reference prose comment is preserved (human-readable
    // hint for editors without an LSP — both directives coexist).
    expect(configYml).toContain('# Schema reference: packages/cli/src/config/schema.ts');
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

  it('appends missing scaffold entries to a stale .gitignore (upgrade path)', () => {
    // Simulate a workspace that ran `ok init` before the consolidation —
    // its .open-knowledge/.gitignore lacks principal.json + last-spawn-error.log.
    const okDir = join(testDir, OK_DIR);
    mkdirSync(okDir, { recursive: true });
    const stale = `cache/\nserver.lock\nui.lock\nsync-state.json\n`;
    writeFileSync(join(okDir, '.gitignore'), stale, 'utf-8');

    const result = initContent(testDir);

    // Byte-exact: any regression that re-wrote the full scaffold would
    // duplicate the four pre-existing entries, and substring-only assertions
    // wouldn't catch it. The contract under test is "append only what's
    // missing" — pin every byte.
    const after = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(after).toBe(
      `cache/\nserver.lock\nui.lock\nsync-state.json\nprincipal.json\nlast-spawn-error.log\n`,
    );
    // The merge path classifies as 'updated', not 'created' — surfaces a
    // distinct banner at the CLI ('Updated: .gitignore' vs 'Created: ...').
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
    // User customization preserved
    expect(after).toContain('my-custom-ignore.tmp');
    // Scaffold entries appended
    expect(after).toContain('principal.json');
    expect(after).toContain('last-spawn-error.log');
  });

  it('does not duplicate .gitignore entries on repeated initContent calls', () => {
    initContent(testDir);
    initContent(testDir);
    initContent(testDir);

    const gitignore = readFileSync(join(testDir, OK_DIR, '.gitignore'), 'utf-8');
    // Each scaffold entry should appear exactly once
    for (const entry of [
      'cache/',
      'server.lock',
      'ui.lock',
      'sync-state.json',
      'principal.json',
      'last-spawn-error.log',
    ]) {
      const matches = gitignore.split('\n').filter((l) => l.trim() === entry).length;
      expect(matches).toBe(1);
    }
  });
});

// Drift guard: the committed `.open-knowledge/.gitignore` in this repo MUST stay
// in sync with what `ok init` writes. The PR that consolidated ignores fixed a
// prior drift between these two surfaces; this test prevents the next drift.
describe('committed .open-knowledge/.gitignore matches scaffold output', () => {
  it('matches OK_GITIGNORE_CONTENT byte-for-byte', () => {
    const tmp = resolve(
      tmpdir(),
      `gitignore-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmp, { recursive: true });
    try {
      initContent(tmp);
      const scaffolded = readFileSync(join(tmp, OK_DIR, '.gitignore'), 'utf-8');

      // Walk up from this test file (which lives in packages/cli/src/content/)
      // to the repo root. Avoid hard-coded relative paths that break when the
      // test file moves.
      let dir = dirname(import.meta.path);
      while (dir !== '/' && !existsSync(join(dir, '.open-knowledge', '.gitignore'))) {
        dir = dirname(dir);
      }
      if (dir === '/') {
        throw new Error(
          `drift-guard: could not locate .open-knowledge/.gitignore by walking up from ${import.meta.path}`,
        );
      }
      const committedPath = join(dir, '.open-knowledge', '.gitignore');
      const committed = readFileSync(committedPath, 'utf-8');

      expect(committed).toBe(scaffolded);
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
    // npm publish typically strips prerelease suffixes from the URL path; we
    // pass the raw split result through. Acceptable since unpkg resolves the
    // `@<MAJOR.MINOR>` selector against the latest matching published version.
    expect(packageVersionMajorMinor('1.2.0-rc.1')).toBe('1.2');
  });

  it('falls back to 0.0 when the input is malformed', () => {
    expect(packageVersionMajorMinor('')).toBe('0.0');
  });
});

describe('buildConfigYmlContent', () => {
  it('templates the magic comment with the supplied version', () => {
    const out = buildConfigYmlContent('3.5.0');
    expect(out.split('\n')[0]).toBe(
      '# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@3.5/dist/config.workspace.schema.json',
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
