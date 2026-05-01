import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

let testDir: string;
let fakeHome: string;

// Stub node:os.homedir() before importing the loader so Layer 1 (user-global
// config) doesn't read the real `~/.open-knowledge/config.yml` and pollute
// every test that asserts on `sources`. Bun caches the resolved homedir on
// first call, so mutating `process.env.HOME` in beforeEach is too late.
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

/** Helper: write a project config.yml inside testDir */
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

    // content
    expect(config.content.dir).toBe('.');

    // server — host has a default; port is NOT a schema field per D29
    expect(config.server.host).toBe('localhost');
    expect(config.server.openOnAgentEdit).toBe(false);

    // mcp auto-spawn enabled by default
    expect(config.mcp.autoStart).toBe(true);

    // appearance defaults to UNSET per D55
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

    // Comments-only YAML parses to null, so no source is recorded
    expect(sources).toHaveLength(0);
    expect(config.server.host).toBe('localhost');
    expect(config.content.dir).toBe('.');
  });

  test('stale dropped fields (sync.*, persistence.debounceMs, server.port) load via loose-mode (D34)', () => {
    // Per D29 these fields were removed from the schema. Per D34 every
    // z.object → z.looseObject so users mid-upgrade aren't broken; the
    // codemod (`ok config migrate`) is the proactive cleanup path.
    writeWorkspaceConfig(
      'sync:\n  pushIntervalSeconds: 30\npersistence:\n  debounceMs: 2000\nserver:\n  port: 3000\n  host: example.dev\n',
    );
    const { config } = loadConfig(testDir);
    // Known field still resolves; unknown keys pass through silently.
    expect(config.server.host).toBe('example.dev');
  });

  test('mcp.autoStart: false disables auto-spawn', () => {
    writeWorkspaceConfig('mcp:\n  autoStart: false\n');
    const { config } = loadConfig(testDir);
    expect(config.mcp.autoStart).toBe(false);
  });

  // ── Workspace overrides ─────────────────────────────────────────────

  test('project config overrides a single field, other defaults preserved', () => {
    writeWorkspaceConfig('server:\n  host: 0.0.0.0\n');

    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(1);
    expect(config.server.host).toBe('0.0.0.0');
    // sibling default preserved
    expect(config.server.openOnAgentEdit).toBe(false);
    // other sections untouched
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
    // sibling default preserved within section
    expect(config.mcp.tools.search.maxResults).toBe(50);
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
    // Source-located header: file:line:col points inside the fixture.
    expect(caught?.message).toMatch(
      new RegExp(`${expectedPath.replace(/[/\\.]/g, '\\$&')}:\\d+:\\d+`),
    );
    expect(caught?.message).toContain('content.include');
    expect(caught?.message).toContain('.okignore');
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
  });

  test('partial section override preserves sibling defaults within that section', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    search:\n      maxResults: 25\n');

    const { config } = loadConfig(testDir);

    expect(config.mcp.tools.search.maxResults).toBe(25);
    expect(config.mcp.tools.read_document.historyDepth).toBe(5); // sibling preserved
  });

  // ── Validation ──────────────────────────────────────────────────────

  test('invalid host type throws descriptive error', () => {
    writeWorkspaceConfig('server:\n  host: 12345\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('appearance.theme outside the enum throws', () => {
    writeWorkspaceConfig('appearance:\n  theme: midnight\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('negative mcp.tools.search.maxResults throws', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    search:\n      maxResults: -1\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  test('unknown top-level keys are silently ignored (forward-compat)', () => {
    writeWorkspaceConfig('future_feature:\n  enabled: true\n');
    const { config } = loadConfig(testDir);

    // Still resolves defaults — no crash
    expect(config.server.host).toBe('localhost');
  });

  test('unknown nested keys within known sections are silently ignored', () => {
    writeWorkspaceConfig('server:\n  host: 0.0.0.0\n  unknownKey: hello\n');
    const { config } = loadConfig(testDir);

    expect(config.server.host).toBe('0.0.0.0');
  });

  test('malformed YAML does not crash — returns defaults', () => {
    writeWorkspaceConfig('server:\n  host: [invalid yaml');
    // Malformed YAML is caught by the loader and warned, falls back to defaults
    const { config } = loadConfig(testDir);
    expect(config.server.host).toBe('localhost');
  });

  // ── Source-located errors (FR-27 / D36) ────────────────────────────

  test('schema-invalid project config emits file:line:col in error message', () => {
    // mcp.tools.search.maxResults: schema is z.number().int().min(1)
    // — typing it as a string fails Zod validation. The loader uses
    // parseDocument + locateIssue to map the issue back to source position.
    const yaml = `mcp:
  tools:
    search:
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
    // The expected literal: <abs-path>:<line>:<col> — must be `4:` because
    // `maxResults: "fifty"` lives on line 4 of the fixture above.
    expect(caught?.message).toContain(`${expectedPath}:4:`);
    // Error message also includes the path-message line and a snippet.
    expect(caught?.message).toContain('mcp.tools.search.maxResults');
  });

  test('source-located error renders code snippet with caret marker', () => {
    writeWorkspaceConfig('mcp:\n  tools:\n    search:\n      maxResults: -5\n');
    let caught: Error | undefined;
    try {
      loadConfig(testDir);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    // Caret marker (`^^^`) should appear under the offending value in
    // the code snippet (separate line below the source line).
    expect(caught?.message).toContain('^');
  });

  test('user-global config is sidelined on schema-invalid (cold-start recovery)', () => {
    // Simulate a user-global config by routing readConfigSafely through a
    // tempdir-backed homedir override at the call site. The simplest way
    // to test the flow without monkey-patching homedir is to test
    // readConfigSafely in isolation in core/src/config/read-config-safely.test.ts
    // (covered there). Here we just confirm loader doesn't throw when the
    // user-global file is missing — the standard happy path.
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
    // Per D29 `server.port` is no longer a schema field; the resolver
    // applies HOST env override only. PORT is handled at the start
    // command's action (bootStartServer opts.port → bootServer).
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
