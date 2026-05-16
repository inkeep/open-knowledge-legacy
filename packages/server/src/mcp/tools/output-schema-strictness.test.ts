import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv.js';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register as registerDeleteTemplate } from './delete-template.ts';
import { register as registerDiscover } from './discover.ts';
import { register as registerGetComponents } from './get-components.ts';
import { register as registerGetConfig } from './get-config.ts';
import { register as registerGrep } from './grep.ts';
import { registerAllTools } from './index.ts';
import { register as registerSearch } from './search.ts';
import { register as registerSetFolderRule } from './set-folder-rule.ts';
import type { ServerInstance } from './shared.ts';
import { register as registerWriteTemplate } from './write-template.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type AnyHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface Captured {
  cfg: {
    outputSchema?: Record<string, unknown>;
  };
  handler: AnyHandler;
}

function captureRegistration<TDeps>(
  register: (server: ServerInstance, deps: TDeps) => void,
  deps: TDeps,
): Captured {
  let captured: Captured | null = null;
  const server = {
    registerTool(_name: string, cfg: Captured['cfg'], handler: AnyHandler) {
      captured = { cfg, handler };
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
  const cwd = mkdtempSync(join(tmpdir(), 'ok-output-strict-'));
  mkdirSync(join(cwd, '.ok'), { recursive: true });
  return cwd;
}

function compileOutputSchemaForClient(rawShape: unknown): Record<string, unknown> {
  const normalized = normalizeObjectSchema(rawShape);
  if (!normalized) {
    throw new Error('outputSchema did not normalize to an object schema');
  }
  return toJsonSchemaCompat(normalized, {
    strictUnions: true,
    pipeStrategy: 'output',
  }) as Record<string, unknown>;
}

function validateStrict(
  jsonSchema: Record<string, unknown>,
  data: unknown,
): {
  valid: boolean;
  error?: string;
} {
  const validator = new AjvJsonSchemaValidator();
  const fn = validator.getValidator(jsonSchema);
  const result = fn(data);
  if (result.valid) return { valid: true };
  return { valid: false, error: result.errorMessage };
}

describe('MCP outputSchema strictness — structuredContent must validate (PRD-6655 + PRD-6656)', () => {
  test('discover: structuredContent validates against compiled outputSchema (PRD-6656)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(registerDiscover, {
      config: BASE_CONFIG,
      resolveCwd: async () => cwd,
    });
    const result = await captured.handler({});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const jsonSchema = compileOutputSchemaForClient(captured.cfg.outputSchema);
    const validation = validateStrict(jsonSchema, result.structuredContent);
    expect(validation.error).toBeUndefined();
    expect(validation.valid).toBe(true);
  });

  test('set_folder_rule (success path): structuredContent validates against compiled outputSchema (PRD-6655)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(registerSetFolderRule, {
      config: BASE_CONFIG,
      resolveCwd: async () => cwd,
    });
    const result = await captured.handler({
      rules: [{ match: 'projects/**', frontmatter: { tags: ['project'] } }],
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();

    const jsonSchema = compileOutputSchemaForClient(captured.cfg.outputSchema);
    const validation = validateStrict(jsonSchema, result.structuredContent);
    expect(validation.error).toBeUndefined();
    expect(validation.valid).toBe(true);
  });

  test('set_folder_rule (error path): error structuredContent ALSO validates', async () => {
    const cwd = newProject();
    const captured = captureRegistration(registerSetFolderRule, {
      config: BASE_CONFIG,
      resolveCwd: async () => cwd,
    });
    const result = await captured.handler({
      rules: [{ match: 'specs/*/evidence/**', frontmatter: {} }],
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeDefined();

    const jsonSchema = compileOutputSchemaForClient(captured.cfg.outputSchema);
    const validation = validateStrict(jsonSchema, result.structuredContent);
    expect(validation.error).toBeUndefined();
    expect(validation.valid).toBe(true);
  });
});

