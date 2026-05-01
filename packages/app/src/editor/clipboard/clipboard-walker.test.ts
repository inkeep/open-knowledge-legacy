/**
 * Unit tests for the live-DOM clipboard walker pure helpers.
 *
 * The walker's full DOM behavior (cloneNode parallel walk, view.nodeDOM
 * lookup, fallback palette firing on Activity-hidden subtrees) requires a
 * real browser and is exercised in Playwright (US-009). Here we test the
 * pure transformation helpers + the static surface (allowlist / blocklist
 * contents) that live in this file.
 *
 * The FR-20 sanitization helpers (URL classification, embedded-URL
 * substitution, event-handler / style-payload filters) live in
 * `clipboard-sanitize.ts` and are tested in `clipboard-sanitize.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import {
  ATTR_BLOCKLIST,
  buildInlineStyleFrom,
  CLASS_BLOCKLIST,
  type ComputedStyleLike,
  glyphForLucide,
  LUCIDE_GLYPH_MAP,
  STYLE_ALLOWLIST,
  stripBlocklistedClasses,
} from './clipboard-walker.ts';

function fakeStyles(map: Record<string, string>): ComputedStyleLike {
  return {
    getPropertyValue: (prop: string) => map[prop] ?? '',
  };
}

describe('STYLE_ALLOWLIST — surface contract', () => {
  test('includes the email-safe color + typography properties', () => {
    expect(STYLE_ALLOWLIST).toContain('color');
    expect(STYLE_ALLOWLIST).toContain('background-color');
    expect(STYLE_ALLOWLIST).toContain('font-family');
    expect(STYLE_ALLOWLIST).toContain('font-size');
    expect(STYLE_ALLOWLIST).toContain('font-weight');
    expect(STYLE_ALLOWLIST).toContain('text-align');
    expect(STYLE_ALLOWLIST).toContain('line-height');
  });

  test('includes the box-model spacing properties', () => {
    expect(STYLE_ALLOWLIST).toContain('padding');
    expect(STYLE_ALLOWLIST).toContain('margin');
    expect(STYLE_ALLOWLIST).toContain('border');
    expect(STYLE_ALLOWLIST).toContain('border-radius');
  });

  test('does NOT include layout / transform / animation properties', () => {
    // Cross-app destinations rebuild layout; inlining these would yield
    // broken visuals on paste-receive.
    expect(STYLE_ALLOWLIST).not.toContain('display');
    expect(STYLE_ALLOWLIST).not.toContain('position');
    expect(STYLE_ALLOWLIST).not.toContain('transform');
    expect(STYLE_ALLOWLIST).not.toContain('transition');
    expect(STYLE_ALLOWLIST).not.toContain('animation');
    expect(STYLE_ALLOWLIST).not.toContain('flex');
    expect(STYLE_ALLOWLIST).not.toContain('grid');
  });

  test('does NOT include vendor-prefixed or interaction properties', () => {
    expect(STYLE_ALLOWLIST.some((p) => p.startsWith('-webkit-'))).toBe(false);
    expect(STYLE_ALLOWLIST).not.toContain('pointer-events');
    expect(STYLE_ALLOWLIST).not.toContain('user-select');
  });
});

describe('CLASS_BLOCKLIST — surface contract', () => {
  test('strips the JSX wrapper chrome', () => {
    expect(CLASS_BLOCKLIST.has('jsx-component-wrapper')).toBe(true);
  });

  test('strips ProseMirror selection / placeholder internals', () => {
    expect(CLASS_BLOCKLIST.has('ProseMirror-selectednode')).toBe(true);
    expect(CLASS_BLOCKLIST.has('ProseMirror-trailingBreak')).toBe(true);
    expect(CLASS_BLOCKLIST.has('selectedCell')).toBe(true);
    expect(CLASS_BLOCKLIST.has('is-empty')).toBe(true);
  });
});

describe('ATTR_BLOCKLIST — surface contract', () => {
  test('strips data-* selection / drag markers', () => {
    expect(ATTR_BLOCKLIST.has('data-selected')).toBe(true);
    expect(ATTR_BLOCKLIST.has('data-has-child-selected')).toBe(true);
    expect(ATTR_BLOCKLIST.has('data-dragging')).toBe(true);
  });

  test('strips contenteditable + data-pm-slice', () => {
    expect(ATTR_BLOCKLIST.has('contenteditable')).toBe(true);
    expect(ATTR_BLOCKLIST.has('data-pm-slice')).toBe(true);
  });
});

describe('buildInlineStyleFrom — pure style filter', () => {
  test('emits allowlisted properties only', () => {
    const styles = fakeStyles({
      color: 'rgb(20, 20, 20)',
      'background-color': 'rgb(255, 240, 240)',
      // Properties NOT in the allowlist — should not appear in output.
      display: 'flex',
      transform: 'rotate(0deg)',
      position: 'absolute',
    });
    const out = buildInlineStyleFrom(styles);
    expect(out).toContain('color: rgb(20, 20, 20)');
    expect(out).toContain('background-color: rgb(255, 240, 240)');
    expect(out).not.toContain('display:');
    expect(out).not.toContain('transform:');
    expect(out).not.toContain('position:');
  });

  test('skips empty / initial / normal property values', () => {
    const styles = fakeStyles({
      color: 'rgb(0, 0, 0)',
      'background-color': '',
      'font-family': 'initial',
      'line-height': 'normal',
    });
    const out = buildInlineStyleFrom(styles);
    expect(out).toContain('color:');
    expect(out).not.toContain('background-color:');
    expect(out).not.toContain('font-family:');
    expect(out).not.toContain('line-height:');
  });

  test('returns empty string when no allowlisted properties have values', () => {
    const styles = fakeStyles({});
    expect(buildInlineStyleFrom(styles)).toBe('');
  });

  test('honors a custom allowlist for selective emission', () => {
    const styles = fakeStyles({
      color: 'rgb(1, 2, 3)',
      'font-size': '14px',
    });
    const out = buildInlineStyleFrom(styles, ['color']);
    expect(out).toContain('color:');
    expect(out).not.toContain('font-size:');
  });
});

describe('stripBlocklistedClasses — pure class filter', () => {
  test('removes blocklisted entries and preserves others', () => {
    const result = stripBlocklistedClasses('callout jsx-component-wrapper callout-note');
    expect(result).toBe('callout callout-note');
  });

  test('returns null when ALL classes are blocklisted', () => {
    const result = stripBlocklistedClasses('jsx-component-wrapper ProseMirror-selectednode');
    expect(result).toBeNull();
  });

  test('returns null for an empty class string', () => {
    expect(stripBlocklistedClasses('')).toBeNull();
  });

  test('handles whitespace and multiple spaces', () => {
    const result = stripBlocklistedClasses('  callout    is-empty   callout-note  ');
    expect(result).toBe('callout callout-note');
  });

  test('honors a custom blocklist', () => {
    const result = stripBlocklistedClasses('foo bar baz', new Set(['bar']));
    expect(result).toBe('foo baz');
  });
});

describe('buildInlineStyleFrom — modern CSS color downgrade', () => {
  test('converts oklch values to rgb so destination renderers can paint them', () => {
    // Tailwind v4 themes resolve to oklch literals via `getComputedStyle`.
    // The walker must convert these to rgb() before emitting inline style;
    // otherwise destinations like Gmail / Notion render them as default
    // (invisible chevrons, missing accent borders).
    const styles = fakeStyles({
      color: 'oklch(0.62 0.15 240)',
      'background-color': 'oklch(0.95 0.02 240)',
    });
    const out = buildInlineStyleFrom(styles);
    expect(out).not.toContain('oklch(');
    expect(out).toMatch(/color: rgb\(/);
    expect(out).toMatch(/background-color: rgb\(/);
  });

  test('preserves rgb / hex values unchanged when already legacy', () => {
    const styles = fakeStyles({
      color: 'rgb(20, 20, 20)',
      'background-color': '#fef3c7',
    });
    const out = buildInlineStyleFrom(styles);
    expect(out).toContain('color: rgb(20, 20, 20)');
    expect(out).toContain('background-color: #fef3c7');
  });
});

describe('glyphForLucide — pure lookup for cross-app icon substitution', () => {
  test('returns the glyph for a single-class lucide name', () => {
    expect(glyphForLucide('lucide-info')).toBe('ℹ');
    expect(glyphForLucide('lucide-chevron-right')).toBe('›');
    expect(glyphForLucide('lucide-alert-triangle')).toBe('⚠');
  });

  test('handles multi-class strings with the lucide name as prefix', () => {
    expect(glyphForLucide('lucide-info callout-icon')).toBe('ℹ');
    expect(glyphForLucide('lucide-chevron-right accordion-chevron')).toBe('›');
  });

  test('handles multi-class strings with the lucide name as suffix', () => {
    expect(glyphForLucide('callout-icon lucide-info')).toBe('ℹ');
    expect(glyphForLucide('lucide lucide-info')).toBe('ℹ');
  });

  test('handles multi-class strings with the lucide name in the middle', () => {
    expect(glyphForLucide('foo lucide-info bar')).toBe('ℹ');
  });

  test('does NOT substring-match — `lucide-info-darker` is not `lucide-info`', () => {
    // Anchor regression: a hyphenated extension of a mapped name must not
    // collide with the mapped glyph. The class regex requires the name to
    // be terminated by whitespace or string-end.
    expect(glyphForLucide('lucide-info-darker')).toBeNull();
    expect(glyphForLucide('lucide-info-foo lucide-foo')).toBeNull();
  });

  test('returns null for empty / no-lucide-class inputs', () => {
    expect(glyphForLucide('')).toBeNull();
    expect(glyphForLucide('callout-icon')).toBeNull();
    expect(glyphForLucide('foo bar baz')).toBeNull();
  });

  test('returns null for unmapped lucide-* classes (graceful degradation)', () => {
    // Unmapped lucide icons fall through to the walker's existing
    // sanitization — the SVG stays in place. Cross-app destinations
    // strip it, but a wrong glyph would be worse than no glyph.
    expect(glyphForLucide('lucide-nonexistent-icon')).toBeNull();
    expect(glyphForLucide('lucide-volume-2')).toBeNull();
    expect(glyphForLucide('lucide-trash2')).toBeNull();
  });

  test('LUCIDE_GLYPH_MAP entry count is anchored — adding/removing icons is intentional', () => {
    // Pin the surface so a mistakenly-deleted entry surfaces here, and
    // intentional additions force a test update. Six entries cover the
    // current Callout (5 type icons) + collapsible chevron surface; adding
    // a new descriptor with new icons requires bumping this count.
    expect(Object.keys(LUCIDE_GLYPH_MAP)).toHaveLength(6);
  });

  test('every LUCIDE_GLYPH_MAP key matches the lucide-<kebab-name> shape', () => {
    // The class regex uses `[a-z0-9-]+` after `lucide-`; if a key were
    // added with a capital letter or underscore it would never match the
    // class string emitted by lucide-react. Anchor the convention.
    for (const key of Object.keys(LUCIDE_GLYPH_MAP)) {
      expect(key).toMatch(/^lucide-[a-z0-9-]+$/);
    }
  });

  test('every LUCIDE_GLYPH_MAP value is a non-empty string', () => {
    for (const value of Object.values(LUCIDE_GLYPH_MAP)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
