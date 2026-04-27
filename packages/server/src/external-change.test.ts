/**
 * Direct unit tests for the unified disk→CRDT bridge (`applyExternalChange`).
 *
 * Covers the 4 internal branches of the throwing helper:
 *   (a) document-missing → silent early return (no throw, no mutations)
 *   (b) frontmatter asymmetry → XmlFragment gets body only, Y.Text gets full content
 *   (c) Y.Text no-op → skip delete/insert when content unchanged
 *   (d) transaction origin → matches LocalTransactionOrigin shape
 *
 * Plus the factory wrapper's error-swallowing contract (S1.R2).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hocuspocus } from '@hocuspocus/server';
import type * as Y from 'yjs';
import { applyExternalChange, createExternalChangeHandler } from './external-change.ts';

type Conn = Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;

function getDoc(conn: Conn): Y.Doc {
  const doc = (conn as unknown as { document: Y.Doc }).document;
  if (!doc) throw new Error('DirectConnection has no document');
  return doc;
}

describe('applyExternalChange — throwing helper', () => {
  let hp: Hocuspocus;

  beforeEach(() => {
    hp = new Hocuspocus({ quiet: true });
  });

  test('(a) document-missing early return — no throw, no mutations', () => {
    // No document opened → hocuspocus.documents is empty
    expect(() => {
      applyExternalChange(hp, 'nonexistent-doc', '# Hello\n\nWorld\n');
    }).not.toThrow();
    // Verify the document was never created
    expect(hp.documents.get('nonexistent-doc')).toBeUndefined();
  });

  test('(b) frontmatter asymmetry — XmlFragment gets body, Y.Text gets full content, per-key + legacy populated', async () => {
    const docName = 'test-frontmatter-asymmetry';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    // stripFrontmatter regex captures `---\n...\n---\n?` including delimiters + trailing newline
    const fullContent = '---\ntitle: Test\ntags: [a, b]\n---\n# Hello\n\nParagraph text.\n';

    applyExternalChange(hp, docName, fullContent);

    // Y.Text should contain the FULL content (frontmatter + body)
    const ytext = doc.getText('source');
    expect(ytext.toString()).toBe(fullContent);

    // XmlFragment should contain body-derived nodes but NOT frontmatter text
    const xmlFragment = doc.getXmlFragment('default');
    const xmlString = xmlFragment.toString();
    expect(xmlString).not.toContain('title: Test');
    expect(xmlString).not.toContain('tags: [a, b]');

    // Per-key entries are written under D2 / D13: `title` is a primitive string,
    // `tags` is a flat string array.
    const metaMap = doc.getMap('metadata');
    expect(metaMap.get('title')).toBe('Test');
    expect(metaMap.get('tags')).toEqual(['a', 'b']);

    // Legacy mirror is still populated for transition compat — readers in
    // `agent-sessions.ts` / `server-observers.ts` / `api-extension.ts` still
    // pull `metaMap.get('frontmatter')` directly until US-003 / US-004 land.
    const storedFm = metaMap.get('frontmatter') as string;
    expect(storedFm).toContain('title: Test');
    expect(storedFm).toContain('---');

    await conn.disconnect();
  });

  test('(b2) per-key diff — repeated apply with identical content does not mutate per-key entries', async () => {
    const docName = 'test-perkey-diff';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const content = '---\ntitle: Stable\nstatus: draft\n---\n# Body\n';
    applyExternalChange(hp, docName, content);

    // Track per-key mutations via metaMap observer.
    let perKeyChanges = 0;
    const metaMap = doc.getMap('metadata');
    const observer = (event: { keysChanged: Set<string> }) => {
      for (const key of event.keysChanged) {
        if (key !== 'frontmatter') perKeyChanges++;
      }
    };
    metaMap.observe(observer);

    applyExternalChange(hp, docName, content);

    metaMap.unobserve(observer);

    // Identical YAML should produce zero per-key change events — the per-key
    // diff in `setFrontmatterFromYaml` skips equal values to preserve
    // UndoManager attribution per property.
    expect(perKeyChanges).toBe(0);

    await conn.disconnect();
  });

  test('(b3) per-key diff — adding a key writes only the new key', async () => {
    const docName = 'test-perkey-diff-add';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    applyExternalChange(hp, docName, '---\ntitle: A\n---\n# Body\n');

    const metaMap = doc.getMap('metadata');
    const seen: string[] = [];
    const observer = (event: { keysChanged: Set<string> }) => {
      for (const key of event.keysChanged) {
        if (key !== 'frontmatter') seen.push(key);
      }
    };
    metaMap.observe(observer);

    applyExternalChange(hp, docName, '---\ntitle: A\nstatus: draft\n---\n# Body\n');

    metaMap.unobserve(observer);

    // Only `status` should be touched — `title` is unchanged.
    expect(seen.sort()).toEqual(['status']);
    expect(metaMap.get('title')).toBe('A');
    expect(metaMap.get('status')).toBe('draft');

    await conn.disconnect();
  });

  test('(b4) per-key diff — removing a key from YAML deletes only that key', async () => {
    const docName = 'test-perkey-diff-remove';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    applyExternalChange(hp, docName, '---\ntitle: A\nstatus: draft\n---\n# Body\n');

    applyExternalChange(hp, docName, '---\ntitle: A\n---\n# Body\n');

    const metaMap = doc.getMap('metadata');
    expect(metaMap.has('status')).toBe(false);
    expect(metaMap.get('title')).toBe('A');

    await conn.disconnect();
  });

  test('(b5) malformed YAML keeps last valid per-key state', async () => {
    const docName = 'test-malformed-yaml';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    applyExternalChange(hp, docName, '---\ntitle: Valid\nstatus: draft\n---\n# Body\n');

    const metaMap = doc.getMap('metadata');
    const titleBefore = metaMap.get('title');
    const statusBefore = metaMap.get('status');

    // Malformed YAML — unterminated flow sequence on the title line.
    applyExternalChange(hp, docName, '---\ntitle: [unterminated\nstatus: published\n---\n# Body\n');

    // Per-key state unchanged; the malformed YAML is reflected only in Y.Text /
    // the legacy slot for the source-mode user to fix.
    expect(metaMap.get('title')).toBe(titleBefore);
    expect(metaMap.get('status')).toBe(statusBefore);

    await conn.disconnect();
  });

  test('(c) Y.Text no-op — delete/insert skipped when content unchanged', async () => {
    const docName = 'test-ytext-noop';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const content = '# Hello\n\nWorld\n';

    // First call: seeds the Y.Text
    applyExternalChange(hp, docName, content);
    expect(doc.getText('source').toString()).toBe(content);

    // Track Y.Text mutations via observer
    let textMutations = 0;
    const ytext = doc.getText('source');
    const observer = () => {
      textMutations++;
    };
    ytext.observe(observer);

    // Second call with identical content — should not mutate Y.Text
    applyExternalChange(hp, docName, content);

    ytext.unobserve(observer);

    // The observer fires per-transaction when Y.Text operations occur.
    // With the no-op path (content unchanged), the ytext delete/insert branch is
    // skipped, so no Y.Text events fire.
    expect(textMutations).toBe(0);

    await conn.disconnect();
  });

  test('(d) transaction origin matches LocalTransactionOrigin shape', async () => {
    const docName = 'test-tx-origin';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    let capturedOrigin: unknown = null;
    doc.on('beforeTransaction', (tx: Y.Transaction) => {
      // Only capture the file-watcher origin, skip any internal transactions
      if (
        tx.origin &&
        typeof tx.origin === 'object' &&
        'context' in tx.origin &&
        (tx.origin as { context?: { origin?: string } }).context?.origin === 'file-watcher'
      ) {
        capturedOrigin = tx.origin;
      }
    });

    applyExternalChange(hp, docName, '# Test\n');

    expect(capturedOrigin).toEqual({
      source: 'local',
      skipStoreHooks: true,
      context: { origin: 'file-watcher', paired: true },
    });

    await conn.disconnect();
  });
});

describe('createExternalChangeHandler — error-swallowing factory', () => {
  let hp: Hocuspocus;

  beforeEach(() => {
    hp = new Hocuspocus({ quiet: true });
  });

  test('factory wrapper catches and logs when applyExternalChange throws', async () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy;

    try {
      const handler = createExternalChangeHandler(hp);
      const docName = 'test-throw-path';
      const conn = await hp.openDirectConnection(docName);

      // Sabotage the document's getXmlFragment to force a throw inside the transact
      const doc = getDoc(conn);
      const originalGetXmlFragment = doc.getXmlFragment.bind(doc);
      doc.getXmlFragment = () => {
        throw new Error('synthetic getXmlFragment failure');
      };

      // Seed Y.Text so we can verify it's unchanged after error
      doc.getText('source').insert(0, '# Original\n');
      const textBefore = doc.getText('source').toString();

      // The factory should catch and log, not throw
      await expect(handler(docName, '# Content\n')).resolves.toBeUndefined();

      // Verify console.error was called with the expected message
      expect(errorSpy).toHaveBeenCalled();
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('Failed to apply external change');
      expect(callArgs[0]).toContain(docName);

      // Document state unchanged after error
      expect(doc.getText('source').toString()).toBe(textBefore);

      // Restore
      doc.getXmlFragment = originalGetXmlFragment;
      await conn.disconnect();
    } finally {
      console.error = originalError;
    }
  });
});
