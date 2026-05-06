import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './set-folder-rule.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

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

function readNestedFm(cwd: string, folder: string): string | null {
  const p = folder
    ? join(cwd, folder, '.ok', 'frontmatter.yml')
    : join(cwd, '.ok', 'frontmatter.yml');
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

interface SuccessPayload {
  result: {
    ok: true;
    applied: Array<{ match: string; path: string; action: 'written' | 'deleted' }>;
  };
}
interface ErrorPayload {
  result: { ok: false; error: { code: string; message: string; rule?: string } };
}

describe('set_folder_rule tool — nested .ok/frontmatter.yml writes (FR6)', () => {
  test('writes nested <folder>/.ok/frontmatter.yml for `specs/**`', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs', tags: ['spec'] } }],
    });
    expect(result.isError).toBeUndefined();
    const yaml = readNestedFm(cwd, 'specs');
    expect(yaml).not.toBeNull();
    expect(yaml).toContain('description: Specs');
    expect(yaml).toContain('- spec');

    const payload = result.structuredContent as unknown as SuccessPayload;
    expect(payload.result.ok).toBe(true);
    expect(payload.result.applied).toHaveLength(1);
    expect(payload.result.applied[0]?.match).toBe('specs/**');
    expect(payload.result.applied[0]?.action).toBe('written');
    expect(payload.result.applied[0]?.path).toBe('specs/.ok/frontmatter.yml');
  });

  test('upserts existing nested file in place (per-key replace)', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs', tags: ['spec'] } }],
    });
    await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs (updated)' } }],
    });
    const yaml = readNestedFm(cwd, 'specs');
    expect(yaml).toContain('Specs (updated)');
    expect(yaml).toContain('- spec');
  });

  test('rename via new_match deletes old folder file and writes new', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    await handler({
      rules: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
    });
    expect(readNestedFm(cwd, 'specs')).not.toBeNull();

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
    expect(readNestedFm(cwd, 'specs')).toBeNull(); // old removed
    const newYaml = readNestedFm(cwd, 'design-specs');
    expect(newYaml).toContain('Design Specs');
  });

  test('multi-folder glob is rejected with MULTI_FOLDER_GLOB', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: 'specs/*/evidence/**', frontmatter: { description: 'Evidence' } }],
    });
    expect(result.isError).toBe(true);
    const payload = result.structuredContent as unknown as ErrorPayload;
    expect(payload.result.ok).toBe(false);
    expect(payload.result.error.code).toBe('MULTI_FOLDER_GLOB');
    expect(payload.result.error.message).toContain('multiple folders');
  });

  test('transactional: any rule failure blocks ALL writes', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [
        { match: 'specs/**', frontmatter: { description: 'Specs' } },
        { match: 'reports/*/draft/**', frontmatter: { description: 'Draft Reports' } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(readNestedFm(cwd, 'specs')).toBeNull();
    expect(readNestedFm(cwd, 'reports')).toBeNull();
  });

  test('empty frontmatter on existing rule deletes the nested file + auto-cleans .ok/', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    await handler({
      rules: [{ match: 'meetings/**', frontmatter: { description: 'Meetings' } }],
    });
    expect(readNestedFm(cwd, 'meetings')).not.toBeNull();

    const result = await handler({
      rules: [{ match: 'meetings/**', frontmatter: {} }],
    });
    expect(result.isError).toBeUndefined();
    expect(readNestedFm(cwd, 'meetings')).toBeNull();
    expect(existsSync(join(cwd, 'meetings', '.ok'))).toBe(false);

    const payload = result.structuredContent as unknown as SuccessPayload;
    expect(payload.result.applied[0]?.action).toBe('deleted');
  });

  test('always-array shape works for N=1', async () => {
    const cwd = newProject();
    const handler = captureHandler(cwd);
    const result = await handler({
      rules: [{ match: 'docs/**', frontmatter: { description: 'Docs' } }],
    });
    expect(result.isError).toBeUndefined();
    const payload = result.structuredContent as unknown as SuccessPayload;
    expect(payload.result.ok).toBe(true);
    expect(payload.result.applied).toHaveLength(1);
    expect(payload.result.applied[0]?.path).toBe('docs/.ok/frontmatter.yml');
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
