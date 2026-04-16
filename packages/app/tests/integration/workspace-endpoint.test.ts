/**
 * Integration tests for `GET /api/workspace`, the endpoint that powers the
 * sidebar 'Copy path > Full path' action. Two behaviors matter:
 *
 *   1. It returns `{ ok, contentDir, pathSeparator }` to loopback clients so
 *      the browser can compose absolute filesystem paths without guessing
 *      the host path separator.
 *   2. The response contents expose host-shape (username, directory layout),
 *      so the endpoint is loopback-only. Non-loopback requests are refused
 *      with 403 even when the server is bound to 0.0.0.0 (the default loopback
 *      test setup is already sufficient for this path — the 403 path is
 *      covered by unit checks in the handler itself).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sep } from 'node:path';
import { createTestServer, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('GET /api/workspace', () => {
  test('returns canonical contentDir and platform path separator', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      contentDir: string;
      pathSeparator: string;
    };
    expect(body.ok).toBe(true);
    expect(body.contentDir).toBe(server.contentDir);
    expect(body.pathSeparator).toBe(sep);
  });

  test('rejects non-GET methods with 405', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
  });
});
