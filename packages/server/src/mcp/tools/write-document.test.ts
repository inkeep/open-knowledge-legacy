import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Config } from '../../config/schema.ts';
import type { ServerInstance } from './shared.ts';
import { register } from './write-document.ts';

const BASE_CONFIG: Config = {
  content: { dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] },
  server: { host: 'localhost', openOnAgentEdit: false },
  mcp: {
    tools: {
      read_document: { historyDepth: 5 },
      search: { maxResults: 50 },
    },
  },
};

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

interface RegisteredTool {
  name: string;
  handler: (args: {
    docName: string;
    markdown?: string;
    template?: string;
    position: 'append' | 'prepend' | 'replace';
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
  } as unknown as ServerInstance;
  return {
    server,
    getTool(): RegisteredTool {
      if (!registeredTool) throw new Error('Tool was not registered');
      return registeredTool;
    },
  };
}

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let mockSubscriberCount: number | undefined = 1;
let mockSystemSubscriberCount: number | undefined = 1;
let lastWriteRequest: Record<string, unknown> | undefined;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/agent-write-md') {
        lastWriteRequest = (await req.json()) as Record<string, unknown>;
        return Response.json({
          ok: true,
          timestamp: '2026-04-15T00:00:00.000Z',
          ...(mockSubscriberCount !== undefined ? { subscriberCount: mockSubscriberCount } : {}),
          ...(mockSystemSubscriberCount !== undefined
            ? { systemSubscriberCount: mockSystemSubscriberCount }
            : {}),
        });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

let tmpDir: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-write-doc-'));
  originalEnv = process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  mockSubscriberCount = 1;
  mockSystemSubscriberCount = 1;
  lastWriteRequest = undefined;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL;
  } else {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = originalEnv;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

function makeDeps() {
  return {
    serverUrl: baseUrl,
    config: BASE_CONFIG,
    resolveCwd: async () => tmpDir,
  };
}

describe('write_document — previewUrl emission', () => {
  test('emits previewUrl + source when resolver resolves', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent).toEqual({
      previewUrl: 'https://env.example/#/docs/test',
      previewUrlSource: 'env',
    });
    expect(result.content[0]?.text).toContain('Written successfully (append)');
    expect(result.content[0]?.text).toContain('Preview: https://env.example/#/docs/test');
  });

  test('omits structuredContent when nothing resolves AND subscribers>0', async () => {
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test',
      markdown: 'hello',
      position: 'replace',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Written successfully (replace).');
  });

  test('emits attach-preview-once hint with previewUrl when systemSubscriberCount=0', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://env.example';
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent).toMatchObject({
      previewUrl: 'https://env.example/#/docs/test',
      previewUrlSource: 'env',
      warning: {
        action: 'attach-preview-once',
        message: 'Open the previewUrl in your preview browser.',
        previewUrl: 'https://env.example/#/docs/test',
      },
    });
    expect(result.content[0]?.text).toContain(
      'Open https://env.example/#/docs/test in your preview browser.',
    );
  });

  test('emits attach-preview-once hint with null previewUrl when systemSubscriberCount=0 and no resolver', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 0;
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent).toMatchObject({
      warning: {
        action: 'attach-preview-once',
        message: 'Open the previewUrl in your preview browser.',
        previewUrl: null,
      },
    });
    expect(result.structuredContent).not.toHaveProperty('previewUrl');
  });

  test('no warning when systemSubscriberCount>0 even if per-doc subscriberCount=0 (second doc, server-push follows)', async () => {
    mockSubscriberCount = 0;
    mockSystemSubscriberCount = 1;
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/second',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent?.warning).toBeUndefined();
    expect(result.content[0]?.text).not.toContain('No preview attached');
  });

  test('no warning when server omits systemSubscriberCount (legacy server)', async () => {
    mockSubscriberCount = undefined;
    mockSystemSubscriberCount = undefined;
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]?.text).toBe('Written successfully (append).');
  });

  test('strips .md extension before building preview URL', async () => {
    process.env.OPEN_KNOWLEDGE_PREVIEW_BASE_URL = 'https://x.example';
    const { server, getTool } = createFakeServer();
    register(server, makeDeps());

    const result = await getTool().handler({
      docName: 'docs/test.md',
      markdown: 'hello',
      position: 'append',
    });

    expect(result.structuredContent).toEqual({
      previewUrl: 'https://x.example/#/docs/test',
      previewUrlSource: 'env',
    });
  });
});

