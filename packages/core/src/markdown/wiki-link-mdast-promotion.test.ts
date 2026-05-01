
import { describe, expect, test } from 'bun:test';
import { fromProseMirror } from '@handlewithcare/remark-prosemirror';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import type { JSONContent } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import type { Paragraph, Root } from 'mdast';
import type { WikiLinkMdast } from './mdast-augmentation.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findWikiLinks(json: JSONContent): JSONContent[] {
  const found: JSONContent[] = [];
  function walk(node: JSONContent) {
    if (node.type === 'wikiLink') found.push(node);
    if (node.content) for (const child of node.content) walk(child);
  }
  walk(json);
  return found;
}

describe('wikiLink mdast promotion (US-004 / D7)', () => {
  test('simple [[Page]] round-trips bit-exact', () => {
    const md = 'See [[Page]] here\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });

  test('[[Page#anchor]] round-trips bit-exact', () => {
    const md = 'See [[Page#section]] here\n';
    const out = mdManager.serialize(mdManager.parse(md));
    expect(out).toBe(md);
  });

  test('[[Page|Alias]] round-trips bit-exact', () => {
    const md = 'See [[Page|Alias]] here\n';
    const out = mdManager.serialize(mdManager.parse(md));
    expect(out).toBe(md);
  });

  test('[[Page#anchor|Alias]] round-trips bit-exact', () => {
    const md = 'See [[Page#section|Alias]] here\n';
    const out = mdManager.serialize(mdManager.parse(md));
    expect(out).toBe(md);
  });

  test('PM→mdast emits first-class wikiLink node (not html passthrough)', () => {
    const pm = mdManager.parse('See [[Page|Alias]] here');
    const schema = getSchema(sharedExtensions);
    const pmNode = schema.nodeFromJSON(pm);

    type Handlers = Parameters<typeof fromProseMirror>[1];
    type Managerish = {
      pmNodeHandlers: NonNullable<Handlers>['nodeHandlers'];
      pmMarkHandlers: NonNullable<Handlers>['markHandlers'];
    };
    const internal = mdManager as unknown as Managerish;
    const tree = fromProseMirror(pmNode, {
      schema,
      nodeHandlers: internal.pmNodeHandlers,
      markHandlers: internal.pmMarkHandlers,
    }) as Root;

    const para = tree.children.find((c) => c.type === 'paragraph') as Paragraph;
    expect(para).toBeDefined();
    const wiki = para.children.find((c) => c.type === 'wikiLink') as unknown as
      | WikiLinkMdast
      | undefined;
    expect(wiki).toBeDefined();
    if (!wiki) throw new Error('unreachable');
    expect(wiki.data.target).toBe('Page');
    expect(wiki.data.alias).toBe('Alias');
    expect(wiki.data.anchor).toBeNull();
    expect(wiki.children).toHaveLength(1);
    expect(wiki.children[0]?.value).toBe('Alias');
  });

  test('PM doc survives a full markdown round-trip with wikiLink nodes preserved', () => {
    const md = 'Link to [[Page#heading|Alias]] in prose\n';
    const pm1 = mdManager.parse(md);
    const mdOut = mdManager.serialize(pm1);
    const pm2 = mdManager.parse(mdOut);
    expect(pm2).toEqual(pm1);
    expect(mdOut).toBe(md);
    const wikis = findWikiLinks(pm1);
    expect(wikis).toHaveLength(1);
    expect(wikis[0]?.attrs?.target).toBe('Page');
    expect(wikis[0]?.attrs?.alias).toBe('Alias');
    expect(wikis[0]?.attrs?.anchor).toBe('heading');
  });

  test('multiple wikiLinks in one paragraph round-trip', () => {
    const md = 'See [[A]] and [[B#c|d]] together\n';
    const pm = mdManager.parse(md);
    const out = mdManager.serialize(pm);
    expect(out).toBe(md);
  });
});
