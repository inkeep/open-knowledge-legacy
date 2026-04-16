/**
 * Integration tests for `GET /api/workspace`, the endpoint that powers the
 * sidebar 'Copy path > Full path' action. Covers the full auth surface:
 *
 *   1. Happy path: loopback caller with a loopback Host header gets
 *      `{ ok, contentDir, pathSeparator, symlinkResolved }`.
 *   2. Host-header allowlist (DNS-rebinding defense): a loopback peer that
 *      speaks with a non-loopback Host header is refused with 403.
 *   3. Auth-before-method ordering: an unauthorized caller receives 403 for
 *      *every* verb — the method check never fires for them, so the endpoint
 *      doesn't leak "I exist, I expect GET" to cross-origin callers.
 *   4. Symlink-unresolved (ENOENT): if contentDir is deleted out from under
 *      the server, `GET /api/workspace` still returns 200 with the unresolved
 *      path and `symlinkResolved: false`, matching the persistence-layer
 *      symlink contract in CLAUDE.md.
 *
 * The `isLoopbackAddress` / `isAllowedWorkspaceHostHeader` predicate tables
 * live in `packages/server/src/loopback.test.ts`. This file exercises the
 * handler wiring — that the predicates are called, that they run in the right
 * order, and that the happy path shape matches the TypeScript contract the
 * client uses.
 *
 * Non-loopback *peer* (not just Host header) is not exercised here because
 * simulating a non-loopback peer would require binding the test server to a
 * non-loopback interface, which isn't portable cross-platform. The predicate
 * unit tests cover the peer dimension; the Host-header dimension is covered
 * here and is the more realistic DNS-rebinding attack shape.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
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

  test('rejects non-GET methods with 405 and error:method-not-allowed', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('method-not-allowed');
  });

  test('rejects DNS-rebinding Host header with 403 even from loopback peer', async () => {
    // TCP peer is 127.0.0.1 (loopback), but Host header names an attacker-
    // controlled domain — the shape a DNS-rebinding attack produces. The
    // Host-header allowlist must refuse even though the peer passes the
    // loopback check.
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      headers: { Host: 'attacker.example.com' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('host-header-not-allowed');
  });

  test('Host-header check fires before method dispatch (no verb fingerprinting)', async () => {
    // An unauthorized caller must see 403 for every verb — if POST-with-bad-Host
    // returned 405, the endpoint would leak "I exist, I expect GET" to cross-
    // origin callers. Both GET and POST from the same bad Host must return the
    // same 403 response with the same error slug.
    const getRes = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      headers: { Host: 'attacker.example.com' },
    });
    const postRes = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      method: 'POST',
      headers: { Host: 'attacker.example.com' },
    });
    expect(getRes.status).toBe(403);
    expect(postRes.status).toBe(403);
    const getBody = (await getRes.json()) as { error: string };
    const postBody = (await postRes.json()) as { error: string };
    expect(getBody.error).toBe('host-header-not-allowed');
    expect(postBody.error).toBe('host-header-not-allowed');
  });
});

describe('GET /api/workspace — filesystem edge cases', () => {
  // Dedicated server for this block because deleting contentDir partway
  // through the suite would corrupt the shared server's state. Uses
  // `keepContentDir: false` (default) so cleanup still attempts rmSync — which
  // is a no-op when we've already deleted the directory.
  let fsServer: TestServer;

  beforeAll(async () => {
    fsServer = await createTestServer();
  });

  afterAll(async () => {
    await fsServer.cleanup();
  });

  test('ENOENT on realpath returns 200 with symlinkResolved:false and unresolved path', async () => {
    // Delete contentDir out from under the server — simulates the user
    // rm -rf'ing their workspace in another terminal while the server keeps
    // running. The persistence layer's symlink contract says "return the
    // unresolved path, let the client decide whether to act on it."
    rmSync(fsServer.contentDir, { recursive: true, force: true });
    const res = await fetch(`http://127.0.0.1:${fsServer.port}/api/workspace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      contentDir: string;
      pathSeparator: string;
      symlinkResolved: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.symlinkResolved).toBe(false);
    expect(body.contentDir).toBe(fsServer.contentDir);
    expect(body.pathSeparator).toBe(sep);
  });
});
