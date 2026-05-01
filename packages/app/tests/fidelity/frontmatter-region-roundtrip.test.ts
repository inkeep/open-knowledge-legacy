/**
 * D24 layer (b) — fidelity PBT for the FM-region parse-edit-stringify pipeline.
 *
 * Invariants:
 *   I-rt-1: parse(serialize(parse(fenced))) === parse(fenced) — round-trip
 *           through yaml@2 Document is fixed-point on the second pass.
 *   I-rt-2: applyPatchToFm with an empty patch is a no-op (canonicalization
 *           may rewrite scalar styles, but the parsed map is invariant).
 *   I-rt-3: applyRenameToFm preserves source order (FR2). After renaming the
 *           i-th key, the position-i key in the output is the new name.
 *   I-rt-4: applyReorderToFm with the identity permutation is a no-op.
 *   I-rt-5: a permutation of keys is exactly the new key order on output.
 *   I-rt-6: round-trip survives comments on subsequent keys (A1 — yaml@2's
 *           Document.toString preserves leading-comment placement).
 */
import { describe, expect, test } from 'bun:test';
import {
  applyPatchToFm,
  applyRenameToFm,
  applyReorderToFm,
  parseFencedFmRegion,
} from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';

const MAX_KEY_BYTES = 32;
const MAX_VALUE_BYTES = 64;

const safeKey = fc
  .string({ minLength: 1, maxLength: MAX_KEY_BYTES })
  .filter((s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && s !== 'frontmatter');

// Conservative alphanumeric values to keep generated YAML in plain-scalar
// territory across yaml@2's stringification rules. Adversarial value shapes
// (special characters, unicode, leading-special) belong in the malformed-YAML
// fuzz layer, not the round-trip arbitrary.
// Conservative alphanumeric values that always parse as plain string
// scalars. Adversarial value shapes (special characters, unicode,
// leading-special) belong in the malformed-YAML fuzz layer, not the
// round-trip arbitrary. The regex requires a leading letter so the value
// can't be confused with a number, dash, or YAML reserved literal.
const stringValue = fc
  .string({ minLength: 1, maxLength: MAX_VALUE_BYTES })
  .filter(
    (s) =>
      /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(s) &&
      !s.endsWith(' ') &&
      !['true', 'false', 'null', '~', 'yes', 'no', 'on', 'off'].includes(s.toLowerCase()),
  );

const numberValue = fc.integer({ min: -1000, max: 1000 });
const booleanValue = fc.boolean();
const listValue = fc.array(stringValue, { minLength: 1, maxLength: 5 });

const valueArbitrary = fc.oneof(stringValue, numberValue, booleanValue, listValue);

const fmMapArbitrary = fc.uniqueArray(safeKey, { minLength: 1, maxLength: 6 }).chain((keys) =>
  fc.tuple(...keys.map(() => valueArbitrary)).map((values) => {
    const map: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      map[k] = values[i];
    });
    return { keys, map };
  }),
);

function buildFenced(keys: string[], map: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const key of keys) {
    const v = map[key];
    if (Array.isArray(v)) {
      lines.push(`${key}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${key}: ${v}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

describe('frontmatter-region — round-trip invariants', () => {
  test('I-rt-1: parse → serialize → parse is fixed-point', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const { doc, map: parsed1 } = parseFencedFmRegion(fenced);
        if (parsed1 === null) return; // invalid arbitrary, skip
        const reSer = doc.toString({ defaultKeyType: 'PLAIN', lineWidth: 0 });
        const { map: parsed2 } = parseFencedFmRegion(`---\n${reSer}---\n`);
        expect(parsed2).toEqual(parsed1);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-2: applyPatchToFm with {} is a parse-stable no-op', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const result = applyPatchToFm(fenced, {});
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
        const { map: parsedOrig } = parseFencedFmRegion(fenced);
        expect(parsedNext).toEqual(parsedOrig);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-3: applyRenameToFm preserves source position (FR2)', () => {
    fc.assert(
      fc.property(
        fmMapArbitrary.filter(({ keys }) => keys.length >= 2),
        fc.integer({ min: 0, max: 5 }),
        fc
          .string({ minLength: 1, maxLength: MAX_KEY_BYTES })
          .filter((s) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && s !== 'frontmatter'),
        ({ keys, map }, idxRaw, newKey) => {
          const idx = idxRaw % keys.length;
          const oldKey = keys[idx];
          if (!oldKey || keys.includes(newKey)) return;
          const fenced = buildFenced(keys, map);
          const result = applyRenameToFm(fenced, oldKey, newKey);
          if (!result.ok) return;
          const { doc } = parseFencedFmRegion(result.nextFenced);
          const items = (doc.contents as { items?: { key?: { value?: string } | string }[] })
            ?.items;
          if (!items) return;
          const keyAtIdx = items[idx]?.key;
          const keyName = typeof keyAtIdx === 'string' ? keyAtIdx : keyAtIdx?.value;
          expect(keyName).toBe(newKey);
        },
      ),
      { numRuns: 50 },
    );
  });

  test('I-rt-4: applyReorderToFm with identity is a no-op', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        const fenced = buildFenced(keys, map);
        const result = applyReorderToFm(fenced, keys);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { map: parsedNext } = parseFencedFmRegion(result.nextFenced);
        expect(parsedNext).toEqual(map);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-5: permutation lands the requested order', () => {
    fc.assert(
      fc.property(fmMapArbitrary, ({ keys, map }) => {
        if (keys.length < 2) return;
        const reversed = [...keys].reverse();
        const fenced = buildFenced(keys, map);
        const result = applyReorderToFm(fenced, reversed);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { doc } = parseFencedFmRegion(result.nextFenced);
        const items =
          (doc.contents as { items?: { key?: { value?: string } | string }[] })?.items ?? [];
        const observedKeys = items.map((p) => {
          const k = p.key;
          return typeof k === 'string' ? k : k?.value;
        });
        expect(observedKeys).toEqual(reversed);
      }),
      { numRuns: 50 },
    );
  });

  test('I-rt-6: comment placement on a non-leading key survives a value patch (A1 probe)', () => {
    const fenced = '---\ntitle: Hello\n# pinned comment\nstatus: draft\n---\n';
    const result = applyPatchToFm(fenced, { status: 'published' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextFenced).toContain('# pinned comment');
    expect(result.nextFenced).toContain('status: published');
  });
});
