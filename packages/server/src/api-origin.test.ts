import { describe, expect, test } from 'bun:test';
import { isAllowedApiOrigin, isLoopbackRemoteAddress } from './api-origin.ts';

describe('API origin guards', () => {
  test('allows only local browser origins and opaque Electron origins', () => {
    expect(isAllowedApiOrigin('null')).toBe(true);
    expect(isAllowedApiOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedApiOrigin('https://127.0.0.1:3000')).toBe(true);
    expect(isAllowedApiOrigin('http://[::1]:3000')).toBe(true);

    expect(isAllowedApiOrigin('https://example.com')).toBe(false);
    expect(isAllowedApiOrigin('not a url')).toBe(false);
  });

  test('recognizes IPv4, IPv6, and IPv4-mapped loopback remotes', () => {
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('127.12.34.56')).toBe(true);
    expect(isLoopbackRemoteAddress('::1')).toBe(true);
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true);

    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
    expect(isLoopbackRemoteAddress('192.168.1.20')).toBe(false);
    expect(isLoopbackRemoteAddress('::ffff:192.168.1.20')).toBe(false);
  });
});
