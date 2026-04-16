import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { OK_DIR } from '../constants.ts';
import { previewContent } from '../content/preview.ts';
import { ALL_EDITOR_IDS } from './editors.ts';
import { detectInstalledEditors, formatInitResult, runInit } from './init.ts';

describe('runInit', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `init-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Original tests — backward compat (default editors: ['claude'])
  // -----------------------------------------------------------------------

  it('scaffolds .open-knowledge/ and writes a fresh .mcp.json', () => {
    const result = runInit({ cwd: testDir });

    expect(result.contentCreated.length).toBeGreaterThan(0);
    // Post-V0-24.2 scaffold: config-only, no content subdirs
    expect(existsSync(join(testDir, OK_DIR, 'cache'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'articles'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'external-sources'))).toBe(false);
    expect(existsSync(join(testDir, OK_DIR, 'research'))).toBe(false);

    // Backward-compat fields
    expect(result.mcpAction).toBe('written');
    const mcpPath = join(testDir, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);

    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });

    // New editors array
    expect(result.editors).toHaveLength(1);
    expect(result.editors[0].editorId).toBe('claude');
    expect(result.editors[0].action).toBe('written');
  });

  it('preserves other mcpServers entries when adding open-knowledge', () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            someOtherServer: {
              command: 'node',
              args: ['./other.js'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('written');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers.someOtherServer).toEqual({
      command: 'node',
      args: ['./other.js'],
    });
    expect(config.mcpServers['open-knowledge']).toBeDefined();
  });

  it('skips existing open-knowledge entry by default', () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'node',
              args: ['./packages/cli/dist/cli.mjs', 'mcp'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('skipped-existing');
    expect(result.editors[0].action).toBe('skipped-existing');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['open-knowledge'].command).toBe('node');
    expect(config.mcpServers['open-knowledge'].args).toEqual([
      './packages/cli/dist/cli.mjs',
      'mcp',
    ]);
  });

  it('overwrites existing open-knowledge entry with --force', () => {
    writeFileSync(
      join(testDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'open-knowledge': {
              command: 'node',
              args: ['./old/path.js'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runInit({ cwd: testDir, force: true });
    expect(result.mcpAction).toBe('overwritten');

    const config = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    });
  });

  it('does not touch .mcp.json when --no-mcp is passed', () => {
    const result = runInit({ cwd: testDir, mcp: false });

    expect(result.mcpAction).toBe('skipped-flag');
    expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);

    // But the .open-knowledge/ config scaffold IS created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, OK_DIR, 'config.yml'))).toBe(true);
  });

  it('is idempotent — running twice produces the same end state', () => {
    const firstResult = runInit({ cwd: testDir });
    expect(firstResult.mcpAction).toBe('written');
    expect(firstResult.contentCreated.length).toBeGreaterThan(0);

    const firstConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');

    const secondResult = runInit({ cwd: testDir });
    expect(secondResult.mcpAction).toBe('skipped-existing');
    expect(secondResult.contentCreated.length).toBe(0);
    expect(secondResult.contentSkipped.length).toBeGreaterThan(0);

    const secondConfig = readFileSync(join(testDir, '.mcp.json'), 'utf-8');
    expect(secondConfig).toBe(firstConfig);
  });

  it('returns failed mcpAction when .mcp.json is invalid JSON', () => {
    writeFileSync(join(testDir, '.mcp.json'), '{not valid json');

    const result = runInit({ cwd: testDir });
    expect(result.mcpAction).toBe('failed');
    expect(result.mcpError).toMatch(/invalid JSON/i);

    // Config scaffold should still have been created
    expect(existsSync(join(testDir, OK_DIR, 'AGENTS.md'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Multi-editor tests
  // -----------------------------------------------------------------------

  describe('Cursor', () => {
    it('writes .cursor/mcp.json with mcpServers key', () => {
      const result = runInit({ cwd: testDir, editors: ['cursor'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('cursor');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(testDir, '.cursor', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers['open-knowledge']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('preserves existing Cursor MCP entries', () => {
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { other: { command: 'node', args: ['x'] } } }, null, 2),
      );

      const result = runInit({ cwd: testDir, editors: ['cursor'] });
      expect(result.editors[0].action).toBe('written');

      const config = JSON.parse(readFileSync(join(testDir, '.cursor', 'mcp.json'), 'utf-8'));
      expect(config.mcpServers.other).toEqual({ command: 'node', args: ['x'] });
      expect(config.mcpServers['open-knowledge']).toBeDefined();
    });
  });

  describe('VS Code', () => {
    it('writes .vscode/mcp.json with servers key and type: stdio', () => {
      const result = runInit({ cwd: testDir, editors: ['vscode'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('vscode');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(testDir, '.vscode', 'mcp.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      // VS Code uses 'servers' not 'mcpServers'
      expect(config.servers).toBeDefined();
      expect(config.mcpServers).toBeUndefined();
      expect(config.servers['open-knowledge']).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('Windsurf', () => {
    it('writes to global path using home override', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('windsurf');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers['open-knowledge']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('multi-editor', () => {
    it('writes Claude + Cursor configs in a single run', () => {
      const result = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });

      expect(result.editors).toHaveLength(2);
      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('written');

      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
    });

    it('writes all four editors with editors: all', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({
        cwd: testDir,
        editors: [...ALL_EDITOR_IDS],
        home: fakeHome,
      });

      expect(result.editors).toHaveLength(4);
      for (const editor of result.editors) {
        expect(editor.action).toBe('written');
      }

      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(true);
      expect(existsSync(join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json'))).toBe(true);
    });

    it('--force overwrites across all targeted editors', () => {
      // Pre-populate Claude and Cursor with old entries
      writeFileSync(
        join(testDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(
        join(testDir, '.cursor', 'mcp.json'),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'old', args: [] } },
        }),
      );

      const result = runInit({
        cwd: testDir,
        editors: ['claude', 'cursor'],
        force: true,
      });

      expect(result.editors[0].action).toBe('overwritten');
      expect(result.editors[1].action).toBe('overwritten');

      const claude = JSON.parse(readFileSync(join(testDir, '.mcp.json'), 'utf-8'));
      expect(claude.mcpServers['open-knowledge'].command).toBe('npx');

      const cursor = JSON.parse(readFileSync(join(testDir, '.cursor', 'mcp.json'), 'utf-8'));
      expect(cursor.mcpServers['open-knowledge'].command).toBe('npx');
    });

    it('partial failure — one editor fails, others succeed', () => {
      // Write invalid JSON to Cursor config
      mkdirSync(join(testDir, '.cursor'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'mcp.json'), '{broken');

      const result = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });

      expect(result.editors[0].editorId).toBe('claude');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[1].editorId).toBe('cursor');
      expect(result.editors[1].action).toBe('failed');
      expect(result.editors[1].error).toMatch(/invalid JSON/i);
    });

    it('idempotent per-editor across two runs', () => {
      const first = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });
      expect(first.editors.every((e) => e.action === 'written')).toBe(true);

      const second = runInit({ cwd: testDir, editors: ['claude', 'cursor'] });
      expect(second.editors.every((e) => e.action === 'skipped-existing')).toBe(true);
    });

    it('--no-mcp skips all editors', () => {
      const result = runInit({
        cwd: testDir,
        editors: ['claude', 'cursor', 'vscode'],
        mcp: false,
      });

      expect(result.editors).toHaveLength(3);
      for (const editor of result.editors) {
        expect(editor.action).toBe('skipped-flag');
      }
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Claude Code launch.json scaffolding (US-009 / D-020 / D-031)
  // -----------------------------------------------------------------------

  describe('launch.json scaffolding', () => {
    it('writes a fresh .claude/launch.json pointing at ok ui with autoPort', () => {
      const result = runInit({ cwd: testDir });

      expect(result.launchJson).toBeDefined();
      expect(result.launchJson?.action).toBe('created');

      const configPath = join(testDir, '.claude', 'launch.json');
      expect(existsSync(configPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(parsed.configurations).toHaveLength(1);
      const entry = parsed.configurations[0];
      expect(entry.name).toBe('open-knowledge');
      expect(entry.runtimeExecutable).toBe('npx');
      expect(entry.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(entry.port).toBe(3000);
      expect(entry.autoPort).toBe(true);
    });

    it('flags a stale open-knowledge entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge',
                runtimeExecutable: 'npx',
                runtimeArgs: ['open-knowledge', 'start'],
                port: 3000,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('skipped-stale');
      expect(result.launchJson?.staleFields).toEqual(
        expect.arrayContaining(['runtimeArgs', 'autoPort']),
      );

      // Unchanged — still the old shape (user must re-run with --force)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations[0].runtimeArgs).toEqual(['open-knowledge', 'start']);
      expect(parsed.configurations[0].autoPort).toBeUndefined();
    });

    it('skips an up-to-date open-knowledge entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge',
                runtimeExecutable: 'npx',
                runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
                port: 3000,
                autoPort: true,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('skipped-existing');
      expect(result.launchJson?.staleFields).toBeUndefined();
    });

    it('migrates an existing open-knowledge entry on --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge',
                runtimeExecutable: 'npx',
                runtimeArgs: ['open-knowledge', 'start'],
                port: 3000,
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir, force: true });
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations).toHaveLength(1);
      const entry = parsed.configurations[0];
      expect(entry.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(entry.port).toBe(3000);
      expect(entry.autoPort).toBe(true);
    });

    it('merges the new entry into an existing launch.json with other configurations', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'some-other-server',
                runtimeExecutable: 'node',
                runtimeArgs: ['./server.js'],
              },
            ],
          },
          null,
          2,
        ),
      );

      const result = runInit({ cwd: testDir });
      expect(result.launchJson?.action).toBe('merged');

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations).toHaveLength(2);
      const ok = parsed.configurations.find((c: { name: string }) => c.name === 'open-knowledge');
      expect(ok.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(ok.autoPort).toBe(true);
    });

    it('does NOT scaffold launch.json when Claude is not among selected editors', () => {
      const result = runInit({ cwd: testDir, editors: ['cursor'] });
      expect(result.launchJson).toBeUndefined();
      expect(existsSync(join(testDir, '.claude', 'launch.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Content preview integration (US-002)
  // -----------------------------------------------------------------------

  describe('content preview in init output', () => {
    it('renders Content block with file count and sample when preview succeeds', () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = runInit({ cwd: testDir, mcp: false });

      const preview = previewContent({
        projectDir: testDir,
        contentDir: testDir,
        include: ['**/*.md'],
        exclude: [],
      });
      result.preview = preview;

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
      expect(output).toContain('Scope: include=');
      expect(output).toContain('Re-check anytime: open-knowledge preview');
    });

    it('renders warning line when preview is undefined with previewWarning', () => {
      const result = runInit({ cwd: testDir, mcp: false });
      result.preview = undefined;
      result.previewWarning = 'something went wrong';

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content preview unavailable: something went wrong');
      expect(output).not.toContain('Found');
    });

    it('omits Sample line when preview.totalCount is 0', () => {
      const result = runInit({ cwd: testDir, mcp: false });
      result.preview = {
        totalCount: 0,
        sample: [],
        contentDir: testDir,
        include: ['**/*.md'],
        exclude: [],
        warnings: [],
      };

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Found 0 markdown files');
      expect(output).not.toContain('Sample:');
    });

    it('loadConfig + previewContent integration: preview picks up scaffolded config', () => {
      writeFileSync(join(testDir, 'readme.md'), '# Readme');
      mkdirSync(join(testDir, 'docs'));
      writeFileSync(join(testDir, 'docs', 'guide.md'), '# Guide');

      const result = runInit({ cwd: testDir, mcp: false });

      const { config } = loadConfig(testDir);
      const contentDir = resolve(testDir, config.content.dir);
      const preview = previewContent({
        projectDir: testDir,
        contentDir,
        include: config.content.include,
        exclude: config.content.exclude,
      });
      result.preview = preview;

      expect(preview.totalCount).toBeGreaterThanOrEqual(2);
      expect(preview.sample.some((p) => p.includes('readme.md'))).toBe(true);

      const output = formatInitResult(result, testDir);
      expect(output).toContain('Content:');
      expect(output).toContain(`Found ${preview.totalCount} markdown files`);
    });
  });
});

// ---------------------------------------------------------------------------
// detectInstalledEditors — US-013 / FR-3.1 / D-013
// ---------------------------------------------------------------------------

describe('detectInstalledEditors', () => {
  let testDir: string;
  let fakeHome: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `detect-editors-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    fakeHome = join(testDir, 'fakehome');
    mkdirSync(fakeHome, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('always detects Claude because its config dir is cwd itself', () => {
    // No sibling dirs created; Claude's configPath is <cwd>/.mcp.json → dirname is cwd → exists
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('claude');
  });

  it('detects Cursor when .cursor/ exists', () => {
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('cursor');
  });

  it('does NOT detect Cursor when .cursor/ is absent', () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('cursor');
  });

  it('detects VS Code when .vscode/ exists', () => {
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('vscode');
  });

  it('detects Windsurf when ~/.codeium/windsurf/ exists (via home override)', () => {
    mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('windsurf');
  });

  it('does NOT detect Windsurf when ~/.codeium/windsurf/ is absent', () => {
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).not.toContain('windsurf');
  });

  it('returns all four when all editor config dirs exist', () => {
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(expect.arrayContaining([...ALL_EDITOR_IDS]));
    expect(detected).toHaveLength(4);
  });

  it('preserves EDITOR_TARGETS ordering in return value', () => {
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    // Order comes from ALL_EDITOR_IDS = ['claude', 'cursor', 'vscode', 'windsurf']
    expect(detected).toEqual(['claude', 'cursor', 'vscode']);
  });

  it('returns empty list when the cwd itself does not exist (zero-detected edge case)', () => {
    // Synthesizes the "zero detected" non-TTY fallback path that exit 1s.
    // In real filesystems, cwd always exists (so Claude is always detected),
    // but with a synthetic nonexistent cwd + home, every editor's dirname
    // misses → no detections.
    const missingCwd = join(testDir, 'does-not-exist');
    const missingHome = join(testDir, 'also-not-here');
    const detected = detectInstalledEditors(missingCwd, missingHome);
    expect(detected).toEqual([]);
  });
});
