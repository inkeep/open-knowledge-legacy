/**
 * Tests for D7 / US-005: jsxComponent and jsxInline promoted to first-class
 * MDX mdast types (`mdxJsxFlowElement` / `mdxJsxTextElement`).
 *
 * Before US-005 the PM→mdast handlers emitted `{type:'html',value:raw}`
 * passthroughs. After US-005 they emit proper mdast-util-mdx-jsx types with
 * `data.sourceRaw` for verbatim serialization, and matching to-markdown
 * handlers read sourceRaw to emit bit-exact equivalent output.
 *
 * Invariants asserted:
 *   1. PM→mdast emits mdxJsxFlowElement / mdxJsxTextElement (not html).
 *   2. Markdown serialization is bit-exact equivalent to the pre-US-005 output.
 *   3. Round-trip (PM → mdast → markdown → re-parse → mdast → PM) is stable.
 */

import { describe, expect, test } from 'bun:test';
import { fromProseMirror } from '@handlewithcare/remark-prosemirror';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import type { Paragraph, Root } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

type Handlers = Parameters<typeof fromProseMirror>[1];
type Managerish = {
  pmNodeHandlers: NonNullable<Handlers>['nodeHandlers'];
  pmMarkHandlers: NonNullable<Handlers>['markHandlers'];
};

function pmToMdast(json: unknown): Root {
  const schema = getSchema(sharedExtensions);
  // biome-ignore lint/suspicious/noExplicitAny: parse returns JSONContent with loose typing
  const pmNode = schema.nodeFromJSON(json as any);
  const internal = mdManager as unknown as Managerish;
  return fromProseMirror(pmNode, {
    schema,
    nodeHandlers: internal.pmNodeHandlers,
    markHandlers: internal.pmMarkHandlers,
  }) as Root;
}

describe('jsxComponent mdast promotion (US-005 / D7)', () => {
  test('<Callout type="info">content</Callout> round-trips bit-exact', () => {
    const md = '<Callout type="info">content</Callout>\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });

  test('self-closing <Note/> round-trips bit-exact', () => {
    const md = '<Note/>\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });

  test('PM→mdast emits mdxJsxFlowElement (not html)', () => {
    const pm = mdManager.parse('<MyBlock a="1">\n  body\n</MyBlock>\n');
    const tree = pmToMdast(pm);
    // The jsxComponent PM node converts to mdxJsxFlowElement at the top level.
    const jsx = tree.children.find((c) => c.type === 'mdxJsxFlowElement') as
      | MdxJsxFlowElement
      | undefined;
    expect(jsx).toBeDefined();
    if (!jsx) throw new Error('unreachable');
    expect(typeof jsx.data?.sourceRaw).toBe('string');
    expect(jsx.data?.sourceRaw).toContain('<MyBlock');
  });

  test('round-trip survives full PM→mdast→md→re-parse→PM', () => {
    const md = '<Block x={y}>\n  Hi [[Link]] there.\n</Block>\n';
    const pm1 = mdManager.parse(md);
    const mdOut = mdManager.serialize(pm1);
    const pm2 = mdManager.parse(mdOut);
    expect(pm2).toEqual(pm1);
  });
});

describe('jsxInline mdast promotion (US-005 / D7)', () => {
  test('inline <Note type="warn">hey</Note> round-trips', () => {
    const md = 'Prose with <Note type="warn">hey</Note> inline.\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });

  test('self-closing inline <br/> round-trips', () => {
    const md = 'Line one<br/>Line two\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });

  test('PM→mdast emits mdxJsxTextElement (not html)', () => {
    const pm = mdManager.parse('prose <Tag/> text\n');
    const tree = pmToMdast(pm);
    const para = tree.children.find((c) => c.type === 'paragraph') as Paragraph;
    expect(para).toBeDefined();
    const jsx = para.children.find((c) => c.type === 'mdxJsxTextElement') as
      | MdxJsxTextElement
      | undefined;
    expect(jsx).toBeDefined();
    if (!jsx) throw new Error('unreachable');
    expect(jsx.data?.sourceRaw).toContain('<Tag');
  });

  test('round-trip PM equivalence for inline JSX', () => {
    const md = 'See <Ref id="x"/> and <Em>em</Em> here\n';
    const pm1 = mdManager.parse(md);
    const mdOut = mdManager.serialize(pm1);
    const pm2 = mdManager.parse(mdOut);
    expect(pm2).toEqual(pm1);
  });
});
