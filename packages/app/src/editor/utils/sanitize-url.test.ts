import { describe, expect, test } from 'bun:test';
import { sanitizeComponentProps, sanitizeUrlValue, URL_PROP_NAMES } from './sanitize-url';

describe('sanitizeUrlValue', () => {
  test('passes http/https through unchanged', () => {
    expect(sanitizeUrlValue('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrlValue('http://example.com/a?b=c#d')).toBe('http://example.com/a?b=c#d');
  });

  test('passes mailto/tel/ftp/sms through unchanged', () => {
    expect(sanitizeUrlValue('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(sanitizeUrlValue('tel:+1-800-555-1212')).toBe('tel:+1-800-555-1212');
    expect(sanitizeUrlValue('ftp://files.example.com/x')).toBe('ftp://files.example.com/x');
    expect(sanitizeUrlValue('sms:+15551234567')).toBe('sms:+15551234567');
  });

  test('passes relative paths and fragments through', () => {
    expect(sanitizeUrlValue('/docs/foo')).toBe('/docs/foo');
    expect(sanitizeUrlValue('./sibling')).toBe('./sibling');
    expect(sanitizeUrlValue('../up')).toBe('../up');
    expect(sanitizeUrlValue('#section')).toBe('#section');
    expect(sanitizeUrlValue('path/with:colon')).toBe('path/with:colon');
    expect(sanitizeUrlValue('query?x:y=1')).toBe('query?x:y=1');
  });

  test('passes protocol-relative URLs through', () => {
    expect(sanitizeUrlValue('//cdn.example.com/lib.js')).toBe('//cdn.example.com/lib.js');
  });

  test('strips javascript: scheme', () => {
    expect(sanitizeUrlValue('javascript:alert(1)')).toBe('#');
    expect(sanitizeUrlValue('JavaScript:alert(1)')).toBe('#');
    expect(sanitizeUrlValue(' javascript:alert(1) ')).toBe('#');
  });

  test('strips vbscript: scheme', () => {
    expect(sanitizeUrlValue('vbscript:MsgBox(1)')).toBe('#');
  });

  test('strips data:text/html scheme (but other schemes still blocked too)', () => {
    expect(sanitizeUrlValue('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(sanitizeUrlValue('data:image/png;base64,XXXX')).toBe('#');
  });

  test('strips custom / uncommon schemes', () => {
    expect(sanitizeUrlValue('file:///etc/passwd')).toBe('#');
    expect(sanitizeUrlValue('chrome://settings')).toBe('#');
  });

  test('passes empty/falsy strings through', () => {
    expect(sanitizeUrlValue('')).toBe('');
    expect(sanitizeUrlValue(undefined)).toBe(undefined);
    expect(sanitizeUrlValue(null)).toBe(null);
  });

  test('passes non-strings through (caller guards key against URL_PROP_NAMES)', () => {
    expect(sanitizeUrlValue(42)).toBe(42);
    expect(sanitizeUrlValue(true)).toBe(true);
  });
});

describe('sanitizeComponentProps', () => {
  test('rewrites only URL-typed props', () => {
    const input = {
      href: 'javascript:alert(1)',
      title: 'Hello',
      external: true,
      src: 'https://ok.example.com/x.png',
    };
    const output = sanitizeComponentProps(input);
    expect(output.href).toBe('#');
    expect(output.src).toBe('https://ok.example.com/x.png');
    expect(output.title).toBe('Hello');
    expect(output.external).toBe(true);
  });

  test('returns input unchanged when no URL-typed prop needs rewriting', () => {
    const input = {
      href: 'https://example.com',
      title: 'Hello',
    };
    const output = sanitizeComponentProps(input);
    expect(output).toBe(input); // same reference — no unnecessary re-render
  });

  test('covers all known URL prop names', () => {
    const allMalicious: Record<string, string> = {};
    for (const name of URL_PROP_NAMES) allMalicious[name] = 'javascript:alert(1)';
    const output = sanitizeComponentProps(allMalicious);
    for (const name of URL_PROP_NAMES) {
      expect(output[name]).toBe('#');
    }
  });
});
