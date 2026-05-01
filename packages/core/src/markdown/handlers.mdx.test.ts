import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

function findInJson(json: JSONContent, type: string): JSONContent | null {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, type);
    if (found) return found;
  }
  return null;
}

describe('MDX: flow element (block-level JSX)', () => {
  test('self-closing component round-trips', () => {
    const md = '<Chart />\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('component with string literal attr round-trips', () => {
    const md = '<Callout type="info" />\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('component with expression attr round-trips', () => {
    const md = '<Chart data={values} />\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('component with boolean shorthand round-trips', () => {
    const md = '<Icon disabled />\n';
    expect(roundTrip(md)).toBe(md);
  });

  test('member expression tag round-trips', () => {
    const md = '<Docs.Link />\n';
    expect(roundTrip(md)).toBe(md);
  });

});


describe('MDX: PM node storage', () => {
  test('self-closing component parsed to jsxComponent with sourceRaw', () => {
    const json = mdManager.parse('<Chart />\n');
    const jsx = findInJson(json, 'jsxComponent');
    expect(jsx).toBeDefined();
    expect(jsx.attrs.sourceRaw).toContain('Chart');
  });

  test('component with attrs stored in sourceRaw', () => {
    const json = mdManager.parse('<Callout type="info" />\n');
    const jsx = findInJson(json, 'jsxComponent');
    expect(jsx).toBeDefined();
    expect(jsx.attrs.sourceRaw).toContain('type="info"');
  });
});
