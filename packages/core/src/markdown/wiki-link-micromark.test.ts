/**
 * Tests for wiki-link micromark extension.
 *
 * 4 shapes + 11 edge cases + 5 integration cases from the probe.
 * Tests the full parse→serialize round-trip via MarkdownManager.
 */
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import type { Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { visit } from 'unist-util-visit';
import type { WikiLinkEmbedMdast, WikiLinkMdast } from './mdast-augmentation.ts';
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

function findWikiLinkEmbeds(tree: Root): WikiLinkEmbedMdast[] {
  const embeds: WikiLinkEmbedMdast[] = [];
  visit(tree, (node: Nodes) => {
    if (node.type === 'wikiLinkEmbed') {
      embeds.push(node as unknown as WikiLinkEmbedMdast);
    }
  });
  return embeds;
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

describe('wiki-embed: 4 functional shapes (FR-3a)', () => {
  test('![[photo.png]] — bare embed', () => {
    const tree = parseMdast('![[photo.png]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.target).toBe('photo.png');
    expect(embeds[0].data.anchor).toBeNull();
    expect(embeds[0].data.alias).toBeNull();
    expect(serializeMdast(tree)).toBe('![[photo.png]]');
  });

  test('![[file.pdf|alt text]] — with alias', () => {
    const tree = parseMdast('![[file.pdf|alt text]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.target).toBe('file.pdf');
    expect(embeds[0].data.alias).toBe('alt text');
    expect(serializeMdast(tree)).toBe('![[file.pdf|alt text]]');
  });

  test('![[file.pdf#page=3]] — with anchor (page fragment)', () => {
    const tree = parseMdast('![[file.pdf#page=3]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.target).toBe('file.pdf');
    expect(embeds[0].data.anchor).toBe('page=3');
    expect(serializeMdast(tree)).toBe('![[file.pdf#page=3]]');
  });

  test('![[file.pdf#page=3|Page 3]] — full form', () => {
    const tree = parseMdast('![[file.pdf#page=3|Page 3]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.target).toBe('file.pdf');
    expect(embeds[0].data.anchor).toBe('page=3');
    expect(embeds[0].data.alias).toBe('Page 3');
    expect(serializeMdast(tree)).toBe('![[file.pdf#page=3|Page 3]]');
  });
});

describe('wiki-embed: interaction with wikiLink (additive, not mutual)', () => {
  test('[[Page]] without ! still parses as wikiLink, not wikiLinkEmbed', () => {
    const tree = parseMdast('[[Page]]');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(0);
    expect(findWikiLinks(tree)).toHaveLength(1);
  });

  test('mixed document: one link + one embed', () => {
    const tree = parseMdast('See [[Index]] and ![[diagram.png]]');
    expect(findWikiLinks(tree)).toHaveLength(1);
    expect(findWikiLinkEmbeds(tree)).toHaveLength(1);
    expect(serializeMdast(tree)).toBe('See [[Index]] and ![[diagram.png]]');
  });

  test('backslash-escape of ! defeats embed tokenization — renders as wikiLink', () => {
    // CommonMark §2.4: `\!` is a recognized escape. The escape construct
    // consumes `\!` before our tokenizer sees the stream, so what remains
    // is `[[photo.png]]` — a plain wikiLink, not an embed.
    const tree = parseMdast('\\![[photo.png]]');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(0);
    const links = findWikiLinks(tree);
    expect(links).toHaveLength(1);
    expect(links[0].data.target).toBe('photo.png');
  });

  test('bang before non-embed text does not eat following brackets', () => {
    // `!not-an-embed` — the ! is not followed by `[[`, so the tokenizer
    // rejects and the bytes flow through as text.
    const tree = parseMdast('!not-an-embed');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(0);
  });
});

describe('wiki-embed: mid-line context + edge cases', () => {
  test('adjacent text is fine', () => {
    const tree = parseMdast('before ![[photo.png]] after');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(1);
  });

  test('two embeds on one line', () => {
    const tree = parseMdast('![[a.png]] and ![[b.mp4]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(2);
    expect(embeds[0].data.target).toBe('a.png');
    expect(embeds[1].data.target).toBe('b.mp4');
  });

  test('mid-word bang before [[…]] does tokenize as embed', () => {
    // Our tokenizer is context-insensitive — it does not check whether `!`
    // is preceded by whitespace. This matches Obsidian-family ergonomics
    // (embed tokens are globally available inline) and keeps the
    // implementation free of whitespace-disambiguation hazards. Documented
    // here so future refactors preserve the call.
    const tree = parseMdast('a![[x.png]]');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(1);
  });

  test('empty target ![[]] is NOT a wiki-embed', () => {
    const tree = parseMdast('![[]]');
    expect(findWikiLinkEmbeds(tree)).toHaveLength(0);
  });

  test('unicode target', () => {
    const tree = parseMdast('![[会議メモ.pdf]]');
    const embeds = findWikiLinkEmbeds(tree);
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.target).toBe('会議メモ.pdf');
    expect(serializeMdast(tree)).toBe('![[会議メモ.pdf]]');
  });

  test('target containing dots and dashes survives round-trip', () => {
    const tree = parseMdast('![[screenshot-2026-04-21_at-14.32.png]]');
    expect(serializeMdast(tree)).toBe('![[screenshot-2026-04-21_at-14.32.png]]');
  });
});

describe('wiki-embed: invariants I1 and I4 (mdast-util level)', () => {
  // The mdManager-level fidelity PBT (I5/I7 cross-path) lives with US-010
  // where the mdast↔PM handlers are added. This PBT covers pure mdast-util
  // round-trip (I1 identity + I4 idempotence) so the tokenizer + to-markdown
  // edges are locked independent of the PM conversion story.

  const extensionPool = ['png', 'jpg', 'pdf', 'mp4', 'mp3', 'wav', 'ogg', 'webm', 'm4a'];

  test('I1 — parse then serialize is byte-identical for canonical embed shapes', () => {
    // Generators exclude whitespace: the from-markdown exit handlers trim
    // anchor/alias, so a leading-space input round-trips as the trimmed
    // form — that is intentional normalization (see `exitAlias`) rather
    // than a byte-identical path. Whitespace round-trip is out of scope.
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,12}$/).filter((s) => s.length > 0),
        fc.constantFrom(...extensionPool),
        fc.option(fc.stringMatching(/^[a-zA-Z0-9_=-]{1,12}$/), { nil: null }),
        fc.option(fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/), { nil: null }),
        (stem, ext, anchor, alias) => {
          let source = `![[${stem}.${ext}`;
          if (anchor) source += `#${anchor}`;
          if (alias) source += `|${alias}`;
          source += ']]';
          const roundTripped = serializeMdast(parseMdast(source));
          expect(roundTripped).toBe(source);
        },
      ),
      { numRuns: Number(process.env.STRESS_FIDELITY) === 1 ? 10_000 : 500 },
    );
  });

  test('I4 — serialize(parse(X)) is idempotent across two compositions', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/).filter((s) => s.length > 0),
        fc.constantFrom(...extensionPool),
        (stem, ext) => {
          const first = serializeMdast(parseMdast(`![[${stem}.${ext}]]`));
          const second = serializeMdast(parseMdast(first));
          expect(second).toBe(first);
        },
      ),
      { numRuns: Number(process.env.STRESS_FIDELITY) === 1 ? 10_000 : 500 },
    );
  });
});
