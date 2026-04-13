/**
 * Tests for autolink semantic promotion transformer.
 *
 * Validates that `<scheme:uri>` patterns in text nodes are promoted to
 * semantic `link` mdast nodes with `data.sourceStyle: 'autolink'`.
 */
import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function findLinks(json: any): any[] {
  const links: any[] = [];
  function walk(node: any) {
    if (node.marks) {
      for (const m of node.marks) {
        if (m.type === 'link') links.push(m);
      }
    }
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  }
  walk(json);
  return links;
}

describe('autolink promotion: basic shapes', () => {
  test('<https://example.com> produces a PM link mark with linkStyle autolink', () => {
    const json = mdManager.parse('<https://example.com>\n');
    const links = findLinks(json);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].attrs.href).toBe('https://example.com');
    expect(links[0].attrs.linkStyle).toBe('autolink');
  });

  test('<mailto:a@b.com> produces autolink-style link', () => {
    const json = mdManager.parse('<mailto:a@b.com>\n');
    const links = findLinks(json);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].attrs.href).toBe('mailto:a@b.com');
    expect(links[0].attrs.linkStyle).toBe('autolink');
  });

  test('<ftp://files.example.com/path> produces autolink-style link', () => {
    const json = mdManager.parse('<ftp://files.example.com/path>\n');
    const links = findLinks(json);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].attrs.linkStyle).toBe('autolink');
  });

  test('custom scheme <custom+x.y:data> produces autolink-style link', () => {
    const json = mdManager.parse('<custom+x.y:data>\n');
    const links = findLinks(json);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].attrs.linkStyle).toBe('autolink');
  });
});

describe('autolink promotion: paragraph context', () => {
  test('autolink in middle of text produces 3 PM children', () => {
    const json = mdManager.parse('See <https://example.com> here.\n');
    // Should have: text "See ", link, text " here."
    const para = json.content?.find((n: any) => n.type === 'paragraph');
    expect(para).toBeDefined();
    const children = para?.content ?? [];
    // At least 3 children (text + linked-text + text)
    expect(children.length).toBeGreaterThanOrEqual(3);
    const linkedChild = children.find((c: any) => c.marks?.some((m: any) => m.type === 'link'));
    expect(linkedChild).toBeDefined();
    expect(linkedChild.marks[0].attrs.linkStyle).toBe('autolink');
  });

  test('multiple autolinks in one paragraph', () => {
    const json = mdManager.parse('Visit <https://a.com> and <https://b.com> today.\n');
    const links = findLinks(json);
    expect(links.length).toBe(2);
    expect(links[0].attrs.href).toBe('https://a.com');
    expect(links[1].attrs.href).toBe('https://b.com');
  });
});

describe('autolink promotion: round-trip byte-identity', () => {
  test('<https://example.com> round-trips byte-identically', () => {
    const input = '<https://example.com>\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('<mailto:a@b.com> round-trips byte-identically', () => {
    const input = '<mailto:a@b.com>\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('autolink in paragraph context round-trips', () => {
    const input = 'See <https://example.com> here.\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('multiple autolinks round-trip', () => {
    const input = 'Visit <https://a.com> and <mailto:x@y.com> today.\n';
    expect(roundTrip(input)).toBe(input);
  });

  test('idempotent: second round-trip matches first', () => {
    const input = '<https://example.com>\n';
    const r1 = roundTrip(input);
    const r2 = roundTrip(r1);
    expect(r2).toBe(r1);
  });
});

describe('autolink promotion: negative cases (should NOT promote)', () => {
  test('<Callout> is JSX, not autolink (no scheme colon)', () => {
    // <Callout> has no ":" so the autolink regex doesn't match
    const json = mdManager.parse('<Callout>body</Callout>\n');
    const links = findLinks(json);
    const autolinkLinks = links.filter((l) => l.attrs.linkStyle === 'autolink');
    expect(autolinkLinks.length).toBe(0);
  });

  test('<br> is void HTML, not autolink', () => {
    const json = mdManager.parse('Line<br>two.\n');
    const links = findLinks(json);
    const autolinkLinks = links.filter((l) => l.attrs.linkStyle === 'autolink');
    expect(autolinkLinks.length).toBe(0);
  });

  test('<foo> without colon is not promoted', () => {
    // No scheme:uri pattern — no promotion
    const input = '<foo>\n';
    const json = mdManager.parse(input);
    const links = findLinks(json);
    const autolinkLinks = links.filter((l) => l.attrs.linkStyle === 'autolink');
    expect(autolinkLinks.length).toBe(0);
  });

  test('[text](url) inline link keeps linkStyle inline (not autolink)', () => {
    const json = mdManager.parse('[click here](https://example.com)\n');
    const links = findLinks(json);
    expect(links.length).toBe(1);
    expect(links[0].attrs.linkStyle).toBe('inline');
  });
});

describe('autolink promotion: JSX + autolink coexistence', () => {
  test('<Callout>see <https://x.com></Callout> — autolink inside JSX children', () => {
    const input = '<Callout>see <https://x.com></Callout>\n';
    const r = roundTrip(input);
    expect(r.trim()).toBe(input.trim());
  });
});
