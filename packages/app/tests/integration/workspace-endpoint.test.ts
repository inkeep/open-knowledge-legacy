/**
 * Integration tests for `GET /api/workspace`, the endpoint that powers the
 * sidebar 'Copy path > Full path' action. Two behaviors matter:
 *
 *   1. It returns `{ ok, contentDir, pathSeparator, symlinkResolved }` to
 *      loopback clients so the browser can compose absolute filesystem paths
 *      without guessing the host path separator.
 *   2. The response contents expose host-shape (username, directory layout),
 *      so the endpoint is loopback-only. Non-loopback requests are refused
 *      with 403. The predicate logic has its own unit-test table in
 *      `packages/server/src/loopback.test.ts` that covers the v4 /8 block,
 *      IPv6 loopback, IPv4-mapped IPv6, and the LAN/public-reject cases.
 *      This file only exercises the loopback-success path — simulating a
 *      real non-loopback peer would require binding the test server to a
 *      non-loopback interface, which isn't portable cross-platform and
 *      duplicates the predicate tests.
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
  test('returns canonical contentDir, platform path separator, and symlinkResolved:true', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      contentDir: string;
      pathSeparator: string;
      symlinkResolved: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.contentDir).toBe(server.contentDir);
    expect(body.pathSeparator).toBe(sep);
    expect(body.symlinkResolved).toBe(true);
  });

  test('rejects non-GET methods with 405', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
  });
});
