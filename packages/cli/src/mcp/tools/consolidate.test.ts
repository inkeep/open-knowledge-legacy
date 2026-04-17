import { describe, expect, test } from 'bun:test';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './consolidate.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function captureTool() {
  let captured: ((args: { topic: string }) => ToolResult) | undefined;
  const server = {
    tool(
      _name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: (args: { topic: string }) => ToolResult,
    ) {
      captured = handler;
    },
  } as unknown as ServerInstance;
  return {
    server,
    call(topic: string) {
      if (!captured) throw new Error('Tool was not registered');
      return captured({ topic });
    },
  };
}

describe('consolidate — previewUrl emission', () => {
  test('returns structuredContent with previewUrl: null (workflow primer)', () => {
    const { server, call } = captureTool();
    register(server, BASE_CONFIG);
    const result = call('CRDT architecture');
    expect(result.structuredContent).toEqual({ previewUrl: null });
    expect(result.content[0]?.text).toContain('CRDT architecture');
  });
});
