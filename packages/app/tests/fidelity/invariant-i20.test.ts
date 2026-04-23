/**
 * Invariant I20 — Obsidian foldable Callout round-trip (US-010 / D-MF17).
 *
 * Two claims:
 *
 * 1. Structural equivalence: `parse('> [!TYPE]-\nText')` produces the same
 *    PM tree (modulo γ source-raw fields) as `parse('<Callout type="<type>" collapsible defaultOpen={false}>Text</Callout>')`;
 *    and analogous for the `+` marker with `defaultOpen={true}`. This is
 *    what lets the DIY Callout renderer treat both authoring forms
 *    identically when the collapsible prop is true.
 *
 * 2. γ pristine preservation: `parse → serialize` on a foldable GFM-alert
 *    input emits the original source bytes (including the `+`/`-` marker)
 *    when no user edit has occurred.
 *
 * Scope (D-MF17): foldable marker recognition is limited to the 5 GFM types
 * (note, tip, important, warning, caution). Broader Obsidian foldable
 * syntax with non-GFM types (e.g. `> [!success]+`) still normalizes the
 * type via the alias map but MAY lose the foldable marker — see the
 * scope-boundary test below for the exact behavior.
 *
 * Complements I18 (static GFM alerts).
 */

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
  }
  const content = node.content?.map(stripGammaAttrs);
  return { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) };
}

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

const GFM_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

describe('I20 — Obsidian foldable `-` marker parses to collapsible + defaultOpen=false', () => {
  for (const type of GFM_TYPES) {
    test(`[!${type.toUpperCase()}]- structurally equivalent to <Callout type collapsible defaultOpen={false}>`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]-\n> X\n`;
      const mdxForm = `<Callout type="${type}" collapsible defaultOpen={false}>\n\nX\n\n</Callout>\n`;
      const fromGfm = stripGammaAttrs(mdManager.parse(gfmForm));
      const fromMdx = stripGammaAttrs(mdManager.parse(mdxForm));
      expect(JSON.stringify(fromGfm)).toBe(JSON.stringify(fromMdx));
    });
  }
});

describe('I20 — Obsidian foldable `+` marker parses to collapsible + defaultOpen=true', () => {
  for (const type of GFM_TYPES) {
    test(`[!${type.toUpperCase()}]+ structurally equivalent to <Callout type collapsible defaultOpen>`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]+\n> X\n`;
      const mdxForm = `<Callout type="${type}" collapsible defaultOpen>\n\nX\n\n</Callout>\n`;
      const fromGfm = stripGammaAttrs(mdManager.parse(gfmForm));
      const fromMdx = stripGammaAttrs(mdManager.parse(mdxForm));
      expect(JSON.stringify(fromGfm)).toBe(JSON.stringify(fromMdx));
    });
  }
});

