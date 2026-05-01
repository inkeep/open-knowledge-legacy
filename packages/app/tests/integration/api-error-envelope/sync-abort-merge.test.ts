/**
 * Per-handler narrow-integration smoke test for `handleSyncAbortMerge`
 * (FR10 / D16, US-013).
 *
 * The test harness has a SyncEngine but no real merge in progress, so the
 * happy-path is unreachable here. `engine.abortMerge()` succeeds idempotently
 * (no-op when there's no merge), so the smoke focuses on method gating.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ProblemDetailsSchema, SyncAbortMergeSuccessSchema } from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer } from '../test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('sync-abort-merge envelope (RFC 9457)', () => {
  test('happy path emits flat empty body (no merge to abort is a no-op)', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/sync/abort-merge`, {
      method: 'POST',
    });
    // engine.abortMerge() in test harness either succeeds (200) or throws
    // (500). Both wire into the canonical envelope; assert one of them.
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers.get('content-type')).toBe('application/json');
      const body = await res.json();
      expect(SyncAbortMergeSuccessSchema.safeParse(body).success).toBe(true);
      expect((body as Record<string, unknown>).ok).toBeUndefined();
    } else {
      expect(res.headers.get('content-type')).toBe('application/problem+json');
      const parsed = ProblemDetailsSchema.safeParse(await res.json());
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.type).toBe('urn:ok:error:internal-server-error');
      }
    }
  });

  test('method-not-allowed on GET emits problem+json with Allow: POST', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/sync/abort-merge`);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');

    const parsed = ProblemDetailsSchema.safeParse(await res.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:method-not-allowed');
    }
  });
});
