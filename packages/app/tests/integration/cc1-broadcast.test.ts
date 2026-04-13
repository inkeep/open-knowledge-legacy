import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { type CC1Signal, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';
import { createTestServer, type TestServer, wait, waitForSync } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

function connectSystemDoc(port: number): {
  provider: HocuspocusProvider;
  signals: CC1Signal[];
  destroy: () => void;
} {
  const doc = new Y.Doc();
  const signals: CC1Signal[] = [];
  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: SYSTEM_DOC_NAME,
    document: doc,
    connect: true,
    onStateless: ({ payload }) => {
      try {
        const parsed = JSON.parse(payload) as CC1Signal;
        signals.push(parsed);
      } catch {
        // ignore malformed payloads
      }
    },
  });

  return {
    provider,
    signals,
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}

describe('CC1 broadcast — L1 integration', () => {
  test('disk write triggers onStateless with valid CC1 signal', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);
      await wait(100);

      const fileName = `cc1-test-${crypto.randomUUID()}.md`;
      writeFileSync(join(server.contentDir, fileName), '# hello\n', 'utf-8');

      // Wait for watcher + debounce + broadcast
      await wait(500);

      expect(signals.length).toBeGreaterThanOrEqual(1);
      const signal = signals[0];
      expect(signal.v).toBe(1);
      expect(signal.ch).toBe('files');
      expect(typeof signal.seq).toBe('number');
      expect(signal.seq).toBeGreaterThanOrEqual(1);
    } finally {
      destroy();
    }
  });

  test('10 spaced creates produce 10 signals with monotonic seq', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);
      await wait(100);

      for (let i = 0; i < 10; i++) {
        const fileName = `cc1-mono-${i}-${crypto.randomUUID()}.md`;
        writeFileSync(join(server.contentDir, fileName), `# file ${i}\n`, 'utf-8');
        await wait(200);
      }

      // Wait for final debounce
      await wait(300);

      expect(signals.length).toBe(10);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i].seq).toBeGreaterThan(signals[i - 1].seq);
      }
    } finally {
      destroy();
    }
  });

  test('burst of rapid creates debounces to ~1 signal', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);
      await wait(100);

      for (let i = 0; i < 50; i++) {
        const fileName = `cc1-burst-${i}-${crypto.randomUUID()}.md`;
        writeFileSync(join(server.contentDir, fileName), `# burst ${i}\n`, 'utf-8');
      }

      // Wait for debounce to settle
      await wait(500);

      // Expect a small number of signals (debounce collapses the burst)
      // The exact number depends on watcher batching, but should be much less than 50
      expect(signals.length).toBeLessThanOrEqual(5);
      expect(signals.length).toBeGreaterThanOrEqual(1);
    } finally {
      destroy();
    }
  });

  test('file update does not trigger ch:files signal', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);

      // Create a file first
      const fileName = `cc1-update-test-${crypto.randomUUID()}.md`;
      const filePath = join(server.contentDir, fileName);
      writeFileSync(filePath, '# original\n', 'utf-8');

      // Wait for the create signal
      await wait(500);
      const createCount = signals.length;
      expect(createCount).toBeGreaterThanOrEqual(1);

      // Now update the file (should NOT trigger ch:files)
      writeFileSync(filePath, '# updated content\n', 'utf-8');

      // Wait and verify no new signal
      await wait(500);
      expect(signals.length).toBe(createCount);
    } finally {
      destroy();
    }
  });

  test('skip surface: no __system__ state in any subsystem', async () => {
    // After server has been running with CC1 active, verify no leaked state

    // No __system__.md on disk
    expect(existsSync(join(server.contentDir, '__system__.md'))).toBe(false);

    // File index has no __system__ entry
    const docsRes = await fetch(`http://localhost:${server.port}/api/documents`);
    const body = (await docsRes.json()) as { documents: Array<{ docName: string }> };
    const systemDocs = body.documents.filter((d) => d.docName === '__system__');
    expect(systemDocs).toHaveLength(0);
  });

  test('POST /api/create-page rejects __system__ docName', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/create-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '__system__.md' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain('reserved');
  });

  test('signal payload shape conforms to CC1 contract v1', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);
      await wait(100);

      const fileName = `cc1-shape-${crypto.randomUUID()}.md`;
      writeFileSync(join(server.contentDir, fileName), '# shape test\n', 'utf-8');
      await wait(500);

      expect(signals.length).toBeGreaterThanOrEqual(1);
      const payload = signals[0];
      expect(Object.keys(payload).sort()).toEqual(['ch', 'seq', 'v']);
      expect(payload.v).toBe(1);
      expect(typeof payload.ch).toBe('string');
      expect(typeof payload.seq).toBe('number');
    } finally {
      destroy();
    }
  });
});
