import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isKnownConfigError } from './errors.ts';
import { resolveConfigPath, writeConfigPatch } from './write-config-patch.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ok-write-config-patch-'));
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

function projectConfigPath(): string {
  return join(testDir, '.ok', 'config.yml');
}

function userConfigPath(homeOverride: string): string {
  return join(homeOverride, '.ok', 'config.yml');
}

describe('writeConfigPatch — project scope', () => {
  test('writes a fresh project config when none exists (lazy first-write)', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });

    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { content: { dir: 'docs' } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.created).toBe(true);
    expect(result.appliedPaths).toContain('content.dir');
    expect(existsSync(projectConfigPath())).toBe(true);
    const onDisk = readFileSync(projectConfigPath(), 'utf-8');
    expect(onDisk).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/unpkg\.com\/@inkeep\/open-knowledge@latest\/dist\/schemas\/v\d+\/config\.project\.schema\.json/,
    );
    expect(onDisk).toContain('content:');
    expect(onDisk).toContain('dir: docs');
  });

  test('mode 0o644 on lazy first-write (config is not secret)', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { content: { dir: '.' } },
    });
    const stats = statSync(projectConfigPath());
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o644);
  });

  test('updates an existing project config and preserves comments', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    const original = `# user-written comment at top
content:
  # inline comment about dir
  dir: .
  include:
    - "**/*.md"
mcp:
  autoStart: true
`;
    writeFileSync(projectConfigPath(), original, 'utf-8');

    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { mcp: { autoStart: false } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.created).toBe(false);

    const onDisk = readFileSync(projectConfigPath(), 'utf-8');
    expect(onDisk).toContain('# user-written comment at top');
    expect(onDisk).toContain('# inline comment about dir');
    expect(onDisk).toContain('autoStart: false');
    expect(onDisk).not.toContain('autoStart: true');
  });

  test('null in patch deletes the field (RFC 7396 spirit)', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    writeFileSync(
      projectConfigPath(),
      `mcp:\n  autoStart: false\n  tools:\n    search:\n      maxResults: 100\n`,
      'utf-8',
    );

    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { mcp: { autoStart: null as any } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const onDisk = readFileSync(projectConfigPath(), 'utf-8');
    expect(onDisk).not.toContain('autoStart:');
    expect(onDisk).toContain('maxResults: 100');
  });
});

describe('writeConfigPatch — user scope', () => {
  test('lazy first-write of ~/.ok/config.yml creates parent dir', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ok-write-config-patch-home-'));
    try {
      expect(existsSync(join(home, '.ok'))).toBe(false);

      const result = await writeConfigPatch({
        cwd: testDir,
        scope: 'user',
        patch: { appearance: { theme: 'dark' } },
        homedirOverride: home,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.created).toBe(true);

      const filePath = userConfigPath(home);
      expect(existsSync(filePath)).toBe(true);

      const onDisk = readFileSync(filePath, 'utf-8');
      expect(onDisk).toContain('theme: dark');
      expect(onDisk).toMatch(/^# yaml-language-server: \$schema=/);

      expect(result.effective.appearance?.theme).toBe('dark');
    } finally {
      if (existsSync(home)) rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('writeConfigPatch — validation failures', () => {
  test('invalid scalar type → SCHEMA_INVALID with structured issues; no fs write', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { appearance: { theme: 42 as any } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(isKnownConfigError(result.error)).toBe(true);
    if (!isKnownConfigError(result.error)) throw new Error('expected known error');
    expect(result.error.code).toBe('SCHEMA_INVALID');
    if (result.error.code !== 'SCHEMA_INVALID') throw new Error('expected SCHEMA_INVALID');
    expect(result.error.issues.length).toBeGreaterThan(0);
    expect(result.error.issues[0].path).toContain('appearance');
    expect(existsSync(projectConfigPath())).toBe(false);
  });

  test('invalid enum value → SCHEMA_INVALID; no fs write', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { appearance: { editorModeDefault: 'vim' as any } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    if (!isKnownConfigError(result.error)) throw new Error('expected known error');
    expect(result.error.code).toBe('SCHEMA_INVALID');
    expect(existsSync(projectConfigPath())).toBe(false);
  });

  test('YAML with malformed syntax → YAML_PARSE; no fs write', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    writeFileSync(
      projectConfigPath(),
      '\tnot: valid\n: : :\n  - broken\n - "unterminated',
      'utf-8',
    );

    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { content: { dir: '.' } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    if (!isKnownConfigError(result.error)) throw new Error('expected known error');
    expect(result.error.code).toBe('YAML_PARSE');
  });
});

describe('writeConfigPatch — defaults preserved on round-trip with stale fields', () => {
  test('config with dropped sync.* field loads via loose-mode and preserves the line on round-trip', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    const original = `sync:
  pushIntervalSeconds: 30
  enabled: true
content:
  dir: .
mcp:
  autoStart: true
`;
    writeFileSync(projectConfigPath(), original, 'utf-8');

    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { mcp: { autoStart: false } },
    });
    expect(result.ok).toBe(true);
    const onDisk = readFileSync(projectConfigPath(), 'utf-8');
    expect(onDisk).toContain('pushIntervalSeconds: 30');
    expect(onDisk).toContain('enabled: true');
    expect(onDisk).toContain('autoStart: false');
  });
});

describe('writeConfigPatch — Result type narrowing', () => {
  test('result.appliedPaths only typechecks inside the result.ok=true branch', async () => {
    mkdirSync(join(testDir, '.ok'), { recursive: true });
    const result = await writeConfigPatch({
      cwd: testDir,
      scope: 'project',
      patch: { content: { dir: '.' } },
    });
    if (result.ok) {
      expect(Array.isArray(result.appliedPaths)).toBe(true);
      expect(result.path).toBe(projectConfigPath());
    } else {
      expect(result.error).toBeDefined();
    }
  });
});

describe('resolveConfigPath', () => {
  test('project scope resolves to <cwd>/.ok/config.yml', () => {
    expect(resolveConfigPath('project', '/abs/proj')).toBe('/abs/proj/.ok/config.yml');
  });

  test('user scope ignores cwd, uses homedirOverride', () => {
    expect(resolveConfigPath('user', '/abs/proj', '/home/alice')).toBe(
      '/home/alice/.ok/config.yml',
    );
  });
});
