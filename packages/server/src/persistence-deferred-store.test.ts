import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import { __setQuiescentOverrideForTests } from './bridge-quiescence.ts';
import {
  createPersistenceExtension,
  getReconciledBase,
  setBatchInProgress,
  switchReconciledBaseScope,
} from './persistence.ts';

const BROWSER_ORIGIN = {
  source: 'connection',
  connection: { context: { principalId: 'principal-test' } },
};

function replaceDocParagraph(document: Y.Doc, text: string): void {
  replaceDocParagraphs(document, [text]);
}

function replaceDocParagraphs(document: Y.Doc, texts: string[]): void {
  const body = `${texts.join('\n\n')}\n`;
  const fragment = document.getXmlFragment('default');
  const ytext = document.getText('source');
  if (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }
  fragment.insert(
    0,
    texts.map((text) => {
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText(text)]);
      return paragraph;
    }),
  );
  if (ytext.length > 0) {
    ytext.delete(0, ytext.length);
  }
  ytext.insert(0, body);
}

async function loadDocument(
  persistence: ReturnType<typeof createPersistenceExtension>,
  document: Y.Doc,
  documentName: string,
): Promise<void> {
  await persistence.extension.onLoadDocument?.({
    document,
    documentName,
    context: {},
  } as never);
}

async function storeDocument(
  persistence: ReturnType<typeof createPersistenceExtension>,
  document: Y.Doc,
  documentName: string,
): Promise<void> {
  await persistence.extension.onStoreDocument?.({
    document,
    documentName,
    lastTransactionOrigin: BROWSER_ORIGIN,
    lastContext: {},
  } as never);
}

