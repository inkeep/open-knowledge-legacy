/**
 * Per-key frontmatter round-trip + bridge invariant (US-013).
 *
 * Covers four contract surfaces at the fidelity tier so a regression in any
 * fails the gate that runs on every PR:
 *
 *   AC #1 — `parse(serialize(map)) === map` round-trip across fixtures including
 *           comments, Unicode, varied scalar styles, and the five widget shapes.
 *   AC #2 — `serialize(parse(yaml))` produces canonical form; subsequent saves
 *           are byte-stable (idempotent under canonicalization).
 *   AC #6 — `attachBridgeInvariantWatcher`'s composition `prependFrontmatter(
 *           getFrontmatter(doc), serialize(fragment))` is byte-equal to Y.Text
 *           after a per-key write — the substrate bridge invariant under the
 *           per-key storage shape (D11, NOT the markdown-pipeline I1).
 *
 * Why this lives at the fidelity tier (not just `packages/core/src/frontmatter/yaml-codec.test.ts`):
 * the codec tests verify the codec in isolation; this file pins the contract
 * the OBSERVERS rely on — composed YAML+body equality across CRDT roots — so a
 * future codec change that survives unit tests but breaks the bridge invariant
 * surfaces here at PR time, not in stress runs.
 */

import { describe, expect, test } from 'bun:test';
import {
  type FrontmatterMap,
  type FrontmatterValue,
  getFrontmatter,
  getFrontmatterMap,
  parseFrontmatterYaml,
  prependFrontmatter,
  serializeFrontmatterMap,
  setFrontmatterFromYaml,
  withFences,
} from '@inkeep/open-knowledge-core';
import * as fc from 'fast-check';
import * as Y from 'yjs';

import { assertAcrossSeeds } from './helpers';

// ── Arbitraries: the five widget shapes ────────────────────────────────────

/** YAML-safe key: starts with a letter, alphanumeric + underscore, 1–20 chars. */
const safeKey = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s));

/** Plain string scalar: no newlines, no leading/trailing whitespace, no YAML
 *  special characters that would require quoting in PLAIN scalar style. The
 *  goal is to stay inside `defaultStringType: 'PLAIN'`'s tolerance so the
 *  serialized form stays canonical without escapes. */
const plainString = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(
    (s) =>
      !s.includes('\n') &&
      !s.includes('\r') &&
      !s.includes(':') &&
      !s.includes('#') &&
      !s.startsWith('-') &&
      !s.startsWith('?') &&
      !s.startsWith('!') &&
      !s.startsWith('@') &&
      !s.startsWith('>') &&
      !s.startsWith('|') &&
      s.trim() === s &&
      s.length > 0,
  );

/** Number — bounded to avoid scientific-notation rendering ambiguity. */
const numberArb = fc.integer({ min: -1_000_000, max: 1_000_000 });

/** ISO 8601 date string — YYYY-MM-DD. yaml@2 round-trips these as strings
 *  when `defaultStringType: 'PLAIN'`. */
const isoDate = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** List of plain strings (the chip-input widget shape, D20). */
const stringList = fc.array(plainString, { minLength: 0, maxLength: 6 });

/** Union over all five widget value shapes. */
const valueArb = fc.oneof(plainString, numberArb, fc.boolean(), isoDate, stringList);

/** Frontmatter map: 0–8 keys, each mapping to one value-arb shape. */
const mapArb: fc.Arbitrary<FrontmatterMap> = fc
  .uniqueArray(safeKey, { minLength: 0, maxLength: 8 })
  .chain((keys) =>
    fc.tuple(...keys.map(() => valueArb)).map((values) => {
      const map: Record<string, FrontmatterValue> = {};
      keys.forEach((k, i) => {
        const v = values[i];
        if (v !== undefined) map[k] = v;
      });
      return map;
    }),
  );

// ── AC #1: parse(serialize(map)) === map ───────────────────────────────────

