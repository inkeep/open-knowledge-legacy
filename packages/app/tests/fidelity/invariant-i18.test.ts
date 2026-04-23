/**
 * Invariant I18 — GFM-alerts ↔ Callout round-trip (US-010 / FR-7).
 *
 * Two claims:
 *
 * 1. Structural equivalence: `parse('> [!TYPE]\nText')` produces the same PM
 *    tree (modulo γ source-raw fields) as `parse('<Callout type="<type>">Text</Callout>')`
 *    for every GFM 5-type token (note, tip, important, warning, caution).
 *    This is what lets the DIY Callout renderer + PropPanel treat both
 *    authoring forms identically at the runtime layer.
 *
 * 2. γ pristine preservation: `parse → serialize` on a GFM-alert input emits
 *    the original source bytes (modulo a single trailing newline that
 *    remark-stringify always appends). Proves the transformer properly
 *    copies `.position` so Phase B's position-slice walker attaches the
 *    right sourceRaw.
 *
 * Scope: I18 covers the non-foldable (`[!TYPE]`) form. I20 covers the
 * Obsidian foldable form (`[!TYPE]+`/`[!TYPE]-`).
 *
 * Alias map: we also assert a sample of the 22-entry alias map so a
 * regression that silently drops alias normalization would fail here (not
 * the pristine-path unit tests, which would silently continue to produce
 * rawMdxFallback or un-transformed blockquotes).
 */

import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { mdManager, mdRoundTrip, NUM_RUNS } from './helpers';

/** Strip γ-path-specific attrs that differ across authoring forms (sourceRaw,
 * source-attr array) but keep the normalized componentName + props which
 * represent the render-time equivalence. */
function stripGammaAttrs(node: JSONContent): JSONContent {
  if (!node) return node;
  let attrs = node.attrs;
  if (node.type === 'jsxComponent' && attrs) {
    attrs = { ...attrs };
    delete (attrs as Record<string, unknown>).sourceRaw;
    delete (attrs as Record<string, unknown>).content;
    delete (attrs as Record<string, unknown>).attributes;
    delete (attrs as Record<string, unknown>).sourceDirty;
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

describe('I18 — alias map folds broader types to GFM 5 subset', () => {
  // Sample aliases from the 22-entry map (Q-MF3 LOCKED).
  // Any regression that drops alias normalization surfaces here.
  const aliasCases: Array<{ alias: string; expectedType: (typeof GFM_TYPES)[number] }> = [
    { alias: 'info', expectedType: 'note' },
    { alias: 'success', expectedType: 'tip' },
    { alias: 'danger', expectedType: 'caution' },
    { alias: 'error', expectedType: 'caution' },
    { alias: 'warn', expectedType: 'warning' },
    { alias: 'idea', expectedType: 'tip' },
    { alias: 'hint', expectedType: 'tip' },
    { alias: 'attention', expectedType: 'warning' },
    { alias: 'bug', expectedType: 'caution' },
  ];

  for (const { alias, expectedType } of aliasCases) {
    test(`[!${alias}] alias-folds to type="${expectedType}"`, () => {
      const gfmForm = `> [!${alias}]\n> Body\n`;
      const json = mdManager.parse(gfmForm);
      const calloutNode = findFirstNode(json, 'jsxComponent');
      expect(calloutNode).toBeDefined();
      expect(calloutNode?.attrs?.componentName).toBe('Callout');
      expect((calloutNode?.attrs?.props as Record<string, unknown>)?.type).toBe(expectedType);
    });
  }

  test('alias-authored source round-trips byte-identical (γ preserves raw type token)', () => {
    // Even though the type normalizes to `tip`, the γ sourceRaw field keeps
    // the original `> [!success]\n...` bytes for pristine save.
    const gfmForm = '> [!success]\n> Authored with Obsidian\n';
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
  // Body text must start with a letter and contain only letters, digits,
  // spaces, and a minimal punctuation set. The property under test is the
  // blockquote→mdxJsxFlowElement transform — bodies that look like
  // setext underlines (`=====`), GFM table separators (`-:`, `|-|`),
  // block-level HTML (`<p>`), or any other markdown construct would
  // exercise parser ambiguities unrelated to the transformer. A more
  // thorough test of the full parse-pipeline interaction lives in I3
  // (normalization canonicality) + the existing fidelity corpus.
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

// ──────────────────────────── helpers ────────────────────────────

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
