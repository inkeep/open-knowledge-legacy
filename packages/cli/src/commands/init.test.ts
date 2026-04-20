import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { OK_DIR } from '../constants.ts';
import { previewContent } from '../content/preview.ts';
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
    const windsurfConfigPath = (home: string) =>
      join(home, '.codeium', 'windsurf', 'mcp_config.json');

    const findOkEntries = (config: Record<string, unknown>): Record<string, unknown> => {
      const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(servers)) {
        if (k.startsWith('open-knowledge')) out[k] = v;
      }
      return out;
    };

    it('writes to global path with project-qualified key + --cwd baked in', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('windsurf');
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[0].serverKey).toMatch(/^open-knowledge-/);

      const configPath = windsurfConfigPath(fakeHome);
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const okEntries = findOkEntries(config);
      const keys = Object.keys(okEntries);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe(result.editors[0].serverKey);

      const entry = okEntries[keys[0]] as { command: string; args: string[] };
      expect(entry.command).toBe('npx');
      expect(entry.args).toEqual(['@inkeep/open-knowledge', 'mcp', '--cwd', testDir]);
    });

    it('migrates legacy plain open-knowledge entry to project-qualified form', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = windsurfConfigPath(fakeHome);
      mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'open-knowledge': { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] },
          },
        }),
      );

      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });

      expect(result.editors[0].action).toBe('overwritten');
      expect(result.editors[0].serverKey).toMatch(/^open-knowledge-/);
      expect(result.editors[0].migratedFromKey).toBe('open-knowledge');

      // Legacy key must be removed — exactly one open-knowledge-* entry remains.
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers['open-knowledge']).toBeUndefined();
      const okEntries = findOkEntries(config);
      expect(Object.keys(okEntries)).toHaveLength(1);

      const newKey = result.editors[0].serverKey;
      if (newKey === undefined) throw new Error('expected serverKey');
      const entry = config.mcpServers[newKey] as { args: string[] };
      expect(entry.args).toContain('--cwd');
      expect(entry.args).toContain(testDir);
    });

    it('multi-project keys coexist in the same Windsurf config', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const projA = join(testDir, 'projA');
      const projB = join(testDir, 'projB');
      mkdirSync(projA, { recursive: true });
      mkdirSync(projB, { recursive: true });

      const r1 = runInit({ cwd: projA, editors: ['windsurf'], home: fakeHome });
      const r2 = runInit({ cwd: projB, editors: ['windsurf'], home: fakeHome });

      expect(r1.editors[0].action).toBe('written');
      expect(r1.editors[0].serverKey).toBe('open-knowledge-proja');
      expect(r2.editors[0].action).toBe('written');
      expect(r2.editors[0].serverKey).toBe('open-knowledge-projb');

      const config = JSON.parse(readFileSync(windsurfConfigPath(fakeHome), 'utf-8'));
      const okEntries = findOkEntries(config);
      expect(Object.keys(okEntries).sort()).toEqual([
        'open-knowledge-proja',
        'open-knowledge-projb',
      ]);
    });

    it('protected partial-legacy: exact key with --cwd matching current project → skipped-existing', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = windsurfConfigPath(fakeHome);
      mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'open-knowledge': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp', '--cwd', testDir],
            },
          },
        }),
      );

      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });

      // --cwd already present → not a legacy entry; match-by-cwd path finds it → skipped-existing.
      expect(result.editors[0].action).toBe('skipped-existing');
      expect(result.editors[0].serverKey).toBe('open-knowledge');
      expect(result.editors[0].migratedFromKey).toBeUndefined();

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(Object.keys(findOkEntries(config))).toEqual(['open-knowledge']);
    });

    it('protected partial-legacy: exact key with --cwd pointing elsewhere → auto-disambig', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = windsurfConfigPath(fakeHome);
      mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });

      // Use matching basenames so the default slug-key collides and -2 fires.
      // The default key is picked from slugify(basename(cwd)) — if basenames
      // differ, there's no collision and no disambiguation.
      const workNotes = join(testDir, 'work', 'notes');
      const personalNotes = join(testDir, 'personal', 'notes');
      mkdirSync(workNotes, { recursive: true });
      mkdirSync(personalNotes, { recursive: true });

      // Pre-seed an existing `open-knowledge-notes` entry bound to workNotes.
      // Critically, also include an exact 'open-knowledge' key with --cwd
      // pointing at workNotes — this must NOT trigger legacy migration (has
      // --cwd) AND must NOT be matched by the current run (cwd is personalNotes).
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'open-knowledge-notes': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp', '--cwd', workNotes],
            },
            'open-knowledge': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp', '--cwd', workNotes],
            },
          },
        }),
      );

      const result = runInit({ cwd: personalNotes, editors: ['windsurf'], home: fakeHome });

      // Default key `open-knowledge-notes` is taken (bound to workNotes) →
      // auto-disambig writes `open-knowledge-notes-2`.
      expect(result.editors[0].action).toBe('written');
      expect(result.editors[0].serverKey).toBe('open-knowledge-notes-2');
      expect(result.editors[0].disambiguatedFrom).toBe('open-knowledge-notes');
      expect(result.editors[0].migratedFromKey).toBeUndefined();

      // Original 'open-knowledge' and 'open-knowledge-notes' entries untouched.
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcpServers['open-knowledge']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', workNotes],
      });
      expect(config.mcpServers['open-knowledge-notes']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', workNotes],
      });
    });

    it('re-init with same cwd is idempotent (skipped-existing)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const first = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });
      expect(first.editors[0].action).toBe('written');

      const second = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });
      expect(second.editors[0].action).toBe('skipped-existing');
      expect(second.editors[0].serverKey).toBe(first.editors[0].serverKey);
    });
  });

  describe('Codex', () => {
    it('writes .codex/config.toml with mcp_servers table', () => {
      const result = runInit({ cwd: testDir, editors: ['codex'] });

      expect(result.editors).toHaveLength(1);
      expect(result.editors[0].editorId).toBe('codex');
      expect(result.editors[0].action).toBe('written');

      const configPath = join(testDir, '.codex', 'config.toml');
      expect(existsSync(configPath)).toBe(true);

      const config = Bun.TOML.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcp_servers).toBeDefined();
      expect(config.mcp_servers['open-knowledge']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });

    it('preserves existing Codex MCP entries', () => {
      mkdirSync(join(testDir, '.codex'), { recursive: true });
      writeFileSync(
        join(testDir, '.codex', 'config.toml'),
        ['[mcp_servers.other]', 'command = "node"', 'args = ["x"]', ''].join('\n'),
      );

      const result = runInit({ cwd: testDir, editors: ['codex'] });
      expect(result.editors[0].action).toBe('written');

      const config = Bun.TOML.parse(readFileSync(join(testDir, '.codex', 'config.toml'), 'utf-8'));
      expect(config.mcp_servers.other).toEqual({ command: 'node', args: ['x'] });
      expect(config.mcp_servers['open-knowledge']).toEqual({
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp'],
      });
    });
  });

  describe('Claude Desktop', () => {
    // The Claude Desktop config dir on macOS:
    // <home>/Library/Application Support/Claude/claude_desktop_config.json
    const desktopConfigPath = (home: string) =>
      join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

    // Tests run on macOS or Linux dev hosts; gate the macOS-shaped path tests
    // accordingly so the suite is portable. Windows path test mocks platform
    // explicitly below. Linux unsupported-platform test does the same.
    const skipDarwinPath = process.platform !== 'darwin';

    /**
     * Find the open-knowledge* key in a Claude Desktop config (there may be
     * multiple after disambiguation). Returns the entries map keyed by suffix.
     */
    const findOkEntries = (config: Record<string, unknown>): Record<string, unknown> => {
      const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(servers)) {
        if (k.startsWith('open-knowledge')) out[k] = v;
      }
      return out;
    };

    it.skipIf(skipDarwinPath)(
      'fresh write — emits open-knowledge-<slug> key with --cwd baked in',
      () => {
        const fakeHome = join(testDir, 'fakehome');
        mkdirSync(fakeHome, { recursive: true });

        const result = runInit({
          cwd: testDir,
          editors: ['claude-desktop'],
          home: fakeHome,
        });

        expect(result.editors).toHaveLength(1);
        expect(result.editors[0].editorId).toBe('claude-desktop');
        expect(result.editors[0].action).toBe('written');
        expect(result.editors[0].serverKey).toMatch(/^open-knowledge-/);
        expect(result.editors[0].disambiguatedFrom).toBeUndefined();
        expect(result.editors[0].migratedFromKey).toBeUndefined();

        const configPath = desktopConfigPath(fakeHome);
        expect(existsSync(configPath)).toBe(true);

        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        const okEntries = findOkEntries(config);
        const keys = Object.keys(okEntries);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toBe(result.editors[0].serverKey);

        const entry = okEntries[keys[0]] as { command: string; args: string[] };
        expect(entry.command).toBe('npx');
        expect(entry.args).toEqual(['@inkeep/open-knowledge', 'mcp', '--cwd', testDir]);
      },
    );

    it.skipIf(skipDarwinPath)('multi-project keys coexist in the same config', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      // Two distinct project dirs with deterministic basenames.
      const projA = join(testDir, 'projA');
      const projB = join(testDir, 'projB');
      mkdirSync(projA, { recursive: true });
      mkdirSync(projB, { recursive: true });

      const r1 = runInit({ cwd: projA, editors: ['claude-desktop'], home: fakeHome });
      const r2 = runInit({ cwd: projB, editors: ['claude-desktop'], home: fakeHome });

      expect(r1.editors[0].action).toBe('written');
      expect(r1.editors[0].serverKey).toBe('open-knowledge-proja');
      expect(r2.editors[0].action).toBe('written');
      expect(r2.editors[0].serverKey).toBe('open-knowledge-projb');

      const config = JSON.parse(readFileSync(desktopConfigPath(fakeHome), 'utf-8'));
      const okEntries = findOkEntries(config);
      expect(Object.keys(okEntries).sort()).toEqual([
        'open-knowledge-proja',
        'open-knowledge-projb',
      ]);
    });

    it.skipIf(skipDarwinPath)(
      'basename collision triggers -2 disambiguation with conflict hint',
      () => {
        const fakeHome = join(testDir, 'fakehome');
        mkdirSync(fakeHome, { recursive: true });

        // Two project dirs named the same ("notes") under different parents.
        const aNotes = join(testDir, 'work', 'notes');
        const bNotes = join(testDir, 'personal', 'notes');
        mkdirSync(aNotes, { recursive: true });
        mkdirSync(bNotes, { recursive: true });

        const r1 = runInit({ cwd: aNotes, editors: ['claude-desktop'], home: fakeHome });
        const r2 = runInit({ cwd: bNotes, editors: ['claude-desktop'], home: fakeHome });

        expect(r1.editors[0].serverKey).toBe('open-knowledge-notes');
        expect(r1.editors[0].disambiguatedFrom).toBeUndefined();
        expect(r2.editors[0].action).toBe('written');
        expect(r2.editors[0].serverKey).toBe('open-knowledge-notes-2');
        expect(r2.editors[0].disambiguatedFrom).toBe('open-knowledge-notes');

        const config = JSON.parse(readFileSync(desktopConfigPath(fakeHome), 'utf-8'));
        const okEntries = findOkEntries(config);
        expect(Object.keys(okEntries).sort()).toEqual([
          'open-knowledge-notes',
          'open-knowledge-notes-2',
        ]);
      },
    );

    it.skipIf(skipDarwinPath)('re-init with same cwd is idempotent (skipped-existing)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const first = runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });
      expect(first.editors[0].action).toBe('written');

      const second = runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });
      expect(second.editors[0].action).toBe('skipped-existing');
      // Matched key is the same key the first run wrote.
      expect(second.editors[0].serverKey).toBe(first.editors[0].serverKey);
    });

    it.skipIf(skipDarwinPath)(
      'hand-crafted custom-keyed entry is matched by --cwd realpath',
      () => {
        const fakeHome = join(testDir, 'fakehome');
        mkdirSync(fakeHome, { recursive: true });

        // Pre-seed a hand-crafted entry under a non-default key, with --cwd
        // pointing at the current project. Realpath-normalize for portability.
        const configPath = desktopConfigPath(fakeHome);
        mkdirSync(join(fakeHome, 'Library', 'Application Support', 'Claude'), {
          recursive: true,
        });
        writeFileSync(
          configPath,
          JSON.stringify({
            mcpServers: {
              'open-knowledge-bim-tools': {
                command: 'npx',
                args: ['@inkeep/open-knowledge', 'mcp', '--cwd', testDir],
              },
            },
            preferences: { theme: 'dark' },
          }),
        );

        const result = runInit({
          cwd: testDir,
          editors: ['claude-desktop'],
          home: fakeHome,
        });

        expect(result.editors[0].action).toBe('skipped-existing');
        expect(result.editors[0].serverKey).toBe('open-knowledge-bim-tools');

        // Hand-crafted entry survives untouched + preferences key preserved.
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(Object.keys(findOkEntries(config))).toEqual(['open-knowledge-bim-tools']);
        expect((config.preferences as { theme: string }).theme).toBe('dark');
      },
    );

    it.skipIf(skipDarwinPath)('--force overwrites the matched entry', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      // First run lands the entry.
      const first = runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });
      expect(first.editors[0].action).toBe('written');
      const writtenKey = first.editors[0].serverKey;
      if (writtenKey === undefined) throw new Error('expected serverKey on first run');

      // Tamper with the entry's command so we can detect the overwrite.
      const configPath = desktopConfigPath(fakeHome);
      const tampered = JSON.parse(readFileSync(configPath, 'utf-8'));
      tampered.mcpServers[writtenKey].command = 'tampered';
      writeFileSync(configPath, JSON.stringify(tampered));

      // Second run with --force should rewrite the entry.
      const second = runInit({
        cwd: testDir,
        editors: ['claude-desktop'],
        home: fakeHome,
        force: true,
      });
      expect(second.editors[0].action).toBe('overwritten');
      expect(second.editors[0].serverKey).toBe(writtenKey);

      const reread = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(reread.mcpServers[writtenKey].command).toBe('npx');
    });

    it.skipIf(skipDarwinPath)('preserves unrelated top-level keys (e.g. preferences)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const configPath = desktopConfigPath(fakeHome);
      mkdirSync(join(fakeHome, 'Library', 'Application Support', 'Claude'), {
        recursive: true,
      });
      writeFileSync(configPath, JSON.stringify({ preferences: { theme: 'dark', fontSize: 14 } }));

      runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect((config.preferences as { theme: string; fontSize: number }).theme).toBe('dark');
      expect((config.preferences as { theme: string; fontSize: number }).fontSize).toBe(14);
      expect(Object.keys(findOkEntries(config))).toHaveLength(1);
    });

    describe('Windows path resolution', () => {
      const originalPlatform = process.platform;
      const originalAppData = process.env.APPDATA;

      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      });

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
        if (originalAppData === undefined) delete process.env.APPDATA;
        else process.env.APPDATA = originalAppData;
      });

      it('writes to %APPDATA%\\Claude\\claude_desktop_config.json on Windows', () => {
        const fakeHome = join(testDir, 'fakehome');
        const fakeAppData = join(fakeHome, 'AppData', 'Roaming');
        mkdirSync(fakeAppData, { recursive: true });
        process.env.APPDATA = fakeAppData;

        const result = runInit({
          cwd: testDir,
          editors: ['claude-desktop'],
          home: fakeHome,
        });
        expect(result.editors[0].action).toBe('written');

        const configPath = join(fakeAppData, 'Claude', 'claude_desktop_config.json');
        expect(existsSync(configPath)).toBe(true);

        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        const okEntries = findOkEntries(config);
        expect(Object.keys(okEntries)).toHaveLength(1);
      });

      it('falls back to <home>/AppData/Roaming when APPDATA is unset', () => {
        const fakeHome = join(testDir, 'fakehome');
        mkdirSync(join(fakeHome, 'AppData', 'Roaming'), { recursive: true });
        delete process.env.APPDATA;

        const result = runInit({
          cwd: testDir,
          editors: ['claude-desktop'],
          home: fakeHome,
        });
        expect(result.editors[0].action).toBe('written');

        const configPath = join(
          fakeHome,
          'AppData',
          'Roaming',
          'Claude',
          'claude_desktop_config.json',
        );
        expect(existsSync(configPath)).toBe(true);
      });
    });

    describe('unsupported platforms', () => {
      const originalPlatform = process.platform;

      afterEach(() => {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      });

      it('refuses Claude Desktop target on Linux with a friendly message', () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

        const result = runInit({ cwd: testDir, editors: ['claude-desktop'] });
        expect(result.editors).toHaveLength(1);
        expect(result.editors[0].action).toBe('failed');
        expect(result.editors[0].error).toMatch(
          /Claude Desktop is not available on linux\. Supported: macOS, Windows\./,
        );
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

    it('writes project-and-windsurf editors with editors: [claude, cursor, vscode, codex, windsurf]', () => {
      // claude-desktop has platform-specific mocking (macOS / Windows / Linux
      // refusal) that belongs in its own describe block, not in this
      // multi-editor smoke test. See the 'Claude Desktop' describe block below.
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const result = runInit({
        cwd: testDir,
        editors: ['claude', 'cursor', 'vscode', 'codex', 'windsurf'],
        home: fakeHome,
      });

      expect(result.editors).toHaveLength(5);
      for (const editor of result.editors) {
        expect(editor.action).toBe('written');
      }

      expect(existsSync(join(testDir, '.mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(true);
      expect(existsSync(join(testDir, '.codex', 'config.toml'))).toBe(true);
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
        editors: ['claude', 'cursor', 'vscode', 'codex'],
        mcp: false,
      });

      expect(result.editors).toHaveLength(4);
      for (const editor of result.editors) {
        expect(editor.action).toBe('skipped-flag');
      }
      expect(existsSync(join(testDir, '.mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.vscode', 'mcp.json'))).toBe(false);
      expect(existsSync(join(testDir, '.codex', 'config.toml'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Claude Code launch.json scaffolding (US-009 / D-020 / D-031)
  // -----------------------------------------------------------------------

  describe('launch.json scaffolding', () => {
    it('writes a fresh .claude/launch.json pointing at open-knowledge ui', () => {
      const result = runInit({ cwd: testDir });

      expect(result.launchJson).toBeDefined();
      expect(result.launchJson?.action).toBe('created');

      const configPath = join(testDir, '.claude', 'launch.json');
      expect(existsSync(configPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(parsed.configurations).toHaveLength(1);
      const entry = parsed.configurations[0];
      expect(entry.name).toBe('open-knowledge-ui');
      expect(entry.runtimeExecutable).toBe('npx');
      expect(entry.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(entry.port).toBe(3000);
      expect(entry.autoPort).toBeUndefined();
    });

    it('flags a stale open-knowledge-ui entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
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
      expect(result.launchJson?.staleFields).toEqual(expect.arrayContaining(['runtimeArgs']));

      // Unchanged — still the old shape (user must re-run with --force)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed.configurations[0].runtimeArgs).toEqual(['open-knowledge', 'start']);
    });

    it('skips an up-to-date open-knowledge-ui entry without --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
                runtimeExecutable: 'npx',
                runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
                port: 3000,
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

    it('migrates an existing open-knowledge-ui entry on --force', () => {
      const configPath = join(testDir, '.claude', 'launch.json');
      mkdirSync(join(testDir, '.claude'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: '0.0.1',
            configurations: [
              {
                name: 'open-knowledge-ui',
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
      expect(entry.autoPort).toBeUndefined();
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
      const ok = parsed.configurations.find(
        (c: { name: string }) => c.name === 'open-knowledge-ui',
      );
      expect(ok.runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
      expect(ok.autoPort).toBeUndefined();
    });

    it('does NOT scaffold launch.json when Claude is not among selected editors', () => {
      const result = runInit({ cwd: testDir, editors: ['cursor'] });
      expect(result.launchJson).toBeUndefined();
      expect(existsSync(join(testDir, '.claude', 'launch.json'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Per-editor instruction file injection (from main)
  // -----------------------------------------------------------------------

  describe('per-editor instruction file injection', () => {
    it('writes CLAUDE.md when claude editor is selected', () => {
      const result = runInit({ cwd: testDir, editors: ['claude'] });

      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')).toContain(
        '<!-- open-knowledge:begin -->',
      );
      const agentsEntry = result.rootInstructions.find((r) => r.file === 'AGENTS.md');
      const claudeEntry = result.rootInstructions.find((r) => r.file === 'CLAUDE.md');
      expect(agentsEntry?.action).toBe('created');
      expect(claudeEntry?.action).toBe('created');
    });

    it('writes only AGENTS.md for cursor (no rule-file scaffolding)', () => {
      const result = runInit({ cwd: testDir, mcp: false, editors: ['cursor'] });

      // AGENTS.md is the tool-agnostic instruction surface; Cursor picks it up natively.
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes only AGENTS.md for windsurf (no rule-file scaffolding)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = runInit({ cwd: testDir, mcp: false, editors: ['windsurf'], home: fakeHome });

      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'rules', 'open-knowledge.md'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
    });

    it('writes no extra instruction files for vscode (no instructionsPath)', () => {
      const result = runInit({ cwd: testDir, mcp: false, editors: ['vscode'] });

      // Only AGENTS.md — vscode has no instructionsPath
      expect(result.rootInstructions).toHaveLength(1);
      expect(result.rootInstructions[0].file).toBe('AGENTS.md');
      expect(existsSync(join(testDir, '.vscoderules'))).toBe(false);
    });

    it('writes AGENTS.md + CLAUDE.md for claude + cursor + windsurf combined', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = runInit({
        cwd: testDir,
        mcp: false,
        editors: ['claude', 'cursor', 'windsurf'],
        home: fakeHome,
      });

      // Only Claude has an instructionsPath (CLAUDE.md). Cursor + Windsurf read
      // the root AGENTS.md natively, so no extra files are scaffolded for them.
      expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'open-knowledge.mdc'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurf', 'rules', 'open-knowledge.md'))).toBe(false);
      expect(existsSync(join(testDir, '.cursorrules'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(result.rootInstructions).toHaveLength(2);
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

  // -------------------------------------------------------------------------
  // formatInitResult — hint variants for global-scope editors (US-006)
  // -------------------------------------------------------------------------
  describe('formatInitResult hints', () => {
    const skipDarwinPath = process.platform !== 'darwin';

    it.skipIf(skipDarwinPath)(
      'Claude Desktop fresh write emits "quit and relaunch" restart hint',
      () => {
        const fakeHome = join(testDir, 'fakehome');
        mkdirSync(fakeHome, { recursive: true });
        const result = runInit({ cwd: testDir, editors: ['claude-desktop'], home: fakeHome });
        const output = formatInitResult(result, testDir);
        expect(output).toContain('quit and relaunch Claude Desktop to activate');
      },
    );

    it('Windsurf written does NOT emit restart hint (hot-reloads)', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });
      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });
      const output = formatInitResult(result, testDir);
      expect(output).not.toContain('quit and relaunch');
    });

    it('Windsurf legacy migration emits "overwritten — migrated legacy … → …"', () => {
      const fakeHome = join(testDir, 'fakehome');
      const configPath = join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
      mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'open-knowledge': { command: 'npx', args: ['@inkeep/open-knowledge', 'mcp'] },
          },
        }),
      );
      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });
      const output = formatInitResult(result, testDir);
      expect(output).toMatch(/overwritten — migrated legacy open-knowledge → open-knowledge-/);
    });

    it('disambiguation emits "(<old> is already bound to --cwd <cwd>)" hint', () => {
      const fakeHome = join(testDir, 'fakehome');
      mkdirSync(fakeHome, { recursive: true });

      const workNotes = join(testDir, 'work', 'notes');
      const personalNotes = join(testDir, 'personal', 'notes');
      mkdirSync(workNotes, { recursive: true });
      mkdirSync(personalNotes, { recursive: true });

      // First init writes `open-knowledge-notes` bound to workNotes.
      runInit({ cwd: workNotes, editors: ['windsurf'], home: fakeHome });
      // Second init from personalNotes collides → `-2` + hint.
      const result = runInit({ cwd: personalNotes, editors: ['windsurf'], home: fakeHome });

      const output = formatInitResult(result, testDir);
      expect(output).toContain(`(open-knowledge-notes is already bound to --cwd ${workNotes})`);
    });

    it('skipped-existing with non-default key emits "(<matched-key>)" annotation', () => {
      const fakeHome = join(testDir, 'fakehome');
      const configPath = join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
      mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            'open-knowledge-bim-tools': {
              command: 'npx',
              args: ['@inkeep/open-knowledge', 'mcp', '--cwd', testDir],
            },
          },
        }),
      );
      const result = runInit({ cwd: testDir, editors: ['windsurf'], home: fakeHome });
      const output = formatInitResult(result, testDir);
      expect(output).toContain('already configured (open-knowledge-bim-tools)');
    });

    it('project-scoped skipped-existing (default key) has no key annotation', () => {
      // Pre-seed with the default `open-knowledge` key for a project-scoped editor.
      writeFileSync(
        join(testDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { 'open-knowledge': { command: 'npx', args: ['old'] } },
        }),
      );
      const result = runInit({ cwd: testDir, editors: ['claude'] });
      const output = formatInitResult(result, testDir);
      // No `(open-knowledge)` suffix — matching the default key is the common
      // case and doesn't need annotation.
      expect(output).toContain('already configured');
      expect(output).not.toContain('already configured (open-knowledge)');
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

  it('detects Codex when .codex/ exists', () => {
    mkdirSync(join(testDir, '.codex'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toContain('codex');
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

  it('returns all existing-editor targets when their config dirs exist (excluding claude-desktop stub)', () => {
    // claude-desktop is registered in ALL_EDITOR_IDS at US-001 time but its
    // configPath resolves to a non-existent sentinel path so detection never
    // fires on it. Later US-003 wires the real configPath (macOS / Windows)
    // and its detection becomes asserted in the dedicated Claude Desktop
    // describe block.
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    mkdirSync(join(testDir, '.codex'), { recursive: true });
    mkdirSync(join(fakeHome, '.codeium', 'windsurf'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    expect(detected).toEqual(
      expect.arrayContaining(['claude', 'cursor', 'vscode', 'codex', 'windsurf']),
    );
    expect(detected).not.toContain('claude-desktop');
    expect(detected).toHaveLength(5);
  });

  it('preserves EDITOR_TARGETS ordering in return value', () => {
    mkdirSync(join(testDir, '.cursor'), { recursive: true });
    mkdirSync(join(testDir, '.vscode'), { recursive: true });
    mkdirSync(join(testDir, '.codex'), { recursive: true });
    const detected = detectInstalledEditors(testDir, fakeHome);
    // Order comes from ALL_EDITOR_IDS = ['claude', 'cursor', 'vscode', 'codex', 'windsurf']
    expect(detected).toEqual(['claude', 'cursor', 'vscode', 'codex']);
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
