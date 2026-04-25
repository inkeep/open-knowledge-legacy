import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  type CC1DerivedViewPayload,
  CC1DerivedViewPayloadSchema,
  SYSTEM_DOC_NAME,
} from '@inkeep/open-knowledge-core';
import { applyExternalChange, BacklinkIndex, reconcile } from '@inkeep/open-knowledge-server';
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
  signals: CC1DerivedViewPayload[];
  destroy: () => void;
} {
  const doc = new Y.Doc();
  const signals: CC1DerivedViewPayload[] = [];
  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: SYSTEM_DOC_NAME,
    document: doc,
    connect: true,
    onStateless: ({ payload }) => {
      let raw: unknown;
      try {
        raw = JSON.parse(payload);
      } catch {
        return;
      }
      const result = CC1DerivedViewPayloadSchema.safeParse(raw);
      // Only track 'files' channel signals — backlinks/graph signals from
      // server observer processing should not affect file-event assertions.
      // Mismatched-channel payloads (server-info, branch-switched) parse-fail
      // here and are silently skipped.
      if (result.success && result.data.ch === 'files') {
        signals.push(result.data);
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

  // ─── QA-005: delete DiskEvent → ch:'files' signal ─────────────────────────
  test('file delete triggers ch:files signal', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);

      // Create first
      const fileName = `cc1-delete-test-${crypto.randomUUID()}.md`;
      const filePath = join(server.contentDir, fileName);
      writeFileSync(filePath, '# to be deleted\n', 'utf-8');
      await wait(500);
      const createCount = signals.length;
      expect(createCount).toBeGreaterThanOrEqual(1);

      // Delete it
      unlinkSync(filePath);
      await wait(500);

      // One more signal should have arrived for the delete
      expect(signals.length).toBeGreaterThan(createCount);
      const deleteSignal = signals[signals.length - 1];
      expect(deleteSignal.v).toBe(1);
      expect(deleteSignal.ch).toBe('files');
      expect(deleteSignal.seq).toBeGreaterThan(0);
    } finally {
      destroy();
    }
  });

  // ─── QA-006: rename DiskEvent → ch:'files' signal ─────────────────────────
  test('file rename triggers ch:files signal', async () => {
    const { provider, signals, destroy } = connectSystemDoc(server.port);
    try {
      await waitForSync(provider);

      // Create first
      const oldName = `cc1-rename-old-${crypto.randomUUID()}.md`;
      const newName = `cc1-rename-new-${crypto.randomUUID()}.md`;
      const oldPath = join(server.contentDir, oldName);
      const newPath = join(server.contentDir, newName);
      writeFileSync(oldPath, '# to be renamed\n', 'utf-8');
      await wait(500);
      const createCount = signals.length;
      expect(createCount).toBeGreaterThanOrEqual(1);

      // Rename it
      renameSync(oldPath, newPath);
      await wait(600);

      // At least one more signal should have arrived for the rename
      expect(signals.length).toBeGreaterThan(createCount);
      const lastSignal = signals[signals.length - 1];
      expect(lastSignal.v).toBe(1);
      expect(lastSignal.ch).toBe('files');
    } finally {
      destroy();
    }
  });

  // ─── QA-017: reconcile({docName:'__system__'}) → noop ──────────────────────
  test('reconcile with __system__ docName returns noop', () => {
    const result = reconcile({
      docName: SYSTEM_DOC_NAME,
      base: '',
      ours: 'any content',
      theirs: 'different content',
    });
    expect(result.kind).toBe('noop');
  });

  // ─── QA-018: backlinkIndex skips __system__ entries ────────────────────────
  test('BacklinkIndex.updateDocument(__system__, ...) is a no-op', () => {
    const idx = new BacklinkIndex({
      projectDir: server.contentDir,
      contentDir: server.contentDir,
    });

    idx.updateDocument(SYSTEM_DOC_NAME, [{ target: 'some-page', snippet: null }]);
    idx.updateDocumentFromMarkdown(SYSTEM_DOC_NAME, '# Has [[some-page]] link');

    // Forward graph must not carry a __system__ source entry
    expect(idx.getForwardLinks(SYSTEM_DOC_NAME)).toEqual([]);

    // Backward graph must not carry __system__ as a source for any target
    const backlinks = idx.getBacklinks('some-page');
    expect(backlinks.find((b) => b.source === SYSTEM_DOC_NAME)).toBeUndefined();

    // deleteDocument with __system__ is also a no-op (should not throw)
    expect(() => idx.deleteDocument(SYSTEM_DOC_NAME)).not.toThrow();
  });

  // ─── QA-019: AgentSessionManager refuses __system__ ────────────────────────
  test('AgentSessionManager.getSession(__system__) throws', async () => {
    await expect(server.instance.sessionManager.getSession(SYSTEM_DOC_NAME)).rejects.toThrow(
      /reserved/i,
    );
  });

  // ─── QA-020: applyExternalChange with __system__ is a no-op ────────────────
  test('applyExternalChange(__system__, content) does not throw and does not mutate', () => {
    // The pseudo-doc has been pre-materialized by createServer; applyExternalChange must
    // return immediately without touching its Y.Doc.
    const systemDoc = server.instance.hocuspocus.documents.get(SYSTEM_DOC_NAME);
    const beforeXmlLen = systemDoc?.getXmlFragment('default').length ?? 0;
    const beforeTextLen = systemDoc?.getText('source').length ?? 0;

    expect(() =>
      applyExternalChange(server.instance.hocuspocus, SYSTEM_DOC_NAME, '# should be ignored'),
    ).not.toThrow();

    const afterXmlLen = systemDoc?.getXmlFragment('default').length ?? 0;
    const afterTextLen = systemDoc?.getText('source').length ?? 0;

    expect(afterXmlLen).toBe(beforeXmlLen);
    expect(afterTextLen).toBe(beforeTextLen);
  });

  // ─── QA-025: Latency p95 < 500ms (local, 2s CI loose budget) ───────────────
  test('disk-to-signal latency p95 under budget', async () => {
    // Use a fresh provider with a timestamp-capturing onStateless callback so we
    // measure actual arrival delta, not the wait(500) upper bound.
    const doc = new Y.Doc();
    const arrivals: Array<{ seq: number; at: number }> = [];
    const provider = new HocuspocusProvider({
      url: `ws://localhost:${server.port}/collab`,
      name: SYSTEM_DOC_NAME,
      document: doc,
      connect: true,
      onStateless: ({ payload }) => {
        try {
          const parsed = JSON.parse(payload) as CC1DerivedViewPayload;
          arrivals.push({ seq: parsed.seq, at: performance.now() });
        } catch {
          // ignore
        }
      },
    });
    try {
      await waitForSync(provider);
      await wait(100);

      const sendTimes: number[] = [];

      // 20 spaced writes at 200ms intervals (outside 100ms debounce window)
      const N = 20;
      for (let i = 0; i < N; i++) {
        const fileName = `cc1-latency-${i}-${crypto.randomUUID()}.md`;
        const sendAt = performance.now();
        writeFileSync(join(server.contentDir, fileName), `# ${i}\n`, 'utf-8');
        sendTimes.push(sendAt);
        await wait(200);
      }

      // Wait for final debounce
      await wait(500);

      // Pair writes to arrivals in order — if fewer arrivals than writes (OS coalesced),
      // pair only what we have.
      const paired = Math.min(sendTimes.length, arrivals.length);
      const latencies: number[] = [];
      for (let i = 0; i < paired; i++) {
        latencies.push(arrivals[i].at - sendTimes[i]);
      }

      if (latencies.length === 0) {
        throw new Error('no latency samples captured');
      }

      latencies.sort((a, b) => a - b);
      const p95Idx = Math.max(0, Math.floor(latencies.length * 0.95) - 1);
      const p95 = latencies[p95Idx];

      // CI loose bound: 2s per SPEC §14 risk row. Local target: <500ms.
      expect(p95).toBeLessThan(2000);
    } finally {
      provider.destroy();
      doc.destroy();
    }
  });
});
