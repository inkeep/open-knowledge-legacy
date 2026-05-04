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

  test('rejects non-GET methods with 405 and error:Method not allowed', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Method not allowed');
  });

  test('rejects DNS-rebinding Host header with 403 even from loopback peer', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/workspace`, {
      headers: { Host: 'attacker.example.com' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('host-header-not-allowed');
  });

  test('Host-header check fires before method dispatch (no verb fingerprinting)', async () => {
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
  let fsServer: TestServer;

  beforeAll(async () => {
    fsServer = await createTestServer();
  });

  afterAll(async () => {
    await fsServer.cleanup();
  });

  test('ENOENT on realpath returns 200 with symlinkResolved:false and unresolved path', async () => {
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
