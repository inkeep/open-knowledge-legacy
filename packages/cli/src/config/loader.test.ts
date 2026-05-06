import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

let testDir: string;
let fakeHome: string;

await mock.module('node:os', () => {
  const actual = require('node:os');
  return {
    ...actual,
    homedir: () => fakeHome,
  };
});

const { OK_DIR } = await import('../constants.ts');
const { createProjectConfigResolver, loadConfig } = await import('./loader');

beforeEach(() => {
  testDir = resolve(
    tmpdir(),
    `ok-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
  fakeHome = resolve(testDir, '__home__');
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

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
  test('no config files → all defaults resolve', () => {
    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(0);

    expect(config.content.dir).toBe('.');

    expect(config.server.host).toBe('localhost');
    expect(config.server.openOnAgentEdit).toBe(false);

    expect(config.mcp.autoStart).toBe(true);

    expect(config.appearance.theme).toBeUndefined();
    expect(config.appearance.editorModeDefault).toBeUndefined();
  });

  test('empty YAML file → all defaults resolve', () => {
    writeWorkspaceConfig('');
    const { config } = loadConfig(testDir);

    expect(config.server.host).toBe('localhost');
    expect(config.content.dir).toBe('.');
    expect(config.mcp.autoStart).toBe(true);
  });

  test('comments-only YAML (scaffolded config) → all defaults resolve', () => {
    writeWorkspaceConfig(`
# This is a fully commented config
# content:
#   dir: .
# server:
#   host: localhost
`);
    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(0);
    expect(config.server.host).toBe('localhost');
    expect(config.content.dir).toBe('.');
  });

  test('stale dropped fields (sync.*, persistence.debounceMs, server.port) load via loose-mode (D34)', () => {
    writeWorkspaceConfig(
      'sync:\n  pushIntervalSeconds: 30\npersistence:\n  debounceMs: 2000\nserver:\n  port: 3000\n  host: example.dev\n',
    );
    const { config } = loadConfig(testDir);
    expect(config.server.host).toBe('example.dev');
  });

  test('mcp.autoStart: false disables auto-spawn', () => {
    writeWorkspaceConfig('mcp:\n  autoStart: false\n');
    const { config } = loadConfig(testDir);
    expect(config.mcp.autoStart).toBe(false);
  });

  test('project config overrides a single field, other defaults preserved', () => {
    writeWorkspaceConfig('server:\n  host: 0.0.0.0\n');

    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(1);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.openOnAgentEdit).toBe(false);
    expect(config.content.dir).toBe('.');
  });

  test('project config overrides multiple sections at once', () => {
    writeWorkspaceConfig(`
server:
  host: 0.0.0.0
  openOnAgentEdit: true
mcp:
  autoStart: false
`);
    const { config } = loadConfig(testDir);

    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.openOnAgentEdit).toBe(true);
    expect(config.mcp.autoStart).toBe(false);
    expect(config.mcp.tools.grep.maxResults).toBe(50);
  });

  test('content.include in project config rejects with REMOVED_KEY error directing to .okignore', () => {
    writeWorkspaceConfig(`content:
  include:
    - "**/*.md"
`);
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    const expectedPath = resolve(testDir, OK_DIR, 'config.yml');
    expect(caught?.message).toMatch(
      new RegExp(`${expectedPath.replace(/[/\\.]/g, '\\$&')}:\\d+:\\d+`),
    );
    expect(caught?.message).toContain('content.include');
    expect(caught?.message).toContain('content.dir');
    expect(caught?.message).toContain('.okignore');
    expect(caught?.message).toContain('exclude-only');
  });

  test('content.exclude in project config rejects with REMOVED_KEY error', () => {
    writeWorkspaceConfig(`content:
  exclude:
    - "**/drafts/**"
`);
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    const expectedPath = resolve(testDir, OK_DIR, 'config.yml');
    expect(caught?.message).toMatch(
      new RegExp(`${expectedPath.replace(/[/\\.]/g, '\\$&')}:\\d+:\\d+`),
    );
    expect(caught?.message).toContain('content.exclude');
    expect(caught?.message).toContain('.okignore');
    expect(caught?.message).toContain('1:1 migration');
  });

  test('content.include AND content.exclude together emit BOTH REMOVED_KEY errors in one pass', () => {
    writeWorkspaceConfig(`content:
  include:
    - "**/*.md"
  exclude:
    - "**/drafts/**"
`);
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain('content.include');
    expect(caught?.message).toContain('content.exclude');
    expect(caught?.message).toContain('content.dir');
    expect(caught?.message).toContain('1:1 migration');
  });

  test('partial section override preserves sibling defaults within that section', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    grep:\n      maxResults: 25\n');

    const { config } = loadConfig(testDir);

    expect(config.mcp.tools.grep.maxResults).toBe(25);
    expect(config.mcp.tools.read_document.historyDepth).toBe(5); // sibling preserved
  });

  test('invalid host type throws descriptive error', () => {
    writeWorkspaceConfig('server:\n  host: 12345\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('appearance.theme outside the enum throws', () => {
    writeWorkspaceConfig('appearance:\n  theme: midnight\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('negative mcp.tools.grep.maxResults throws', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    grep:\n      maxResults: -1\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('unknown top-level keys are silently ignored (forward-compat)', () => {
    writeWorkspaceConfig('future_feature:\n  enabled: true\n');
    const { config } = loadConfig(testDir);

    expect(config.server.host).toBe('localhost');
  });

  test('unknown nested keys within known sections are silently ignored', () => {
    writeWorkspaceConfig('server:\n  host: 0.0.0.0\n  unknownKey: hello\n');
    const { config } = loadConfig(testDir);

    expect(config.server.host).toBe('0.0.0.0');
  });

  test('malformed YAML does not crash — returns defaults', () => {
    writeWorkspaceConfig('server:\n  host: [invalid yaml');
    const { config } = loadConfig(testDir);
    expect(config.server.host).toBe('localhost');
  });

  test('schema-invalid project config emits file:line:col in error message', () => {
    const yaml = `mcp:
  tools:
    grep:
      maxResults: "fifty"
`;
    writeWorkspaceConfig(yaml);
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    const expectedPath = resolve(testDir, OK_DIR, 'config.yml');
    expect(caught?.message).toContain(`${expectedPath}:4:`);
    expect(caught?.message).toContain('mcp.tools.grep.maxResults');
  });

  test('source-located error renders code snippet with caret marker', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    grep:\n      maxResults: -5\n');
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain('^');
  });

  test('user-global config is sidelined on schema-invalid (cold-start recovery)', () => {
    expect(() => loadConfig(testDir)).not.toThrow();
  });
});

describe('createProjectConfigResolver', () => {
  test('loads different project configs per cwd', async () => {
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
    writeWorkspaceConfig('server:\n  host: localhost\n');
    const startupConfig = loadConfig(testDir).config;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: testDir,
      startupConfig,
      env: {
        ...process.env,
        HOST: '0.0.0.0',
      },
    });

    await expect(resolveConfig()).resolves.toMatchObject({
      server: { host: '0.0.0.0' },
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

  test('deduplicates concurrent config loads for the same cwd', async () => {
    const projectA = resolve(testDir, 'project-a');
    const projectB = resolve(testDir, 'project-b');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    writeWorkspaceConfigAt(projectB, 'content:\n  dir: docs-b\n');

    const startupConfig = loadConfig(projectA).config;
    let loadCalls = 0;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: projectA,
      startupConfig,
      cacheMs: 10_000,
      loadConfigFn: (cwd) => {
        loadCalls += 1;
        return loadConfig(cwd);
      },
    });

    const [first, second] = await Promise.all([resolveConfig(projectB), resolveConfig(projectB)]);
    expect(first).toMatchObject({ content: { dir: 'docs-b' } });
    expect(second).toMatchObject({ content: { dir: 'docs-b' } });
    expect(loadCalls).toBe(1);
  });

  test('reloads config after cache expiration', async () => {
    const projectA = resolve(testDir, 'project-a');
    const projectB = resolve(testDir, 'project-b');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    writeWorkspaceConfigAt(projectB, 'content:\n  dir: docs-b\n');

    const startupConfig = loadConfig(projectA).config;
    let loadCalls = 0;
    const resolveConfig = createProjectConfigResolver({
      startupCwd: projectA,
      startupConfig,
      cacheMs: 1,
      loadConfigFn: (cwd) => {
        loadCalls += 1;
        return loadConfig(cwd);
      },
    });

    await expect(resolveConfig(projectB)).resolves.toMatchObject({
      content: { dir: 'docs-b' },
    });

    writeWorkspaceConfigAt(projectB, 'content:\n  dir: docs-c\n');
    await wait(5);

    await expect(resolveConfig(projectB)).resolves.toMatchObject({
      content: { dir: 'docs-c' },
    });
    expect(loadCalls).toBe(2);
  });
});
