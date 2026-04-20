import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { FileBackend } from '../../auth/token-store.ts';
import { handleCredentialGet } from './git-credential.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeStream(content: string): Readable {
  return Readable.from([Buffer.from(content, 'utf-8')]);
}

function makeOutput(): { writable: Writable; result: () => string } {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return {
    writable,
    result: () => Buffer.concat(chunks).toString('utf-8'),
  };
}

function makeStore(tmpDir: string) {
  return new FileBackend(join(tmpDir, 'auth.yml'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleCredentialGet', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-git-cred-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns credentials for stored host', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc123');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc123\n');
  });

  test('returns 1 when host not stored', async () => {
    const store = makeStore(tmpDir);
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
    expect(result()).toBe('');
  });

  test('returns 1 when no host in input', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream('protocol=https\n\n');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
    expect(result()).toBe('');
  });

  test('handles input without trailing blank line', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream('protocol=https\nhost=github.com');
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc\n');
  });

  test('host-specific lookup — different host returns 1', async () => {
    const store = makeStore(tmpDir);
    await store.set('gitlab.com', 'bob', 'glpat_xyz');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(1);
  });

  test('ignores extra input fields (path, username)', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'alice', 'gho_abc');
    const input = makeStream(
      'protocol=https\nhost=github.com\nusername=irrelevant\npath=/org/repo\n\n',
    );
    const { writable, result } = makeOutput();

    const code = await handleCredentialGet(input, writable, store);

    expect(code).toBe(0);
    expect(result()).toBe('username=alice\npassword=gho_abc\n');
  });

  test('output format matches git credential protocol', async () => {
    const store = makeStore(tmpDir);
    await store.set('github.com', 'miles', 'gho_secret_token_123');
    const input = makeStream('protocol=https\nhost=github.com\n\n');
    const { writable, result } = makeOutput();

    await handleCredentialGet(input, writable, store);

    const lines = result().split('\n');
    expect(lines[0]).toBe('username=miles');
    expect(lines[1]).toBe('password=gho_secret_token_123');
    expect(lines[2]).toBe('');
  });
});
