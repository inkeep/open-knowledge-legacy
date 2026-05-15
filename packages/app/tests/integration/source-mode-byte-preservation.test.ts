import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { updateYFragment } from '@tiptap/y-tiptap';
import {
  agentWriteMd,
  assertBridgeInvariant,
  awaitDocQuiescence,
  createTestClient,
  createTestClients,
  createTestServer,
  mdManager,
  pollDiskContentStable,
  pollUntil,
  schema,
  serializeFragment,
  type TestClient,
  type TestServer,
} from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

/** Apply markdown to a client's XmlFragment via updateYFragment — simulates
 *  a y-prosemirror-driven WYSIWYG keystroke commit. The transact's origin is
 *  the default `null` — neither OBSERVER_SYNC_ORIGIN nor a paired-write origin,
 *  so server Observer A treats it as a genuine WYSIWYG mutation. */
function applyWysiwygEdit(client: TestClient, markdownAfterEdit: string): void {
  const parsed = mdManager.parse(markdownAfterEdit);
  const pmNode = schema.nodeFromJSON(parsed);
  client.doc.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(client.doc, client.fragment, pmNode, meta);
  });
}

describe('source-mode byte preservation under WYSIWYG-side activity', () => {
  test('H1: disk-loaded `_foo_` survives concurrent WYSIWYG mutation', async () => {
    const docName = `byte-preserve-h1-${crypto.randomUUID()}`;

    await agentWriteMd(server.port, '_foo_', { docName, position: 'replace' });
    await wait(300);

    const clients = await createTestClients(server.port, {
      count: 2,
      docName,
      perClientOptions: { skipInvariantWatcher: true },
    });

    try {
      await pollUntil(() => clients[0].ytext.toString() === '_foo_', 5000);
      await pollUntil(() => clients[1].ytext.toString() === '_foo_', 5000);

      expect(clients[0].ytext.toString()).toBe('_foo_');
      expect(clients[1].ytext.toString()).toBe('_foo_');

      applyWysiwygEdit(clients[1], '_foo_ bar');

      await wait(800);
      await awaitDocQuiescence(clients[0].doc, { timeoutMs: 3000 });
      await awaitDocQuiescence(clients[1].doc, { timeoutMs: 3000 });
      await pollUntil(() => clients[0].ytext.toString().includes('bar'), 5000);
      await pollUntil(() => clients[1].ytext.toString().includes('bar'), 5000);
      for (const c of clients) assertBridgeInvariant(c.ytext, c.fragment);

      const yA = clients[0].ytext.toString();
      const yB = clients[1].ytext.toString();
      const fragA = serializeFragment(clients[0].fragment);
      const fragB = serializeFragment(clients[1].fragment);

      const diag = {
        ytextA: yA,
        ytextB: yB,
        fragmentA: fragA,
        fragmentB: fragB,
      };

      expect(
        yA.includes('_foo_'),
        `Client A Y.Text lost underscore markers. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(true);
      expect(
        yB.includes('_foo_'),
        `Client B Y.Text lost underscore markers. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(true);

      expect(
        yA.includes('*foo*'),
        `Client A Y.Text shows canonical clobber. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(false);
      expect(
        yB.includes('*foo*'),
        `Client B Y.Text shows canonical clobber. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(false);

      expect(yA).toContain('bar');
      expect(yB).toContain('bar');

      expect(yA).toBe(yB);

      const diskPath = join(server.contentDir, `${docName}.md`);
      const diskContent = await pollDiskContentStable(diskPath, (c) => c.includes('bar'), {
        timeoutMs: 5000,
        settleMs: 300,
      });
      expect(
        diskContent.includes('_foo_'),
        `Disk file lost underscore markers. Content: ${JSON.stringify(diskContent)}`,
      ).toBe(true);
      expect(
        diskContent.includes('*foo*'),
        `Disk file shows canonical clobber. Content: ${JSON.stringify(diskContent)}`,
      ).toBe(false);
    } finally {
      for (const c of clients) await c.cleanup();
    }
  });

  test('H1-control: without WYSIWYG mutation, `_foo_` survives untouched', async () => {
    const docName = `byte-preserve-h1-control-${crypto.randomUUID()}`;
    await agentWriteMd(server.port, '_foo_', { docName, position: 'replace' });
    await wait(300);

    const client = await createTestClient(server.port, docName, {
      skipInvariantWatcher: true,
    });
    try {
      await pollUntil(() => client.ytext.toString() === '_foo_', 5000);
      expect(client.ytext.toString()).toBe('_foo_');

      assertBridgeInvariant(client.ytext, client.fragment);

      expect(client.ytext.toString()).toBe('_foo_');
      const diskPath = join(server.contentDir, `${docName}.md`);
      const diskContent = await pollDiskContentStable(diskPath, (c) => c.includes('_foo_'), {
        timeoutMs: 5000,
        settleMs: 300,
      });
      expect(diskContent).toContain('_foo_');
      expect(diskContent).not.toContain('*foo*');
    } finally {
      await client.cleanup();
    }
  });

  test('H2: CM6-typed `_foo_` then concurrent WYSIWYG edit — observe Path B behavior', async () => {
    const docName = `byte-preserve-h2-${crypto.randomUUID()}`;
    await agentWriteMd(server.port, 'placeholder', { docName, position: 'replace' });
    await wait(200);

    const clients = await createTestClients(server.port, {
      count: 2,
      docName,
      perClientOptions: { skipInvariantWatcher: true },
    });

    try {
      await pollUntil(() => clients[0].ytext.toString().includes('placeholder'), 5000);
      await pollUntil(() => clients[1].ytext.toString().includes('placeholder'), 5000);

      clients[0].doc.transact(() => {
        clients[0].ytext.delete(0, clients[0].ytext.length);
        clients[0].ytext.insert(0, '_foo_');
      });

      await wait(500);
      await pollUntil(() => clients[1].ytext.toString().includes('foo'), 5000);

      applyWysiwygEdit(clients[1], '_foo_ bar');

      await wait(800);
      await awaitDocQuiescence(clients[0].doc, { timeoutMs: 3000 });
      await awaitDocQuiescence(clients[1].doc, { timeoutMs: 3000 });
      await pollUntil(() => clients[0].ytext.toString().includes('bar'), 5000);
      await pollUntil(() => clients[1].ytext.toString().includes('bar'), 5000);
      for (const c of clients) assertBridgeInvariant(c.ytext, c.fragment);

      const yA = clients[0].ytext.toString();
      const yB = clients[1].ytext.toString();
      const fragA = serializeFragment(clients[0].fragment);
      const fragB = serializeFragment(clients[1].fragment);

      const diag = { ytextA: yA, ytextB: yB, fragmentA: fragA, fragmentB: fragB };

      expect(
        yA.includes('_foo_'),
        `Client A Y.Text lost underscore markers under Path B. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(true);
      expect(
        yA.includes('*foo*'),
        `Client A Y.Text shows canonical clobber under Path B. Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(false);
      expect(
        yB.includes('_foo_'),
        `Client B Y.Text lost underscore markers under Path B (mutator-side). Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(true);
      expect(
        yB.includes('*foo*'),
        `Client B Y.Text shows canonical clobber under Path B (mutator-side). Diag: ${JSON.stringify(diag, null, 2)}`,
      ).toBe(false);

      expect(yA).toContain('bar');
      expect(yB).toContain('bar');

      expect(yA).toBe(yB);

      const diskPath = join(server.contentDir, `${docName}.md`);
      const diskContent = await pollDiskContentStable(diskPath, (c) => c.includes('bar'), {
        timeoutMs: 5000,
        settleMs: 300,
      });
      expect(
        diskContent.includes('_foo_'),
        `Disk file lost underscore markers under Path B. Content: ${JSON.stringify(diskContent)}`,
      ).toBe(true);
      expect(
        diskContent.includes('*foo*'),
        `Disk file shows canonical clobber under Path B. Content: ${JSON.stringify(diskContent)}`,
      ).toBe(false);
    } finally {
      for (const c of clients) await c.cleanup();
    }
  });
});
