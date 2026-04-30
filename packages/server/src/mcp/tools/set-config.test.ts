import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../../config/schema.ts';
import { collectPatchLeaves, register } from './set-config.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
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

interface SetConfigArgs {
  patch: Record<string, unknown>;
  cwd?: string;
}

type ToolHandler = (args: SetConfigArgs) => Promise<ToolResult>;

interface MockHomeProject {
  cwd: string;
  home: string;
}

function newProjectWithHome(): MockHomeProject {
  const cwd = mkdtempSync(join(tmpdir(), 'ok-set-config-'));
  const home = mkdtempSync(join(tmpdir(), 'ok-set-config-home-'));
  mkdirSync(join(cwd, '.open-knowledge'), { recursive: true });
  mkdirSync(join(home, '.open-knowledge'), { recursive: true });
  return { cwd, home };
}

function captureHandler(
  project: MockHomeProject,
  configOverride?: (cwd: string) => Promise<Config>,
): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
      captured = h;
    },
    tool() {
      throw new Error('not used');
    },
  } as unknown as ServerInstance;

  const config = configOverride ?? (async () => BASE_CONFIG);
  register(server, {
    config,
    resolveCwd: async () => project.cwd,
    homedirOverride: project.home,
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

function readWorkspaceYaml(cwd: string): string | null {
  const p = join(cwd, '.open-knowledge', 'config.yml');
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

function readUserYaml(home: string): string | null {
  const p = join(home, '.open-knowledge', 'config.yml');
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

describe('collectPatchLeaves', () => {
  test('walks nested object to scalar leaves', () => {
    const leaves = collectPatchLeaves({
      mcp: { tools: { search: { maxResults: 100 } } },
    });
    expect(leaves).toEqual([['mcp', 'tools', 'search', 'maxResults']]);
  });

  test('treats arrays as leaves (no descent)', () => {
    const leaves = collectPatchLeaves({
      folders: [{ match: 'specs/**', frontmatter: {} }],
    });
    expect(leaves).toEqual([['folders']]);
  });

  test('null is a leaf (RFC 7396 clear)', () => {
    const leaves = collectPatchLeaves({
      appearance: { theme: null },
    });
    expect(leaves).toEqual([['appearance', 'theme']]);
  });

  test('multiple leaves across branches', () => {
    const leaves = collectPatchLeaves({
      mcp: { tools: { search: { maxResults: 100 } } },
      content: { include: ['**/*.md'] },
    });
    expect(leaves).toContainEqual(['mcp', 'tools', 'search', 'maxResults']);
    expect(leaves).toContainEqual(['content', 'include']);
    expect(leaves).toHaveLength(2);
  });

  test('skips undefined values', () => {
    const leaves = collectPatchLeaves({
      mcp: { tools: { search: { maxResults: undefined } } },
    });
    expect(leaves).toEqual([]);
  });
});

describe('set_config — happy paths', () => {
  test('writes mcp.tools.search.maxResults to user-global (no scope already set, defaultScope=user)', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { mcp: { tools: { search: { maxResults: 100 } } } },
    });
    expect(result.isError).toBeUndefined();
    const success = result.structuredContent?.result as {
      ok: boolean;
      scope: string;
      applied: string[];
    };
    expect(success.ok).toBe(true);
    expect(success.scope).toBe('user');
    expect(success.applied).toEqual(['mcp.tools.search.maxResults']);

    // user-global file should exist
    const userYaml = readUserYaml(project.home);
    expect(userYaml).toContain('maxResults: 100');
  });

  test('writes folders[] (workspace defaultScope)', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: {
        folders: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
      },
    });
    expect(result.isError).toBeUndefined();
    const success = result.structuredContent?.result as {
      ok: boolean;
      scope: string;
    };
    expect(success.scope).toBe('workspace');
    expect(readWorkspaceYaml(project.cwd)).toContain('match: specs/**');
  });

  test('writes content.include to workspace (defaultScope=workspace)', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { content: { include: ['*.md'] } },
    });
    expect(result.isError).toBeUndefined();
    const success = result.structuredContent?.result as { scope: string };
    expect(success.scope).toBe('workspace');
  });

  test('routes to workspace when path is already set in workspace YAML (scope-inference ladder)', async () => {
    const project = newProjectWithHome();
    // Pre-seed mcp.tools.search.maxResults in workspace YAML so the inspect
    // ladder sees `workspace: true` even though the field's defaultScope=user.
    writeFileSync(
      join(project.cwd, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 75\n',
    );
    const handler = captureHandler(project);
    const result = await handler({
      patch: { mcp: { tools: { search: { maxResults: 200 } } } },
    });
    expect(result.isError).toBeUndefined();
    const success = result.structuredContent?.result as { scope: string };
    expect(success.scope).toBe('workspace');
    const yaml = readWorkspaceYaml(project.cwd);
    expect(yaml).toContain('maxResults: 200');
  });
});

