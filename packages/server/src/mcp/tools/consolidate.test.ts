import { describe as _bunDescribe, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './consolidate.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function captureTool() {
  let captured: ((args: { topic: string; cwd?: string }) => Promise<ToolResult>) | undefined;
  const server = {
    tool(
      _name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: (args: { topic: string; cwd?: string }) => Promise<ToolResult>,
    ) {
      captured = handler;
    },
  } as unknown as ServerInstance;
  return {
    server,
    async call(topic: string) {
      if (!captured) throw new Error('Tool was not registered');
      return await captured({ topic });
    },
  };
}

describe('consolidate — previewUrl emission', () => {
  test('returns structuredContent with previewUrl: null (workflow primer)', async () => {
    const { server, call } = captureTool();
    register(server, { config: BASE_CONFIG, resolveCwd: async () => process.cwd() });
    const result = await call('CRDT architecture');
    expect(result.structuredContent).toMatchObject({ previewUrl: null });
    expect(result.content[0]?.text).toContain('CRDT architecture');
  });
});