describe('AC #1 — parse(serialize(map)) === map', () => {
  test('PBT: round-trips arbitrary maps across the five widget shapes', () => {
    assertAcrossSeeds(
      fc.property(mapArb, (map) => {
        const yaml = serializeFrontmatterMap(map);
        const parsed = parseFrontmatterYaml(yaml).map;
        expect(parsed).toEqual(map);
      }),
      // Lower than NUM_RUNS — each iteration parses + serializes a Document,
      // ~0.3ms each; 600 across 3 seeds keeps total < 1s but covers ~600
      // distinct shapes.
      { numRuns: 600 },
    );
  });

  test('fixture: empty map → empty YAML body', () => {
    expect(serializeFrontmatterMap({})).toBe('');
    expect(parseFrontmatterYaml('').map).toEqual({});
  });

  test('fixture: comments survive parse-then-serialize via the Document', () => {
    // Parsing through the Document (not just .toJS()) keeps comments anchored
    // to their owning key. The map shape is what feeds Y.Map; the Document is
    // what feeds applyPatchToDocument. Both must round-trip the comment.
    const yaml = '# spec owner: sarah\ntitle: Hello\n# end of file\n';
    const { doc, map } = parseFrontmatterYaml(yaml);
    expect(map).toEqual({ title: 'Hello' });
    const serialized = doc.toString();
    expect(serialized).toContain('# spec owner: sarah');
    expect(serialized).toContain('# end of file');
    expect(serialized).toContain('title: Hello');
  });

  test('fixture: Unicode / non-ASCII scalars round-trip', () => {
    const map: FrontmatterMap = {
      title: '日本語のタイトル',
      author: 'Renée',
      slogan: 'naïveté',
      tagline: 'café résumé',
    };
    const yaml = serializeFrontmatterMap(map);
    expect(parseFrontmatterYaml(yaml).map).toEqual(map);
  });

  test('fixture: special-character strings do not collapse on round-trip', () => {
    // Strings whose plain form would be ambiguous get auto-quoted by yaml@2.
    // The contract is shape preservation, not byte-stability of the YAML —
    // round-trip via parse+serialize must reproduce the same logical map.
    const map: FrontmatterMap = {
      url: 'https://example.com/path?q=1',
      sentence: 'hello: world',
      hashy: 'value # with hash',
      dashy: '- not a list',
    };
    const yaml = serializeFrontmatterMap(map);
    expect(parseFrontmatterYaml(yaml).map).toEqual(map);
  });

  test('fixture: mixed scalar styles in a single map', () => {
    const map: FrontmatterMap = {
      text_field: 'plain text',
      version: 42,
      published: true,
      release_date: '2026-04-27',
      tags: ['docs', 'crdt', 'frontmatter'],
    };
    const yaml = serializeFrontmatterMap(map);
    expect(parseFrontmatterYaml(yaml).map).toEqual(map);
  });
});

// ── AC #2: serialize(parse(yaml)) is canonical and idempotent ──────────────

describe('AC #2 — serialize(parse(yaml)) is canonical and byte-stable', () => {
  test('PBT: load-then-save is idempotent on subsequent saves', () => {
    assertAcrossSeeds(
      fc.property(mapArb, (map) => {
        // 1st save: canonical bytes from any valid input map.
        const canonical = serializeFrontmatterMap(map);
        // 2nd save: parse the canonical, re-serialize, expect byte equality.
        const reparsed = parseFrontmatterYaml(canonical).map;
        if (reparsed === null) throw new Error('round-trip parse returned null');
        const round2 = serializeFrontmatterMap(reparsed);
        expect(round2).toBe(canonical);
      }),
      { numRuns: 600 },
    );
  });

  test('PBT: serialize is deterministic across runs', () => {
    // Same input → byte-identical output across calls. This is the property
    // the bridge invariant requires; if yaml@2 ever introduces output
    // non-determinism (e.g. via a Map iteration change), this fails first.
    assertAcrossSeeds(
      fc.property(mapArb, (map) => {
        expect(serializeFrontmatterMap(map)).toBe(serializeFrontmatterMap(map));
      }),
      { numRuns: 300 },
    );
  });

  test('fixture: byte-stable on three consecutive load→save cycles', () => {
    const map: FrontmatterMap = {
      title: 'Open Knowledge',
      version: 1,
      tags: ['docs', 'crdt'],
    };
    const c1 = serializeFrontmatterMap(map);
    const c2 = serializeFrontmatterMap(parseFrontmatterYaml(c1).map ?? {});
    const c3 = serializeFrontmatterMap(parseFrontmatterYaml(c2).map ?? {});
    expect(c2).toBe(c1);
    expect(c3).toBe(c1);
  });
});

