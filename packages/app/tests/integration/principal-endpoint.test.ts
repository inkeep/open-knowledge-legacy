
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PrincipalResponseSchema } from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('GET /api/principal', () => {
  test('returns principal body that round-trips through PrincipalResponseSchema', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/principal`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = PrincipalResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(typeof parsed.data.id).toBe('string');
      expect(parsed.data.id.startsWith('principal-')).toBe(true);
      expect(['git-config', 'synthesized']).toContain(parsed.data.source);
    }
  });

  test('rejects DNS-rebinding Host header with 403 host-header-not-allowed', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/principal`, {
      headers: { Host: 'attacker.example.com' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('host-header-not-allowed');
  });

  test('Host-header check fires before method dispatch (no verb fingerprinting)', async () => {
    const getRes = await fetch(`http://127.0.0.1:${server.port}/api/principal`, {
      headers: { Host: 'attacker.example.com' },
    });
    const postRes = await fetch(`http://127.0.0.1:${server.port}/api/principal`, {
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
