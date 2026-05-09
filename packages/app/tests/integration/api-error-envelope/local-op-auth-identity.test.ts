import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  LocalOpAuthIdentitySuccessSchema,
  ProblemDetailsSchema,
} from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer } from '../test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('local-op-auth-identity envelope (RFC 9457, US-012)', () => {
  test('happy path returns flat { identity } with application/json', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/local-op/auth/identity`, {
      method: 'GET',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = await res.json();
    const parsed = LocalOpAuthIdentitySuccessSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect((body as Record<string, unknown>).ok).toBeUndefined();
  });

  test('method-not-allowed on POST emits problem+json with Allow: GET', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/local-op/auth/identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:method-not-allowed');
    }
  });
});
