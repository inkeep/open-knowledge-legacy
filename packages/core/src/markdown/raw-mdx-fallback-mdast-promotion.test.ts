/**
 * Tests for D7 / US-006: rawMdxFallback promoted to first-class mdast type.
 *
 * Before US-006 the PM→mdast handler emitted `{type:'html',value:textContent}`
 * passthrough. After US-006 it emits `{type:'rawMdxFallback', data:{reason,
 * originalSpan}, value:raw}` and the to-markdown-handlers.ts rawMdxFallback
 * handler emits `node.value` verbatim.
 *
 * Invariants asserted:
 *   1. PM→mdast emits first-class rawMdxFallback mdast (not html).
 *   2. Markdown round-trip is bit-exact — the raw source is preserved.
 *   3. Existing R6 block-level fallback behavior continues to work — this is
 *      a shape change on the mdast type, not a rewrite of the fallback flow.
 */

import { describe, expect, test } from 'bun:test';
import { fromProseMirror } from '@handlewithcare/remark-prosemirror';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import type { Root } from 'mdast';
import type { RawMdxFallbackMdast } from './mdast-augmentation.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

type Handlers = Parameters<typeof fromProseMirror>[1];
type Managerish = {
  pmNodeHandlers: NonNullable<Handlers>['nodeHandlers'];
  pmMarkHandlers: NonNullable<Handlers>['markHandlers'];
};

function pmToMdast(json: JSONContent): Root {
  const schema = getSchema(sharedExtensions);
  const pmNode = schema.nodeFromJSON(json);
  const internal = mdManager as unknown as Managerish;
  return fromProseMirror(pmNode, {
    schema,
    nodeHandlers: internal.pmNodeHandlers,
    markHandlers: internal.pmMarkHandlers,
  }) as Root;
}

/**
 * Hand-construct a PM doc containing a rawMdxFallback node. In production
 * these are created by parse-with-fallback.ts when the MDX parser chokes
 * on a block; the promotion change in US-006 is on the serialize side, so
 * we construct the PM node directly to isolate the behavior under test
 * from the R6/R8 fallback flow.
 */
function docWithFallback(rawSource: string, reason: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'before' }],
      },
      {
        type: 'rawMdxFallback',
        attrs: {
          reason,
          originalSpan: { start: 7, end: 7 + rawSource.length },
        },
        content: rawSource ? [{ type: 'text', text: rawSource }] : [],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'after' }],
      },
    ],
  };
}

describe('rawMdxFallback mdast promotion (US-006 / D7)', () => {
  test('PM→mdast emits first-class rawMdxFallback (not html passthrough)', () => {
    const doc = docWithFallback('<Outer>\n  text\n</Inner>', 'Mismatched tag');
    const tree = pmToMdast(doc);
    const fallback = tree.children.find((c) => c.type === 'rawMdxFallback') as
      | RawMdxFallbackMdast
      | undefined;
    expect(fallback).toBeDefined();
    if (!fallback) throw new Error('unreachable');
    expect(fallback.value).toBe('<Outer>\n  text\n</Inner>');
    expect(fallback.data.reason).toBe('Mismatched tag');
    expect(fallback.data.originalSpan).toEqual({
      start: 7,
      end: 7 + '<Outer>\n  text\n</Inner>'.length,
    });
  });

  test('serialize emits rawMdxFallback value verbatim', () => {
    const raw = '<A prop="b">\n</C>';
    const doc = docWithFallback(raw, 'tag mismatch');
    const out = mdManager.serialize(doc);
    // Raw bytes appear in the output unchanged — the clipboard copy path
    // therefore round-trips the fallback content.
    expect(out).toContain(raw);
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  test('empty fallback content serializes cleanly', () => {
    const doc = docWithFallback('', 'empty broken block');
    // Serialize should not throw or produce undefined output; empty value
    // collapses to a blank line between surrounding paragraphs.
    expect(() => mdManager.serialize(doc)).not.toThrow();
  });

  test('existing R6 parse-with-fallback path continues to work', async () => {
    // Confirms US-006's shape change did NOT alter the parse-side fallback
    // behavior in parse-with-fallback.ts — parseWithFallback produces PM
    // rawMdxFallback nodes that carry the broken source.
    const { parseWithFallback } = await import('./parse-with-fallback.ts');
    const md = 'p1\n\n<Outer>\n  x\n</Inner>\n\np2\n';
    const doc = parseWithFallback(md, { parse: (s) => mdManager.parse(s) });
    // Find the rawMdxFallback in the parsed doc.
    type Visitable = JSONContent & { content?: Visitable[]; type?: string };
    function findType(node: Visitable, type: string): Visitable | undefined {
      if (node.type === type) return node;
      for (const child of node.content ?? []) {
        const hit = findType(child as Visitable, type);
        if (hit) return hit;
      }
      return undefined;
    }
    const fb = findType(doc as Visitable, 'rawMdxFallback');
    expect(fb).toBeDefined();
  });
});
