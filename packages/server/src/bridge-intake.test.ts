import { beforeEach, describe, expect, test } from 'bun:test';
import { normalizeBridge, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import { FILE_WATCHER_ORIGIN } from './external-change.ts';
import { mdManager, schema } from './md-manager.ts';

describe('composeAndWriteRawBody — primitive contract', () => {
  let doc: Y.Doc;

  beforeEach(() => {
    doc = new Y.Doc();
  });

  test('writes raw bytes to Y.Text verbatim — no canonicalization', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Heading\n\nbody\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('# Heading\n\nbody\n');
  });

  test('preserves source-form delimiter `__foo__` (NOT canonicalized to `**foo**`)', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '__foo__\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('__foo__\n');
  });

  test('preserves source-form delimiter `_foo_` (NOT canonicalized to `*foo*`)', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '_emphasis_\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('_emphasis_\n');
  });

  test('preserves source-form fence `~~~` (NOT canonicalized to ``` `)', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '~~~js\nconst x = 1;\n~~~\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('~~~js\nconst x = 1;\n~~~\n');
  });

  test('preserves doc-start `---` thematic break (was: canonicalized to `***`)', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '---\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('---\n');
  });

  test('preserves frontmatter region byte-equal (no FM canonicalization)', () => {
    const content = '---\ntags:\n  - characters\n  - air-nomads\n---\n# Aang\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe(content);
    const { frontmatter } = stripFrontmatter(doc.getText('source').toString());
    expect(frontmatter).toBe('---\ntags:\n  - characters\n  - air-nomads\n---\n');
  });

  test('preserves CRLF line endings verbatim', () => {
    const content = '# Heading\r\n\r\nbody\r\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe(content);
  });

  test('preserves UTF-8 BOM verbatim', () => {
    const content = '﻿# Heading\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe(content);
  });

  test('XmlFragment derives from parse(body) — fragment matches structural form', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Heading\n\nbody\n');
    }, FILE_WATCHER_ORIGIN);

    const xmlFragment = doc.getXmlFragment('default');
    expect(xmlFragment.length).toBeGreaterThan(0);
    expect(xmlFragment.length).toBe(2);
  });

  test('XmlFragment does NOT contain frontmatter content', () => {
    const content = '---\ntitle: Test\n---\n# Heading\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    const xmlFragment = doc.getXmlFragment('default');
    const xmlString = xmlFragment.toString();
    expect(xmlString).not.toContain('title: Test');
    expect(xmlString).not.toContain('---');
  });

  test('bridge invariant holds: normalizeBridge(ytext) === normalizeBridge(serialize(fragment) + fm)', () => {
    const content = '---\ntitle: Test\n---\n# Heading\n\nbody\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    const ytext = doc.getText('source').toString();
    const xmlFragment = doc.getXmlFragment('default');
    const fragmentBody = mdManager.serialize(
      yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
    );
    const { frontmatter } = stripFrontmatter(ytext);
    const fragmentFull = `${frontmatter}${fragmentBody}`;

    expect(normalizeBridge(ytext)).toBe(normalizeBridge(fragmentFull));
  });

  test('idempotent — second call with same content does not mutate Y.Text', () => {
    const content = '# Heading\n\nbody\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    let textMutations = 0;
    const observer = (): void => {
      textMutations++;
    };
    const ytext = doc.getText('source');
    ytext.observe(observer);

    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    ytext.unobserve(observer);
    expect(textMutations).toBe(0);
  });

  test('overwrites existing content — replace semantics from caller', () => {
    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Old\n');
    }, FILE_WATCHER_ORIGIN);
    doc.transact(() => {
      composeAndWriteRawBody(doc, '# New\n');
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe('# New\n');
  });

  test('does not call doc.transact() — caller-wrap is mandatory for atomicity', () => {
    let tx = 0;
    doc.on('beforeTransaction', () => {
      tx++;
    });

    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Test\n');
    }, FILE_WATCHER_ORIGIN);

    expect(tx).toBe(1);
  });

  test('Y.Text is mutated before XmlFragment (write-order contract per FR-30)', () => {
    const events: string[] = [];
    const xmlFragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');
    xmlFragment.observeDeep(() => events.push('xml'));
    ytext.observe(() => events.push('ytext'));

    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Test\n');
    }, FILE_WATCHER_ORIGIN);

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.indexOf('ytext')).toBeLessThan(events.indexOf('xml'));
  });

  test('writes XmlFragment + Y.Text atomically inside one caller-wrap transact', () => {
    let xmlObserved = false;
    let textObserved = false;
    let observedTxOrigin: unknown;
    const xmlFragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    xmlFragment.observeDeep((_events, transaction) => {
      xmlObserved = true;
      observedTxOrigin = transaction.origin;
    });
    ytext.observe((_event, transaction) => {
      textObserved = true;
      observedTxOrigin = transaction.origin;
    });

    doc.transact(() => {
      composeAndWriteRawBody(doc, '# Test\n');
    }, FILE_WATCHER_ORIGIN);

    expect(xmlObserved).toBe(true);
    expect(textObserved).toBe(true);
    expect(observedTxOrigin).toBe(FILE_WATCHER_ORIGIN);
  });

  test('preserves intentional leading whitespace (no .trim() per FR-30 D8)', () => {
    const content = '\n\n# Heading\n';
    doc.transact(() => {
      composeAndWriteRawBody(doc, content);
    }, FILE_WATCHER_ORIGIN);

    expect(doc.getText('source').toString()).toBe(content);
  });

  test('handles empty content without throwing', () => {
    expect(() => {
      doc.transact(() => {
        composeAndWriteRawBody(doc, '');
      }, FILE_WATCHER_ORIGIN);
    }).not.toThrow();

    expect(doc.getText('source').toString()).toBe('');
  });

  test('embedResolver context is threaded through to mdManager.parseWithFallback', () => {
    let calledWithBasename = '';
    let calledWithSourcePath = '';
    const embedResolver = {
      resolveEmbed: (basename: string, sourcePath: string): string | null => {
        calledWithBasename = basename;
        calledWithSourcePath = sourcePath;
        return `/resolved/${basename}`;
      },
      sourcePath: 'docs/feature.md',
    };

    doc.transact(() => {
      composeAndWriteRawBody(doc, '![[photo.png]]\n', embedResolver);
    }, FILE_WATCHER_ORIGIN);

    expect(calledWithBasename).toBe('photo.png');
    expect(calledWithSourcePath).toBe('docs/feature.md');
  });
});
