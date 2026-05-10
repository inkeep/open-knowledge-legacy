/**
 * Mega-combo corpus coverage drift check.
 *
 * Asserts that the mega-combo entry's `ng[]` field, combined with the
 * explicit MEGA_COMBO_EXCLUSIONS set defined here, exhaustively covers
 * the canonical `NG_TAXONOMY` from `md-audit/src/data/ng-taxonomy.ts`.
 *
 * Failure modes this catches:
 *   - A new NG class (e.g., NG-17) is added to the canonical taxonomy
 *     without being addressed in this corpus → drift assertion fails.
 *   - A typo in mega-combo's `ng[]` field references an NG ID that
 *     doesn't exist in the canonical taxonomy → second assertion fails.
 *   - A stale entry remains in MEGA_COMBO_EXCLUSIONS after the canonical
 *     taxonomy retired the corresponding NG class → third assertion fails.
 *
 * If this test fails because a new canonical NG class was added, the fix is
 * one of:
 *   (a) extend the mega-combo body (in
 *       `_fixtures/init-load-byte-stable-corpus.ts`) to include a snippet
 *       exercising the new class, AND add the new NG ID to mega-combo's
 *       `ng[]` field;
 *   (b) add the new NG ID to MEGA_COMBO_EXCLUSIONS below WITH a one-line
 *       inline rationale explaining why it cannot compose into a single .md
 *       (e.g., requires .mdx, structurally no-body, etc.);
 *   (c) decide the new class isn't relevant to load-without-mutate at all
 *       (rare — most NG classes are byte-shift behaviors that should be
 *       absorbed by the markdownSemanticallyUnchanged short-circuit).
 *
 * NOT a behavioral test of byte-stability — that's
 * `init-load-byte-stable.test.ts`. This file is a metadata-consistency
 * check between two artifacts.
 *
 * Future work: a hybrid pattern where every test declares its NG coverage
 * via JSDoc tags (`@pins-ng NG-01,...`) and a generator populates
 * `knownTests[]` in NG_TAXONOMY automatically — modeled on the openbolts
 * `BOUNDARY_TESTS.md` source-derived catalog (see PR body "Future work"
 * section for the cross-reference).
 */

import { describe, expect, test } from 'bun:test';
import { NG_TAXONOMY, type NgFloorId } from '../../../../md-audit/src/data/ng-taxonomy.ts';
import { CORPUS, type CorpusEntry } from './_fixtures/init-load-byte-stable-corpus.ts';

const MEGA_COMBO_EXCLUSIONS = new Set<NgFloorId>([
  'NG-05', // Storage-policy structural property (HTML pass-through, no sanitization). Not a content shape exercisable via byte-stability — the storage layer accepts whatever bytes the user content emits, no normalization gate. mega-combo's HTML entity content covers NG-06 (entity ref preservation), not NG-05.
  'NG-07', // Requires .mdx — JSX-context `---` parsing is MDX-grammar-only. Covered at integration tier as standalone .mdx entry (ng5-mdx-yaml-in-jsx.mdx).
  'NG-08', // Requires .mdx — block-GFM-inside-inline-JSX flattening is MDX-grammar-only. Covered at integration tier as standalone .mdx entry (ng6-block-inside-jsx.mdx).
  'NG-11', // Structurally "no body" — the synthesized-empty-paragraph behavior only fires when the parsed mdast body is empty. Adding body content to mega-combo destroys the property. Covered at integration tier as standalone entry (ng8-frontmatter-only.md).
  'NG-12', // Edited-node quoting normalization. Not yet reviewed for inclusion in this corpus.
  'NG-13', // Requires .mdx — jsxComponent is the PM-schema anchor for user JSX components (Note/Card/Callout/...). MDX-grammar-only.
  'NG-14', // Requires .mdx — jsxInline is the PM atom for inline-position MDX content (`<Icon />`, `<Mention />`). MDX-grammar-only.
  'NG-15', // Post-fix taxonomy slot retained for cell-resolver matcher reference. Produces byte-identical output; no load-without-mutate coverage gap to fill.
  'NG-16', // Post-fix taxonomy slot retained for cell-resolver matcher continuity (position-slice extends CommonMark §2.4 ESCAPABLE_CHARS coverage). Produces byte-identical output; no load-without-mutate coverage gap to fill.
]);

