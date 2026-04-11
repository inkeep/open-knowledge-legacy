/**
 * Tests for MCP shared helpers — textResult, httpGet, httpPost.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, httpPost, textResult } from './shared.ts';

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

describe('HOCUSPOCUS_NOT_RUNNING_ERROR', () => {
  test('contains actionable guidance', () => {
    expect(HOCUSPOCUS_NOT_RUNNING_ERROR).toContain('open-knowledge start');
    expect(HOCUSPOCUS_NOT_RUNNING_ERROR).toContain('native Edit tool');
  });
});

// ── HTTP helpers — test against a local test server ──

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
        // Respond after 100ms (won't timeout with our 30s limit)
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
