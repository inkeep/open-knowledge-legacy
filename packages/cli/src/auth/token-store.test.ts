import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileBackend } from './token-store.ts';

// ---------------------------------------------------------------------------
// File backend — tested directly with a tmp directory
// ---------------------------------------------------------------------------

describe('FileBackend', () => {
  let tmpDir: string;
  let authFile: string;
  let store: FileBackend;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-token-store-test-'));
    authFile = join(tmpDir, 'auth.yml');
    store = new FileBackend(authFile);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('backend property is "file"', () => {
    expect(store.backend).toBe('file');
  });

  test('get() returns null when file does not exist', async () => {
    expect(await store.get('github.com')).toBeNull();
  });

  test('set() and get() round-trip', async () => {
    await store.set('github.com', 'alice', 'gho_abc123');
    const entry = await store.get('github.com');
    expect(entry).toMatchObject({ login: 'alice', token: 'gho_abc123' });
  });

  test('set() with extra fields stores them', async () => {
    await store.set('github.com', 'alice', 'gho_abc123', {
      gitProtocol: 'https',
      name: 'Alice Example',
      email: 'alice@example.com',
    });
    const entry = await store.get('github.com');
    expect(entry).toMatchObject({
      login: 'alice',
      token: 'gho_abc123',
      gitProtocol: 'https',
      name: 'Alice Example',
      email: 'alice@example.com',
    });
  });

  test('multiple hosts stored independently', async () => {
    await store.set('github.com', 'alice', 'gho_abc');
    await store.set('gitlab.com', 'bob', 'glpat_xyz');
    expect((await store.get('github.com'))?.login).toBe('alice');
    expect((await store.get('gitlab.com'))?.login).toBe('bob');
  });

  test('clear() removes entry', async () => {
    await store.set('github.com', 'alice', 'gho_abc123');
    await store.clear('github.com');
    expect(await store.get('github.com')).toBeNull();
  });

  test('clear() on non-existent entry does not throw', async () => {
    await expect(store.clear('nonexistent.com')).resolves.toBeUndefined();
  });

  test('set() overwrites previous value', async () => {
    await store.set('github.com', 'alice', 'gho_old');
    await store.set('github.com', 'alice', 'gho_new');
    const entry = await store.get('github.com');
    expect(entry?.token).toBe('gho_new');
  });

  test('auth.yml file has mode 0600', async () => {
    await store.set('github.com', 'alice', 'gho_abc123');
    const stat = Bun.file(authFile);
    // The file should exist
    expect(await stat.exists()).toBe(true);
    // Verify mode via Node fs stat
    const { statSync } = await import('node:fs');
    const mode = statSync(authFile).mode & 0o777;
    // 0600 on Unix; Windows may return different value
    if (process.platform !== 'win32') {
      expect(mode).toBe(0o600);
    }
  });

  test('file contents are valid YAML with hostname keys', async () => {
    await store.set('github.com', 'alice', 'gho_abc123');
    await store.set('gitlab.com', 'bob', 'glpat_xyz');
    const raw = readFileSync(authFile, 'utf-8');
    // Should contain both hostnames as YAML keys
    expect(raw).toContain('github.com');
    expect(raw).toContain('gitlab.com');
    // Token values present
    expect(raw).toContain('gho_abc123');
    expect(raw).toContain('glpat_xyz');
  });

  test('get() returns null for non-stored host after writing other hosts', async () => {
    await store.set('github.com', 'alice', 'gho_abc');
    expect(await store.get('bitbucket.org')).toBeNull();
  });

  test('handles corrupt YAML file gracefully', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(authFile, '{{{{ not valid yaml }}}}');
    expect(await store.get('github.com')).toBeNull();
  });

  test('creates parent directory if missing', async () => {
    const nestedFile = join(tmpDir, 'deep', 'nested', 'auth.yml');
    const nestedStore = new FileBackend(nestedFile);
    await nestedStore.set('github.com', 'alice', 'gho_abc');
    expect(await nestedStore.get('github.com')).toMatchObject({ login: 'alice' });
  });
});

// ---------------------------------------------------------------------------
// createTokenStore — integration smoke test
// ---------------------------------------------------------------------------

describe('createTokenStore', () => {
  test('returns a store with a recognised backend property', async () => {
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(
      join(mkdtempSync(join(tmpdir(), 'ok-ts-smoke-')), 'auth.yml'),
    );
    expect(['keyring', 'file']).toContain(store.backend);
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
    expect(typeof store.clear).toBe('function');
  });
});
