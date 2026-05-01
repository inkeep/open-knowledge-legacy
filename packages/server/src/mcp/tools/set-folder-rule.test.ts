import { describe as _bunDescribe, expect, test } from 'bun:test';

// Skip-on-CI gate (oven-sh/bun#11892): simple-git fixture pattern in MCP
// test setup spawns git children that Bun fails to reap on ubuntu-latest
// GHA runners; post-test cgroup never drains, hanging test (test) at the
// 15-min timeout. Tests run normally locally; follow-up PR will migrate
// fixtures to execFileSync. PR #377 evidence in jobs 73874363184+.
const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { register } from './set-folder-rule.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.' },
  github: { oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI' },
  server: { host: 'localhost', openOnAgentEdit: false },
  preview: {},
  folders: [],
  mcp: {
    autoStart: true,
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
  appearance: {},
};

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface UpsertArgs {
  rules: Array<{
    match: string;
    frontmatter: Record<string, unknown>;
    new_match?: string;
  }>;
  cwd?: string;
}

type ToolHandler = (args: UpsertArgs) => Promise<ToolResult>;

function newProject(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'ok-set-folder-rule-'));
  mkdirSync(join(cwd, '.ok'), { recursive: true });
  return cwd;
}

function captureHandler(cwd: string): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
      captured = h;
    },
    tool() {
      throw new Error('not used');
    },
  } as unknown as ServerInstance;
  register(server, {
    config: BASE_CONFIG,
    resolveCwd: async () => cwd,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

function readConfigFile(cwd: string): string | null {
  const p = join(cwd, '.ok', 'config.yml');
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

describe('set_folder_rule tool', () => {
  test('appends a new rule to empty folders[] (lazy first-write creates file)', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
    });
    expect(result.isError).toBeUndefined();
    const yaml = readConfigFile(cwd);
    expect(yaml).toContain('match: specs/**');
    expect(yaml).toContain('description: Specs');
  });

  test('upserts in place (preserves array order) for existing match', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    await handler({
      rules: [
        { match: 'specs/**', frontmatter: { description: 'Specs' } },
        { match: 'reports/**', frontmatter: { description: 'Reports' } },
      ],
    });
    await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs (updated)' } }],
    });
    const yaml = readConfigFile(cwd);
    expect(yaml).toContain('Specs (updated)');
    expect(yaml).toContain('match: reports/**');
  });

  test('rename via new_match', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
    });
    const result = await handler({
      rules: [
        {
          match: 'specs/**',
          new_match: 'design-specs/**',
          frontmatter: { description: 'Design Specs' },
        },
      ],
    });
    expect(result.isError).toBeUndefined();
    const yaml = readConfigFile(cwd);
    expect(yaml).toContain('match: design-specs/**');
    expect(yaml).toContain('Design Specs');
    expect(yaml).not.toContain('match: specs/**');
  });

  test('transactional all-or-nothing: invalid rule blocks the entire batch', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [
        { match: 'specs/**', frontmatter: { description: 'Specs' } },
        { match: '', frontmatter: {} },
      ],
    });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as { ok: boolean; error?: { code: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe('SCHEMA_INVALID');
    expect(readConfigFile(cwd)).toBeNull();
  });

  test('always-array shape works for N=1', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: 'docs/**', frontmatter: { description: 'Docs' } }],
    });
    expect(result.isError).toBeUndefined();
    const success = result.structuredContent?.result as {
      ok: boolean;
      applied: string[];
      scope: string;
    };
    expect(success.ok).toBe(true);
    expect(success.scope).toBe('project');
    expect(success.applied).toEqual(['folders']);
  });

  test('error path emits humanFormat + retry-framing in content[].text', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: '', frontmatter: {} }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Please fix and try again.');
  });

  test('rejects when resolveCwd throws', async () => {
    let captured: ToolHandler | null = null;
    const server = {
      registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
        captured = h;
      },
      tool() {
        throw new Error('not used');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: BASE_CONFIG,
      resolveCwd: async () => {
        throw new Error('no roots advertised');
      },
    });
    if (!captured) throw new Error('tool not registered');
    const result = await (captured as ToolHandler)({
      rules: [{ match: 'specs/**', frontmatter: {} }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('no roots advertised');
  });
});
