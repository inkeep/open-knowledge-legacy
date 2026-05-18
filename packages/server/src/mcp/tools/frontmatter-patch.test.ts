import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_WRITE_ORIGIN,
  AgentSessionManager,
  applyAgentMarkdownWrite,
} from '../../agent-sessions.ts';
import { createApiExtension } from '../../api-extension.ts';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register } from './frontmatter-patch.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  name: string;
  handler: (args: {
    docName: string;
    patch: Record<string, string | number | boolean | string[] | null>;
    summary?: string;
    types?: Record<string, 'text' | 'number' | 'boolean' | 'date' | 'list'>;
  }) => Promise<ToolResult>;
}

function createFakeServer() {
  let registeredTool: RegisteredTool | undefined;
  const server = {
    tool(
      name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: RegisteredTool['handler'],
    ) {
      registeredTool = { name, handler };
    },
    registerTool(name: string, _config: unknown, handler: RegisteredTool['handler']) {
      registeredTool = { name, handler };
    },
  } as unknown as ServerInstance;
  return {
    server,
    getTool(): RegisteredTool {
      if (!registeredTool) throw new Error('Tool was not registered');
      return registeredTool;
    },
  };
}

interface Harness {
  projectDir: string;
  contentDir: string;
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  baseUrl: string;
  testServer: ReturnType<typeof Bun.serve>;
  cleanup: () => Promise<void>;
}

async function setupHarness(): Promise<Harness> {
  const projectDir = mkdtempSync(join(tmpdir(), 'ok-frontmatter-patch-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  const hocuspocus = new Hocuspocus({ quiet: true });
  const sessionManager = new AgentSessionManager(hocuspocus);
  const ext = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex: () => new Map(),
  });

  const testServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const bodyText = req.method === 'POST' ? await req.text() : '';
      const readable = Readable.from(Buffer.from(bodyText)) as unknown as IncomingMessage;
      readable.method = req.method;
      readable.url = `${url.pathname}${url.search}`;
      readable.headers = {
        host: url.host,
        'content-type': req.headers.get('content-type') ?? 'application/json',
      };
      const captured = { status: 200, body: '', contentType: 'application/json' };
      const res = {
        writeHead(status: number, headers?: Record<string, string>) {
          captured.status = status;
          if (headers?.['Content-Type']) captured.contentType = headers['Content-Type'];
        },
        setHeader(name: string, value: string) {
          if (name.toLowerCase() === 'content-type') captured.contentType = value;
        },
        end(body?: string) {
          captured.body = body ?? '';
        },
        headersSent: false,
        writableEnded: false,
        destroyed: false,
      } as unknown as ServerResponse;
      await (
        ext as {
          onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
        }
      ).onRequest({ request: readable, response: res });
      return new Response(captured.body || null, {
        status: captured.status,
        headers: { 'Content-Type': captured.contentType },
      });
    },
  });
  const baseUrl = `http://localhost:${testServer.port}`;

  const cleanup = async () => {
    testServer.stop();
    await sessionManager.closeAll();
    rmSync(projectDir, { recursive: true, force: true });
  };

  return { projectDir, contentDir, hocuspocus, sessionManager, baseUrl, testServer, cleanup };
}

function readFmRegion(doc: import('yjs').Doc): string {
  const ytext = doc.getText('source').toString();
  const m = ytext.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1] : '';
}

describe('frontmatter_patch — MCP tool over real CRDT path', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await setupHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  function makeDeps() {
    return {
      serverUrl: harness.baseUrl,
      config: BASE_CONFIG,
      resolveCwd: async () => harness.projectDir,
    };
  }

  async function seedDoc(docName: string, fullMarkdown: string): Promise<void> {
    const session = await harness.sessionManager.getSession(docName);
    session.dc.document.transact(() => {
      applyAgentMarkdownWrite(session.dc.document, fullMarkdown, 'replace');
    }, AGENT_WRITE_ORIGIN);
  }

  test('per-key SET adds the new key (RFC 7396)', async () => {
    await seedDoc('test-doc', '---\ntitle: My Doc\n---\n# Body\n\nOriginal body.\n');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'test-doc',
      patch: { status: 'published' },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('Frontmatter patched');

    const session = await harness.sessionManager.getSession('test-doc');
    const fm = readFmRegion(session.dc.document);
    expect(fm).toContain('title: My Doc');
    expect(fm).toContain('status: published');
    expect(session.dc.document.getText('source').toString()).toContain('Original body.');
  });

  test('per-key DELETE removes the key (RFC 7396 null sentinel)', async () => {
    await seedDoc('test-doc', '---\ntitle: My Doc\ntags: [a, b]\n---\n# Body\n');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'test-doc',
      patch: { tags: null },
    });

    expect(result.isError).toBeUndefined();
    const session = await harness.sessionManager.getSession('test-doc');
    const fm = readFmRegion(session.dc.document);
    expect(fm).toContain('title: My Doc');
    expect(fm).not.toContain('tags:');
  });

  test('atomic rejection: invalid value rejects whole patch + emits fieldErrors', async () => {
    await seedDoc('test-doc', '---\ntitle: Original\n---\n# Body\n');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'test-doc',
      patch: {
        title: { nested: 'object' } as unknown as string,
        note: 'should-not-land',
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Error:');

    const session = await harness.sessionManager.getSession('test-doc');
    const fm = readFmRegion(session.dc.document);
    expect(fm).toContain('title: Original');
    expect(fm).not.toContain('note:');
  });

  test('CRDT field-level merge: two patches to different keys both land', async () => {
    await seedDoc('test-doc', '---\ntitle: My Doc\n---\n# Body\n');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const r1 = await getTool().handler({
      docName: 'test-doc',
      patch: { status: 'draft' },
    });
    const r2 = await getTool().handler({
      docName: 'test-doc',
      patch: { author: 'Alice' },
    });

    expect(r1.isError).toBeUndefined();
    expect(r2.isError).toBeUndefined();

    const session = await harness.sessionManager.getSession('test-doc');
    const fm = readFmRegion(session.dc.document);
    expect(fm).toContain('title: My Doc');
    expect(fm).toContain('status: draft');
    expect(fm).toContain('author: Alice');
  });

  test('writer attribution: write fires under session.origin (paired) — undo tracks it', async () => {
    await seedDoc('test-doc', '---\ntitle: My Doc\n---\n# Body\n');

    const session = await harness.sessionManager.getSession('test-doc', 'claude-1');
    session.um.clear();
    expect(session.um.undoStack.length).toBe(0);

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'test-doc',
      patch: { status: 'reviewed' },
    });

    expect(result.isError).toBeUndefined();
    expect(session.um.undoStack.length).toBeGreaterThan(0);
  });

  test('reserved doc name (__system__) rejected with HTTP 400', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: '__system__',
      patch: { status: 'reviewed' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content?.[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('reserved');
  });

  test('reserved doc name (__config__/project) rejected with HTTP 400', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: '__config__/project',
      patch: { status: 'reviewed' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content?.[0] as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('reserved');
  });

  test('empty patch {} is a clean no-op (success, no contributor, no git flush)', async () => {
    await seedDoc('test-doc', '---\ntitle: My Doc\n---\n# Body\n');

    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'test-doc',
      patch: {},
    });

    expect(result.isError).toBeUndefined();
    const session = await harness.sessionManager.getSession('test-doc');
    expect(readFmRegion(session.dc.document)).toBe('title: My Doc');
  });
});