function normalizeNgId(id: string): string {
  const match = id.match(/^NG-?(\d+)$/);
  if (!match?.[1]) {
    throw new Error(`invalid NG id: ${JSON.stringify(id)}`);
  }
  return `NG-${match[1].padStart(2, '0')}`;
}

function findMegaCombo(): CorpusEntry {
  const entry = CORPUS.find((c) => c.filename === 'mega-combo-8ng.md');
  if (!entry) {
    throw new Error('CORPUS invariant violated: mega-combo-8ng.md not found');
  }
  return entry;
}

describe('mega-combo corpus coverage drift check', () => {
  test('every NG ID in the canonical taxonomy is either covered by mega-combo or explicitly excluded', () => {
    const megaCombo = findMegaCombo();
    const covered = new Set(megaCombo.ng.map(normalizeNgId));
    const taxonomyIds = NG_TAXONOMY.map((entry) => entry.id);

    const unaddressed = taxonomyIds.filter(
      (id) => !covered.has(id) && !MEGA_COMBO_EXCLUSIONS.has(id),
    );

    if (unaddressed.length > 0) {
      throw new Error(
        `Canonical NG_TAXONOMY contains entries not addressed in mega-combo or MEGA_COMBO_EXCLUSIONS: ${unaddressed.join(', ')}. ` +
          `Either extend the mega-combo body to exercise the new class(es) and add the IDs to mega-combo.ng[], ` +
          `OR add the IDs to MEGA_COMBO_EXCLUSIONS in init-load-byte-stable-corpus-coverage.test.ts with an inline rationale.`,
      );
    }

    expect(unaddressed).toEqual([]);
  });

  test('every NG ID in mega-combo.ng[] exists in the canonical taxonomy (no typos)', () => {
    const megaCombo = findMegaCombo();
    const taxonomyIds = new Set<string>(NG_TAXONOMY.map((entry) => entry.id));

    const unknown = megaCombo.ng.map(normalizeNgId).filter((id) => !taxonomyIds.has(id));

    if (unknown.length > 0) {
      throw new Error(
        `mega-combo.ng[] references NG IDs that do not exist in the canonical NG_TAXONOMY: ${unknown.join(', ')}. ` +
          `Either fix the typo in the corpus fixture, or add the missing entries to md-audit/src/data/ng-taxonomy.ts.`,
      );
    }

    expect(unknown).toEqual([]);
  });

  test('every NG ID in MEGA_COMBO_EXCLUSIONS exists in the canonical taxonomy (no stale exclusions)', () => {
    const taxonomyIds = new Set(NG_TAXONOMY.map((entry) => entry.id));

    const stale = [...MEGA_COMBO_EXCLUSIONS].filter((id) => !taxonomyIds.has(id));

    if (stale.length > 0) {
      throw new Error(
        `MEGA_COMBO_EXCLUSIONS references NG IDs that do not exist in the canonical NG_TAXONOMY: ${stale.join(', ')}. ` +
          `Either remove the stale exclusion (the canonical taxonomy retired the entry), ` +
          `or fix the typo in the exclusion ID.`,
      );
    }

    expect(stale).toEqual([]);
  });

  test('mega-combo.ng[] and MEGA_COMBO_EXCLUSIONS are disjoint (no contradictions)', () => {
    const megaCombo = findMegaCombo();
    const covered = new Set(megaCombo.ng.map(normalizeNgId));

    const overlap = [...MEGA_COMBO_EXCLUSIONS].filter((id) => covered.has(id));

    if (overlap.length > 0) {
      throw new Error(
        `Contradiction: NG ID(s) appear in BOTH mega-combo.ng[] AND MEGA_COMBO_EXCLUSIONS: ${overlap.join(', ')}. ` +
          `An NG class is either covered by mega-combo or explicitly excluded from it; it cannot be both.`,
      );
    }

    expect(overlap).toEqual([]);
  });
});
