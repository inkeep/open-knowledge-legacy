import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { DESCRIPTION, register } from './discover.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface DiscoverArgs {
  cwd?: string;
}

type ToolHandler = (args: DiscoverArgs) => Promise<ToolResult>;

interface RegisterToolCapture {
  name: string;
  cfg: {
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: {
      readOnlyHint?: boolean;
      idempotentHint?: boolean;
      destructiveHint?: boolean;
    };
  };
  handler: ToolHandler;
}

function newProject(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'ok-discover-'));
  mkdirSync(join(cwd, '.ok'), { recursive: true });
  return cwd;
}

function captureRegistration(cwd: string): RegisterToolCapture {
  let captured: RegisterToolCapture | null = null;
  const server = {
    registerTool(name: string, cfg: RegisterToolCapture['cfg'], handler: ToolHandler) {
      captured = { name, cfg, handler };
    },
    tool() {
      throw new Error('discover should use registerTool, not tool');
    },
  } as unknown as ServerInstance;
  register(server, {
    config: BASE_CONFIG,
    resolveCwd: async () => cwd,
  });
  if (!captured) throw new Error('discover tool was not registered');
  return captured;
}

describe('discover — tool registration', () => {
  test('T-U1: registers under the name `discover`', () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    expect(captured.name).toBe('discover');
  });

  test('T-U2: annotations match set_folder_rule + write_template (readOnly:false, idempotent:true, destructive:false)', () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    expect(captured.cfg.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    });
  });

  test('T-U6: input schema declares optional `cwd` and nothing else', () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const schemaKeys = Object.keys(captured.cfg.inputSchema);
    expect(schemaKeys).toEqual(['cwd']);
  });
});

describe('discover — DESCRIPTION (tools/list blurb)', () => {
  test('T-U3a: mentions "existing" repo context', () => {
    expect(DESCRIPTION.toLowerCase()).toContain('existing');
  });

  test('T-U3b: names `ok seed` as the empty-repo alternative', () => {
    expect(DESCRIPTION).toContain('ok seed');
  });

  test('T-U3c: signals idempotency / one-shot semantics', () => {
    expect(DESCRIPTION.toLowerCase()).toMatch(/one-shot|idempotent/);
  });
});

describe('discover — instructional body structural markers', () => {
  test('T-U4: body contains all seven phase markers (Phase 1 … Phase 7)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(body).toContain(`Phase ${n}`);
    }
  });

  test('T-U5a: body contains the four primary STOP gate markers (gates 1, 2, 3, 4)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    for (const n of [1, 2, 3, 4]) {
      expect(body).toContain(`STOP gate ${n}`);
    }
  });

  test('T-U5b: body contains the six Phase 5 link-graph sub-pass STOP gates (5a-5f)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    for (const letter of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(body).toContain(`STOP gate 5${letter}`);
    }
  });

  test('T-U5c: body contains ⛔ marker (visual STOP indicator)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('⛔');
  });

  test("body contains anti-patterns section (don't restructure / don't auto-apply / etc.)", async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    expect(body).toContain("Don't restructure");
    expect(body).toContain("Don't auto-apply");
    expect(body).toContain("Don't bulk-rewrite");
  });

  test('body contains exit conditions section (empty project, server down, validation failure)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('Exit conditions');
    expect(body).toContain('Empty project');
    expect(body).toContain('ok seed');
  });

  test('body references the existing primitives discover composes', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('set_folder_rule');
    expect(body).toContain('write_template');
    expect(body).toContain('get_orphans');
    expect(body).toContain('get_hubs');
    expect(body).toContain('get_dead_links');
    expect(body).toContain('suggest_links');
    expect(body).toContain('list_documents');
    expect(body).toContain('exec');
  });
});

describe('discover — handler behavior', () => {
  test('returns structuredContent with previewUrl: null (matches workflow-tool pattern)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    expect(result.structuredContent).toMatchObject({ previewUrl: null });
  });

  test('returns dual-channel result (text content + structuredContent)', async () => {
    const cwd = newProject();
    const captured = captureRegistration(cwd);
    const result = await captured.handler({});
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text.length).toBeGreaterThan(1000);
    expect(result.structuredContent).toBeDefined();
  });

  test('T-U7: handler returns error when cwd resolution fails', async () => {
    const capture: { handler: ToolHandler | null } = { handler: null };
    const server = {
      registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
        capture.handler = h;
      },
      tool() {
        throw new Error('not used');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: BASE_CONFIG,
      resolveCwd: async () => {
        throw new Error('synthetic: no cwd available');
      },
    });
    if (!capture.handler) throw new Error('tool not registered');
    const handler = capture.handler;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Error');
  });

  test('body includes the resolved content directory (interpolation distinguishable from hardcoded default)', async () => {
    const cwd = newProject();
    const customConfig: Config = ConfigSchema.parse({ content: { dir: 'knowledge' } });
    let captured: ToolHandler | null = null;
    const server = {
      registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
        captured = h;
      },
      tool() {
        throw new Error('not used');
      },
    } as unknown as ServerInstance;
    register(server, { config: customConfig, resolveCwd: async () => cwd });
    if (!captured) throw new Error('tool not registered');
    const handler = captured as ToolHandler;
    const result = await handler({});
    const body = result.content[0]?.text ?? '';
    expect(body).toContain('Content directory: `knowledge`');
    expect(body).toContain('exec("ls knowledge")');
    expect(body).not.toContain('Content directory: `.`');
  });

  test('args.cwd is plumbed through to resolveCwd', async () => {
    const projectCwd = newProject();
    const received: { explicit: string | undefined } = { explicit: undefined };
    const capture: { handler: ToolHandler | null } = { handler: null };
    const server = {
      registerTool(_name: string, _cfg: unknown, h: ToolHandler) {
        capture.handler = h;
      },
      tool() {
        throw new Error('not used');
      },
    } as unknown as ServerInstance;
    register(server, {
      config: BASE_CONFIG,
      resolveCwd: async (explicit?: string) => {
        received.explicit = explicit;
        return projectCwd;
      },
    });
    if (!capture.handler) throw new Error('tool not registered');
    const handler = capture.handler;
    await handler({ cwd: '/explicit/path/from/caller' });
    expect(received.explicit).toBe('/explicit/path/from/caller');
  });
});
