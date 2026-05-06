import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { type Config, ConfigSchema } from './config/schema.ts';
import {
  createMcpHttpHandler,
  type McpHttpHandler,
  type McpHttpHandlerOptions,
} from './mcp-http.ts';

const MCP_PROTOCOL_VERSION = '2025-06-18';

interface SessionHarness {
  contentDir: string;
  port: number;
  cleanup: () => Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((res) => {
    const s = createNetServer();
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => res(port));
    });
  });
}

async function bootHandler(
  config: Config,
  handlerOptions: Partial<Pick<McpHttpHandlerOptions, 'log' | 'maxSessions' | 'sessionTtlMs'>> = {},
): Promise<SessionHarness> {
  const contentDir = mkdtempSync(join(tmpdir(), 'ok-mcp-http-cfg-'));
  const port = await getFreePort();
  let handler: McpHttpHandler | null = null;
  let httpServer: HttpServer | null = null;
  try {
    handler = createMcpHttpHandler({
      contentDir,
      projectDir: contentDir,
      config,
      getServerUrl: () => `http://localhost:${port}`,
      ...handlerOptions,
    });

    httpServer = createHttpServer((req, res) => {
      const url = req.url?.split('?')[0];
      if (url === '/mcp') {
        // biome-ignore lint/style/noNonNullAssertion: handler is set inside the try
        handler!.handle(req, res).catch((err: unknown) => {
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end(`Internal server error: ${(err as Error).message ?? String(err)}`);
          }
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    await new Promise<void>((res) => {
      // biome-ignore lint/style/noNonNullAssertion: httpServer is set inside the try
      httpServer!.listen(port, () => res());
    });
  } catch (err) {
    if (httpServer) await new Promise<void>((res) => httpServer?.close(() => res()));
    if (handler) await handler.close();
    rmSync(contentDir, { recursive: true, force: true });
    throw err;
  }

  return {
    contentDir,
    port,
    cleanup: async () => {
      // biome-ignore lint/style/noNonNullAssertion: handler/httpServer are non-null after successful boot
      await handler!.close();
      // biome-ignore lint/style/noNonNullAssertion: see above
      await new Promise<void>((res) => httpServer!.close(() => res()));
      rmSync(contentDir, { recursive: true, force: true });
    },
  };
}

interface InitializedSession {
  sessionId: string;
  protocolVersion: string;
}

async function openMcpSession(port: number): Promise<InitializedSession> {
  const init = await fetch(`http://localhost:${port}/mcp`, {
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
        clientInfo: { name: 'us-006-config-probe', version: '0.0.0' },
      },
    }),
  });
  expect(init.status).toBe(200);
  const sessionId = init.headers.get('mcp-session-id');
  expect(sessionId).toBeTruthy();
  const initBody = (await init.json()) as {
    result?: { protocolVersion?: string };
  };
  const protocolVersion = initBody.result?.protocolVersion ?? MCP_PROTOCOL_VERSION;

  const initialized = await fetch(`http://localhost:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-session-id': sessionId as string,
      'mcp-protocol-version': protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  expect(initialized.status).toBe(202);

  return { sessionId: sessionId as string, protocolVersion };
}

interface ToolCallResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function callGrepTool(
  port: number,
  session: InitializedSession,
  args: { query: string; cwd: string },
  rpcId: number,
): Promise<ToolCallResult> {
  const res = await fetch(`http://localhost:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-session-id': session.sessionId,
      'mcp-protocol-version': session.protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId,
      method: 'tools/call',
      params: { name: 'grep', arguments: args },
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result?: ToolCallResult; error?: unknown };
  if (body.error) throw new Error(`tools/call returned error: ${JSON.stringify(body.error)}`);
  return body.result ?? {};
}

function seedSearchableFiles(contentDir: string, count: number, marker: string): void {
  for (let i = 0; i < count; i++) {
    writeFileSync(resolve(contentDir, `note-${i}.md`), `# note ${i}\n\n${marker}\n`);
  }
}

let openHarnesses: SessionHarness[] = [];

beforeEach(() => {
  openHarnesses = [];
});

afterEach(async () => {
  await Promise.allSettled(openHarnesses.map((h) => h.cleanup()));
  openHarnesses = [];
});

test('configured mcp.tools.grep.maxResults caps tool output (truncation hint surfaces)', async () => {
  const config: Config = ConfigSchema.parse({ mcp: { tools: { grep: { maxResults: 1 } } } });
  expect(config.mcp.tools.grep.maxResults).toBe(1);

  const harness = await bootHandler(config);
  openHarnesses.push(harness);

  seedSearchableFiles(harness.contentDir, 3, 'configured-search-marker');

  const session = await openMcpSession(harness.port);
  const result = await callGrepTool(
    harness.port,
    session,
    { query: 'configured-search-marker', cwd: harness.contentDir },
    2,
  );

  expect(result.isError ?? false).toBe(false);
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
  expect(text).toContain('1 of');
  expect(text).toContain('matches shown');
  expect(text).toContain('mcp.tools.grep.maxResults');
  expect(result.structuredContent?.truncated).toBe(true);
  expect(result.structuredContent?.matchCount).toBe(1);
});

test('higher mcp.tools.grep.maxResults surfaces all matches without truncation', async () => {
  const config: Config = ConfigSchema.parse({ mcp: { tools: { grep: { maxResults: 99 } } } });
  expect(config.mcp.tools.grep.maxResults).toBe(99);

  const harness = await bootHandler(config);
  openHarnesses.push(harness);

  seedSearchableFiles(harness.contentDir, 3, 'configured-search-marker');

  const session = await openMcpSession(harness.port);
  const result = await callGrepTool(
    harness.port,
    session,
    { query: 'configured-search-marker', cwd: harness.contentDir },
    2,
  );

  expect(result.isError ?? false).toBe(false);
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
  expect(text).not.toContain('matches shown. Raise');
  expect(result.structuredContent?.truncated).toBe(false);
  expect(result.structuredContent?.matchCount).toBe(3);
});

test('configured mcp.tools.read_document.historyDepth is the value handed to the read tool', async () => {
  const config: Config = ConfigSchema.parse({
    mcp: { tools: { read_document: { historyDepth: 7 }, grep: { maxResults: 11 } } },
  });
  expect(config.mcp.tools.read_document.historyDepth).toBe(7);
  expect(config.mcp.tools.grep.maxResults).toBe(11);

  const harness = await bootHandler(config);
  openHarnesses.push(harness);

  const session = await openMcpSession(harness.port);
  const tools = await fetch(`http://localhost:${harness.port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-session-id': session.sessionId,
      'mcp-protocol-version': session.protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  });
  expect(tools.status).toBe(200);
  const toolsBody = (await tools.json()) as {
    result?: { tools?: Array<{ name: string }> };
  };
  const toolNames = toolsBody.result?.tools?.map((t) => t.name) ?? [];
  expect(toolNames).toContain('read_document');
  expect(toolNames).toContain('search');
  expect(toolNames).toContain('grep');

  seedSearchableFiles(harness.contentDir, 12, 'historydepth-co-witness');
  const result = await callGrepTool(
    harness.port,
    session,
    { query: 'historydepth-co-witness', cwd: harness.contentDir },
    3,
  );
  expect(result.structuredContent?.truncated).toBe(true);
  expect(result.structuredContent?.matchCount).toBe(11);
});

test('active MCP session cap refuses new sessions before allocation', async () => {
  const config: Config = ConfigSchema.parse({});
  const harness = await bootHandler(config, { maxSessions: 1 });
  openHarnesses.push(harness);

  await openMcpSession(harness.port);

  const second = await fetch(`http://localhost:${harness.port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'over-cap', version: '0.0.0' },
      },
    }),
  });

  expect(second.status).toBe(503);
  expect(await second.text()).toContain('Too many active MCP sessions');
});

test('inactive MCP sessions expire and return 404 on later use', async () => {
  const config: Config = ConfigSchema.parse({});
  const harness = await bootHandler(config, { sessionTtlMs: 250 });
  openHarnesses.push(harness);

  const session = await openMcpSession(harness.port);
  await wait(350);

  const expired = await fetch(`http://localhost:${harness.port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-session-id': session.sessionId,
      'mcp-protocol-version': session.protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
  });

  expect(expired.status).toBe(404);
  expect(await expired.text()).toContain('MCP session not found');
});
