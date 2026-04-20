/**
 * Three-edge handler-parity coverage test for `PROMOTED_MDAST_TYPES`.
 *
 * Enforces precedent #19(d): every type in the promoted union MUST have a
 * handler on all three pipeline edges. A silent gap re-exposes the FR-20
 * security surface (to-hast default emits a hast `html` node that passes
 * raw value through as literal HTML) or breaks bit-exact markdown round-trip
 * (to-markdown default is text passthrough).
 *
 * The to-hast edge is statically enforced by `Record<PromotedMdastType,
 * Handler>` on `promotedHandlers` in `mdast-to-hast-handlers.ts`. The
 * parse + to-markdown edges span multiple modules (wikiLink lives in
 * `wiki-link-micromark.ts`; the others in `to-markdown-handlers.ts` +
 * `index.ts`) so a single-file Record type can't cover them all. This
 * test mechanically checks each cell so adding a type to
 * `PROMOTED_MDAST_TYPES` without handlers on every edge fails CI.
 */

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

// `parseWithFallback` on the `<Foo>abc</Bar>` fixture increments the
// module-global `parseFallback.blockLevel` counter in `metrics/parse-health.ts`.
// Other tests (parse-with-fallback.test.ts: "valid markdown parses clean")
// assert that counter is 0. Reset on teardown so test file execution order
// doesn't leak state.
afterAll(() => {
  resetParseHealth();
});

// biome-ignore lint/suspicious/noExplicitAny: handler tables accept loose shape at runtime; strict types would require enumerating every mdast type
type AnyHandlerMap = Record<string, any>;

function toMarkdownHasHandler(type: PromotedMdastType): boolean {
  if ((toMarkdownHandlers as AnyHandlerMap)[type]) return true;
  // wikiLink's to-markdown handler lives on a different export — the
  // `wikiLinkToMarkdown` plugin extension registered via `remarkWikiLink`.
  if (type === 'wikiLink' && wikiLinkToMarkdown.handlers.wikiLink) return true;
  return false;
}

function toHastHasHandler(type: PromotedMdastType): boolean {
  return (customNodeHandlers as AnyHandlerMap)[type] != null;
}

// End-to-end parse-coverage probe: feed a fixture markdown string that
// should produce each promoted type's corresponding PM node, and assert
// the PM doc contains the expected shape. A missing parse edge would
// either crash the pipeline or leave the node as a text passthrough.
const parseFixtures: Record<PromotedMdastType, { md: string; expectedPmType: string }> = {
  wikiLink: { md: '[[TargetPage]]', expectedPmType: 'wikiLink' },
  mdxJsxFlowElement: { md: '<MyComponent/>', expectedPmType: 'jsxComponent' },
  mdxJsxTextElement: { md: 'hello <Inline/> world', expectedPmType: 'jsxInline' },
  // rawMdxFallback is produced by parseWithFallback on crash-class MDX; a
  // mismatched open/close tag fixture is proven to trigger the block-level
  // fallback path (empirically verified). Bare unclosed tags instead
  // surface as plain text by the R23 autolink/void-HTML guard.
  rawMdxFallback: {
    md: '<Foo>abc</Bar>',
    expectedPmType: 'rawMdxFallback',
  },
};

function findPmNode(json: JSONContent, type: string): boolean {
  if (json.type === type) return true;
  for (const child of json.content ?? []) {
    if (findPmNode(child, type)) return true;
  }
  return false;
}

function parsePathCoverage(type: PromotedMdastType): boolean {
  const mgr = new MarkdownManager({ extensions: sharedExtensions });
  const { md, expectedPmType } = parseFixtures[type];
  let json: JSONContent;
  try {
    // rawMdxFallback surfaces only through the fallback path; for the
    // others, the regular parse is enough. parseWithFallback handles both.
    json = mgr.parseWithFallback(md);
  } catch {
    return false;
  }
  return findPmNode(json, expectedPmType);
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
    // Compile-time proof: the Record<PromotedMdastType, Handler> typing on
    // `promotedHandlers` in mdast-to-hast-handlers.ts enforces this. We
    // can't express "this would fail to compile if removed" in a bun test,
    // but we CAN assert the runtime shape matches the declared union.
    const hastKeys = Object.keys(customNodeHandlers).sort();
    const expectedKeys = [...PROMOTED_MDAST_TYPES].sort();
    // Every promoted type must be keyed in the hast handler map.
    for (const k of expectedKeys) {
      expect(hastKeys).toContain(k);
    }
  });

  test('smoke test: each promoted type produces a non-trivial hast shape', () => {
    // Cheap runtime probe of the hast handlers. If a handler is replaced
    // with a stub or accidentally returns undefined, this catches it.
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
    };

    for (const type of PROMOTED_MDAST_TYPES) {
      const handler = (customNodeHandlers as AnyHandlerMap)[type];
      const result = handler(fakeState, fixtures[type] as Parents);
      expect(result).toBeDefined();
      expect(result).not.toBe(null);
    }
  });

  test('smoke test: each promoted type produces a non-empty markdown string', () => {
    // Exercise the to-markdown handlers by invoking them with minimal
    // fixtures. Missing handlers (or ones returning undefined) fail here.
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
    };

    for (const type of PROMOTED_MDAST_TYPES) {
      let handler: unknown;
      if (type === 'wikiLink') {
        handler = wikiLinkToMarkdown.handlers.wikiLink;
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