describe('batch-gated L1 persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-deferred-store-'));
    mkdirSync(tmpDir, { recursive: true });
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
  });

  afterEach(() => {
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('defers browser-style stores during a batch and drains them after batch end', async () => {
    const docName = 'batch-edit';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, 'initial\n', 'utf-8');
    const acks: Array<{ docName: string; sv: Uint8Array }> = [];
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
      onDiskFlush: (name, sv) => acks.push({ docName: name, sv }),
    });
    const document = new Y.Doc();

    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraph(document, 'queued edit'), BROWSER_ORIGIN);

    setBatchInProgress(true);
    await storeDocument(persistence, document, docName);

    expect(readFileSync(docPath, 'utf-8')).toBe('initial\n');
    expect(acks).toHaveLength(0);

    setBatchInProgress(false);
    await persistence.flushDeferredStores('within-branch');

    expect(readFileSync(docPath, 'utf-8')).toContain('queued edit');
    expect(acks).toHaveLength(1);
    expect(acks[0]?.docName).toBe(docName);

    document.destroy();
  });

  test('within-branch no-disk-event batches do not strand queued stores', async () => {
    const docName = 'index-lock-noise';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, 'clean\n', 'utf-8');
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    const document = new Y.Doc();

    await loadDocument(persistence, document, docName);
    document.transact(
      () => replaceDocParagraph(document, 'dirty after index lock'),
      BROWSER_ORIGIN,
    );

    setBatchInProgress(true);
    await storeDocument(persistence, document, docName);
    setBatchInProgress(false);
    await persistence.flushDeferredStores('within-branch');

    expect(readFileSync(docPath, 'utf-8')).toContain('dirty after index lock');

    document.destroy();
  });

  test('within-branch flush continues after one deferred store fails', async () => {
    const badDocName = 'deferred-bad';
    const goodDocName = 'deferred-good';
    mkdirSync(join(tmpDir, `${badDocName}.md`));
    const goodPath = join(tmpDir, `${goodDocName}.md`);
    writeFileSync(goodPath, 'good base\n', 'utf-8');
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    const badDoc = new Y.Doc();
    const goodDoc = new Y.Doc();

    badDoc.transact(() => replaceDocParagraph(badDoc, 'bad queued edit'), BROWSER_ORIGIN);
    await loadDocument(persistence, goodDoc, goodDocName);
    goodDoc.transact(() => replaceDocParagraph(goodDoc, 'good queued edit'), BROWSER_ORIGIN);

    setBatchInProgress(true);
    await storeDocument(persistence, badDoc, badDocName);
    await storeDocument(persistence, goodDoc, goodDocName);
    setBatchInProgress(false);

    await expect(persistence.flushDeferredStores('within-branch')).resolves.toBeUndefined();
    expect(readFileSync(goodPath, 'utf-8')).toContain('good queued edit');

    badDoc.destroy();
    goodDoc.destroy();
  });

  test('tripwire reset failure breaker only suppresses duplicate reset retries', async () => {
    const docName = 'tripwire-reset-failed';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, 'base\n', 'utf-8');
    let resetAttempts = 0;
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
      applyDiskContentToDoc: () => {
        resetAttempts += 1;
        throw new Error('synthetic reset failure');
      },
    });
    const document = new Y.Doc();

    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraphs(document, ['base', 'base']), BROWSER_ORIGIN);

    await storeDocument(persistence, document, docName);
    expect(resetAttempts).toBe(1);
    expect(readFileSync(docPath, 'utf-8')).toBe('base\n');

    await storeDocument(persistence, document, docName);
    expect(resetAttempts).toBe(1);
    expect(readFileSync(docPath, 'utf-8')).toBe('base\n');

    document.transact(() => replaceDocParagraph(document, 'recovered edit'), BROWSER_ORIGIN);
    await storeDocument(persistence, document, docName);
    expect(readFileSync(docPath, 'utf-8')).toContain('recovered edit');

    document.destroy();
  });

  test('stale deferred stores are discarded across branch changes', async () => {
    const docName = 'branch-protected';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, 'branch A base\n', 'utf-8');
    const acks: Array<{ docName: string; sv: Uint8Array }> = [];
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
      onDiskFlush: (name, sv) => acks.push({ docName: name, sv }),
    });
    const document = new Y.Doc();

    switchReconciledBaseScope('branch-a');
    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraph(document, 'old branch edit'), BROWSER_ORIGIN);

    setBatchInProgress(true);
    await storeDocument(persistence, document, docName);
    expect(readFileSync(docPath, 'utf-8')).toBe('branch A base\n');

    writeFileSync(docPath, 'target branch content\n', 'utf-8');
    switchReconciledBaseScope('branch-b');
    setBatchInProgress(false);
    await persistence.flushDeferredStores('discard-stale');

    expect(readFileSync(docPath, 'utf-8')).toBe('target branch content\n');
    expect(acks).toHaveLength(0);

    document.destroy();
  });

  test('concurrent discard-stale flush wins over an in-flight within-branch drain', async () => {
    const firstDocName = 'first-queued';
    const secondDocName = 'second-stale';
    const firstPath = join(tmpDir, `${firstDocName}.md`);
    const secondPath = join(tmpDir, `${secondDocName}.md`);
    writeFileSync(firstPath, 'first base\n', 'utf-8');
    writeFileSync(secondPath, 'second base\n', 'utf-8');

    const firstDoc = new Y.Doc();
    const secondDoc = new Y.Doc();
    let queuedSecondStore = false;
    let discardFlush: Promise<void> | undefined;

    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
      onDiskFlush: (docName) => {
        if (docName !== firstDocName || queuedSecondStore) return;
        queuedSecondStore = true;

        setBatchInProgress(true);
        void storeDocument(persistence, secondDoc, secondDocName);
        setBatchInProgress(false);
        discardFlush = persistence.flushDeferredStores('discard-stale');
      },
    });

    await loadDocument(persistence, firstDoc, firstDocName);
    await loadDocument(persistence, secondDoc, secondDocName);
    firstDoc.transact(() => replaceDocParagraph(firstDoc, 'first queued edit'), BROWSER_ORIGIN);
    secondDoc.transact(() => replaceDocParagraph(secondDoc, 'second stale edit'), BROWSER_ORIGIN);

    setBatchInProgress(true);
    await storeDocument(persistence, firstDoc, firstDocName);
    setBatchInProgress(false);

    await persistence.flushDeferredStores('within-branch');
    await discardFlush;

    expect(queuedSecondStore).toBe(true);
    expect(readFileSync(firstPath, 'utf-8')).toContain('first queued edit');
    expect(readFileSync(secondPath, 'utf-8')).toBe('second base\n');

    firstDoc.destroy();
    secondDoc.destroy();
  });
});

