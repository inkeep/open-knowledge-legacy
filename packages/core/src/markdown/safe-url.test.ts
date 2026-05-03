import { describe, expect, test } from 'bun:test';
import { isRelativeUrl, isSafeUrl, SAFE_URL_SCHEME_RE, SAFE_URL_SCHEMES } from './safe-url.ts';

describe('SAFE_URL_SCHEMES — canonical scheme array', () => {
  test('contains the documented allowlist and nothing else', () => {
    expect([...SAFE_URL_SCHEMES]).toEqual(['https', 'http', 'mailto', 'tel', 'ftp', 'sms']);
  });

  test('schemes are stored without a trailing colon', () => {
    for (const scheme of SAFE_URL_SCHEMES) {
      expect(scheme).not.toContain(':');
    }
  });
});

describe('SAFE_URL_SCHEME_RE — derived regex form', () => {
  test('matches every scheme in the canonical array (with colon)', () => {
    for (const scheme of SAFE_URL_SCHEMES) {
      expect(SAFE_URL_SCHEME_RE.test(`${scheme}:foo`)).toBe(true);
    }
  });

  test('matches relative URL prefixes', () => {
    expect(SAFE_URL_SCHEME_RE.test('/abs/path')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('#fragment')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('?query=1')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('./sibling')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('../parent')).toBe(true);
  });

  test('rejects dangerous schemes', () => {
    expect(SAFE_URL_SCHEME_RE.test('javascript:alert(1)')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('vbscript:msgbox(1)')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('data:text/html,<script>')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('data:image/png;base64,iVBOR')).toBe(false); // intentional — data: in any flavor
    expect(SAFE_URL_SCHEME_RE.test('file:///etc/passwd')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('chrome-extension://abc')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('moz-extension://abc')).toBe(false);
  });

  test('matches case-insensitively (browsers normalize scheme to lowercase per WHATWG URL §3.1)', () => {
    expect(SAFE_URL_SCHEME_RE.test('HTTPS://example.com')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('Https://example.com')).toBe(true);
    expect(SAFE_URL_SCHEME_RE.test('JaVaScRiPt:alert(1)')).toBe(false);
  });

  test('is head-anchored — does not match URLs embedded in text', () => {
    expect(SAFE_URL_SCHEME_RE.test('Click https://example.com')).toBe(false);
    expect(SAFE_URL_SCHEME_RE.test('See javascript:alert(1)')).toBe(false);
  });
});

describe('isSafeUrl — public allowlist classifier', () => {
  test('treats empty / whitespace-only input as benign', () => {
    expect(isSafeUrl('')).toBe(true);
    expect(isSafeUrl('   ')).toBe(true);
    expect(isSafeUrl('\t\n')).toBe(true);
  });

  test('accepts every scheme in SAFE_URL_SCHEMES', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
    expect(isSafeUrl('tel:+15551234567')).toBe(true);
    expect(isSafeUrl('ftp://files.example.com')).toBe(true);
    expect(isSafeUrl('sms:+15551234567?body=hi')).toBe(true);
  });

  test('accepts relative URL forms', () => {
    expect(isSafeUrl('/abs')).toBe(true);
    expect(isSafeUrl('./sibling')).toBe(true);
    expect(isSafeUrl('../parent')).toBe(true);
    expect(isSafeUrl('#anchor')).toBe(true);
    expect(isSafeUrl('?q=1')).toBe(true);
  });

  test('rejects dangerous schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  test('rejects novel/unknown schemes (fail-closed)', () => {
    expect(isSafeUrl('intent://foo')).toBe(false);
    expect(isSafeUrl('blob:https://x')).toBe(false);
    expect(isSafeUrl('view-source:https://x')).toBe(false);
    expect(isSafeUrl('chrome-extension://abc')).toBe(false);
    expect(isSafeUrl('moz-extension://abc')).toBe(false);
  });

  test('trims leading whitespace before classifying (WHATWG URL §4)', () => {
    expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\tjavascript:alert(1)')).toBe(false);
    expect(isSafeUrl('  https://example.com')).toBe(true);
  });

  test('rejects bare relative paths without leading delimiter (mdast scope)', () => {
    expect(isSafeUrl('one.png')).toBe(false);
    expect(isSafeUrl('path/file.jpg')).toBe(false);
  });
});

describe('isRelativeUrl — relative-URL detection (clipboard walker + sanitize-url shared helper)', () => {
  test('treats empty / whitespace-only input as relative', () => {
    expect(isRelativeUrl('')).toBe(true);
    expect(isRelativeUrl('   ')).toBe(true);
  });

  test('returns true when no colon present (bare relative paths)', () => {
    expect(isRelativeUrl('one.png')).toBe(true);
    expect(isRelativeUrl('path/file.jpg')).toBe(true);
    expect(isRelativeUrl('relative-doc')).toBe(true);
  });

  test('returns true when path delimiter precedes the colon', () => {
    expect(isRelativeUrl('/path/with:colon')).toBe(true);
    expect(isRelativeUrl('?query=a:b')).toBe(true);
    expect(isRelativeUrl('#section:1')).toBe(true);
    expect(isRelativeUrl('./sib:1')).toBe(true);
  });

  test('returns false when colon precedes any path delimiter (looks like a scheme)', () => {
    expect(isRelativeUrl('https://example.com')).toBe(false);
    expect(isRelativeUrl('javascript:alert(1)')).toBe(false);
    expect(isRelativeUrl('mailto:user@host')).toBe(false);
    expect(isRelativeUrl('intent:foo')).toBe(false);
  });

  test('combined with isSafeUrl forms the walker / sanitize-url full safety check', () => {
    const cases: Array<[string, boolean]> = [
      ['https://safe.example', true],
      ['mailto:foo@bar', true],
      ['/relative/path.png', true],
      ['one.png', true], // relative — no colon
      ['#anchor', true],
      ['javascript:alert(1)', false],
      ['data:text/html,<script>', false],
      ['vbscript:msgbox(1)', false],
      ['file:///etc/passwd', false],
      ['intent://maps', false], // novel scheme with authority — fail-closed at scheme check, fail-closed at relative check
    ];
    for (const [url, expected] of cases) {
      const result = isSafeUrl(url) || isRelativeUrl(url);
      expect(result, url).toBe(expected);
    }
  });
});

describe('drift parity invariant — sanitize-url.ts derivation', () => {
  test('SAFE_URL_SCHEMES is the source for both the regex and the Set', () => {
    const setForm = new Set(SAFE_URL_SCHEMES.map((s) => `${s}:`));
    expect(setForm.has('https:')).toBe(true);
    expect(setForm.has('http:')).toBe(true);
    expect(setForm.has('mailto:')).toBe(true);
    expect(setForm.has('tel:')).toBe(true);
    expect(setForm.has('ftp:')).toBe(true);
    expect(setForm.has('sms:')).toBe(true);
    expect(setForm.has('javascript:')).toBe(false);
    expect(setForm.has('data:')).toBe(false);
  });

  test('every Set member is accepted by isSafeUrl, every dangerous scheme rejected', () => {
    const setForm = new Set(SAFE_URL_SCHEMES.map((s) => `${s}:`));
    for (const member of setForm) {
      expect(isSafeUrl(`${member}example`)).toBe(true);
    }
    const dangerous = ['javascript:', 'vbscript:', 'data:', 'file:', 'chrome-extension:'];
    for (const scheme of dangerous) {
      expect(setForm.has(scheme)).toBe(false);
      expect(isSafeUrl(`${scheme}payload`)).toBe(false);
    }
  });
});
