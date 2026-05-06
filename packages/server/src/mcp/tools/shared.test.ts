import { describe as _bunDescribe, afterAll, beforeAll, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { type Config, ConfigSchema } from '../../config/schema.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  httpPost,
  normalizeDocName,
  resolveProjectConfigContext,
  resolveProjectServerContext,
  textResult,
} from './shared.ts';

const TEST_CONFIG: Config = ConfigSchema.parse({ content: { dir: 'content' } });

describe('textResult', () => {
  test('wraps text in MCP content array', () => {
    const result = textResult('hello');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  test('includes isError flag when true', () => {
    const result = textResult('fail', true);
    expect(result).toEqual({
      content: [{ type: 'text', text: 'fail' }],
      isError: true,
    });
  });

  test('omits isError when false or undefined', () => {
    const result = textResult('ok', false);
    expect(result).not.toHaveProperty('isError');
    const result2 = textResult('ok');
    expect(result2).not.toHaveProperty('isError');
  });
});

describe('normalizeDocName', () => {
  test('strips trailing .md silently', () => {
    const result = normalizeDocName('notes/meeting.md');
    expect(result).toEqual({ ok: true, docName: 'notes/meeting' });
  });

  test('strips trailing .mdx silently', () => {
    const result = normalizeDocName('notes/meeting.mdx');
    expect(result).toEqual({ ok: true, docName: 'notes/meeting' });
  });

  test('strips uppercase .MD (case-insensitive)', () => {
    const result = normalizeDocName('NOTES.MD');
    expect(result).toEqual({ ok: true, docName: 'NOTES' });
  });

  test('strips mixed-case .Mdx (case-insensitive)', () => {
    const result = normalizeDocName('Component.Mdx');
    expect(result).toEqual({ ok: true, docName: 'Component' });
  });

  test('strips only one trailing extension (not recursive)', () => {
    const result = normalizeDocName('notes/meeting.md.md');
    expect(result).toEqual({ ok: true, docName: 'notes/meeting.md' });
  });

  test('leaves extension-less docName untouched', () => {
    const result = normalizeDocName('notes/meeting');
    expect(result).toEqual({ ok: true, docName: 'notes/meeting' });
  });

  test('rejects .markdown — unsupported extension', () => {
    const result = normalizeDocName('notes/meeting.markdown');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('.markdown');
      expect(result.error).toContain('not a supported extension');
    }
  });

  test('leaves unrelated dotted names untouched', () => {
    const result = normalizeDocName('releases/v1.0');
    expect(result).toEqual({ ok: true, docName: 'releases/v1.0' });
  });

  test('handles root-level docName with .md', () => {
    const result = normalizeDocName('PROJECT.md');
    expect(result).toEqual({ ok: true, docName: 'PROJECT' });
  });
});

describe('HOCUSPOCUS_NOT_RUNNING_ERROR', () => {
  test('contains actionable guidance', () => {
    expect(HOCUSPOCUS_NOT_RUNNING_ERROR).toContain('open-knowledge start');
    expect(HOCUSPOCUS_NOT_RUNNING_ERROR).toContain('native Edit tool');
  });
});

describe('resolveProjectConfigContext', () => {
  test('returns cwd and resolved config on success', async () => {
    const result = await resolveProjectConfigContext(
      async () => '/workspace/project',
      async (cwd) => ({
        ...TEST_CONFIG,
        content: { ...TEST_CONFIG.content, dir: cwd ?? 'content' },
      }),
    );

    expect(result).toEqual({
      ok: true,
      cwd: '/workspace/project',
      config: {
        ...TEST_CONFIG,
        content: { ...TEST_CONFIG.content, dir: '/workspace/project' },
      },
    });
  });

  test('returns an error when resolveCwd throws', async () => {
    const result = await resolveProjectConfigContext(async () => {
      throw new Error('No client roots');
    }, TEST_CONFIG);

    expect(result).toEqual({ ok: false, error: 'No client roots' });
  });

  test('returns an error when config resolution throws', async () => {
    const result = await resolveProjectConfigContext(
      async () => '/workspace/project',
      async () => {
        throw new Error('Config exploded');
      },
    );

    expect(result).toEqual({ ok: false, error: 'Config exploded' });
  });
});

describe('resolveProjectServerContext', () => {
  test('returns cwd, config, and server url on success', async () => {
    const result = await resolveProjectServerContext(
      async () => '/workspace/project',
      TEST_CONFIG,
      async (cwd) => `ws://localhost/${cwd?.split('/').at(-1)}`,
    );

    expect(result).toEqual({
      ok: true,
      cwd: '/workspace/project',
      config: TEST_CONFIG,
      url: 'ws://localhost/project',
    });
  });

  test('propagates config-context failure', async () => {
    const result = await resolveProjectServerContext(
      async () => {
        throw new Error('Explicit cwd required');
      },
      TEST_CONFIG,
      async () => 'ws://localhost/project',
    );

    expect(result).toEqual({ ok: false, error: 'Explicit cwd required' });
  });

  test('returns an error when server resolution throws', async () => {
    const result = await resolveProjectServerContext(
      async () => '/workspace/project',
      TEST_CONFIG,
      async () => {
        throw new Error('Server lookup failed');
      },
    );

    expect(result).toEqual({ ok: false, error: 'Server lookup failed' });
  });
});

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  testServer = Bun.serve({
    port: 0, // random available port
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/ok') {
        return Response.json({ ok: true, data: 'hello' });
      }
      if (url.pathname === '/error') {
        return Response.json({ ok: false, error: 'bad request' }, { status: 400 });
      }
      if (url.pathname === '/not-json') {
        return new Response('plain text', { status: 200 });
      }
      if (url.pathname === '/post-echo') {
        return req.json().then((body) => Response.json({ ok: true, received: body }));
      }
      if (url.pathname === '/slow') {
        return new Promise((resolve) =>
          setTimeout(() => resolve(Response.json({ ok: true })), 100),
        );
      }
      return new Response('Not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${testServer.port}`;
});

afterAll(() => {
  testServer.stop();
});

describe('httpGet', () => {
  test('returns parsed JSON on success', async () => {
    const result = await httpGet(baseUrl, '/ok');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
  });

  test('returns parsed JSON on error status', async () => {
    const result = await httpGet(baseUrl, '/error');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bad request');
  });

  test('handles non-JSON response', async () => {
    const result = await httpGet(baseUrl, '/not-json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('non-JSON body');
  });

  test('handles unreachable server', async () => {
    const result = await httpGet('http://localhost:1', '/anything');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Server unreachable');
  });
});

describe('httpPost', () => {
  test('sends JSON body and returns parsed response', async () => {
    const result = await httpPost(baseUrl, '/post-echo', { key: 'value' });
    expect(result.ok).toBe(true);
    expect(result.received).toEqual({ key: 'value' });
  });

  test('works without body', async () => {
    const result = await httpPost(baseUrl, '/ok');
    expect(result.ok).toBe(true);
  });

  test('handles unreachable server', async () => {
    const result = await httpPost('http://localhost:1', '/anything', { data: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Server unreachable');
  });

  test('handles non-JSON response', async () => {
    const result = await httpPost(baseUrl, '/not-json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('non-JSON body');
  });
});
