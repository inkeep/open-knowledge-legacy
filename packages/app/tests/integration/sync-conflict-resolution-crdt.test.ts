import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createTestClient, createTestServer, pollUntil, type TestServer } from './test-harness';

const BASE_CONTENT = '# Base\n\nBase paragraph.\n';
const THEIRS_CONTENT = '# Theirs\n\nTeam version.\n';
const CONFLICT_MARKERS =
  '<<<<<<< HEAD\n# Mine\n\nLocal version.\n=======\n# Theirs\n\nTeam version.\n>>>>>>> origin/main\n';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
}, 30_000);

async function setupServerWithDoc(docName: string, initial: string): Promise<TestServer> {
  const server = await createTestServer({ debounce: 100, maxDebounce: 500 });
  cleanups.push(() => server.cleanup());
  writeFileSync(join(server.contentDir, `${docName}.md`), initial, 'utf-8');
  await pollUntil(async () => {
    const res = await fetch(`http://localhost:${server.port}/api/documents`).catch(() => null);
    if (!res?.ok) return false;
    const data = (await res.json()) as { documents?: Array<{ docName: string }> };
    return data.documents?.some((d) => d.docName === docName) ?? false;
  });
  return server;
}

describe('case "conflict" disk event -> CRDT lifecycle', () => {
  test('clears lifecycle.status after conflict resolves to theirs', async () => {
    const docName = `conflict-clear-${crypto.randomUUID()}`;
    const server = await setupServerWithDoc(docName, BASE_CONTENT);
    const client = await createTestClient(server.port, docName);
    cleanups.push(() => client.cleanup());

    await pollUntil(() => client.ytext.toString().includes('Base paragraph'));

    const lifecycle = client.doc.getMap('lifecycle');
    const filePath = join(server.contentDir, `${docName}.md`);

    writeFileSync(filePath, CONFLICT_MARKERS, 'utf-8');

    await pollUntil(() => lifecycle.get('status') === 'conflict', 10_000);

    writeFileSync(filePath, THEIRS_CONTENT, 'utf-8');

    await pollUntil(() => client.ytext.toString().includes('Team version'), 10_000);

    expect(client.ytext.toString()).toContain('Team version');
    expect(client.ytext.toString()).not.toContain('Base paragraph');

    await pollUntil(() => lifecycle.get('status') === undefined, 5000);
    expect(lifecycle.get('reason')).toBeUndefined();
  }, 30_000);

  test('clears lifecycle.status on noop reconcile (keep-mine path)', async () => {
    const docName = `conflict-noop-${crypto.randomUUID()}`;
    const server = await setupServerWithDoc(docName, BASE_CONTENT);
    const client = await createTestClient(server.port, docName);
    cleanups.push(() => client.cleanup());

    await pollUntil(() => client.ytext.toString().includes('Base paragraph'));

    const lifecycle = client.doc.getMap('lifecycle');
    const filePath = join(server.contentDir, `${docName}.md`);

    writeFileSync(filePath, CONFLICT_MARKERS, 'utf-8');
    await pollUntil(() => lifecycle.get('status') === 'conflict', 10_000);

    writeFileSync(filePath, BASE_CONTENT, 'utf-8');

    await pollUntil(() => lifecycle.get('status') === undefined, 5000);
    expect(lifecycle.get('reason')).toBeUndefined();
    expect(client.ytext.toString()).toContain('Base paragraph');
  }, 30_000);

  test('persistence does not overwrite conflict markers on disk during conflict', async () => {
    const docName = `conflict-persist-${crypto.randomUUID()}`;
    const server = await setupServerWithDoc(docName, BASE_CONTENT);
    const client = await createTestClient(server.port, docName);
    cleanups.push(() => client.cleanup());

    await pollUntil(() => client.ytext.toString().includes('Base paragraph'));

    const lifecycle = client.doc.getMap('lifecycle');
    const filePath = join(server.contentDir, `${docName}.md`);

    writeFileSync(filePath, CONFLICT_MARKERS, 'utf-8');
    await pollUntil(() => lifecycle.get('status') === 'conflict', 10_000);

    expect(readFileSync(filePath, 'utf-8')).toContain('<<<<<<<');

    client.doc.transact(() => {
      client.ytext.insert(client.ytext.length, '\n\nEdit during conflict.\n');
    });

    await pollUntil(() => {
      const serverDoc = server.instance.hocuspocus.documents.get(docName);
      return serverDoc?.getText('source').toString().includes('Edit during conflict') ?? false;
    }, 5000);

    await wait(1500);

    const diskNow = readFileSync(filePath, 'utf-8');
    expect(diskNow).toContain('<<<<<<<');
    expect(diskNow).toContain('=======');
    expect(diskNow).toContain('>>>>>>>');
    expect(diskNow).not.toContain('Edit during conflict');
  }, 30_000);
});
