import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sanitizeClientName } from '@inkeep/open-knowledge-server';
import { findProjectDir } from './server.ts';

describe('findProjectDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-resolve-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('returns the dir itself when `.ok/` is at the start', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    expect(findProjectDir(tmpDir)).toBe(resolve(tmpDir));
  });

  test('walks up from a subdirectory to the nearest project root', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    const sub = resolve(tmpDir, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    expect(findProjectDir(sub)).toBe(resolve(tmpDir));
  });

  test('throws with a clear message when no `.ok/` ancestor exists', () => {
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a regular file named `.ok` and keeps walking up', () => {
    writeFileSync(resolve(tmpDir, '.ok'), 'oops');
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('rejects a dangling symlink at `.ok` and keeps walking up', () => {
    symlinkSync(resolve(tmpDir, 'does-not-exist'), resolve(tmpDir, '.ok'));
    expect(() => findProjectDir(tmpDir)).toThrow(/No Open Knowledge project found/);
  });

  test('prefers the nearest `.ok/` directory over a deeper file marker', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    const inner = resolve(tmpDir, 'inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(resolve(inner, '.ok'), 'oops');
    expect(findProjectDir(inner)).toBe(resolve(tmpDir));
  });
});

describe('sanitizeClientName', () => {
  test('returns fallback for undefined input', () => {
    expect(sanitizeClientName(undefined, 'fallback-id')).toBe('fallback-id');
  });

  test('returns fallback for empty string', () => {
    expect(sanitizeClientName('', 'fallback-id')).toBe('fallback-id');
  });

  test('returns fallback for whitespace-only input', () => {
    expect(sanitizeClientName('   \t\n  ', 'fallback-id')).toBe('fallback-id');
  });

  test('strips ASCII control characters (0x00-0x1F, 0x7F)', () => {
    expect(sanitizeClientName('cl\x00aud\x07e\x1Fco\x7Fde', 'fb')).toBe('cl aud e co de');
  });

  test('collapses runs of whitespace to a single space', () => {
    expect(sanitizeClientName('claude    code\t\tcli', 'fb')).toBe('claude code cli');
  });

  test('truncates at 128 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeClientName(long, 'fb').length).toBe(128);
  });

  test('preserves ordinary printable input unchanged', () => {
    expect(sanitizeClientName('Claude Code v2.1.0', 'fb')).toBe('Claude Code v2.1.0');
  });
});
