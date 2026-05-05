import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { mdManager, mdRoundTrip, NUM_RUNS } from './helpers';

function stripGammaAttrs(node: JSONContent): JSONContent {
  if (!node) return node;
  let attrs = node.attrs;
  if (node.type === 'jsxComponent' && attrs) {
    attrs = { ...attrs };
    delete (attrs as Record<string, unknown>).sourceRaw;
    delete (attrs as Record<string, unknown>).content;
    delete (attrs as Record<string, unknown>).attributes;
    delete (attrs as Record<string, unknown>).sourceDirty;
    delete (attrs as Record<string, unknown>).componentName;
  }
  const content = node.content?.map(stripGammaAttrs);
  return { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) };
}

const GFM_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

describe('I18 — GFM-alerts ↔ Callout structural equivalence', () => {
  for (const type of GFM_TYPES) {
    test(`[!${type.toUpperCase()}] parses to same PM tree as <Callout type="${type}">`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]\n> Body text\n`;
      const mdxForm = `<Callout type="${type}">\n\nBody text\n\n</Callout>\n`;
      const fromGfm = stripGammaAttrs(mdManager.parse(gfmForm));
      const fromMdx = stripGammaAttrs(mdManager.parse(mdxForm));
      expect(JSON.stringify(fromGfm)).toBe(JSON.stringify(fromMdx));
    });
  }

  test('[!note] with explicit title round-trips to same tree as <Callout type title>', () => {
    const gfmForm = '> [!NOTE] Custom title\n> Body text\n';
    const mdxForm = '<Callout type="note" title="Custom title">\n\nBody text\n\n</Callout>\n';
    const fromGfm = stripGammaAttrs(mdManager.parse(gfmForm));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdxForm));
    expect(JSON.stringify(fromGfm)).toBe(JSON.stringify(fromMdx));
  });
});

describe('I18 — γ pristine preservation of GFM-alert source', () => {
  for (const type of GFM_TYPES) {
    test(`[!${type.toUpperCase()}] round-trips byte-identical on pristine save`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]\n> Body text\n`;
      const out = mdRoundTrip(gfmForm);
      expect(out).toBe(gfmForm);
    });
  }

  test('GFM alert with multi-line body round-trips byte-identical', () => {
    const gfmForm = '> [!WARNING]\n> First line\n> Second line\n';
    const out = mdRoundTrip(gfmForm);
    expect(out).toBe(gfmForm);
  });
});

describe('I18 — alias map folds rarer aliases to first-class types', () => {
  const aliasCases: Array<{ alias: string; expectedType: string }> = [
    { alias: 'summary', expectedType: 'abstract' },
    { alias: 'tldr', expectedType: 'abstract' },
    { alias: 'check', expectedType: 'success' },
    { alias: 'done', expectedType: 'success' },
    { alias: 'help', expectedType: 'question' },
    { alias: 'faq', expectedType: 'question' },
    { alias: 'fail', expectedType: 'failure' },
    { alias: 'missing', expectedType: 'failure' },
    { alias: 'error', expectedType: 'danger' },
    { alias: 'cite', expectedType: 'quote' },
    { alias: 'idea', expectedType: 'tip' },
    { alias: 'hint', expectedType: 'tip' },
    { alias: 'warn', expectedType: 'warning' },
    { alias: 'attention', expectedType: 'warning' },
  ];

  for (const { alias, expectedType } of aliasCases) {
    test(`[!${alias}] alias-folds to type="${expectedType}"`, () => {
      const gfmForm = `> [!${alias}]\n> Body\n`;
      const json = mdManager.parse(gfmForm);
      const calloutNode = findFirstNode(json, 'jsxComponent');
      expect(calloutNode).toBeDefined();
      expect(calloutNode?.attrs?.componentName).toBe('GFMCallout');
      expect((calloutNode?.attrs?.props as Record<string, unknown>)?.type).toBe(expectedType);
    });
  }

  test('alias-authored source round-trips byte-identical (γ preserves raw type token)', () => {
    const gfmForm = '> [!summary]\n> Authored with Obsidian\n';
    const out = mdRoundTrip(gfmForm);
    expect(out).toBe(gfmForm);
  });
});

describe('I18 — GFM alerts inside a broader document', () => {
  test('alert surrounded by regular prose round-trips byte-identical', () => {
    const doc =
      'Intro paragraph.\n\n> [!TIP]\n> Helpful hint.\n\nAnother paragraph.\n\n> [!CAUTION]\n> Beware.\n';
    const out = mdRoundTrip(doc);
    expect(out).toBe(doc);
  });
});

describe('I18 — PBT: every GFM type + arbitrary body text round-trips', () => {
  const bodyChars = fc.stringMatching(/^[A-Za-z][\w .,!?;:()']{0,40}$/);

  test('every GFM type × body text produces pristine round-trip', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GFM_TYPES), bodyChars, (type, body) => {
        const gfmForm = `> [!${type.toUpperCase()}]\n> ${body}\n`;
        const out = mdRoundTrip(gfmForm);
        expect(out).toBe(gfmForm);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});

function findFirstNode(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;
  if (node.content) {
    for (const child of node.content) {
      const found = findFirstNode(child, type);
      if (found) return found;
    }
  }
  return undefined;
}
