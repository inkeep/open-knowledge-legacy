import { describe, expect, test } from 'bun:test';
import { PREVIEW_IFRAME_HEADER } from './CodeBlockView';

describe('PREVIEW_IFRAME_HEADER — CSP directives', () => {
  test('contains a CSP <meta> tag', () => {
    expect(PREVIEW_IFRAME_HEADER).toMatch(
      /<meta http-equiv="Content-Security-Policy" content="[^"]+">/,
    );
  });

  test('blocks all outbound network requests', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("connect-src 'none'");
  });

  test('blocks external resource loads by default', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("default-src 'none'");
  });

  test('blocks form submission', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("form-action 'none'");
  });

  test('blocks <base> manipulation', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("base-uri 'none'");
  });

  test('blocks nested iframes', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("frame-src 'none'");
    expect(PREVIEW_IFRAME_HEADER).toContain("child-src 'none'");
  });

  test('permits inline scripts (the whole point of the preview)', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("script-src 'unsafe-inline'");
  });

  test('permits inline styles + `data:` for embedded SVG / fonts', () => {
    expect(PREVIEW_IFRAME_HEADER).toContain("style-src 'unsafe-inline' data:");
    expect(PREVIEW_IFRAME_HEADER).toContain('img-src data:');
    expect(PREVIEW_IFRAME_HEADER).toContain('font-src data:');
  });

  test('does NOT permit `script-src` external URLs (would defeat connect-src)', () => {
    expect(PREVIEW_IFRAME_HEADER).not.toMatch(/script-src[^;]*https:/);
    expect(PREVIEW_IFRAME_HEADER).not.toMatch(/script-src[^;]*\*/);
  });
});
