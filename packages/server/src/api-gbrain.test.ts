import { describe, expect, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Hocuspocus } from '@hocuspocus/server';
import { createApiExtension } from './api-extension.ts';
import type { GBrainSearchResponse } from './gbrain-search.ts';
import type { GBrainStatus, GBrainStatusDetector } from './gbrain-status.ts';

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeReq(options: {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}): IncomingMessage {
  const chunks = options.body === undefined ? [] : [Buffer.from(options.body)];
  const readable = Readable.from(chunks) as unknown as IncomingMessage;
  readable.method = options.method ?? 'GET';
  readable.url = options.url;
  readable.headers = { host: 'localhost', ...options.headers };
  Object.defineProperty(readable, 'socket', {
    value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
  });
  return readable;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const res = {
    statusCode: 200,
    setHeader(name: string, value: number | string | readonly string[]) {
      captured.headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(', ')
        : String(value);
    },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      captured.status = status;
      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          captured.headers[name.toLowerCase()] = value;
        }
      }
    },
    end(body?: string | Buffer) {
      captured.body = Buffer.isBuffer(body) ? body.toString('utf8') : (body ?? '');
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function callGBrainRoute(options: {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
  projectDir?: string;
  status?: GBrainStatus;
  searchResponse?: GBrainSearchResponse;
  useDefaultSearcher?: boolean;
}): Promise<{ captured: CapturedResponse; projectPaths: string[]; searchRequests: unknown[] }> {
  const projectPaths: string[] = [];
  const searchRequests: unknown[] = [];
  const statusDetector: GBrainStatusDetector = {
    async getStatus(projectPath) {
      projectPaths.push(projectPath);
      return (
        options.status ?? {
          state: 'not-installed',
          message: 'gbrain is not installed.',
        }
      );
    },
    async clearCache() {},
  };
  const searcher = options.useDefaultSearcher
    ? undefined
    : {
        async search(projectPath: string, request: unknown): Promise<GBrainSearchResponse> {
          projectPaths.push(projectPath);
          searchRequests.push(request);
          return (
            options.searchResponse ?? {
              ok: false,
              code: 'not-matched',
              message: 'gbrain search is available only for registered gbrain sources.',
            }
          );
        },
      };
  const ext = createApiExtension({
    hocuspocus: { documents: new Map() } as unknown as Hocuspocus,
    sessionManager: {} as never,
    contentDir: '/workspace/project/content',
    projectDir: options.projectDir,
    getFileIndex: () => new Map(),
    serverInstanceId: 'test-instance',
    gbrainStatusDetector: statusDetector,
    ...(searcher === undefined ? {} : { gbrainSearcher: searcher }),
  });
  const req = makeReq(options);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return { captured, projectPaths, searchRequests };
}

describe('gbrain API routes', () => {
  test('GET /api/gbrain/status returns normalized status for the active project', async () => {
    const status: GBrainStatus = {
      state: 'matched',
      sourceId: 'project',
      sourceName: 'Project',
      localPath: '/workspace/project',
    };

    const { captured, projectPaths } = await callGBrainRoute({
      url: '/api/gbrain/status',
      projectDir: '/workspace/project',
      status,
    });

    expect(captured.status).toBe(200);
    expect(JSON.parse(captured.body)).toEqual({ ok: true, status });
    expect(projectPaths).toEqual(['/workspace/project']);
  });

  test('rejects non-loopback peers before invoking gbrain status', async () => {
    const { captured, projectPaths } = await callGBrainRoute({
      url: '/api/gbrain/status',
      remoteAddress: '10.0.0.5',
    });

    expect(captured.status).toBe(403);
    expect(JSON.parse(captured.body)).toEqual({ ok: false, error: 'loopback-required' });
    expect(projectPaths).toEqual([]);
  });

  test('rejects disallowed Host headers before invoking gbrain status', async () => {
    const { captured, projectPaths } = await callGBrainRoute({
      url: '/api/gbrain/status',
      headers: { host: 'attacker.example.com' },
    });

    expect(captured.status).toBe(403);
    expect(JSON.parse(captured.body)).toEqual({ ok: false, error: 'host-header-not-allowed' });
    expect(projectPaths).toEqual([]);
  });

  test('rejects disallowed Origin headers through the shared API guard', async () => {
    const { captured, projectPaths } = await callGBrainRoute({
      url: '/api/gbrain/status',
      headers: { origin: 'https://attacker.example.com' },
    });

    expect(captured.status).toBe(403);
    expect(JSON.parse(captured.body)).toEqual({ ok: false, error: 'origin-not-allowed' });
    expect(projectPaths).toEqual([]);
  });

  test('rejects unsupported status and search methods', async () => {
    const statusResponse = await callGBrainRoute({
      url: '/api/gbrain/status',
      method: 'POST',
    });
    const searchResponse = await callGBrainRoute({
      url: '/api/gbrain/search',
      method: 'GET',
    });

    expect(statusResponse.captured.status).toBe(405);
    expect(JSON.parse(statusResponse.captured.body)).toEqual({
      ok: false,
      error: 'Method not allowed',
    });
    expect(searchResponse.captured.status).toBe(405);
    expect(JSON.parse(searchResponse.captured.body)).toEqual({
      ok: false,
      error: 'Method not allowed',
    });
  });

  test('POST /api/gbrain/search validates JSON and empty queries', async () => {
    const invalidJsonResponse = await callGBrainRoute({
      url: '/api/gbrain/search',
      method: 'POST',
      body: '{',
    });
    const emptyQueryResponse = await callGBrainRoute({
      url: '/api/gbrain/search',
      method: 'POST',
      body: JSON.stringify({ query: '   ' }),
    });

    expect(invalidJsonResponse.captured.status).toBe(400);
    expect(JSON.parse(invalidJsonResponse.captured.body)).toEqual({
      ok: false,
      error: 'Invalid JSON',
    });
    expect(emptyQueryResponse.captured.status).toBe(400);
    expect(JSON.parse(emptyQueryResponse.captured.body)).toEqual({
      ok: false,
      code: 'invalid-query',
      message: 'Enter a search query.',
    });
    expect(emptyQueryResponse.searchRequests).toEqual([]);
  });

  test('POST /api/gbrain/search forwards valid requests and ignores invalid limits', async () => {
    const response: GBrainSearchResponse = {
      ok: true,
      sourceId: 'project',
      limit: 10,
      results: [
        {
          sourceId: 'project',
          slug: 'notes/family-calendar',
          title: 'Family Calendar',
          snippet: 'Calendar planning notes',
          score: 0.89,
        },
      ],
    };

    const { captured, projectPaths, searchRequests } = await callGBrainRoute({
      url: '/api/gbrain/search',
      method: 'POST',
      projectDir: '/workspace/project',
      body: JSON.stringify({ query: 'family calendar', limit: 'many' }),
      searchResponse: response,
    });

    expect(captured.status).toBe(200);
    expect(JSON.parse(captured.body)).toEqual(response);
    expect(projectPaths).toEqual(['/workspace/project']);
    expect(searchRequests).toEqual([{ query: 'family calendar', limit: undefined }]);
  });

  test('POST /api/gbrain/search maps search failures to failure status codes', async () => {
    const response: GBrainSearchResponse = {
      ok: false,
      code: 'timeout',
      message: 'gbrain search did not respond in time.',
    };

    const { captured } = await callGBrainRoute({
      url: '/api/gbrain/search',
      method: 'POST',
      body: JSON.stringify({ query: 'family calendar', limit: 5 }),
      searchResponse: response,
    });

    expect(captured.status).toBe(504);
    expect(JSON.parse(captured.body)).toEqual(response);
  });
});
