/**
 * Unit tests for the live-DOM clipboard walker pure helpers.
 *
 * The walker's full DOM behavior (cloneNode parallel walk, view.nodeDOM
 * lookup, fallback palette firing on Activity-hidden subtrees) requires a
 * real browser and is exercised in Playwright (US-009). Here we test the
 * pure transformation helpers + the static surface (allowlist / blocklist
 * contents).
 */

import { describe, expect, test } from 'bun:test';
import {
  ATTR_BLOCKLIST,
  buildInlineStyleFrom,
  CLASS_BLOCKLIST,
  type ComputedStyleLike,
  isDangerousEventHandlerAttr,
  isSafeWalkerUrl,
  isSrcsetSafe,
  STYLE_ALLOWLIST,
  sanitizeEmbeddedUrlValue,
  sanitizeStyleAttrValue,
  stripBlocklistedClasses,
  URL_BEARING_TEXT_ATTRS,
  URL_SCHEME_ATTRS,
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

describe('URL_SCHEME_ATTRS — surface contract', () => {
  test('covers HTML-spec URL-bearing attribute set', () => {
    expect(URL_SCHEME_ATTRS.has('href')).toBe(true);
    expect(URL_SCHEME_ATTRS.has('src')).toBe(true);
    expect(URL_SCHEME_ATTRS.has('srcset')).toBe(true);
    expect(URL_SCHEME_ATTRS.has('poster')).toBe(true);
    expect(URL_SCHEME_ATTRS.has('formaction')).toBe(true);
    expect(URL_SCHEME_ATTRS.has('xlink:href')).toBe(true);
  });
});

describe('URL_BEARING_TEXT_ATTRS — surface contract', () => {
  test('covers OK canonical aria-label shape + sibling description fields', () => {
    expect(URL_BEARING_TEXT_ATTRS.has('aria-label')).toBe(true);
    expect(URL_BEARING_TEXT_ATTRS.has('aria-description')).toBe(true);
    expect(URL_BEARING_TEXT_ATTRS.has('title')).toBe(true);
  });
});

describe('isSafeWalkerUrl — allowlist URL classifier', () => {
  test('passes the standard navigation schemes', () => {
    expect(isSafeWalkerUrl('http://example.com')).toBe(true);
    expect(isSafeWalkerUrl('https://example.com')).toBe(true);
    expect(isSafeWalkerUrl('mailto:nick@example.com')).toBe(true);
    expect(isSafeWalkerUrl('tel:+15555555555')).toBe(true);
    expect(isSafeWalkerUrl('ftp://example.com')).toBe(true);
    expect(isSafeWalkerUrl('sms:+15555555555')).toBe(true);
  });

  test('passes relative URL forms', () => {
    expect(isSafeWalkerUrl('/absolute/path.png')).toBe(true);
    expect(isSafeWalkerUrl('./sibling.png')).toBe(true);
    expect(isSafeWalkerUrl('../parent/path.png')).toBe(true);
    expect(isSafeWalkerUrl('#fragment')).toBe(true);
    expect(isSafeWalkerUrl('?query=1')).toBe(true);
  });

  test('passes empty / whitespace-only URL (benign no-op href)', () => {
    expect(isSafeWalkerUrl('')).toBe(true);
    expect(isSafeWalkerUrl('   ')).toBe(true);
  });

  test('blocks the dangerous schemes by name', () => {
    expect(isSafeWalkerUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeWalkerUrl('vbscript:msgbox')).toBe(false);
    expect(isSafeWalkerUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeWalkerUrl('chrome-extension://aabb/script.js')).toBe(false);
    expect(isSafeWalkerUrl('moz-extension://aabb/script.js')).toBe(false);
  });

  test('blocks data: schemes including raster image MIME types', () => {
    // Allowlist excludes all data: schemes — descriptor img/video/audio src
    // already passes through `sanitizeComponentProps` upstream, which uses
    // the same allowlist. Walker stays consistent with the upstream gate.
    expect(isSafeWalkerUrl('data:image/png;base64,iVBOR')).toBe(false);
    expect(isSafeWalkerUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
    expect(isSafeWalkerUrl('data:text/html,<script>')).toBe(false);
  });

  test('blocks novel / future schemes by default (allowlist posture)', () => {
    expect(isSafeWalkerUrl('intent://launch')).toBe(false);
    expect(isSafeWalkerUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeWalkerUrl('view-source:https://example.com')).toBe(false);
    expect(isSafeWalkerUrl('zoommtg://example')).toBe(false);
  });

  test('blocks leading-whitespace bypass per WHATWG URL preprocessing', () => {
    // Browsers strip leading ASCII whitespace before parsing href; a regex
    // that anchors on `^javascript:` without trimming is bypassable.
    expect(isSafeWalkerUrl(' javascript:alert(1)')).toBe(false);
    expect(isSafeWalkerUrl('\tjavascript:alert(1)')).toBe(false);
    expect(isSafeWalkerUrl('\n  javascript:alert(1)')).toBe(false);
  });

  test('classification is case-insensitive on scheme', () => {
    expect(isSafeWalkerUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeWalkerUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeWalkerUrl('HTTPS://example.com')).toBe(true);
  });
});

describe('isSrcsetSafe — comma-separated multi-URL classifier', () => {
  test('passes when every candidate URL is safe', () => {
    expect(isSrcsetSafe('one.png 1x, two.png 2x')).toBe(true);
    expect(isSrcsetSafe('https://a.example/img 480w, https://b.example/img 960w')).toBe(true);
  });

  test('fails when ANY candidate URL is dangerous (HTML srcset spec)', () => {
    // Per WHATWG HTML §4.8.4.3 srcset is a comma-separated list of image
    // candidate strings; a head-anchored `^javascript:` regex on the whole
    // attribute value misses dangerous URLs after the first comma.
    expect(isSrcsetSafe('safe.jpg 1x, javascript:alert(1) 2x')).toBe(false);
    expect(isSrcsetSafe('javascript:alert(1) 1x, safe.jpg 2x')).toBe(false);
  });

  test('passes single-URL srcset (no commas)', () => {
    expect(isSrcsetSafe('safe.jpg')).toBe(true);
    expect(isSrcsetSafe('safe.jpg 2x')).toBe(true);
  });

  test('handles trailing whitespace and empty candidates gracefully', () => {
    expect(isSrcsetSafe('safe.jpg 1x,  ,safe2.jpg 2x')).toBe(true);
    expect(isSrcsetSafe('  ')).toBe(true);
  });
});

describe('sanitizeEmbeddedUrlValue — text-attr URL substitution', () => {
  test('replaces dangerous-scheme URLs with [blocked] inside a label', () => {
    expect(sanitizeEmbeddedUrlValue('Link: javascript:alert(1)')).toBe('Link: [blocked]');
    expect(sanitizeEmbeddedUrlValue('See vbscript:msgbox for details')).toBe(
      'See [blocked] for details',
    );
  });

  test('preserves wrapping label text around the substitution', () => {
    // Canonical OK shape: internal-link.ts emits aria-label="Link: <href>".
    // Substitution must not drop the "Link: " prefix.
    const out = sanitizeEmbeddedUrlValue('Link: javascript:alert(1)');
    expect(out).toContain('Link:');
    expect(out).toContain('[blocked]');
  });

  test('passes safe URLs through unchanged', () => {
    expect(sanitizeEmbeddedUrlValue('Link: https://example.com')).toBe('Link: https://example.com');
    expect(sanitizeEmbeddedUrlValue('Link: /relative/path')).toBe('Link: /relative/path');
    expect(sanitizeEmbeddedUrlValue('Link: mailto:foo@example.com')).toBe(
      'Link: mailto:foo@example.com',
    );
  });

  test('passes plain prose without URLs unchanged', () => {
    expect(sanitizeEmbeddedUrlValue('Link')).toBe('Link');
    expect(sanitizeEmbeddedUrlValue('Some descriptive text')).toBe('Some descriptive text');
  });

  test('passes no-space-after-colon labels through unchanged (label-fidelity)', () => {
    // Earlier revision matched RFC 3986 scheme grammar broadly, so labels
    // like "Item:value" got rewritten to "[blocked]" because their shape
    // looked URL-like. The tightened matcher requires `://` (authority)
    // OR a known dangerous scheme prefix — these label shapes survive
    // intact. Aria-labels are read by assistive tech as text, not as
    // URLs, so leaving novel-scheme tokens unblocked here trades label
    // fidelity for a small surface that does not navigate.
    expect(sanitizeEmbeddedUrlValue('Item:value')).toBe('Item:value');
    expect(sanitizeEmbeddedUrlValue('Status:active')).toBe('Status:active');
    expect(sanitizeEmbeddedUrlValue('Tag:urgent')).toBe('Tag:urgent');
    expect(sanitizeEmbeddedUrlValue('Type:warning Severity:high')).toBe(
      'Type:warning Severity:high',
    );
  });

  test('returns null when nothing changed (caller can avoid setAttribute call)', () => {
    expect(sanitizeEmbeddedUrlValue('Link', { reportNoChange: true })).toBeNull();
    expect(
      sanitizeEmbeddedUrlValue('Link: https://example.com', { reportNoChange: true }),
    ).toBeNull();
    expect(sanitizeEmbeddedUrlValue('Item:value', { reportNoChange: true })).toBeNull();
  });
});

describe('isDangerousEventHandlerAttr — on* event handler classifier', () => {
  test('matches DOM event handler attributes', () => {
    expect(isDangerousEventHandlerAttr('onclick')).toBe(true);
    expect(isDangerousEventHandlerAttr('onerror')).toBe(true);
    expect(isDangerousEventHandlerAttr('onload')).toBe(true);
    expect(isDangerousEventHandlerAttr('onmouseover')).toBe(true);
    expect(isDangerousEventHandlerAttr('onfocus')).toBe(true);
  });

  test('matches case-insensitively', () => {
    expect(isDangerousEventHandlerAttr('OnClick')).toBe(true);
    expect(isDangerousEventHandlerAttr('ONERROR')).toBe(true);
  });

  test('does NOT match non-event attributes that happen to start with on', () => {
    // `one`, `only`, `once` etc. are not event handlers — require length
    // discriminator (event handlers like `onfoo` are at least 3 chars).
    expect(isDangerousEventHandlerAttr('on')).toBe(false);
  });

  test('does NOT match safe attributes', () => {
    expect(isDangerousEventHandlerAttr('class')).toBe(false);
    expect(isDangerousEventHandlerAttr('style')).toBe(false);
    expect(isDangerousEventHandlerAttr('href')).toBe(false);
    expect(isDangerousEventHandlerAttr('aria-label')).toBe(false);
  });
});

describe('sanitizeStyleAttrValue — inline-style url() / expression() filter', () => {
  test('drops styles containing url(javascript:...) payloads', () => {
    // Browsers resolve `url(javascript:...)` against `background-image`,
    // `content`, `list-style-image`, `cursor`, etc. — defense-in-depth at
    // the walker boundary mirrors `sanitizeStyleString` in sanitize-url.ts.
    expect(sanitizeStyleAttrValue('background: url(javascript:alert(1))')).toBe('');
    expect(sanitizeStyleAttrValue("background: url('javascript:alert(1)')")).toBe('');
    expect(sanitizeStyleAttrValue('color: red; background-image: url(vbscript:msgbox)')).toBe('');
  });

  test('drops styles containing expression() payloads (legacy IE gadget)', () => {
    expect(sanitizeStyleAttrValue('width: expression(alert(1))')).toBe('');
  });

  test('drops styles containing url(data:...) (covers data:text/html SVG payloads)', () => {
    expect(sanitizeStyleAttrValue('content: url(data:text/html,<script>)')).toBe('');
  });

  test('passes safe inline styles through unchanged', () => {
    expect(sanitizeStyleAttrValue('color: red; padding: 4px')).toBe('color: red; padding: 4px');
    expect(sanitizeStyleAttrValue('background-color: rgb(255, 0, 0)')).toBe(
      'background-color: rgb(255, 0, 0)',
    );
  });

  test('passes safe url() references through unchanged', () => {
    expect(sanitizeStyleAttrValue('background-image: url(https://example.com/img.png)')).toBe(
      'background-image: url(https://example.com/img.png)',
    );
  });
});
