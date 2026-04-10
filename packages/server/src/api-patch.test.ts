/**
 * Tests for agent-patch Y.Text behavior.
 *
 * These tests exercise the patch logic directly against a Y.Doc (no HTTP layer),
 * validating the CRDT invariants that POST /api/agent-patch provides over the old
 * full-document replace approach.
 *
 * Core invariant: a patch only mutates the matched character span — everything
 * else in Y.Text survives untouched, regardless of what other writes have landed.
 */
import { describe, expect, test } from 'bun:test';
import { Hocuspocus } from '@hocuspocus/server';
import type * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN } from './agent-sessions.ts';

type Conn = Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;

function getDoc(conn: Conn): Y.Doc {
  const doc = (conn as unknown as { document: Y.Doc }).document;
  if (!doc) throw new Error('DirectConnection has no document');
  return doc;
}

/**
 * Replicate the handleAgentPatch transaction logic exactly.
 * Returns true if the text was found and patched, false if not found.
 */
function applyPatch(doc: Y.Doc, find: string, replace: string): boolean {
  let notFound = false;
  doc.transact(() => {
    const ytext = doc.getText('source');
    const currentText = ytext.toString();
    const pos = currentText.indexOf(find);
    if (pos === -1) {
      notFound = true;
      return;
    }
    ytext.delete(pos, find.length);
    ytext.insert(pos, replace);
  }, AGENT_WRITE_ORIGIN);
  return !notFound;
}

describe('agent-patch: targeted Y.Text mutation', () => {
  test('only the matched span is replaced — before and after are byte-identical', async () => {
    const hp = new Hocuspocus({ quiet: true });
    const conn = await hp.openDirectConnection('test-patch-span');
    const doc = getDoc(conn);
    const ytext = doc.getText('source');

    const before = '# Introduction\n\n';
    const target = 'Old paragraph text.';
    const after = '\n\n## Conclusion\n\nFinal line.\n';
    doc.transact(() => ytext.insert(0, before + target + after));

    const found = applyPatch(doc, target, 'New paragraph text.');

    expect(found).toBe(true);
    expect(ytext.toString()).toBe(`${before}New paragraph text.${after}`);

    await conn.disconnect();
  });

  test('not-found: Y.Text is completely unchanged', async () => {
    const hp = new Hocuspocus({ quiet: true });
    const conn = await hp.openDirectConnection('test-patch-notfound');
    const doc = getDoc(conn);
    const ytext = doc.getText('source');

    const initial = '# Document\n\nSome content here.\n';
    doc.transact(() => ytext.insert(0, initial));

    const found = applyPatch(doc, 'text that does not exist', 'replacement');

    expect(found).toBe(false);
    expect(ytext.toString()).toBe(initial);

    await conn.disconnect();
  });

  test('content written concurrently outside the matched region survives the patch', async () => {
    // This is the key property that distinguishes agent-patch from a full replace:
    // writes that landed outside the target span are preserved regardless of ordering.
    const hp = new Hocuspocus({ quiet: true });
    const conn = await hp.openDirectConnection('test-patch-concurrent');
    const doc = getDoc(conn);
    const ytext = doc.getText('source');

    doc.transact(() =>
      ytext.insert(0, '# Header\n\nTarget sentence.\n\n## Footer\n\nExisting footer content.\n'),
    );

    // Simulate a concurrent write that arrived before the patch (e.g. user typed something)
    doc.transact(() => {
      const current = ytext.toString();
      ytext.insert(current.length, '\nConcurrently added line.\n');
    });

    applyPatch(doc, 'Target sentence.', 'Patched sentence.');

    const result = ytext.toString();
    expect(result).toContain('# Header');
    expect(result).toContain('Patched sentence.');
    expect(result).toContain('Existing footer content.');
    expect(result).toContain('Concurrently added line.');
    expect(result).not.toContain('Target sentence.');

    await conn.disconnect();
  });

  test('frontmatter patch: body is character-for-character identical after update', async () => {
    // update_frontmatter calls agent-patch with old FM block as `find`.
    // The body must not be touched — not even normalized.
    const hp = new Hocuspocus({ quiet: true });
    const conn = await hp.openDirectConnection('test-patch-frontmatter');
    const doc = getDoc(conn);
    const ytext = doc.getText('source');

    const oldFm = '---\ntitle: Old Title\nauthor: Alice\n---\n';
    const body = '\n# Content\n\nThis is the document body.\n\nIt has multiple paragraphs.\n';
    doc.transact(() => ytext.insert(0, oldFm + body));

    const newFm = '---\ntitle: New Title\nauthor: Alice\n---\n';
    const found = applyPatch(doc, oldFm, newFm);

    expect(found).toBe(true);
    expect(ytext.toString()).toBe(newFm + body);
    // Explicit byte-level check: nothing after the frontmatter changed
    expect(ytext.toString().slice(newFm.length)).toBe(body);

    await conn.disconnect();
  });
});
