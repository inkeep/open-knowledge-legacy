/**
 * Per-handler narrow-integration smoke test for `handleRename` (FR10 / D16, US-007).
 *
 * Asserts the canonical RFC 9457 wire shape:
 *   - happy path: status 200, `Content-Type: application/json`, body parses
 *     against `RenameSuccessSchema`, no `ok: true` discriminator.
 *   - missing newDocName → `urn:ok:error:invalid-request`.
 *   - reserved docname → `urn:ok:error:reserved-docname`.
 *   - source doesn't exist → `urn:ok:error:doc-not-found`.
 *   - destination already exists → `urn:ok:error:doc-already-exists`.
 *   - method-not-allowed on GET emits `urn:ok:error:method-not-allowed`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ProblemDetailsSchema, RenameSuccessSchema } from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer } from '../test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

async function postCreate(body: Record<string, unknown>): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postRename(body: Record<string, unknown>): Promise<Response> {
  return fetch(`http://127.0.0.1:${server.port}/api/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('rename envelope (RFC 9457)', () => {
  test('happy path emits flat success body with application/json', async () => {
    const id = crypto.randomUUID().slice(0, 8);
    const sourcePath = `rename-source-${id}.md`;
    const sourceDocName = `rename-source-${id}`;
    const targetDocName = `rename-target-${id}`;

    const created = await postCreate({ path: sourcePath });
    expect(created.status).toBe(200);

    const res = await postRename({ docName: sourceDocName, newDocName: targetDocName });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');

    const body = await res.json();
    const parsed = RenameSuccessSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.renamed.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.data.rewrittenDocs)).toBe(true);
    }
    expect((body as Record<string, unknown>).ok).toBeUndefined();
  });

  test('missing newDocName emits urn:ok:error:invalid-request', async () => {
    const res = await postRename({ docName: 'foo' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json');

    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:invalid-request');
    }
  });

  test('reserved docname emits urn:ok:error:reserved-docname', async () => {
    const res = await postRename({ docName: 'test-doc', newDocName: '__system__' });
    expect(res.status).toBe(400);
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:reserved-docname');
    }
  });

  test('source doesn’t exist emits urn:ok:error:doc-not-found', async () => {
    const res = await postRename({
      docName: `does-not-exist-${crypto.randomUUID().slice(0, 8)}`,
      newDocName: 'whatever',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:doc-not-found');
    }
  });

  test('destination already exists emits urn:ok:error:doc-already-exists', async () => {
    const id = crypto.randomUUID().slice(0, 8);
    const sourcePath = `rename-conflict-src-${id}.md`;
    const destPath = `rename-conflict-dest-${id}.md`;
    const sourceDocName = `rename-conflict-src-${id}`;
    const destDocName = `rename-conflict-dest-${id}`;

    await postCreate({ path: sourcePath });
    await postCreate({ path: destPath });

    const res = await postRename({ docName: sourceDocName, newDocName: destDocName });
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toBe('application/problem+json');

    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:doc-already-exists');
      expect(parsed.data.status).toBe(409);
    }
  });

  test('method-not-allowed on GET emits problem+json with Allow: POST', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/rename`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    const body = await res.json();
    const parsed = ProblemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('urn:ok:error:method-not-allowed');
    }
  });
});