describe('quiescence gate — deferCount cleanup on disk-write error', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-defer-disk-error-'));
    mkdirSync(tmpDir, { recursive: true });
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
  });

  afterEach(() => {
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('disk-write error in force-flush path resets deferCount so next cycle resumes the gate', async () => {
    const docName = 'force-flush-disk-error';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, 'initial\n', 'utf-8');

    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    const document = new Y.Doc();

    await loadDocument(persistence, document, docName);
    document.transact(() => replaceDocParagraph(document, 'edited body'), BROWSER_ORIGIN);

    __setQuiescentOverrideForTests(document, false);

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      for (let i = 0; i < 8; i++) {
        await storeDocument(persistence, document, docName);
      }
      const skipsBeforeFlush = warnings.filter((w) =>
        w.includes('"event":"persistence-skip-non-quiescent"'),
      ).length;
      expect(skipsBeforeFlush).toBe(8);

      rmSync(docPath, { force: true });
      mkdirSync(docPath);

      let firstThrow: unknown = null;
      try {
        await storeDocument(persistence, document, docName);
      } catch (e) {
        firstThrow = e;
      }
      expect(firstThrow).not.toBeNull();
      const forceFlushesAfterFirst = warnings.filter((w) =>
        w.includes('"event":"persistence-force-flush-during-burst"'),
      ).length;
      expect(forceFlushesAfterFirst).toBe(1);

      try {
        await storeDocument(persistence, document, docName);
      } catch {}
      const forceFlushesAfterSecond = warnings.filter((w) =>
        w.includes('"event":"persistence-force-flush-during-burst"'),
      ).length;
      const skipsAfterSecond = warnings.filter((w) =>
        w.includes('"event":"persistence-skip-non-quiescent"'),
      ).length;

      expect(forceFlushesAfterSecond).toBe(1);
      expect(skipsAfterSecond).toBe(9);
    } finally {
      console.warn = originalWarn;
      __setQuiescentOverrideForTests(document, undefined);
      document.destroy();
    }
  });
});

describe('Y.Text-is-truth wiring (FR-33 / FR-35)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-fr33-wiring-'));
    mkdirSync(tmpDir, { recursive: true });
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
  });

  afterEach(() => {
    setBatchInProgress(false);
    switchReconciledBaseScope('main');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('FR-33: disk bytes come from ytext.toString(), not serialize(fragment)', async () => {
    const docName = 'fr33-wiring';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, '', 'utf-8');
    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    const document = new Y.Doc();
    await loadDocument(persistence, document, docName);

    document.transact(() => {
      composeAndWriteRawBody(document, '__foo__\n');
    });

    await storeDocument(persistence, document, docName);

    const diskBytes = readFileSync(docPath, 'utf-8');
    expect(diskBytes).toContain('__foo__');
    expect(diskBytes).not.toContain('**foo**');
    document.destroy();
  });

  test('FR-35: cold-load setReconciledBase stores raw disk bytes', async () => {
    const docName = 'fr35-cold-load';
    const docPath = join(tmpDir, `${docName}.md`);
    writeFileSync(docPath, '__cold__\n', 'utf-8');

    const persistence = createPersistenceExtension({
      contentDir: tmpDir,
      projectDir: tmpDir,
      gitEnabled: false,
    });
    const document = new Y.Doc();
    await loadDocument(persistence, document, docName);

    const base = getReconciledBase(docName);
    expect(base).toBe('__cold__\n');
    expect(base).not.toContain('**cold**');
    document.destroy();
  });
});
