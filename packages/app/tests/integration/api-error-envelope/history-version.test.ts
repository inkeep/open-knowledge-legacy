/**
 * Per-handler narrow-integration smoke test for `handleHistoryVersion` (US-010).
 *
 * The dynamic `:sha` path parameter prevents `withValidation` integration;
 * the handler hand-rolls method gating + errorResponse calls. Smoke covers:
 *   - invalid SHA format → `urn:ok:error:invalid-request`.
 *   - 40-char SHA without a corresponding commit → `urn:ok:error:doc-not-found`.
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

describe('history-version envelope (RFC 9457)', () => {
  test('invalid SHA emits problem+json invalid-request', async () => {
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/history/not-a-sha?docName=test-doc`,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:invalid-request');
    }
  });

  test('valid SHA but missing commit emits problem+json doc-not-found', async () => {
    const fakeSha = '0123456789abcdef0123456789abcdef01234567';
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/history/${fakeSha}?docName=test-doc`,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:doc-not-found');
      expect(parsed.data.status).toBe(404);
    }
  });

  test('method-not-allowed on POST emits problem+json with Allow: GET', async () => {
    const fakeSha = '0123456789abcdef0123456789abcdef01234567';
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/history/${fakeSha}?docName=test-doc`,
      { method: 'POST' },
    );
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