describe('I20 — γ pristine preservation of foldable markers', () => {
  for (const type of GFM_TYPES) {
    test(`[!${type.toUpperCase()}]- round-trips byte-identical`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]-\n> Hidden\n`;
      expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
    });
    test(`[!${type.toUpperCase()}]+ round-trips byte-identical`, () => {
      const gfmForm = `> [!${type.toUpperCase()}]+\n> Visible\n`;
      expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
    });
  }

  test('foldable marker with explicit title round-trips byte-identical', () => {
    const gfmForm = '> [!WARNING]- Heads up everyone\n> Body\n';
    expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
  });
});

describe('I20 — props shape after parse', () => {
  test('`-` marker sets collapsible=true + defaultOpen=false in props', () => {
    const gfmForm = '> [!NOTE]-\n> Body\n';
    const json = mdManager.parse(gfmForm);
    const callout = findFirstNode(json, 'jsxComponent');
    expect(callout).toBeDefined();
    const props = (callout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.type).toBe('note');
    expect(props.collapsible).toBe(true);
    expect(props.defaultOpen).toBe(false);
  });

  test('`+` marker sets collapsible=true + defaultOpen=true in props', () => {
    const gfmForm = '> [!WARNING]+\n> Body\n';
    const json = mdManager.parse(gfmForm);
    const callout = findFirstNode(json, 'jsxComponent');
    expect(callout).toBeDefined();
    const props = (callout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.type).toBe('warning');
    expect(props.collapsible).toBe(true);
    expect(props.defaultOpen).toBe(true);
  });

  test('no marker → no collapsible + no defaultOpen in props', () => {
    const gfmForm = '> [!NOTE]\n> Body\n';
    const json = mdManager.parse(gfmForm);
    const callout = findFirstNode(json, 'jsxComponent');
    const props = (callout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.collapsible).toBeUndefined();
    expect(props.defaultOpen).toBeUndefined();
  });
});

describe('I20 — scope boundary (D-MF17)', () => {
  test('foldable marker on alias that folds to GFM type is honored', () => {
    // `success` aliases to `tip`, which is a GFM type. Per the transformer
    // comment: "the alias map is about token normalization, foldable scope
    // follows the normalized type." So the marker IS preserved here.
    const gfmForm = '> [!success]-\n> Body\n';
    const json = mdManager.parse(gfmForm);
    const callout = findFirstNode(json, 'jsxComponent');
    const props = (callout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.type).toBe('tip');
    expect(props.collapsible).toBe(true);
    expect(props.defaultOpen).toBe(false);
  });

  test('alias-mapped foldable alert round-trips byte-identical', () => {
    const gfmForm = '> [!success]+\n> Body\n';
    expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
  });

  test('unknown-type foldable marker honored under "fallback to note" path (M1 fix)', () => {
    // `MYSTERY` is NOT in the alias map, so type resolution falls back to
    // `note` (a GFM type). Pre-M1 the foldable-marker capture was gated on
    // pre-resolution `type` and dropped the marker for any unknown token —
    // even though the resolved type was always a GFM-5 member. Post-M1 the
    // capture gates on `resolvedType`, so unknown-type + foldable combos
    // emit the foldable attrs the author intended.
    const minus = '> [!MYSTERY]-\n> Body\n';
    const minusJson = mdManager.parse(minus);
    const minusCallout = findFirstNode(minusJson, 'jsxComponent');
    const minusProps = (minusCallout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(minusProps.type).toBe('note');
    expect(minusProps.collapsible).toBe(true);
    expect(minusProps.defaultOpen).toBe(false);

    const plus = '> [!DISCOVERY]+\n> Body\n';
    const plusJson = mdManager.parse(plus);
    const plusCallout = findFirstNode(plusJson, 'jsxComponent');
    const plusProps = (plusCallout?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(plusProps.type).toBe('note');
    expect(plusProps.collapsible).toBe(true);
    expect(plusProps.defaultOpen).toBe(true);
  });

  test('unknown-type foldable round-trips pristine (γ sourceRaw)', () => {
    // γ pristine path preserves the authored bytes verbatim regardless of
    // type resolution. Both the alias coercion AND the M1 foldable
    // honoring stay invisible on disk until the user edits.
    const gfmForm = '> [!MYSTERY]-\n> Body\n';
    expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
  });
});

describe('I20 — PBT: every GFM type × marker round-trips', () => {
  // Same body-shape discipline as I18: letter-prefix + conservative
  // punctuation. See I18 comment for the rationale.
  const bodyChars = fc.stringMatching(/^[A-Za-z][\w .,!?;:()']{0,40}$/);

  test('GFM type × foldable marker × body text → pristine round-trip', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GFM_TYPES),
        fc.constantFrom('+' as const, '-' as const),
        bodyChars,
        (type, marker, body) => {
          const gfmForm = `> [!${type.toUpperCase()}]${marker}\n> ${body}\n`;
          expect(mdRoundTrip(gfmForm)).toBe(gfmForm);
        },
      ),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
