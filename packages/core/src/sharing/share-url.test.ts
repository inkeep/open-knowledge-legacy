import { describe, expect, test } from 'bun:test';
import {
  decodeShareUrl,
  encodeShareUrl,
  InvalidShareUrlError,
  UnsupportedShareVersionError,
} from './share-url.ts';

describe('encodeShareUrl', () => {
  test('returns a base64url string with no padding for a simple blob URL', () => {
    const encoded = encodeShareUrl('https://github.com/a/b/blob/main/c.md');
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.includes('=')).toBe(false);
  });

  test('produces a payload whose first decoded byte is 0x01 (version v1)', () => {
    const encoded = encodeShareUrl('https://github.com/a/b/blob/main/c.md');
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    expect(binary.charCodeAt(0)).toBe(0x01);
  });
});

describe('decodeShareUrl', () => {
  test('round-trips a simple blob URL through encode/decode', () => {
    const blobUrl = 'https://github.com/a/b/blob/main/c.md';
    const result = decodeShareUrl(encodeShareUrl(blobUrl));
    expect(result).toEqual({ version: 1, blobUrl });
  });

  test('round-trips a long real-world GitHub blob URL with deep path', () => {
    const blobUrl =
      'https://github.com/inkeep/open-knowledge/blob/feat%2Fsharing-virality-flow/packages/core/src/sharing/share-url.ts';
    expect(decodeShareUrl(encodeShareUrl(blobUrl))).toEqual({ version: 1, blobUrl });
  });

  test('round-trips a URL with unicode and spaces in the path', () => {
    const blobUrl =
      'https://github.com/inkeep/playbooks/blob/main/docs/Q4%20OKRs%20%E2%80%94%20Marketing.md';
    expect(decodeShareUrl(encodeShareUrl(blobUrl))).toEqual({ version: 1, blobUrl });
  });

  test('throws UnsupportedShareVersionError when the version byte is not 0x01', () => {
    const blobBytes = new TextEncoder().encode('https://example.com/foo');
    const bytes = new Uint8Array(1 + blobBytes.length);
    bytes[0] = 0x02;
    bytes.set(blobBytes, 1);
    const encoded = uint8ArrayToBase64UrlForTest(bytes);

    let caught: unknown;
    try {
      decodeShareUrl(encoded);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnsupportedShareVersionError);
    expect((caught as UnsupportedShareVersionError).version).toBe(2);
  });

  test('throws InvalidShareUrlError on undecodable base64url input', () => {
    let caught: unknown;
    try {
      decodeShareUrl('not!valid!base64!!!');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidShareUrlError);
  });

  test('throws InvalidShareUrlError on empty input', () => {
    expect(() => decodeShareUrl('')).toThrow(InvalidShareUrlError);
  });

  test('throws InvalidShareUrlError when the payload after the version byte is not valid UTF-8', () => {
    const bytes = new Uint8Array([0x01, 0xc3, 0x28]);
    const encoded = uint8ArrayToBase64UrlForTest(bytes);
    expect(() => decodeShareUrl(encoded)).toThrow(InvalidShareUrlError);
  });

  test('ignores arbitrary query parameters appended to the encoded payload (Axis 1)', () => {
    const blobUrl = 'https://github.com/a/b/blob/main/c.md';
    const encoded = encodeShareUrl(blobUrl);
    expect(decodeShareUrl(`${encoded}?utm_source=slack&ref=campaign`)).toEqual({
      version: 1,
      blobUrl,
    });
  });

  test('ignores an arbitrary fragment appended to the encoded payload (Axis 2)', () => {
    const blobUrl = 'https://github.com/a/b/blob/main/c.md';
    const encoded = encodeShareUrl(blobUrl);
    expect(decodeShareUrl(`${encoded}#section-2`)).toEqual({ version: 1, blobUrl });
  });

  test('ignores both query parameters and a fragment appended together', () => {
    const blobUrl = 'https://github.com/a/b/blob/main/c.md';
    const encoded = encodeShareUrl(blobUrl);
    expect(decodeShareUrl(`${encoded}?utm=x#frag`)).toEqual({ version: 1, blobUrl });
  });
});

function uint8ArrayToBase64UrlForTest(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binaryString);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
