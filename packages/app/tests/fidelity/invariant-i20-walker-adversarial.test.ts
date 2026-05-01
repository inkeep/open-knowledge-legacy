/**
 * Invariant I20 — Live-DOM walker adversarial-attribute corpus.
 *
 * The walker emits cross-app text/html by inlining computed styles from the
 * live editor DOM. This invariant adversarially fuzzes the pure helpers
 * (`buildInlineStyleFrom`, `stripBlocklistedClasses`) to confirm:
 *
 *   1. Allowlist completeness: only properties IN `STYLE_ALLOWLIST` ever
 *      appear in the inline style output, regardless of what computed styles
 *      a malicious / pathological live DOM would expose.
 *   2. Class blocklist completeness: blocklisted classes never survive
 *      `stripBlocklistedClasses`, even when interleaved with adversarial
 *      whitespace.
 *   3. No malicious style smuggling: properties not in the allowlist —
 *      including `expression(…)` (legacy IE), URL-bound `@import`, vendor
 *      prefixes, transform / animation, javascript: URLs in
 *      background-image — all stay out of the output.
 *
 * The walker's full DOM behavior (cloneNode parallelism, view.nodeDOM
 * lookup, fallback palette) is exercised in Playwright; the pure helpers
 * are the only deterministic bun-test target.
 */

import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  buildInlineStyleFrom,
  CLASS_BLOCKLIST,
  type ComputedStyleLike,
  STYLE_ALLOWLIST,
  stripBlocklistedClasses,
} from '../../src/editor/clipboard/clipboard-walker.ts';
import { NUM_RUNS } from './helpers';

const MALICIOUS_PROPS = [
  '-webkit-text-fill-color',
  '-webkit-backface-visibility',
  '-moz-osx-font-smoothing',
  'pointer-events',
  'user-select',
  'transform',
  'transition',
  'animation',
  'animation-name',
  'will-change',
  'mix-blend-mode',
  'filter',
  'backdrop-filter',
  'clip-path',
  'mask',
  'expression',
];

const MALICIOUS_VALUES = [
  'expression(alert(1))',
  'url(javascript:alert(1))',
  '@import url(http://evil.example/x.css)',
  '">/<script>alert(1)</script>',
  'attr(data-x url)',
  'red; background: url(javascript:alert(1))',
];

function fakeStyles(map: Record<string, string>): ComputedStyleLike {
  return { getPropertyValue: (p) => map[p] ?? '' };
}

describe('I20 — walker style allowlist is exhaustive', () => {
  test('no allowlisted property has a vendor-prefix or interaction-control name', () => {
    for (const prop of STYLE_ALLOWLIST) {
      expect(prop.startsWith('-')).toBe(false);
      expect(prop).not.toBe('pointer-events');
      expect(prop).not.toBe('user-select');
      expect(prop).not.toBe('transform');
      expect(prop).not.toBe('animation');
    }
  });
});

describe('I20 — buildInlineStyleFrom rejects every malicious property', () => {
  test.each(MALICIOUS_PROPS)('property %s never appears in output', (prop) => {
    const styles = fakeStyles({ [prop]: 'red' });
    const out = buildInlineStyleFrom(styles);
    expect(out).not.toContain(prop);
  });

  test('allowlisted property carrying a malicious value is emitted but not interpreted (HTML-escape responsibility downstream)', () => {
    // The walker inlines the value verbatim; downstream HTML serialization
    // / sanitizer-proxy is responsible for entity-encoding `<`, `"`, etc.
    // What we assert here is that the property STRUCTURE is preserved (i.e.,
    // the walker does not mangle the value or silently drop the allowlisted
    // property). Smuggled `;` chains still appear as part of the value
    // string — destinations that re-parse the inline style must use a real
    // CSS parser, never naive split.
    const styles = fakeStyles({ color: 'red; background: url(javascript:alert(1))' });
    const out = buildInlineStyleFrom(styles);
    expect(out).toContain('color:');
  });

  test('arbitrary-property fuzz: any property NOT in STYLE_ALLOWLIST stays out', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-z-]+$/.test(s)),
        (prop) => {
          if ((STYLE_ALLOWLIST as readonly string[]).includes(prop)) {
            return; // Skip allowlisted props.
          }
          const styles = fakeStyles({ [prop]: 'red' });
          const out = buildInlineStyleFrom(styles);
          expect(out).not.toContain(prop);
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 500) },
    );
  });

  test.each(
    MALICIOUS_VALUES,
  )('attribute value %s only appears via an allowlisted property carrier', (value) => {
    // Values land inside an allowlisted property — never as a bare expression.
    const styles = fakeStyles({ color: value });
    const out = buildInlineStyleFrom(styles);
    expect(out).toContain('color:');
    // The full output is one `prop: value;` pair — no orphan expression.
    expect(out.startsWith('color:')).toBe(true);
  });
});

describe('I20 — stripBlocklistedClasses rejects every blocklisted class', () => {
  test.each(Array.from(CLASS_BLOCKLIST))('class %s never survives the filter', (cls) => {
    const result = stripBlocklistedClasses(`callout ${cls} callout-note`);
    expect(result).not.toContain(cls);
  });

  test('arbitrary-class-list fuzz: blocklisted entries never survive', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constantFrom(...Array.from(CLASS_BLOCKLIST)),
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z][\w-]*$/.test(s)),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (classes) => {
          const result = stripBlocklistedClasses(classes.join(' '));
          if (result === null) {
            // Every class was blocklisted — the result is null (correct).
            return;
          }
          for (const cls of CLASS_BLOCKLIST) {
            expect(result).not.toContain(cls);
          }
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 500) },
    );
  });
});
