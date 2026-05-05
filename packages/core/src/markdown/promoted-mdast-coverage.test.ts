import { afterAll, describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import type { Parents } from 'mdast';
import type { State } from 'mdast-util-to-markdown';
import { sharedExtensions } from '../extensions/shared.ts';
import { resetParseHealth } from '../metrics/parse-health.ts';
import { MarkdownManager } from './index.ts';
import { PROMOTED_MDAST_TYPES, type PromotedMdastType } from './mdast-augmentation.ts';
import { customNodeHandlers } from './mdast-to-hast-handlers.ts';
import { toMarkdownHandlers } from './to-markdown-handlers.ts';
import { wikiLinkToMarkdown } from './wiki-link-micromark.ts';

afterAll(() => {
  resetParseHealth();
});

// biome-ignore lint/suspicious/noExplicitAny: handler tables accept loose shape at runtime; strict types would require enumerating every mdast type
type AnyHandlerMap = Record<string, any>;

function toMarkdownHasHandler(type: PromotedMdastType): boolean {
  if ((toMarkdownHandlers as AnyHandlerMap)[type]) return true;
  if (type === 'wikiLink' && wikiLinkToMarkdown.handlers.wikiLink) return true;
  if (type === 'wikiLinkEmbed' && wikiLinkToMarkdown.handlers.wikiLinkEmbed) return true;
  return false;
}

function toHastHasHandler(type: PromotedMdastType): boolean {
  return (customNodeHandlers as AnyHandlerMap)[type] != null;
}

type ParseFixture = { md: string; expectedPmType: string } | { md: string; expectedPmMark: string };

const parseFixtures: Record<PromotedMdastType, ParseFixture> = {
  wikiLink: { md: '[[TargetPage]]', expectedPmType: 'wikiLink' },
  wikiLinkEmbed: { md: '![[photo.png]]', expectedPmType: 'jsxComponent' },
  mdxJsxFlowElement: { md: '<MyComponent/>', expectedPmType: 'jsxComponent' },
  mdxJsxTextElement: { md: 'hello <Inline/> world', expectedPmType: 'jsxInline' },
  rawMdxFallback: {
    md: '<Foo>abc</Bar>',
    expectedPmType: 'rawMdxFallback',
  },
  mark: { md: '==hello==', expectedPmMark: 'highlight' },
};

function findPmNode(json: JSONContent, type: string): boolean {
  if (json.type === type) return true;
  for (const child of json.content ?? []) {
    if (findPmNode(child, type)) return true;
  }
  return false;
}

function findPmMark(json: JSONContent, markType: string): boolean {
  if ((json.marks ?? []).some((m) => m.type === markType)) return true;
  for (const child of json.content ?? []) {
    if (findPmMark(child, markType)) return true;
  }
  return false;
}

function parsePathCoverage(type: PromotedMdastType): boolean {
  const mgr = new MarkdownManager({ extensions: sharedExtensions });
  const fixture = parseFixtures[type];
  let json: JSONContent;
  try {
    json = mgr.parseWithFallback(fixture.md);
  } catch {
    return false;
  }
  if ('expectedPmType' in fixture) {
    return findPmNode(json, fixture.expectedPmType);
  }
  return findPmMark(json, fixture.expectedPmMark);
}

describe('PROMOTED_MDAST_TYPES — three-edge handler parity', () => {
  test('every promoted type has a to-hast handler (static enforcement also via Record type)', () => {
    for (const type of PROMOTED_MDAST_TYPES) {
      expect(toHastHasHandler(type)).toBe(true);
    }
  });

  test('every promoted type has a to-markdown handler', () => {
    for (const type of PROMOTED_MDAST_TYPES) {
      expect(toMarkdownHasHandler(type)).toBe(true);
    }
  });

  test('every promoted type has a parse-side PM handler (via MarkdownManager)', () => {
    const failures: PromotedMdastType[] = [];
    for (const type of PROMOTED_MDAST_TYPES) {
      if (!parsePathCoverage(type)) failures.push(type);
    }
    expect(failures).toEqual([]);
  });

  test('adding a new promoted type without updating customNodeHandlers fails TypeScript', () => {
    const hastKeys = Object.keys(customNodeHandlers).sort();
    const expectedKeys = [...PROMOTED_MDAST_TYPES].sort();
    for (const k of expectedKeys) {
      expect(hastKeys).toContain(k);
    }
  });

  test('smoke test: each promoted type produces a non-trivial hast shape', () => {
    const fakeState = {
      patch: () => {},
      applyData: <T>(_node: unknown, result: T) => result,
      all: () => [] as unknown[],
    };

    const fixtures: Record<PromotedMdastType, unknown> = {
      wikiLink: {
        type: 'wikiLink',
        value: 'Label',
        data: { target: 'Page', anchor: null, alias: null },
        children: [{ type: 'text', value: 'Label' }],
      },
      wikiLinkEmbed: {
        type: 'wikiLinkEmbed',
        value: 'photo.png',
        data: { target: 'photo.png', anchor: null, alias: null },
        children: [{ type: 'text', value: 'photo.png' }],
      },
      mdxJsxFlowElement: {
        type: 'mdxJsxFlowElement',
        name: 'X',
        attributes: [],
        children: [],
        data: { sourceRaw: '<X/>' },
      },
      mdxJsxTextElement: {
        type: 'mdxJsxTextElement',
        name: 'X',
        attributes: [],
        children: [],
        data: { sourceRaw: '<X/>' },
      },
      rawMdxFallback: {
        type: 'rawMdxFallback',
        value: '<Unclosed',
        data: { reason: 'test', originalSpan: { start: 0, end: 9 } },
      },
      mark: {
        type: 'mark',
        children: [{ type: 'text', value: 'hi' }],
        data: { sourceForm: 'markdown' },
      },
    };

    for (const type of PROMOTED_MDAST_TYPES) {
      const handler = (customNodeHandlers as AnyHandlerMap)[type];
      const result = handler(fakeState, fixtures[type] as Parents);
      expect(result).toBeDefined();
      expect(result).not.toBe(null);
    }
  });

  test('smoke test: each promoted type produces a non-empty markdown string', () => {
    const minimalState = {
      enter: () => () => {},
      containerPhrasing: () => '',
      createTracker: () => ({
        move: (s: string) => s,
        current: () => ({}),
      }),
      options: {},
      unsafe: [] as Array<{ character: string }>,
      safe: (s: string) => s,
    } as unknown as State;

    const fixtures: Record<PromotedMdastType, unknown> = {
      wikiLink: {
        type: 'wikiLink',
        value: 'Page',
        data: { target: 'Page', anchor: null, alias: null },
        children: [{ type: 'text', value: 'Page' }],
      },
      wikiLinkEmbed: {
        type: 'wikiLinkEmbed',
        value: 'photo.png',
        data: { target: 'photo.png', anchor: null, alias: null },
        children: [{ type: 'text', value: 'photo.png' }],
      },
      mdxJsxFlowElement: {
        type: 'mdxJsxFlowElement',
        name: 'X',
        attributes: [],
        children: [],
        data: { sourceRaw: '<X/>' },
      },
      mdxJsxTextElement: {
        type: 'mdxJsxTextElement',
        name: 'X',
        attributes: [],
        children: [],
        data: { sourceRaw: '<X/>' },
      },
      rawMdxFallback: {
        type: 'rawMdxFallback',
        value: '<Unclosed',
        data: { reason: 'test', originalSpan: { start: 0, end: 9 } },
      },
      mark: {
        type: 'mark',
        children: [{ type: 'text', value: 'hi' }],
        data: { sourceForm: 'markdown' },
      },
    };

    for (const type of PROMOTED_MDAST_TYPES) {
      let handler: unknown;
      if (type === 'wikiLink') {
        handler = wikiLinkToMarkdown.handlers.wikiLink;
      } else if (type === 'wikiLinkEmbed') {
        handler = wikiLinkToMarkdown.handlers.wikiLinkEmbed;
      } else {
        handler = (toMarkdownHandlers as AnyHandlerMap)[type];
      }
      expect(handler).toBeDefined();
      // biome-ignore lint/suspicious/noExplicitAny: minimal smoke invocation
      const out = (handler as any)(fixtures[type], undefined, minimalState, {});
      expect(typeof out).toBe('string');
      expect((out as string).length).toBeGreaterThan(0);
    }
  });
});
