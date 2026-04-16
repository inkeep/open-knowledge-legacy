import { describe, expect, test } from 'bun:test';
import { isLoopbackAddress } from './loopback';

describe('isLoopbackAddress', () => {
  test('accepts classic IPv4 loopback', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
  });

  test('accepts anywhere in the 127.0.0.0/8 block', () => {
    expect(isLoopbackAddress('127.0.0.2')).toBe(true);
    expect(isLoopbackAddress('127.1.2.3')).toBe(true);
    expect(isLoopbackAddress('127.255.255.254')).toBe(true);
  });

  test('accepts IPv6 loopback', () => {
    expect(isLoopbackAddress('::1')).toBe(true);
  });

  test('accepts IPv4-mapped IPv6 loopback', () => {
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  test('rejects LAN IPv4 addresses', () => {
    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
    expect(isLoopbackAddress('172.16.0.1')).toBe(false);
  });

  test('rejects public IPv4 addresses', () => {
    expect(isLoopbackAddress('8.8.8.8')).toBe(false);
    expect(isLoopbackAddress('1.2.3.4')).toBe(false);
  });

  test('rejects non-loopback IPv6 addresses', () => {
    expect(isLoopbackAddress('fe80::1')).toBe(false);
    expect(isLoopbackAddress('2001:db8::1')).toBe(false);
  });

  test('rejects non-loopback IPv4-mapped IPv6', () => {
    expect(isLoopbackAddress('::ffff:192.168.1.5')).toBe(false);
    expect(isLoopbackAddress('::ffff:8.8.8.8')).toBe(false);
  });

  test('rejects undefined (socket closed)', () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isLoopbackAddress('')).toBe(false);
  });

  test('does not misclassify 127-prefixed hostnames outside 127.0.0.0/8', () => {
    // Confirms the startsWith('127.') guard isn't accidentally matching
    // something with a `127` substring that isn't a dotted IPv4 address.
    expect(isLoopbackAddress('127')).toBe(false);
    expect(isLoopbackAddress('1270.0.0.1')).toBe(false);
  });
});
