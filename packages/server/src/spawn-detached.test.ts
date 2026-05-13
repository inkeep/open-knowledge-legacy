import { describe, expect, test } from 'bun:test';
import { spawnDetached } from './spawn-detached.ts';

const NEVER_HIT = 5_000;

describe('spawnDetached — success path', () => {
  test('spawning the running Node binary resolves to { ok: true }', async () => {
    const outcome = await spawnDetached(process.execPath, ['--version'], NEVER_HIT);
    expect(outcome).toEqual({ ok: true });
  });

  test('arguments pass argv-style (shell: false) — metacharacters survive verbatim', async () => {
    const outcome = await spawnDetached(
      process.execPath,
      ['-e', 'process.exit(0) /* $(touch /tmp/pwned) && rm -rf /tmp/pwned */'],
      NEVER_HIT,
    );
    expect(outcome).toEqual({ ok: true });
  });
});

describe('spawnDetached — error classification', () => {
  test('ENOENT (binary not found) → { ok: false, reason: "not-installed" }', async () => {
    const outcome = await spawnDetached('/nonexistent/binary-that-does-not-exist', [], NEVER_HIT);
    expect(outcome).toEqual({ ok: false, reason: 'not-installed' });
  });

  test('EACCES (no exec permission on POSIX) → { ok: false, reason: "not-installed" }', async () => {
    if (process.platform === 'win32') return;
    const outcome = await spawnDetached('/etc/hosts', [], NEVER_HIT);
    expect(outcome).toEqual({ ok: false, reason: 'not-installed' });
  });
});
