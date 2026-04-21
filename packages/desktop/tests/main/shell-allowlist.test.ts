import { describe, expect, test } from 'bun:test';
import { checkOutboundUrl } from '../../src/main/shell-allowlist.ts';

describe('checkOutboundUrl (D47 outbound scheme allowlist)', () => {
  test('allows https:', () => {
    expect(checkOutboundUrl('https://example.com')).toEqual({ ok: true });
  });

  test('allows http:', () => {
    expect(checkOutboundUrl('http://example.com')).toEqual({ ok: true });
  });

  test('allows mailto:', () => {
    expect(checkOutboundUrl('mailto:hello@example.com')).toEqual({ ok: true });
  });

  test('allows openknowledge: (our own deep-link scheme)', () => {
    expect(checkOutboundUrl('openknowledge://open?project=/tmp')).toEqual({ ok: true });
  });

  test('rejects ms-msdt: (Shabarkin 2022 RCE class)', () => {
    const result = checkOutboundUrl('ms-msdt:launch?id=xyz');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects file:', () => {
    const result = checkOutboundUrl('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects javascript:', () => {
    const result = checkOutboundUrl('javascript:alert(1)');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects search-ms:', () => {
    const result = checkOutboundUrl('search-ms:query=x');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects malformed URL', () => {
    const result = checkOutboundUrl('not a url');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-url');
  });
});
