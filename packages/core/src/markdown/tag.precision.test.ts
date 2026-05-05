import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findNodes(json: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

function plainTextOf(json: JSONContent): string {
  let out = '';
  const visit = (n: JSONContent) => {
    if (n.type === 'text') out += n.text ?? '';
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('tags — basic round-trip', () => {
  test('simple `#tag` round-trips byte-stable', () => {
    const src = 'A note about #typescript here.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('nested `#parent/child` round-trips', () => {
    const src = 'Issue is #frontend/regression.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('alphanumeric value (`#issue-42-fix`) round-trips', () => {
    const src = 'See #issue-42-fix for details.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('tags — parse correctness', () => {
  test('parses as PM `tag` atom with value attr (no `#` prefix)', () => {
    const json = mdManager.parse('Hi #foo there.');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('foo');
  });

  test('nested value preserved as a single tag with slash', () => {
    const json = mdManager.parse('See #a/b/c.');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('a/b/c');
  });

  test('digits-only `#123` does NOT promote — stays as plain text', () => {
    const json = mdManager.parse('Number #123 here.');
    expect(findNodes(json, 'tag').length).toBe(0);
    expect(plainTextOf(json)).toContain('#123');
  });

  test('`# Heading` parses as heading, NOT tag', () => {
    const json = mdManager.parse('# Hello\n');
    expect(findNodes(json, 'tag').length).toBe(0);
    const headings = findNodes(json, 'heading');
    expect(headings.length).toBe(1);
  });
});

describe('tags — multiple tags', () => {
  test('two tags in one paragraph round-trip', () => {
    const src = 'See #typescript and #react.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('three tags adjacent with single spaces', () => {
    const json = mdManager.parse('Tags: #a #b #c.');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(3);
    expect(tags.map((t) => t.attrs?.value)).toEqual(['a', 'b', 'c']);
  });
});

describe('tags — surrounding context', () => {
  test('tag inside a heading round-trips', () => {
    const src = '## Heading with #tag\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('tag inside a list item round-trips', () => {
    const src = '- Item with #tag\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('tag mixed with bold round-trips', () => {
    const src = 'Mark **important** as #priority/high.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('tags — boundary edge cases', () => {
  test('tag at start of line (no preceding char) parses', () => {
    const json = mdManager.parse('#first thing\n');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('first');
  });

  test('tag followed by punctuation — `.` does not become part of value', () => {
    const json = mdManager.parse('Done. #fix.');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('fix');
    expect(plainTextOf(json)).toContain('.');
  });

  test('`#` after a word character does NOT promote (e.g. `email#frag`)', () => {
    const json = mdManager.parse('Anchor email#frag in url.');
    expect(findNodes(json, 'tag').length).toBe(0);
    expect(plainTextOf(json)).toContain('email#frag');
  });
});

describe('tags — JSX `<Tag value="…" />` authoring (D-T11 / FR-T13)', () => {
  test('JSX `<Tag value="x" />` parses to a `tag` atom', () => {
    const json = mdManager.parse('Inline <Tag value="frontend" /> mid-prose.\n');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('frontend');
  });

  test('JSX with hierarchy value — single atom with slash preserved', () => {
    const json = mdManager.parse('See <Tag value="proj/team" /> for context.\n');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('proj/team');
  });

  test('JSX form round-trips to canonical inline `#value` shape', () => {
    const out = mdManager.serialize(
      mdManager.parse('Inline <Tag value="frontend" /> mid-prose.\n'),
    );
    expect(out).toBe('Inline #frontend mid-prose.\n');
  });

  test('JSX with empty value attr produces a placeholder atom (no `#` prefix in serialize)', () => {
    const json = mdManager.parse('A <Tag value="" /> here.\n');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(1);
    expect(tags[0].attrs?.value).toBe('');
  });

  test('JSX form coexists with inline `#tag` form in the same paragraph', () => {
    const json = mdManager.parse('Mix #typescript and <Tag value="react" />.\n');
    const tags = findNodes(json, 'tag');
    expect(tags.length).toBe(2);
    expect(tags.map((t) => t.attrs?.value)).toEqual(['typescript', 'react']);
  });
});

describe('tags — escape and inline-code precision', () => {
  test('HTML entity `\\&#x20;` is NOT double-escaped on round-trip', () => {
    const src = 'Entity \\&#x20; stays intact.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('backslash-escaped `\\#word` does NOT promote to a tag', () => {
    const json = mdManager.parse('Escaped \\#notag here.\n');
    expect(findNodes(json, 'tag').length).toBe(0);
  });

  test('`#tag` inside inline code backticks does NOT promote', () => {
    const json = mdManager.parse('Use `#config` for settings.');
    expect(findNodes(json, 'tag').length).toBe(0);
  });
});
