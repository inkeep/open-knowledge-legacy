import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { shouldRefuseMcpStart } from './mcp.ts';

describe('shouldRefuseMcpStart', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-mcp-gate-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('refuses when no port + no .ok/', () => {
    expect(shouldRefuseMcpStart(tmpDir, undefined)).toBe(true);
  });

  test('allows when .ok/ exists (the `ok init` marker)', () => {
    mkdirSync(resolve(tmpDir, '.ok'), { recursive: true });
    expect(shouldRefuseMcpStart(tmpDir, undefined)).toBe(false);
  });

  test('--port bypasses the gate even without the marker', () => {
    expect(shouldRefuseMcpStart(tmpDir, '9999')).toBe(false);
    expect(shouldRefuseMcpStart(tmpDir, '0')).toBe(false);
  });
});
