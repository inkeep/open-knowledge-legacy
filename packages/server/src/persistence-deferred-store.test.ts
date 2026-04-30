import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import {
  createPersistenceExtension,
  setBatchInProgress,
  switchReconciledBaseScope,
} from './persistence.ts';

const BROWSER_ORIGIN = {
  source: 'connection',
  connection: { context: { principalId: 'principal-test' } },
};

function replaceDocParagraph(document: Y.Doc, text: string): void {
  const fragment = document.getXmlFragment('default');
  if (fragment.length > 0) {
    fragment.delete(0, fragment.length);
  }
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  fragment.insert(0, [paragraph]);
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
});
