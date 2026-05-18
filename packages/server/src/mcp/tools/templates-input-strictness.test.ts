import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeObjectSchema,
  safeParseAsync,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register as registerDeleteTemplate } from './delete-template.ts';
import type { ServerInstance } from './shared.ts';
import { register as registerWriteTemplate } from './write-template.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface CapturedInput {
  inputSchema: unknown;
}

function captureInputSchema<TDeps>(
  register: (server: ServerInstance, deps: TDeps) => void,
  deps: TDeps,
): CapturedInput {
  let captured: CapturedInput | null = null;
  const server = {
    registerTool(_name: string, cfg: { inputSchema?: unknown }, _handler: unknown) {
      captured = { inputSchema: cfg.inputSchema };
    },
    tool() {
      throw new Error('not used');
    },
  } as unknown as ServerInstance;
  register(server, deps);
  if (!captured) throw new Error('tool did not register');
  return captured;
}

function newProject(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'ok-templates-input-strict-'));
  mkdirSync(join(cwd, '.ok'), { recursive: true });
  return cwd;
}

async function parseArgs(
  inputSchema: unknown,
  args: Record<string, unknown>,
): Promise<{ success: boolean; errorText: string }> {
  const normalized = normalizeObjectSchema(
    inputSchema as Parameters<typeof normalizeObjectSchema>[0],
  );
  if (!normalized) throw new Error('inputSchema did not normalize to an object schema');
  const result = await safeParseAsync(normalized, args);
  if (result.success) return { success: true, errorText: '' };
  const errAny = (result as { error?: unknown }).error;
  const errorText =
    errAny && typeof errAny === 'object' && 'message' in errAny
      ? String((errAny as { message: unknown }).message)
      : JSON.stringify(errAny);
  return { success: false, errorText };
}

describe('write_template — InputSchema strictness', () => {
  const baseDeps = { config: BASE_CONFIG, resolveCwd: async () => newProject() };
  const validArgs = {
    folder: '',
    name: 'foo',
    body: '# hello',
    frontmatter: { title: 'Hello' },
  };

  test('accepts a well-formed args payload', async () => {
    const { inputSchema } = captureInputSchema(registerWriteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, validArgs);
    expect(result.errorText).toBe('');
    expect(result.success).toBe(true);
  });

  test('rejects stale `target: "user"` with an unrecognized-key error', async () => {
    const { inputSchema } = captureInputSchema(registerWriteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, target: 'user' });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/unrecognized/i);
    expect(result.errorText).toMatch(/target/);
  });

  test('rejects stale `target: "project"` — the entire `target` field is gone', async () => {
    const { inputSchema } = captureInputSchema(registerWriteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, target: 'project' });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/target/);
  });

  test('rejects any unknown key (defense-in-depth — not just `target`)', async () => {
    const { inputSchema } = captureInputSchema(registerWriteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, somethingElse: 1 });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/somethingElse/);
  });
});

describe('delete_template — InputSchema strictness', () => {
  const baseDeps = { config: BASE_CONFIG, resolveCwd: async () => newProject() };
  const validArgs = { folder: '', name: 'foo' };

  test('accepts a well-formed args payload', async () => {
    const { inputSchema } = captureInputSchema(registerDeleteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, validArgs);
    expect(result.errorText).toBe('');
    expect(result.success).toBe(true);
  });

  test('rejects stale `target: "user"` with an unrecognized-key error', async () => {
    const { inputSchema } = captureInputSchema(registerDeleteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, target: 'user' });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/unrecognized/i);
    expect(result.errorText).toMatch(/target/);
  });

  test('rejects stale `target: "project"` — the entire `target` field is gone', async () => {
    const { inputSchema } = captureInputSchema(registerDeleteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, target: 'project' });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/target/);
  });

  test('rejects any unknown key (defense-in-depth — not just `target`)', async () => {
    const { inputSchema } = captureInputSchema(registerDeleteTemplate, baseDeps);
    const result = await parseArgs(inputSchema, { ...validArgs, somethingElse: 1 });
    expect(result.success).toBe(false);
    expect(result.errorText).toMatch(/somethingElse/);
  });
});
