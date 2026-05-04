import { describe as _bunDescribe, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './ingest.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function captureTool() {
  let captured: ((args: { source: string; cwd?: string }) => Promise<ToolResult>) | undefined;
  const server = {
    tool(
      _name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: (args: { source: string; cwd?: string }) => Promise<ToolResult>,
    ) {
      captured = handler;
    },
  } as unknown as ServerInstance;
  return {
    server,
    async call(source: string) {
      if (!captured) throw new Error('Tool was not registered');
      return await captured({ source });
    },
  };
}

describe('ingest — previewUrl emission', () => {
  test('returns structuredContent with previewUrl: null (workflow primer)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('https://example.com/article');
    expect(result.structuredContent).toEqual({ previewUrl: null });
    expect(result.content[0]?.text).toContain('https://example.com/article');
  });
});
