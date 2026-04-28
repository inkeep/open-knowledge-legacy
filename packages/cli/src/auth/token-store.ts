import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

/** Stored credential entry keyed by hostname. */
interface TokenEntry {
  login: string;
  token: string;
  /** Default git protocol for this host (default 'https') */
  gitProtocol?: string;
  /** User display name from OAuth profile, for identity resolution */
  name?: string;
  /** User email from OAuth profile, for identity resolution */
  email?: string;
}

/** Unified token storage API. Both backends implement this interface. */
export interface TokenStore {
  /** Which storage mechanism is active */
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

// ---------------------------------------------------------------------------
// Keyring backend
// ---------------------------------------------------------------------------

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
      // Already absent — ignore
    }
  }
}

// ---------------------------------------------------------------------------
// File backend (~/.open-knowledge/auth.yml, chmod 0600)
// ---------------------------------------------------------------------------

export class FileBackend implements TokenStore {
  readonly backend = 'file' as const;
  private readonly authFile: string;

  constructor(authFile?: string) {
    this.authFile = authFile ?? join(homedir(), '.open-knowledge', 'auth.yml');
  }

  private read(): Record<string, TokenEntry> {
    if (!existsSync(this.authFile)) return {};
    try {
      const raw = readFileSync(this.authFile, 'utf-8');
      return (yamlParse(raw) ?? {}) as Record<string, TokenEntry>;
    } catch (e) {
      // Silent failure here would let the next `write()` overwrite a corrupted
      // but recoverable auth.yml with `{}`, quietly wiping valid tokens. Surface
      // the parse error so users can repair the file before re-authenticating.
      const msg = e instanceof Error ? e.message : 'unknown error';
      process.stderr.write(
        `[auth] Failed to parse ${this.authFile}: ${msg}. Starting with empty credentials.\n`,
      );
      return {};
    }
  }

  private write(data: Record<string, TokenEntry>): void {
    const dir = dirname(this.authFile);
    // 0o700 keeps the directory unreadable by other local users — matches the
    // 0o600 file mode below and prevents listing "you have Open Knowledge
    // credentials" from a shared-host account.
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

// ---------------------------------------------------------------------------
// Factory — auto-detect backend
// ---------------------------------------------------------------------------

/**
 * Create a TokenStore, preferring the OS keychain (via @napi-rs/keyring) and
 * falling back to a plaintext YAML file at ~/.open-knowledge/auth.yml when the
 * native module cannot be loaded.
 *
 * Logs the active backend at INFO level once.
 */
export async function createTokenStore(authFile?: string): Promise<TokenStore> {
  try {
    const { Entry } = await import('@napi-rs/keyring');
    // Verify the native module loaded and Entry is usable
    new Entry(KEYRING_SERVICE, '__probe__');
    process.stderr.write('[auth] token storage: OS keychain\n');
    return new KeyringBackend();
  } catch {
    process.stderr.write('[auth] token storage: file (~/.open-knowledge/auth.yml)\n');
    return new FileBackend(authFile);
  }
}
