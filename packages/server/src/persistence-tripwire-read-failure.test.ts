import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import {
  createPersistenceExtension,
  setReconciledBase,
  switchReconciledBaseScope,
} from './persistence.ts';

const BROWSER_ORIGIN = {
  source: 'connection',
  connection: { context: { principalId: 'principal-test' } },
};

const FIXTURE_DIR = join(import.meta.dirname, 'persistence-tripwire.fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8');
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

describe('tripwire reset readFileSync failure', () => {
  let contentDir: string;

  beforeEach(() => {
    contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-tripwire-readfail-')));
    switchReconciledBaseScope('main');
  });

  afterEach(() => {
    switchReconciledBaseScope('main');
    rmSync(contentDir, { recursive: true, force: true });
  });

  test('falls back to currentBase when readFileSync throws (e.g. EISDIR); tripwire stays usable', async () => {
    const docName = 'incident-tripwire-readfail';
    const baseMarkdown = loadFixture('incident-changeset-readme-doubled.base.md');
    const doubledMarkdown = loadFixture('incident-changeset-readme-doubled.candidate.md');

    mkdirSync(join(contentDir, `${docName}.md`));

    const persistence = createPersistenceExtension({
      contentDir,
      projectDir: contentDir,
      gitEnabled: false,
    });

    const document = new Y.Doc();
    composeAndWriteRawBody(document, doubledMarkdown, 'agent');
    setReconciledBase(docName, baseMarkdown);

    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await storeDocument(persistence, document, docName);

      const ytextAfter = document.getText('source').toString();
      expect(ytextAfter).toBe(baseMarkdown);

      composeAndWriteRawBody(document, doubledMarkdown, 'agent');
      await storeDocument(persistence, document, docName);

      expect(document.getText('source').toString()).toBe(baseMarkdown);
      const breakerActiveSkips = warnSpy.mock.calls
        .map((call) => String(call[0] ?? ''))
        .filter((s) => s.includes('Tripwire breaker active'));
      expect(breakerActiveSkips.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