// ── AC #6: substrate bridge invariant under per-key writes ─────────────────

/**
 * Pin the watcher's composition contract under the per-key storage shape.
 *
 * Per `attachBridgeInvariantWatcher` (`packages/app/tests/integration/test-harness.ts`),
 * the substrate bridge invariant is:
 *
 *   normalizeBridge(ytext) === normalizeBridge(prependFrontmatter(fm, serialize(fragment)))
 *
 * where `fm` is the frontmatter portion of the canonical body. Under the
 * per-key Y.Map storage from US-001..US-005, `fm` resolves through
 * `getFrontmatter(doc)`, which synthesizes the YAML from per-key entries when
 * any exist (and falls back to the legacy single-string slot otherwise).
 *
 * The invariant is the contract; this test asserts it holds after a per-key
 * write that touches the metaMap (no XmlFragment / Y.Text touch).
 */
describe('AC #6 — substrate bridge invariant under per-key writes', () => {
  test('per-key-only metaMap update composes to byte-equal Y.Text via getFrontmatter', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const ytext = doc.getText('source');

    // Seed per-key state directly via the codec helper. This mirrors the path
    // a form-write or `frontmatter_patch` call lands on (US-005): metaMap-only
    // writes, no XmlFragment touch, no direct Y.Text mutation.
    doc.transact(() => {
      const result = setFrontmatterFromYaml(
        doc,
        'title: From Form\nstatus: published\ntags:\n  - docs\n  - crdt\n',
      );
      expect(result.ok).toBe(true);
    });

    // Body content lives in Y.Text (the source-mode mirror that Observer A
    // would compose to). Simulate the post-Observer-A state: ytext = composed
    // YAML+body.
    const composedFm = getFrontmatter(doc);
    const body = '# Body heading\n\nA paragraph.\n';
    doc.transact(() => {
      ytext.insert(0, prependFrontmatter(composedFm, body));
    });

    // The bridge invariant's composition source: legacy slot OR per-key map.
    // After a per-key write, `getFrontmatter(doc)` synthesizes from per-key
    // (the new path); under the legacy storage shape it returns the legacy
    // slot. Both must yield the same composed string when fed into the
    // invariant's prepend.
    const composedFromHelper = getFrontmatter(doc);
    const composedFromPerKey = withFences(serializeFrontmatterMap(getFrontmatterMap(doc)));
    expect(composedFromHelper).toBe(composedFromPerKey);

    // Byte-equality with what the watcher would compose from the fragment
    // (here we use the body string directly as the fragment's serialized
    // form; the watcher uses `mdManager.serialize(fragment)`, which is the
    // body for body-only PM trees).
    const composed = prependFrontmatter(composedFromHelper, body);
    expect(ytext.toString()).toBe(composed);
    void fragment; // not exercised here; integration tests cover the fragment leg
  });

  test('legacy-slot write composes to byte-equal output (back-compat)', () => {
    // The watcher reads `metaMap.get('frontmatter')` directly, but the AC
    // says the contract continues to compose `getFrontmatter(doc)` ⊕ fragment.
    // Under the legacy slot (no per-key entries), `getFrontmatter` returns the
    // legacy string verbatim. Pin this for the docs-not-yet-migrated case.
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    const metaMap = doc.getMap<unknown>('metadata');

    const fenced = '---\ntitle: Legacy\n---\n';
    doc.transact(() => {
      metaMap.set('frontmatter', fenced);
      ytext.insert(0, prependFrontmatter(fenced, '# Body\n'));
    });

    expect(getFrontmatter(doc)).toBe(fenced);
    expect(getFrontmatterMap(doc)).toEqual({});
    const composed = prependFrontmatter(getFrontmatter(doc), '# Body\n');
    expect(ytext.toString()).toBe(composed);
  });

  test('per-key re-canonicalization is byte-stable on subsequent reads', () => {
    // Once per-key state is set, subsequent `getFrontmatter` calls must return
    // the same bytes — this is what makes the watcher's equality check robust
    // across multiple `afterTransaction` firings.
    const doc = new Y.Doc();
    doc.transact(() => {
      setFrontmatterFromYaml(doc, 'title: Stable\ncount: 1\ntags: [a, b]\n');
    });
    const a = getFrontmatter(doc);
    const b = getFrontmatter(doc);
    const c = getFrontmatter(doc);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
