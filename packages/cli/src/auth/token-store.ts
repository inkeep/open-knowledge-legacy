import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

interface TokenEntry {
  login: string;
  token: string;
  gitProtocol?: string;
  name?: string;
  email?: string;
}

export interface TokenStore {
  readonly backend: 'keyring' | 'file';
  get(host: string): Promise<TokenEntry | null>;
  set(
    host: string,
    login: string,
    token: string,
    extra?: Pick<TokenEntry, 'gitProtocol' | 'name' | 'email'>,
  ): Promise<void>;
  clear(host: string): Promise<void>;
}

const KEYRING_SERVICE = 'open-knowledge';


class KeyringBackend implements TokenStore {
  readonly backend = 'keyring' as const;

  async get(host: string): Promise<TokenEntry | null> {
    const { Entry } = await import('@napi-rs/keyring');
    try {
      const entry = new Entry(KEYRING_SERVICE, host);
      const raw = entry.getPassword();
      if (raw == null) return null;
      return JSON.parse(raw) as TokenEntry;
    } catch {
      return null;
    }
  }

  async set(
    host: string,
    login: string,
    token: string,
    extra?: Pick<TokenEntry, 'gitProtocol' | 'name' | 'email'>,
  ): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(KEYRING_SERVICE, host);
    const data: TokenEntry = { login, token, ...extra };
    entry.setPassword(JSON.stringify(data));
  }

  async clear(host: string): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    try {
      const entry = new Entry(KEYRING_SERVICE, host);
      entry.deletePassword();
    } catch {
    }
  }
}


export class FileBackend implements TokenStore {
  readonly backend = 'file' as const;
  private readonly authFile: string;

  constructor(authFile?: string) {
    this.authFile = authFile ?? join(homedir(), '.ok', 'auth.yml');
  }

  private read(): Record<string, TokenEntry> {
    if (!existsSync(this.authFile)) return {};
    try {
      const raw = readFileSync(this.authFile, 'utf-8');
      return (yamlParse(raw) ?? {}) as Record<string, TokenEntry>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      process.stderr.write(
        `[auth] Failed to parse ${this.authFile}: ${msg}. Starting with empty credentials.\n`,
      );
      return {};
    }
  }

  private write(data: Record<string, TokenEntry>): void {
    const dir = dirname(this.authFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(this.authFile, yamlStringify(data), { mode: 0o600 });
  }

  async get(host: string): Promise<TokenEntry | null> {
    return this.read()[host] ?? null;
  }

  async set(
    host: string,
    login: string,
    token: string,
    extra?: Pick<TokenEntry, 'gitProtocol' | 'name' | 'email'>,
  ): Promise<void> {
    const data = this.read();
    data[host] = { login, token, ...extra };
    this.write(data);
  }

  async clear(host: string): Promise<void> {
    const data = this.read();
    delete data[host];
    this.write(data);
  }
}


export async function createTokenStore(authFile?: string): Promise<TokenStore> {
  try {
    const { Entry } = await import('@napi-rs/keyring');
    new Entry(KEYRING_SERVICE, '__probe__');
    process.stderr.write('[auth] token storage: OS keychain\n');
    return new KeyringBackend();
  } catch {
    process.stderr.write('[auth] token storage: file (~/.ok/auth.yml)\n');
    return new FileBackend(authFile);
  }
}
