/**
 * Form ↔ frontmatter_patch end-to-end integration (US-010).
 *
 * Exercises the wire that the property panel uses in production:
 * `POST /api/frontmatter-patch` against a live Hocuspocus server, with real
 * WebSocket clients observing per-key Y.Map state and the source-mode Y.Text
 * mirror.
 *
 * Three AC paths are covered: (a) concurrent writes to different keys merge at
 * the field level (FR3 / D2); (b) concurrent same-key form vs source-mode
 * resolves as per-key LWW (D27); (c) form-only writes propagate to Y.Text via
 * Observer A (FR10).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getFrontmatterMap } from '@inkeep/open-knowledge-core';
import {
  awaitDocQuiescence,
  createTestClient,
  createTestServer,
  pollUntil,
  type TestServer,
  wait,
} from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

interface PatchResponse {
  status: number;
  body: { ok: boolean; error?: string; fieldErrors?: Record<string, string> };
}

async function frontmatterPatch(
  port: number,
  docName: string,
  patch: Record<string, unknown>,
): Promise<PatchResponse> {
  const res = await fetch(`http://localhost:${port}/api/frontmatter-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, patch }),
  });
  let body: PatchResponse['body'] = { ok: false };
  try {
    body = (await res.json()) as PatchResponse['body'];
  } catch {}
  return { status: res.status, body };
}

describe('US-010: form writes via /api/frontmatter-patch', () => {
  test('concurrent writes to different keys both survive (FR3 / D2)', async () => {
    const docName = `us010-concurrent-diff-${crypto.randomUUID()}`;
    const client = await createTestClient(server.port, docName);
    try {
      // Two clients targeting DIFFERENT keys via the same HTTP surface.
      // Field-level CRDT merge means both writes must land regardless of order.
      const [a, b] = await Promise.all([
        frontmatterPatch(server.port, docName, { title: 'Updated' }),
        frontmatterPatch(server.port, docName, { topics: ['research', 'crdt'] }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      await pollUntil(() => {
        const map = getFrontmatterMap(client.doc);
        return map.title === 'Updated' && Array.isArray(map.topics);
      }, 5000);

      const finalMap = getFrontmatterMap(client.doc);
      expect(finalMap.title).toBe('Updated');
      expect(finalMap.topics).toEqual(['research', 'crdt']);
    } finally {
      await client.cleanup();
    }
  });

  test('same-key form patch then source-mode rewrite is per-key LWW (D27)', async () => {
    const docName = `us010-same-key-lww-${crypto.randomUUID()}`;
    const client = await createTestClient(server.port, docName);
    try {
      // 1. Seed via form patch
      const seed = await frontmatterPatch(server.port, docName, { status: 'draft' });
      expect(seed.status).toBe(200);
      await pollUntil(() => getFrontmatterMap(client.doc).status === 'draft', 5000);

      // 2. Source-mode rewrite — overwrites Y.Text with new YAML for the same key.
      // Observer B reconciles this into per-key Y.Map. Per D27 LWW, the
      // source-mode value wins over the prior form value at the same key slot.
      const composedYaml = '---\nstatus: published\n---\n# Body\n';
      client.doc.transact(() => {
        client.ytext.delete(0, client.ytext.length);
        client.ytext.insert(0, composedYaml);
      });

      await pollUntil(() => getFrontmatterMap(client.doc).status === 'published', 5000);

      // 3. Form patch sets the same key once more — last writer wins.
      const result = await frontmatterPatch(server.port, docName, { status: 'archived' });
      expect(result.status).toBe(200);
      await pollUntil(() => getFrontmatterMap(client.doc).status === 'archived', 5000);

      // No corruption — `status` is exactly one of the three values, never a partial.
      expect(getFrontmatterMap(client.doc).status).toBe('archived');
    } finally {
      await client.cleanup();
    }
  });

  test('form-only write propagates composed YAML+body to Y.Text via Observer A (FR10)', async () => {
    const docName = `us010-ytext-mirror-${crypto.randomUUID()}`;
    const client = await createTestClient(server.port, docName);
    try {
      // Seed body content via the existing agent path so XmlFragment has shape
      // that prepend-frontmatter will compose against.
      const seedBody = await fetch(`http://localhost:${server.port}/api/agent-write-md`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docName,
          markdown: '# Heading\n\nBody text.\n',
          position: 'replace',
        }),
      });
      expect(seedBody.ok).toBe(true);

      await pollUntil(() => client.ytext.toString().includes('Heading'), 5000);

      // Form-only write — touches ONLY metaMap. No XmlFragment, no direct Y.Text.
      // Observer A must fire on the per-key change (US-004) and recompose.
      const result = await frontmatterPatch(server.port, docName, {
        title: 'From Form',
        draft: true,
      });
      expect(result.status).toBe(200);

      // Wait for Observer A's composed YAML to appear in Y.Text.
      await pollUntil(() => {
        const text = client.ytext.toString();
        return text.includes('title: From Form') && text.includes('draft: true');
      }, 5000);

      await awaitDocQuiescence(client.doc, { timeoutMs: 1000 });

      // Per-key state is the source of truth; Y.Text is its derived mirror.
      const map = getFrontmatterMap(client.doc);
      expect(map.title).toBe('From Form');
      expect(map.draft).toBe(true);

      // Y.Text starts with `---\n` frontmatter fence and ends with the body.
      const text = client.ytext.toString();
      expect(text.startsWith('---\n')).toBe(true);
      expect(text).toContain('Heading');
      expect(text).toContain('Body text');
    } finally {
      await client.cleanup();
    }
  });

  test('400 with fieldErrors surfaces per-key error (form rollback contract)', async () => {
    const docName = `us010-validation-${crypto.randomUUID()}`;
    const client = await createTestClient(server.port, docName);
    try {
      // Seed a clean baseline.
      const seed = await frontmatterPatch(server.port, docName, { title: 'Baseline' });
      expect(seed.status).toBe(200);
      await pollUntil(() => getFrontmatterMap(client.doc).title === 'Baseline', 5000);

      // Patch with a value that fails Zod (object — not in the value union).
      const bad = await frontmatterPatch(server.port, docName, {
        ok_key: 'fine',
        // biome-ignore lint/suspicious/noExplicitAny: deliberate type violation
        bad_key: { nested: 'object' } as any,
      });
      expect(bad.status).toBe(400);
      expect(bad.body.ok).toBe(false);
      expect(bad.body.fieldErrors).toBeDefined();
      expect(bad.body.fieldErrors?.bad_key).toBeDefined();

      // Atomic reject — neither key landed.
      await wait(50);
      const map = getFrontmatterMap(client.doc);
      expect(map.title).toBe('Baseline');
      expect(map.ok_key).toBeUndefined();
      expect(map.bad_key).toBeUndefined();
    } finally {
      await client.cleanup();
    }
  });
});
