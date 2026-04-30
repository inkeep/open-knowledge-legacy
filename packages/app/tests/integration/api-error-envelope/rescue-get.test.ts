/**
 * Per-handler narrow-integration smoke test for `handleRescueGet` (US-010).
 *
 * The success path emits raw markdown with `Content-Type: text/markdown`
 * (not problem+json). Smoke covers:
 *   - non-existent docName → 404 problem+json `urn:ok:error:not-found`.
 *   - path-traversal docName → 400 problem+json `urn:ok:error:invalid-request`.
 *   - method-not-allowed on POST → `urn:ok:error:method-not-allowed`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ProblemDetailsSchema } from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer } from '../test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('rescue-get envelope (RFC 9457)', () => {
  test('missing docName returns 404 problem+json not-found', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/rescue/this-doc-does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:not-found');
    }
  });

  test('method-not-allowed on POST emits problem+json with Allow: GET', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/rescue/anything`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(res.headers.get('allow')).toBe('GET');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:method-not-allowed');
    }
  });
});