describe('write_document — template instantiation (FR5)', () => {
  test('instantiates from a local template — markdown payload is template body', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(resolve(tmpDir, 'meetings', '.ok', 'templates'), { recursive: true });
    const templateContent =
      '---\ntitle: Meeting Prep\ndescription: Use before a meeting.\ntags: [meeting, prep]\n---\n# {Meeting Title}\n\n**Attendees:** \n';
    await writeFile(
      resolve(tmpDir, 'meetings', '.ok', 'templates', 'prep-notes.md'),
      templateContent,
    );

    const fakeServer = createFakeServer();
    register(fakeServer.server, makeDeps());

    const result = await fakeServer.getTool().handler({
      docName: 'meetings/2026-05-01-foo',
      template: 'prep-notes',
      position: 'replace',
    } as Parameters<RegisteredTool['handler']>[0]);

    expect(result.isError).toBeUndefined();
    expect(lastWriteRequest).toBeDefined();
    expect(lastWriteRequest?.markdown).toBe(templateContent);
    expect(lastWriteRequest?.position).toBe('replace');
    expect(lastWriteRequest?.docName).toBe('meetings/2026-05-01-foo');
  });

  test('inherits template from ancestor folder (walk-up)', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(resolve(tmpDir, 'meetings', '.ok', 'templates'), { recursive: true });
    const templateContent = '---\ntitle: Inherited\n---\nbody\n';
    await writeFile(resolve(tmpDir, 'meetings', '.ok', 'templates', 'shared.md'), templateContent);

    const fakeServer = createFakeServer();
    register(fakeServer.server, makeDeps());

    const result = await fakeServer.getTool().handler({
      docName: 'meetings/prep-notes/foo',
      template: 'shared',
      position: 'replace',
    } as Parameters<RegisteredTool['handler']>[0]);

    expect(result.isError).toBeUndefined();
    expect(lastWriteRequest?.markdown).toBe(templateContent);
  });

  test('rejects unknown template name with helpful menu', async () => {
    const fakeServer = createFakeServer();
    register(fakeServer.server, makeDeps());

    const result = await fakeServer.getTool().handler({
      docName: 'meetings/foo',
      template: 'nonexistent',
      position: 'replace',
    } as Parameters<RegisteredTool['handler']>[0]);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
    expect(lastWriteRequest).toBeUndefined();
  });

  test('rejects descendant-scoped template at parent folder', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(resolve(tmpDir, 'meetings', 'prep-notes', '.ok', 'templates'), {
      recursive: true,
    });
    await writeFile(
      resolve(tmpDir, 'meetings', 'prep-notes', '.ok', 'templates', 'agenda.md'),
      '---\ntitle: Agenda\n---\nb\n',
    );

    const fakeServer = createFakeServer();
    register(fakeServer.server, makeDeps());

    const result = await fakeServer.getTool().handler({
      docName: 'meetings/foo',
      template: 'agenda',
      position: 'replace',
    } as Parameters<RegisteredTool['handler']>[0]);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });

  test('without template arg, behavior unchanged (markdown passes through)', async () => {
    const fakeServer = createFakeServer();
    register(fakeServer.server, makeDeps());

    const result = await fakeServer.getTool().handler({
      docName: 'foo',
      markdown: 'plain content',
      position: 'append',
    } as Parameters<RegisteredTool['handler']>[0]);

    expect(result.isError).toBeUndefined();
    expect(lastWriteRequest?.markdown).toBe('plain content');
    expect(lastWriteRequest?.position).toBe('append');
  });
});
