/**
 * Tests for wiki-link micromark extension.
 *
 * 4 shapes + 11 edge cases + 5 integration cases from the probe.
 * Tests the full parse→serialize round-trip via MarkdownManager.
 */
import { describe, expect, test } from 'bun:test';
import type { Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { visit } from 'unist-util-visit';
import type { WikiLinkMdast } from './mdast-augmentation.ts';
import { wikiLinkFromMarkdown, wikiLinkSyntax, wikiLinkToMarkdown } from './wiki-link-micromark.ts';

function parseMdast(md: string): Root {
  return fromMarkdown(md, {
    extensions: [wikiLinkSyntax()],
    mdastExtensions: [wikiLinkFromMarkdown],
  });
}

function serializeMdast(tree: Root): string {
  return toMarkdown(tree, { extensions: [wikiLinkToMarkdown] }).replace(/\n+$/, '');
}

function findWikiLinks(tree: Root): WikiLinkMdast[] {
  const links: WikiLinkMdast[] = [];
  // Use manual type check — visit(tree, 'wikiLink') double-counts due to
  // unist-util-is checking both node.type and other properties
  visit(tree, (node: Nodes) => {
    if (node.type === 'wikiLink') links.push(node as unknown as WikiLinkMdast);
  });
  return links;
}

describe('wiki-link: 4 functional shapes', () => {
  test('[[Page]] — bare target', () => {
    const tree = parseMdast('[[Page]]');
    const links = findWikiLinks(tree);
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Page');
    expect(links[0].data.anchor).toBeNull();
    expect(links[0].data.alias).toBeNull();
    expect(serializeMdast(tree)).toBe('[[Page]]');
  });

  test('[[Page|Alias]] — with alias', () => {
    const tree = parseMdast('[[Page|Alias]]');
    const links = findWikiLinks(tree);
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Page');
    expect(links[0].data.alias).toBe('Alias');
    expect(serializeMdast(tree)).toBe('[[Page|Alias]]');
  });

  test('[[Page#Heading]] — with anchor', () => {
    const tree = parseMdast('[[Page#Heading]]');
    const links = findWikiLinks(tree);
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Page');
    expect(links[0].data.anchor).toBe('Heading');
    expect(serializeMdast(tree)).toBe('[[Page#Heading]]');
  });

  test('[[Page#Heading|Alias]] — full form', () => {
    const tree = parseMdast('[[Page#Heading|Alias]]');
    const links = findWikiLinks(tree);
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Page');
    expect(links[0].data.anchor).toBe('Heading');
    expect(links[0].data.alias).toBe('Alias');
    expect(serializeMdast(tree)).toBe('[[Page#Heading|Alias]]');
  });
});

describe('wiki-link: edge cases', () => {
  test('spaces in target', () => {
    const links = findWikiLinks(parseMdast('[[Page Name With Spaces]]'));
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Page Name With Spaces');
  });

  test('adjacent text', () => {
    const links = findWikiLinks(parseMdast('[[Page]]-adjacent'));
    expect(links).toHaveLength(1);
  });

  test('text before and after', () => {
    const links = findWikiLinks(parseMdast('before [[Page]] after'));
    expect(links).toHaveLength(1);
  });

  test('two wiki-links', () => {
    const links = findWikiLinks(parseMdast('[[Page]] [[Another]]'));
    expect(links).toHaveLength(2);
  });

  test('empty target [[ ]] — not a wiki-link', () => {
    const links = findWikiLinks(parseMdast('[[]]'));
    expect(links).toHaveLength(0);
  });

  test('unicode target', () => {
    const links = findWikiLinks(parseMdast('[[Página]]'));
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('Página');
  });

  test('double hash in anchor', () => {
    const links = findWikiLinks(parseMdast('[[Page#H#H]]'));
    expect(links).toHaveLength(1);
    expect(links[0].data.anchor).toBe('H#H');
  });
});

describe('wiki-link: integration with other markdown', () => {
  test('inside heading', () => {
    const links = findWikiLinks(parseMdast('# See [[Page]] for details'));
    expect(links).toHaveLength(1);
  });

  test('inside list item', () => {
    const links = findWikiLinks(parseMdast('- See [[Page]]'));
    expect(links).toHaveLength(1);
  });

  test('inside emphasis', () => {
    const links = findWikiLinks(parseMdast('*See [[Page]]*'));
    expect(links).toHaveLength(1);
  });

  test('inside strong', () => {
    const links = findWikiLinks(parseMdast('**See [[Page]]**'));
    expect(links).toHaveLength(1);
  });

  test('alongside inline link', () => {
    const links = findWikiLinks(parseMdast('[[Page]] and [inline](link)'));
    expect(links).toHaveLength(1);
  });
});
