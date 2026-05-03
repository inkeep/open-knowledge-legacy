import { expect, test } from 'bun:test';
import { createTestServer } from './test-harness';

const MCP_PROTOCOL_VERSION = '2025-06-18';

test('POST /mcp serves MCP JSON-RPC over Streamable HTTP', async () => {
  const server = await createTestServer();

  try {
    const init = await fetch(`http://localhost:${server.port}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'ok-integration-test', version: '0.0.0' },
        },
      }),
    });

    expect(init.status).toBe(200);
    const sessionId = init.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    const initBody = (await init.json()) as {
      jsonrpc: '2.0';
      id: number;
      result?: { serverInfo?: { name?: string }; protocolVersion?: string };
    };
    expect(initBody.result?.serverInfo?.name).toBe('open-knowledge');
    expect(initBody.result?.protocolVersion).toBeTruthy();

    const initialized = await fetch(`http://localhost:${server.port}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': sessionId as string,
        'mcp-protocol-version': initBody.result?.protocolVersion ?? MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(initialized.status).toBe(202);

    const tools = await fetch(`http://localhost:${server.port}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': sessionId as string,
        'mcp-protocol-version': initBody.result?.protocolVersion ?? MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });

    expect(tools.status).toBe(200);
    const toolsBody = (await tools.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    const toolNames = toolsBody.result?.tools?.map((tool) => tool.name) ?? [];
    expect(toolNames).toContain('exec');
    expect(toolNames).toContain('read_document');
    expect(toolNames).toContain('write_document');
  } finally {
    await server.cleanup();
  }
});
