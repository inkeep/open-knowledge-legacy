/**
 * Direct unit tests for the unified disk→CRDT bridge (`applyExternalChange`).
 *
 * Covers the 3 internal branches of the throwing helper:
 *   (a) document-missing → silent early return (no throw, no mutations)
 *   (b) frontmatter asymmetry → XmlFragment gets body only, Y.Text gets full content
 *   (c) Y.Text no-op → skip delete/insert when content unchanged
 *   (d) transaction origin → matches LocalTransactionOrigin shape
 *
 * Plus the factory wrapper's error-swallowing contract (S1.R2).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hocuspocus } from '@hocuspocus/server';
import {
  BridgeInvariantViolationError,
  BridgeMergeContentLossError,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
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
    expect(() => {
      applyExternalChange(hp, 'nonexistent-doc', '# Hello\n\nWorld\n');
    }).not.toThrow();
    expect(hp.documents.get('nonexistent-doc')).toBeUndefined();
  });

  test('(b) frontmatter asymmetry — XmlFragment gets body only, Y.Text gets full content (D8)', async () => {
    const docName = 'test-frontmatter-asymmetry';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const fullContent = '---\ntitle: Test\ntags: [a, b]\n---\n# Hello\n\nParagraph text.\n';

    applyExternalChange(hp, docName, fullContent);

    const ytext = doc.getText('source');
    expect(ytext.toString()).toBe(fullContent);

    const { frontmatter } = stripFrontmatter(ytext.toString());
    expect(frontmatter).toContain('title: Test');
    expect(frontmatter).toContain('---');

    const xmlFragment = doc.getXmlFragment('default');
    const xmlString = xmlFragment.toString();
    expect(xmlString).not.toContain('title: Test');
    expect(xmlString).not.toContain('tags: [a, b]');

    await conn.disconnect();
  });

  test('(b2) repeated apply with identical content does not mutate Y.Text', async () => {
    const docName = 'test-ytext-stable';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const content = '---\ntitle: Stable\nstatus: draft\n---\n# Body\n';
    applyExternalChange(hp, docName, content);

    let textMutations = 0;
    const ytext = doc.getText('source');
    const observer = () => {
      textMutations++;
    };
    ytext.observe(observer);

    applyExternalChange(hp, docName, content);

    ytext.unobserve(observer);
    expect(textMutations).toBe(0);

    await conn.disconnect();
  });

  test('(b3) malformed YAML round-trips into Y.Text verbatim (D31 — Y.Text is the source of truth)', async () => {
    const docName = 'test-malformed-yaml';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const malformed = '---\ntitle: [unterminated\nstatus: published\n---\n# Body\n';
    applyExternalChange(hp, docName, malformed);

    expect(doc.getText('source').toString()).toBe(malformed);

    await conn.disconnect();
  });

  test('(b4) FM-indent preserved verbatim; body canonicalized to match XmlFragment (bridge invariant)', async () => {
    const docName = 'test-fm-indent-body-canonical';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const onDisk = '---\ntags:\n  - characters\n  - air-nomads\n---\n\n# Aang\n';
    applyExternalChange(hp, docName, onDisk);

    const ytext = doc.getText('source').toString();
    const { frontmatter } = stripFrontmatter(ytext);
    expect(frontmatter).toBe('---\ntags:\n  - characters\n  - air-nomads\n---\n');

    await conn.disconnect();
  });

  test('(b5) Y.Text-is-truth: doc-start `---` survives in Y.Text (no canonicalize-write-back)', async () => {
    const docName = 'test-thematic-break-raw';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    applyExternalChange(hp, docName, '---\n');

    const ytext = doc.getText('source').toString();
    expect(ytext).toBe('---\n');

    await conn.disconnect();
  });

  test('(c) Y.Text no-op — delete/insert skipped when content unchanged', async () => {
    const docName = 'test-ytext-noop';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    const content = '# Hello\n\nWorld\n';

    applyExternalChange(hp, docName, content);
    expect(doc.getText('source').toString()).toBe(content);

    let textMutations = 0;
    const ytext = doc.getText('source');
    const observer = () => {
      textMutations++;
    };
    ytext.observe(observer);

    applyExternalChange(hp, docName, content);

    ytext.unobserve(observer);
    expect(textMutations).toBe(0);

    await conn.disconnect();
  });

  test('(d) transaction origin matches paired-write shape', async () => {
    const docName = 'test-tx-origin';
    const conn = await hp.openDirectConnection(docName);
    const doc = getDoc(conn);

    let capturedOrigin: unknown = null;
    doc.on('beforeTransaction', (tx: Y.Transaction) => {
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

      const doc = getDoc(conn);
      const originalGetXmlFragment = doc.getXmlFragment.bind(doc);
      doc.getXmlFragment = () => {
        throw new Error('synthetic getXmlFragment failure');
      };

      doc.getText('source').insert(0, '# Original\n');
      const textBefore = doc.getText('source').toString();

      await expect(handler(docName, '# Content\n')).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs[0]).toContain('Failed to apply external change');
      expect(callArgs[0]).toContain(docName);

      expect(doc.getText('source').toString()).toBe(textBefore);

      doc.getXmlFragment = originalGetXmlFragment;
      await conn.disconnect();
    } finally {
      console.error = originalError;
    }
  });

  test('factory wrapper re-throws BridgeInvariantViolationError to preserve loud-failure gate', async () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy;

    try {
      const handler = createExternalChangeHandler(hp);
      const docName = 'test-bridge-violation-rethrow';
      const conn = await hp.openDirectConnection(docName);

      const doc = getDoc(conn);
      const originalGetXmlFragment = doc.getXmlFragment.bind(doc);
      doc.getXmlFragment = () => {
        throw new BridgeInvariantViolationError({
          site: 'observer-b',
          docName,
          ytextSnapshot: 'left',
          fragmentMdSnapshot: 'right',
          unifiedDiff: '',
          stack: undefined,
        });
      };

      await expect(handler(docName, '# Content\n')).rejects.toBeInstanceOf(
        BridgeInvariantViolationError,
      );

      expect(errorSpy).not.toHaveBeenCalled();

      doc.getXmlFragment = originalGetXmlFragment;
      await conn.disconnect();
    } finally {
      console.error = originalError;
    }
  });

  test('factory wrapper re-throws BridgeMergeContentLossError to preserve OK_RETHROW_BRIDGE_LOSS gate', async () => {
    const errorSpy = mock(() => {});
    const originalError = console.error;
    console.error = errorSpy;

    try {
      const handler = createExternalChangeHandler(hp);
      const docName = 'test-merge-loss-rethrow';
      const conn = await hp.openDirectConnection(docName);

      const doc = getDoc(conn);
      const originalGetXmlFragment = doc.getXmlFragment.bind(doc);
      doc.getXmlFragment = () => {
        throw new BridgeMergeContentLossError({
          baseline: 'base',
          userText: 'user',
          agentText: 'agent',
          result: 'merged',
          lostSubstrings: ['lost-text'],
          which: 'user',
          side: 'left',
        });
      };

      await expect(handler(docName, '# Content\n')).rejects.toBeInstanceOf(
        BridgeMergeContentLossError,
      );

      expect(errorSpy).not.toHaveBeenCalled();

      doc.getXmlFragment = originalGetXmlFragment;
      await conn.disconnect();
    } finally {
      console.error = originalError;
    }
  });
});
