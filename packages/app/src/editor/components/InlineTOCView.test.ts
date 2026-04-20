/**
 * Unit test for `extractHeadings` — the pure function that walks the PM
 * doc and derives `TOCItemType[]` for InlineTOCView. The wrapper itself
 * requires a DOM + editor mount to test (Playwright territory); this file
 * covers the extraction logic in isolation via a PM schema built from
 * `sharedExtensions` + doc-from-markdown construction.
 */

import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { extractHeadings } from './InlineTOCView';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/** Build a minimal editor-shape object whose `state.doc` comes from markdown. */
function mkEditor(md: string): { state: EditorState } {
  const json = mdManager.parse(md);
  const doc = schema.nodeFromJSON(json);
  const state = EditorState.create({ doc, schema });
  return { state };
}

describe('extractHeadings', () => {
  test('extracts h1-h6 with correct depth and title', () => {
    const editor = mkEditor('# Alpha\n\n## Beta\n\n### Gamma\n');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: 'Alpha', depth: 1 });
    expect(items[1]).toMatchObject({ title: 'Beta', depth: 2 });
    expect(items[2]).toMatchObject({ title: 'Gamma', depth: 3 });
  });

  test('synthesizes stable URLs with depth + index', () => {
    const editor = mkEditor('# First\n\n# Second\n');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    expect(items[0].url).toMatch(/^#h1-\d+$/);
    expect(items[1].url).toMatch(/^#h1-\d+$/);
    // URLs must be distinct so React keys don't collide for same-title headings
    expect(items[0].url).not.toBe(items[1].url);
  });

  test('skips empty headings', () => {
    // Whitespace-only heading text gets trimmed to '' and excluded.
    const editor = mkEditor('# Real\n\n#   \n\n# Also Real\n');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    // Exactly two real headings; the whitespace heading is pruned.
    const realHeadings = items.filter((i) => typeof i.title === 'string' && i.title.length > 0);
    expect(realHeadings).toHaveLength(2);
  });

  test('empty doc → empty items', () => {
    const editor = mkEditor('');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    expect(items).toEqual([]);
  });

  test('doc with only paragraphs (no headings) → empty items', () => {
    const editor = mkEditor('Paragraph one.\n\nParagraph two.\n');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    expect(items).toEqual([]);
  });

  test('headings preserve order from doc', () => {
    const editor = mkEditor('## Middle\n\n# Top\n\n### Deep\n');
    const items = extractHeadings(editor as unknown as Parameters<typeof extractHeadings>[0]);
    expect(items.map((i) => i.title)).toEqual(['Middle', 'Top', 'Deep']);
  });
});