describe('set_config — error paths', () => {
  test('rejects empty patch with SCHEMA_INVALID', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: {} });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as { ok: boolean; error: { code: string } };
    expect(payload.error.code).toBe('SCHEMA_INVALID');
  });

  test('rejects non-allowlisted path with NOT_AGENT_SETTABLE', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { github: { oauthAppClientId: 'evil' } },
    });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as {
      ok: boolean;
      error: { code: string; path: string[] };
    };
    expect(payload.error.code).toBe('NOT_AGENT_SETTABLE');
    expect(payload.error.path).toEqual(['github', 'oauthAppClientId']);
  });

  test('rejects MIXED_SCOPE when leaves resolve to different scopes', async () => {
    // Pre-seed mcp.tools.search.maxResults in user YAML and content.include
    // in workspace YAML so the inspect ladder reports
    // `mcp.tools.search.maxResults` → user, `content.include` → workspace.
    const project = newProjectWithHome();
    writeFileSync(
      join(project.home, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 75\n',
    );
    writeFileSync(
      join(project.cwd, '.open-knowledge', 'config.yml'),
      'content:\n  include:\n    - "*.md"\n',
    );
    const handler = captureHandler(project);
    const result = await handler({
      patch: {
        mcp: { tools: { search: { maxResults: 200 } } },
        content: { include: ['**/*.md'] },
      },
    });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as {
      ok: boolean;
      error: { code: string; paths: Array<{ path: string[]; scope: string }> };
    };
    expect(payload.error.code).toBe('MIXED_SCOPE');
    expect(payload.error.paths).toContainEqual({
      path: ['mcp', 'tools', 'search', 'maxResults'],
      scope: 'user',
    });
    expect(payload.error.paths).toContainEqual({
      path: ['content', 'include'],
      scope: 'workspace',
    });
  });

  test('rejects schema-invalid leaf value with SCHEMA_INVALID + structured issues', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { mcp: { tools: { search: { maxResults: 'not-a-number' } } } },
    });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as {
      error: { code: string; issues: Array<{ path: (string | number)[] }> };
    };
    expect(payload.error.code).toBe('SCHEMA_INVALID');
    expect(payload.error.issues[0]?.path).toEqual(['mcp', 'tools', 'search', 'maxResults']);
  });

  test('error response includes humanFormat + retry framing in content[].text', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { github: { oauthAppClientId: 'evil' } },
    });
    expect(result.content[0]?.text).toContain('Please fix and try again.');
    expect(result.content[0]?.text).toContain('github.oauthAppClientId');
  });
});

describe('set_config — agent-settable allowlist alignment', () => {
  test('content.include is allowed', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: { content: { include: ['*.md'] } } });
    expect(result.isError).toBeUndefined();
  });

  test('content.exclude is allowed', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: { content: { exclude: ['drafts/**'] } } });
    expect(result.isError).toBeUndefined();
  });

  test('content.dir is NOT allowed (defaultScope=workspace, agentSettable=false)', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: { content: { dir: 'docs' } } });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as {
      error: { code: string; path: string[] };
    };
    expect(payload.error.code).toBe('NOT_AGENT_SETTABLE');
    expect(payload.error.path).toEqual(['content', 'dir']);
  });

  test('mcp.tools.read_document.historyDepth is allowed', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({
      patch: { mcp: { tools: { read_document: { historyDepth: 10 } } } },
    });
    expect(result.isError).toBeUndefined();
  });

  test('appearance.theme is NOT allowed (agentSettable=false)', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: { appearance: { theme: 'dark' } } });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as { error: { code: string } };
    expect(payload.error.code).toBe('NOT_AGENT_SETTABLE');
  });

  test('mcp.autoStart is NOT allowed', async () => {
    const project = newProjectWithHome();
    const handler = captureHandler(project);
    const result = await handler({ patch: { mcp: { autoStart: false } } });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent?.result as { error: { code: string } };
    expect(payload.error.code).toBe('NOT_AGENT_SETTABLE');
  });
});
