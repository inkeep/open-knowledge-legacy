import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
import { createProjectConfigResolver, loadConfig } from './loader';

let testDir: string;

beforeEach(() => {
  testDir = resolve(
    tmpdir(),
    `ok-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Helper: write a workspace config.yml inside testDir */
function writeWorkspaceConfig(yaml: string) {
  const configDir = resolve(testDir, OK_DIR);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(resolve(configDir, 'config.yml'), yaml, 'utf-8');
}

function writeWorkspaceConfigAt(dir: string, yaml: string) {
  const configDir = resolve(dir, OK_DIR);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(resolve(configDir, 'config.yml'), yaml, 'utf-8');
}

describe('loadConfig', () => {
  // ── Defaults ────────────────────────────────────────────────────────

  test('no config files → all defaults resolve', () => {
    const { config, sources } = loadConfig(testDir);

    // sources
    expect(sources).toHaveLength(0);

    // content globs
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.content.exclude).toEqual([]);

    // server — default 0 means kernel-allocated port
    expect(config.server.port).toBe(0);
    expect(config.server.host).toBe('localhost');

    // persistence
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.persistence.maxDebounceMs).toBe(10000);

    // mcp auto-spawn enabled by default
    expect(config.mcp.autoStart).toBe(true);
  });

  test('empty YAML file → all defaults resolve', () => {
    writeWorkspaceConfig('');
    const { config } = loadConfig(testDir);

    expect(config.server.port).toBe(0);
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.mcp.autoStart).toBe(true);
  });

  test('comments-only YAML (scaffolded config) → all defaults resolve', () => {
    writeWorkspaceConfig(`
# This is a fully commented config
# content:
#   include:
#     - "**/*.md"
# server:
#   port: 3000
# persistence:
#   debounceMs: 2000
`);
    const { config, sources } = loadConfig(testDir);

    // Comments-only YAML parses to null, so no source is recorded
    expect(sources).toHaveLength(0);
    expect(config.server.port).toBe(0);
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
  });

  test('explicit server.port: 3000 in config.yml → 3000 (backward compat)', () => {
    writeWorkspaceConfig('server:\n  port: 3000\n');
    const { config } = loadConfig(testDir);
    expect(config.server.port).toBe(3000);
  });

  test('mcp.autoStart: false disables auto-spawn', () => {
    writeWorkspaceConfig('mcp:\n  autoStart: false\n');
    const { config } = loadConfig(testDir);
    expect(config.mcp.autoStart).toBe(false);
  });

  // ── Workspace overrides ─────────────────────────────────────────────

  test('workspace config overrides a single field, other defaults preserved', () => {
    writeWorkspaceConfig('server:\n  port: 5000\n');

    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(1);
    expect(config.server.port).toBe(5000);
    // sibling default preserved
    expect(config.server.host).toBe('localhost');
    // other sections untouched
    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.persistence.debounceMs).toBe(2000);
  });

  test('workspace config overrides multiple sections at once', () => {
    writeWorkspaceConfig(`
server:
  port: 8080
  host: 0.0.0.0
persistence:
  debounceMs: 5000
`);
    const { config } = loadConfig(testDir);

    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.persistence.debounceMs).toBe(5000);
    // sibling default preserved within section
    expect(config.persistence.maxDebounceMs).toBe(10000);
  });

  test('custom content include/exclude patterns', () => {
    writeWorkspaceConfig(`
content:
  include:
    - "**/*.md"
    - "**/*.mdx"
  exclude:
    - "**/drafts/**"
`);
    const { config } = loadConfig(testDir);

    expect(config.content.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.content.exclude).toEqual(['**/drafts/**']);
  });

  test('partial section override preserves sibling defaults within that section', () => {
    writeWorkspaceConfig('persistence:\n  maxDebounceMs: 30000\n');

    const { config } = loadConfig(testDir);

    expect(config.persistence.maxDebounceMs).toBe(30000);
    expect(config.persistence.debounceMs).toBe(2000); // sibling preserved
  });

  // ── Validation ──────────────────────────────────────────────────────

  test('invalid value type throws descriptive error', () => {
    writeWorkspaceConfig('server:\n  port: not-a-number\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('port out of range throws', () => {
    writeWorkspaceConfig('server:\n  port: 99999\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('negative persistence value throws', () => {
    writeWorkspaceConfig('persistence:\n  debounceMs: -1\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('empty include array throws', () => {
    writeWorkspaceConfig('content:\n  include: []\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  test('unknown top-level keys are silently ignored (forward-compat)', () => {
    writeWorkspaceConfig('future_feature:\n  enabled: true\n');
    const { config } = loadConfig(testDir);

    // Still resolves defaults — no crash
    expect(config.server.port).toBe(0);
  });

  test('unknown nested keys within known sections are silently ignored', () => {
    writeWorkspaceConfig('server:\n  port: 4000\n  unknownKey: hello\n');
    const { config } = loadConfig(testDir);

    expect(config.server.port).toBe(4000);
  });

  test('malformed YAML does not crash — returns defaults', () => {
    writeWorkspaceConfig('server:\n  port: [invalid yaml');
    // Malformed YAML is caught by the loader and warned, falls back to defaults
    const { config } = loadConfig(testDir);
    expect(config.server.port).toBe(0);
  });
});

describe('createProjectConfigResolver', () => {
  test('loads different workspace configs per cwd', async () => {
    const projectA = resolve(testDir, 'project-a');
    const projectB = resolve(testDir, 'project-b');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    writeWorkspaceConfigAt(projectA, 'content:\n  dir: docs-a\n');
    writeWorkspaceConfigAt(projectB, 'content:\n  dir: docs-b\n');

    const startupConfig = loadConfig(projectA).config;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: projectA,
      startupConfig,
      cacheMs: 10_000,
    });

    await expect(resolveConfig(projectA)).resolves.toMatchObject({
      content: { dir: 'docs-a' },
    });
    await expect(resolveConfig(projectB)).resolves.toMatchObject({
      content: { dir: 'docs-b' },
    });
  });

  test('applies process env overrides on top of per-cwd config', async () => {
    writeWorkspaceConfig('server:\n  host: localhost\n  port: 3000\n');
    const startupConfig = loadConfig(testDir).config;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: testDir,
      startupConfig,
      env: {
        ...process.env,
        HOST: '0.0.0.0',
        PORT: '4545',
      },
    });

    await expect(resolveConfig()).resolves.toMatchObject({
      server: { host: '0.0.0.0', port: 4545 },
    });
  });

  test('normalizes cwd before config cache lookups', async () => {
    const realProject = resolve(testDir, 'project-real');
    const symlinkProject = resolve(testDir, 'project-link');
    mkdirSync(realProject, { recursive: true });
    symlinkSync(realProject, symlinkProject);

    const startupConfig = loadConfig(realProject).config;
    let loadCalls = 0;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: realProject,
      startupConfig,
      cacheMs: 10_000,
      loadConfigFn: (cwd) => {
        loadCalls += 1;
        return loadConfig(cwd);
      },
    });

    await expect(resolveConfig(symlinkProject)).resolves.toMatchObject(startupConfig);
    expect(loadCalls).toBe(0);
  });
});
