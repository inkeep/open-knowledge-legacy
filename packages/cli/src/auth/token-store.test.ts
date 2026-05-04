import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface KeyringCall {
  service: string;
  account: string;
}
interface SetPasswordCall extends KeyringCall {
  value: string;
}

const keyringMockState = {
  throwOnImport: false,
  throwOnConstruct: false,
  setPasswordCalls: [] as SetPasswordCall[],
  deletePasswordCalls: [] as KeyringCall[],
  getPasswordCalls: [] as KeyringCall[],
  getPasswordReturns: new Map<string, string | null>(),
};

function resetKeyringMockState(): void {
  keyringMockState.throwOnImport = false;
  keyringMockState.throwOnConstruct = false;
  keyringMockState.setPasswordCalls = [];
  keyringMockState.deletePasswordCalls = [];
  keyringMockState.getPasswordCalls = [];
  keyringMockState.getPasswordReturns.clear();
}

class MockKeyringEntry {
  constructor(
    private readonly service: string,
    private readonly account: string,
  ) {
    if (keyringMockState.throwOnConstruct || keyringMockState.throwOnImport) {
      throw new Error(
        keyringMockState.throwOnImport ? 'keyring unavailable' : 'entry construct failed',
      );
    }
  }
  setPassword(value: string): void {
    keyringMockState.setPasswordCalls.push({
      service: this.service,
      account: this.account,
      value,
    });
  }
  getPassword(): string | null {
    keyringMockState.getPasswordCalls.push({
      service: this.service,
      account: this.account,
    });
    return keyringMockState.getPasswordReturns.get(`${this.service}:${this.account}`) ?? null;
  }
  deletePassword(): void {
    keyringMockState.deletePasswordCalls.push({
      service: this.service,
      account: this.account,
    });
  }
}

mock.module('@napi-rs/keyring', () => ({ Entry: MockKeyringEntry }));

import { FileBackend } from './token-store.ts';

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
    expect(await stat.exists()).toBe(true);
    const { statSync } = await import('node:fs');
    const mode = statSync(authFile).mode & 0o777;
    if (process.platform !== 'win32') {
      expect(mode).toBe(0o600);
    }
  });

  test('file contents are valid YAML with hostname keys', async () => {
    await store.set('github.com', 'alice', 'gho_abc123');
    await store.set('gitlab.com', 'bob', 'glpat_xyz');
    const raw = readFileSync(authFile, 'utf-8');
    expect(raw).toContain('github.com');
    expect(raw).toContain('gitlab.com');
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

describe('createTokenStore', () => {
  beforeEach(resetKeyringMockState);

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

describe('KeyringBackend upsert semantics', () => {
  let tmpDir: string;

  beforeEach(() => {
    resetKeyringMockState();
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-ts-upsert-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('set() invokes Entry.setPassword exactly once with a JSON payload', async () => {
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(join(tmpDir, 'auth.yml'));
    expect(store.backend).toBe('keyring');

    await store.set('github.com', 'alice', 'gho_token_1');

    expect(keyringMockState.setPasswordCalls).toHaveLength(1);
    const [call] = keyringMockState.setPasswordCalls;
    expect(call?.service).toBe('open-knowledge');
    expect(call?.account).toBe('github.com');
    const parsed = JSON.parse(call?.value ?? '{}') as Record<string, unknown>;
    expect(parsed).toMatchObject({ login: 'alice', token: 'gho_token_1' });
  });

  test('set() never calls Entry.deletePassword on the refresh path', async () => {
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(join(tmpDir, 'auth.yml'));
    await store.set('github.com', 'alice', 'gho_token_1');
    expect(keyringMockState.deletePasswordCalls).toHaveLength(0);
  });

  test('two set() calls (refresh) produce two setPassword calls and zero deletePassword calls', async () => {
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(join(tmpDir, 'auth.yml'));

    await store.set('github.com', 'alice', 'gho_v1');
    await store.set('github.com', 'alice', 'gho_v2');

    expect(keyringMockState.setPasswordCalls).toHaveLength(2);
    expect(keyringMockState.deletePasswordCalls).toHaveLength(0);

    const tokens = keyringMockState.setPasswordCalls.map(
      (c) => (JSON.parse(c.value) as { token: string }).token,
    );
    expect(tokens).toEqual(['gho_v1', 'gho_v2']);
  });

  test('clear() is the only public path that calls deletePassword', async () => {
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(join(tmpDir, 'auth.yml'));

    await store.set('github.com', 'alice', 'gho_v1');
    expect(keyringMockState.deletePasswordCalls).toHaveLength(0);

    await store.clear('github.com');
    expect(keyringMockState.deletePasswordCalls).toHaveLength(1);
    expect(keyringMockState.deletePasswordCalls[0]).toMatchObject({
      service: 'open-knowledge',
      account: 'github.com',
    });
  });
});

describe('createTokenStore fallback to FileBackend', () => {
  let tmpDir: string;
  let authFile: string;

  beforeEach(() => {
    resetKeyringMockState();
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-ts-fallback-'));
    authFile = join(tmpDir, 'auth.yml');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to FileBackend when keyring import throws', async () => {
    keyringMockState.throwOnImport = true;
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(authFile);
    expect(store.backend).toBe('file');
  });

  test('falls back to FileBackend when Entry constructor throws', async () => {
    keyringMockState.throwOnConstruct = true;
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(authFile);
    expect(store.backend).toBe('file');
  });

  test('FileBackend fallback persists credentials to the tmp authFile', async () => {
    keyringMockState.throwOnImport = true;
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(authFile);

    await store.set('github.com', 'alice', 'gho_fallback');
    const entry = await store.get('github.com');
    expect(entry).toMatchObject({ login: 'alice', token: 'gho_fallback' });

    const { statSync, existsSync } = await import('node:fs');
    expect(existsSync(authFile)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = statSync(authFile).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  test('FileBackend fallback round-trip works via clear()', async () => {
    keyringMockState.throwOnConstruct = true;
    const { createTokenStore } = await import('./token-store.ts');
    const store = await createTokenStore(authFile);

    await store.set('github.com', 'alice', 'gho_fallback');
    expect((await store.get('github.com'))?.token).toBe('gho_fallback');
    await store.clear('github.com');
    expect(await store.get('github.com')).toBeNull();
  });
});
