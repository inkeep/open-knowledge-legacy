/**
 * Per-handler narrow-integration smoke test for `handleDiff` (US-010).
 *
 *   - missing/invalid `to` → `urn:ok:error:invalid-request`.
 *   - valid `to` SHA without a commit → `urn:ok:error:doc-not-found`.
 *   - method-not-allowed on POST → `urn:ok:error:method-not-allowed`
 *     + `Allow: GET`.
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

describe('diff envelope (RFC 9457)', () => {
  test('missing `to` query param emits problem+json invalid-request', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/diff?docName=test-doc`);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:invalid-request');
    }
  });

  test('valid `to` SHA without commit emits problem+json doc-not-found', async () => {
    const fakeSha = '0123456789abcdef0123456789abcdef01234567';
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/diff?docName=test-doc&to=${fakeSha}`,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:doc-not-found');
    }
  });

  test('method-not-allowed on POST emits problem+json with Allow: GET', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/diff?docName=test-doc`, {
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
