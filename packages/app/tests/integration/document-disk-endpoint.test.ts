/**
 * Integration tests for GET /api/document-disk (V2 SPEC FR11 — Option E backend).
 *
 * Verifies:
 *   1. Happy path returns disk bytes + mtime + bytes
 *   2. Missing doc returns 404
 *   3. Invalid docName shapes are rejected (400)
 *   4. Non-GET methods rejected (405)
 *   5. Reserved system doc name rejected (400)
 *   6. No Y.Doc session side-effect — the docs set before/after is the
 *      same (we only test that creating the request doesn't register
 *      the document; the server-lock + session bookkeeping remains
 *      invariant).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestServer, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('GET /api/document-disk — happy path', () => {
  test('returns disk bytes + mtime + bytes for an existing doc', async () => {
    // Write a test doc to disk first — the file watcher picks it up.
    const docName = 'v2-disk-endpoint-happy';
    const docPath = join(server.contentDir, `${docName}.md`);
    const content = '# Hello\n\nBody of the doc.\n';
    writeFileSync(docPath, content, 'utf-8');

    // Wait for the watcher to register the file.
    await new Promise((r) => setTimeout(r, 300));

    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk?docName=${docName}`);
    expect(res.status).toBe(200);
    // Response shape aligned with /api/document (review Minor #16 post-fix):
    // `content` + `sizeBytes` are the canonical names; `markdown` + `bytes`
    // remain duplicated for one rollout cycle.
    const body = (await res.json()) as {
      ok: boolean;
      docName: string;
      content: string;
      sizeBytes: number;
      mtime: number;
      markdown: string;
      bytes: number;
    };
    expect(body.ok).toBe(true);
    expect(body.docName).toBe(docName);
    expect(body.content).toBe(content);
    expect(body.sizeBytes).toBe(content.length);
    expect(typeof body.mtime).toBe('number');
    // Backwards-compat keys duplicate the canonical values.
    expect(body.markdown).toBe(content);
    expect(body.bytes).toBe(content.length);
    // Cache-Control: no-store (review Minor #23).
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/document-disk — error cases', () => {
  test('missing doc returns 404', async () => {
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/document-disk?docName=does-not-exist`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('not found');
  });

  test('missing docName param returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test('invalid docName shape returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk?docName=../escape`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test('system reserved docName returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk?docName=__system__`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('reserved');
  });

  test('POST (non-GET) method returns 405', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk?docName=x`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
  });
});

describe('GET /api/document-disk — STOP rule: no Y.Doc session created', () => {
  test('requesting an existing doc does not register a new Y.Doc in sessionManager', async () => {
    // Write a disk-only doc (no Y.Doc session should exist for it).
    const docName = 'v2-disk-nosession';
    const docPath = join(server.contentDir, `${docName}.md`);
    writeFileSync(docPath, '# Test\n', 'utf-8');
    await new Promise((r) => setTimeout(r, 300));

    // Count sessions BEFORE the request. Use the hocuspocus documents Map
    // as the source of truth — `/api/document` registers a session there
    // via sessionManager.getSession, `/api/document-disk` must NOT.
    // biome-ignore lint/suspicious/noExplicitAny: reach into hocuspocus internals for diagnostic
    const hocuspocus = (server.instance as any).hocuspocus;
    const beforeKeys = new Set<string>(Array.from(hocuspocus.documents.keys()));

    // Request disk bytes.
    const res = await fetch(`http://127.0.0.1:${server.port}/api/document-disk?docName=${docName}`);
    expect(res.status).toBe(200);

    // Count sessions AFTER. The new doc should NOT appear in documents.
    const afterKeys = new Set<string>(Array.from(hocuspocus.documents.keys()));
    expect(afterKeys.has(docName)).toBe(false);

    // Specifically: the set should be unchanged (or may have dropped a
    // session that was evicted during the request; what matters is that
    // our docName didn't get added).
    for (const k of beforeKeys) {
      if (k === docName) {
        // sanity: guard against test pollution across runs
        throw new Error(`Pre-test state already contained session for ${docName}`);
      }
    }
  });
});
