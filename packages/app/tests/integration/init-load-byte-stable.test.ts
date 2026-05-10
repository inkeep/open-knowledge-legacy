import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { runInit } from '../../../cli/src/commands/init.ts';
import { CORPUS, corpusDocName } from './_fixtures/init-load-byte-stable-corpus.ts';
import {
  diffManifest,
  mutationsOf,
  snapshotMarkdownOnly,
} from './_fixtures/init-load-byte-stable-snapshot.ts';
import { awaitDocQuiescence, createTestServer, type TestServer } from './test-harness.ts';

interface OpenedDoc {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  dispose: () => void;
}

async function openDoc(port: number, docName: string): Promise<OpenedDoc> {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://localhost:${port}/collab`,
    name: docName,
    document: doc,
    connect: true,
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sync timeout for ${docName}`)), 15_000);
    provider.on('synced', () => {
      clearTimeout(t);
      resolve();
    });
    if (provider.isSynced) {
      clearTimeout(t);
      resolve();
    }
  });
  return {
    doc,
    provider,
    dispose: () => {
      provider.disconnect();
      provider.destroy();
      doc.destroy();
    },
  };
}

interface Fixture {
  contentDir: string;
  cleanup: () => void;
}

function setupFixture(): Fixture {
  const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-init-load-test-')));
  for (const entry of CORPUS) {
    writeFileSync(join(contentDir, entry.filename), entry.body, 'utf-8');
  }
  return {
    contentDir,
    cleanup: () => rmSync(contentDir, { recursive: true, force: true }),
  };
}

const TEST_HARNESS_DEBOUNCE_MS = 200;
const TEST_HARNESS_MAX_DEBOUNCE_MS = 1000;
const POST_OPEN_WAIT_MS = TEST_HARNESS_MAX_DEBOUNCE_MS * 2 + 500; // 2500 ms

describe('init-load-byte-stable: load path produces zero disk mutations', () => {
  let fixture: Fixture;
  let server: TestServer | undefined;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(async () => {
    if (server) {
      await server.cleanup();
      server = undefined;
    }
    fixture.cleanup();
  });

  test('post `ok init` (in-process runInit), no .md/.mdx mutates', async () => {
    const baseline = snapshotMarkdownOnly(fixture.contentDir);
    expect(Object.keys(baseline.files).length).toBe(CORPUS.length);

    const initResult = await runInit({
      cwd: fixture.contentDir,
      mcp: false,
      installUserSkill: async () => 'skip-current',
    });
    expect(initResult.projectRoot).toBe(fixture.contentDir);
    expect(initResult.mcpAction).toBe('skipped-flag');

    const afterInit = snapshotMarkdownOnly(fixture.contentDir);
    const diff = diffManifest(baseline, afterInit);
    expect(mutationsOf(diff)).toEqual([]);

    for (const entry of CORPUS) {
      const before = baseline.files[entry.filename];
      const after = afterInit.files[entry.filename];
      expect(after).toBeDefined();
      expect(after?.hash).toBe(before?.hash);
      expect(after?.size).toBe(before?.size);
    }
  }, 30_000);

  test('post first cold-start load (every NG corpus doc opened), no .md/.mdx mutates', async () => {
    await runInit({
      cwd: fixture.contentDir,
      mcp: false,
      installUserSkill: async () => 'skip-current',
    });
    const baseline = snapshotMarkdownOnly(fixture.contentDir);

    server = await createTestServer({
      contentDir: fixture.contentDir,
      keepContentDir: true,
      debounce: TEST_HARNESS_DEBOUNCE_MS,
      maxDebounce: TEST_HARNESS_MAX_DEBOUNCE_MS,
    });

    const openings: OpenedDoc[] = [];
    for (const entry of CORPUS) {
      const opened = await openDoc(server.port, corpusDocName(entry));
      openings.push(opened);
    }

    try {
      await wait(POST_OPEN_WAIT_MS);
      for (const o of openings) {
        await awaitDocQuiescence(o.doc);
      }

      const afterLoad = snapshotMarkdownOnly(fixture.contentDir);
      const diff = diffManifest(baseline, afterLoad);
      expect(mutationsOf(diff)).toEqual([]);
      for (const entry of CORPUS) {
        const before = baseline.files[entry.filename];
        const after = afterLoad.files[entry.filename];
        expect(after?.hash).toBe(before?.hash);
        expect(after?.size).toBe(before?.size);
      }
    } finally {
      for (const o of openings) o.dispose();
    }
  }, 60_000);

  test('post server restart + second cold-start load, no .md/.mdx mutates', async () => {
    await runInit({
      cwd: fixture.contentDir,
      mcp: false,
      installUserSkill: async () => 'skip-current',
    });
    const baseline = snapshotMarkdownOnly(fixture.contentDir);

    server = await createTestServer({
      contentDir: fixture.contentDir,
      keepContentDir: true,
      debounce: TEST_HARNESS_DEBOUNCE_MS,
      maxDebounce: TEST_HARNESS_MAX_DEBOUNCE_MS,
    });
    {
      const openings: OpenedDoc[] = [];
      for (const entry of CORPUS) {
        const opened = await openDoc(server.port, corpusDocName(entry));
        openings.push(opened);
      }
      try {
        await wait(POST_OPEN_WAIT_MS);
        for (const o of openings) {
          await awaitDocQuiescence(o.doc);
        }
      } finally {
        for (const o of openings) o.dispose();
      }
    }
    await server.cleanup();
    await wait(500);

    const postFirstLoad = snapshotMarkdownOnly(fixture.contentDir);
    const firstLoadDiff = diffManifest(baseline, postFirstLoad);
    expect(mutationsOf(firstLoadDiff)).toEqual([]);

    server = await createTestServer({
      contentDir: fixture.contentDir,
      keepContentDir: true,
      debounce: TEST_HARNESS_DEBOUNCE_MS,
      maxDebounce: TEST_HARNESS_MAX_DEBOUNCE_MS,
    });
    {
      const openings: OpenedDoc[] = [];
      for (const entry of CORPUS) {
        const opened = await openDoc(server.port, corpusDocName(entry));
        openings.push(opened);
      }
      try {
        await wait(POST_OPEN_WAIT_MS);
        for (const o of openings) {
          await awaitDocQuiescence(o.doc);
        }

        const afterSecondLoad = snapshotMarkdownOnly(fixture.contentDir);
        const diff = diffManifest(baseline, afterSecondLoad);
        expect(mutationsOf(diff)).toEqual([]);
        for (const entry of CORPUS) {
          const before = baseline.files[entry.filename];
          const after = afterSecondLoad.files[entry.filename];
          expect(after?.hash).toBe(before?.hash);
          expect(after?.size).toBe(before?.size);
        }
      } finally {
        for (const o of openings) o.dispose();
      }
    }
  }, 90_000);
});

describe('init-load-byte-stable: mid-session short-circuit absorbs y-prosemirror artifact', () => {
  let fixture: Fixture;
  let server: TestServer | undefined;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(async () => {
    if (server) {
      await server.cleanup();
      server = undefined;
    }
    fixture.cleanup();
  });

  test('Y.XmlFragment empty-paragraph append: short-circuit prevents disk mutation', async () => {
    await runInit({
      cwd: fixture.contentDir,
      mcp: false,
      installUserSkill: async () => 'skip-current',
    });
    const baseline = snapshotMarkdownOnly(fixture.contentDir);

    server = await createTestServer({
      contentDir: fixture.contentDir,
      keepContentDir: true,
      debounce: TEST_HARNESS_DEBOUNCE_MS,
      maxDebounce: TEST_HARNESS_MAX_DEBOUNCE_MS,
    });

    const target = CORPUS.find((c) => c.filename === 'mega-combo-8ng.md');
    if (!target) throw new Error('CORPUS invariant violated: mega-combo-8ng.md not found');
    const opened = await openDoc(server.port, corpusDocName(target));

    try {
      const xmlFragment = opened.doc.getXmlFragment('default');
      opened.doc.transact(() => {
        xmlFragment.push([new Y.XmlElement('paragraph')]);
      });

      await wait(POST_OPEN_WAIT_MS);
      await awaitDocQuiescence(opened.doc);

      const after = snapshotMarkdownOnly(fixture.contentDir);
      const diff = diffManifest(baseline, after);
      expect(mutationsOf(diff)).toEqual([]);

      const before = baseline.files[target.filename];
      const afterEntry = after.files[target.filename];
      expect(afterEntry?.hash).toBe(before?.hash);
      expect(afterEntry?.size).toBe(before?.size);
    } finally {
      opened.dispose();
    }
  }, 60_000);
});

describe('init-load-byte-stable: negative-case control (diff harness has teeth)', () => {
  let fixture: Fixture;
  afterEach(() => fixture?.cleanup());

  test('direct mutation of a corpus file IS detected by the diff harness', () => {
    fixture = setupFixture();
    const baseline = snapshotMarkdownOnly(fixture.contentDir);

    const target = CORPUS[0];
    if (!target) throw new Error('CORPUS empty (fixture invariant violated)');
    const targetPath = join(fixture.contentDir, target.filename);
    expect(existsSync(targetPath)).toBe(true);

    writeFileSync(targetPath, `${target.body}\nMUTATED\n`, 'utf-8');

    const after = snapshotMarkdownOnly(fixture.contentDir);
    const diff = diffManifest(baseline, after);
    const muts = mutationsOf(diff);

    expect(muts.length).toBe(1);
    expect(muts[0]?.relPath).toBe(target.filename);
    expect(muts[0]?.status).toBe('modified');
    expect(muts[0]?.beforeHash).not.toBe(muts[0]?.afterHash);
  });
});
