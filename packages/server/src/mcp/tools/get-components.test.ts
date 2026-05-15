import { describe, expect, test } from 'bun:test';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './get-components.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({ content: { dir: '.' } });

interface ComponentEntry {
  id: string;
  displayName: string;
  description: string;
  kind: 'jsx-block' | 'jsx-void';
  example: string;
  params: Array<Record<string, unknown>>;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: {
    version: number;
    components: ComponentEntry[];
    notFound: string[];
    _text?: string;
  };
  isError?: boolean;
}

type ToolHandler = (args: { ids: string[]; cwd?: string }) => Promise<ToolResult>;

function captureRegistration(): ToolHandler {
  let captured: ToolHandler | null = null;
  const server = {
    registerTool(_name: string, _config: unknown, handler: ToolHandler) {
      captured = handler;
    },
    tool() {
      throw new Error('legacy tool() should not be called by get_components');
    },
  } as unknown as ServerInstance;
  register(server, {
    config: BASE_CONFIG,
    resolveCwd: async () => '/tmp/ok-get-components-test',
  });
  if (!captured) throw new Error('tool not registered');
  return captured;
}

describe('get_components tool', () => {
  test('empty ids → empty components, empty notFound, version stamp', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: [] });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.version).toBe(1);
    expect(result.structuredContent?.components).toEqual([]);
    expect(result.structuredContent?.notFound).toEqual([]);
  });

  test('unknown id surfaces in notFound; does not error', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['NotARealComponent'] });
    expect(result.structuredContent?.components).toEqual([]);
    expect(result.structuredContent?.notFound).toEqual(['NotARealComponent']);
  });

  test('known id returns a full entry with example + params', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['Callout'] });
    const components = result.structuredContent?.components ?? [];
    expect(components.length).toBe(1);
    const entry = components[0];
    expect(entry?.id).toBe('Callout');
    expect(entry?.kind).toBe('jsx-block');
    expect(entry?.example.length).toBeGreaterThan(0);
    expect(entry?.example).toContain('<Callout');
    expect(Array.isArray(entry?.params)).toBe(true);
    expect((entry?.params.length ?? 0) > 0).toBe(true);
    expect(result.structuredContent?.notFound).toEqual([]);
  });

  test('duplicate ids are deduplicated — each canonical appears once', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['Callout', 'Callout', 'Callout'] });
    expect(result.structuredContent?.components.length).toBe(1);
    expect(result.structuredContent?.components[0]?.id).toBe('Callout');
  });

  test('fence-kind id MermaidFence is excluded from the agent surface (D20)', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['MermaidFence'] });
    expect(result.structuredContent?.components).toEqual([]);
    expect(result.structuredContent?.notFound).toEqual(['MermaidFence']);
  });

  test('mixed batch — partial match: matched ids return entries, unmatched land in notFound', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['Callout', 'NopeNope', 'Tabs', 'MermaidFence'] });
    const components = result.structuredContent?.components ?? [];
    const componentIds = components.map((c) => c.id).sort();
    expect(componentIds).toEqual(['Callout', 'Tabs']);
    expect((result.structuredContent?.notFound ?? []).sort()).toEqual(['MermaidFence', 'NopeNope']);
  });

  test('content[0].text mirrors structuredContent body as JSON (dual-channel envelope)', async () => {
    const handler = captureRegistration();
    const result = await handler({ ids: ['Callout'] });
    const text = result.content[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text ?? '{}');
    expect(parsed.version).toBe(1);
    expect(parsed.components.length).toBe(1);
    expect(parsed.notFound).toEqual([]);
  });
});