describe('MCP outputSchema strictness — every registerTool+textPlusStructured tool must admit `text`', () => {
  function compileFromRegistration<TDeps>(
    register: (server: ServerInstance, deps: TDeps) => void,
    deps: TDeps,
  ): Record<string, unknown> {
    const captured = captureRegistration(register, deps);
    return compileOutputSchemaForClient(captured.cfg.outputSchema);
  }

  const cwd = newProject();
  const deps = { config: BASE_CONFIG, resolveCwd: async () => cwd };
  const depsWithServer = {
    config: BASE_CONFIG,
    resolveCwd: async () => cwd,
    serverUrl: undefined,
  };

  const cases: Array<{ name: string; build: () => Record<string, unknown> }> = [
    { name: 'discover', build: () => compileFromRegistration(registerDiscover, deps) },
    { name: 'set_folder_rule', build: () => compileFromRegistration(registerSetFolderRule, deps) },
    { name: 'write_template', build: () => compileFromRegistration(registerWriteTemplate, deps) },
    {
      name: 'delete_template',
      build: () => compileFromRegistration(registerDeleteTemplate, deps),
    },
    { name: 'get_config', build: () => compileFromRegistration(registerGetConfig, deps) },
    {
      name: 'get_components',
      build: () => compileFromRegistration(registerGetComponents, deps),
    },
    { name: 'grep', build: () => compileFromRegistration(registerGrep, depsWithServer) },
    { name: 'search', build: () => compileFromRegistration(registerSearch, depsWithServer) },
  ];

  for (const { name, build } of cases) {
    test(`${name}: outputSchema admits the auto-injected \`text\` field`, () => {
      const jsonSchema = build();
      const validator = new AjvJsonSchemaValidator();
      const probe = { text: 'mirror body' };
      const fn = validator.getValidator(jsonSchema);
      const result = fn(probe);
      if (!result.valid) {
        expect(result.errorMessage).not.toMatch(/additional propert/i);
      }
    });
  }
});

describe('MCP outputSchema strictness — auto-discovered registerTool sweep (no new tools may regress)', () => {
  interface RegisterToolCapture {
    name: string;
    outputSchema?: unknown;
  }

  function captureAllRegistrations(cwd: string): RegisterToolCapture[] {
    const captured: RegisterToolCapture[] = [];
    const server = {
      registerTool(name: string, cfg: { outputSchema?: unknown }, _handler: unknown) {
        captured.push({ name, outputSchema: cfg.outputSchema });
      },
      tool() {},
    } as unknown as ServerInstance;
    registerAllTools(server, {
      config: BASE_CONFIG,
      resolveCwd: async () => cwd,
      serverUrl: undefined,
    });
    return captured;
  }

  const KNOWN_REGISTER_TOOL_NAMES = new Set([
    'delete_template',
    'discover',
    'get_components',
    'get_config',
    'grep',
    'search',
    'set_folder_rule',
    'write_template',
  ]);

  test('every registerTool registration declares `text` in its outputSchema', () => {
    const cwd = newProject();
    const registrations = captureAllRegistrations(cwd);

    const capturedNames = new Set(registrations.map((r) => r.name));
    for (const name of KNOWN_REGISTER_TOOL_NAMES) {
      expect(capturedNames).toContain(name);
    }
    expect(registrations.length).toBeGreaterThanOrEqual(KNOWN_REGISTER_TOOL_NAMES.size);

    const missingSchema = registrations
      .filter((r) => KNOWN_REGISTER_TOOL_NAMES.has(r.name) && r.outputSchema === undefined)
      .map((r) => r.name);
    expect(missingSchema).toEqual([]);

    const offenders: Array<{ name: string; error: string }> = [];
    const validator = new AjvJsonSchemaValidator();
    for (const { name, outputSchema } of registrations) {
      if (outputSchema === undefined) continue;
      const jsonSchema = compileOutputSchemaForClient(outputSchema);
      const probe = fn(validator, jsonSchema);
      if (!probe.valid && /additional propert/i.test(probe.errorMessage ?? '')) {
        offenders.push({ name, error: probe.errorMessage ?? '' });
      }
    }
    expect(offenders).toEqual([]);
  });

  function fn(
    validator: AjvJsonSchemaValidator,
    jsonSchema: Record<string, unknown>,
  ): { valid: boolean; errorMessage?: string } {
    const validate = validator.getValidator(jsonSchema);
    const probe = { text: 'mirror body' };
    return validate(probe) as { valid: boolean; errorMessage?: string };
  }
});
