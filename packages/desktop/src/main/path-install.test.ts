import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureCliOnPath, pathInstallMarkerPath } from './path-install.ts';

const EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const WRAPPER = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

function home() {
  return mkdtempSync(join(tmpdir(), 'ok-path-install-'));
}

describe('ensureCliOnPath', () => {
  test('installs canonical ~/.ok/bin links, env shim, zsh rc block, and marker without admin prompt', async () => {
    const h = home();
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin:/usr/bin`, stderr: '' }),
    });
    expect(result.status).toBe('installed');
    expect(readlinkSync(join(h, '.ok', 'bin', 'ok'))).toBe(WRAPPER);
    expect(readlinkSync(join(h, '.ok', 'bin', 'open-knowledge'))).toBe(WRAPPER);
    expect(readFileSync(join(h, '.ok', 'env.sh'), 'utf8')).toContain(
      'export PATH="$' + '{HOME}/.ok/bin:$' + '{PATH}"',
    );
    expect(readFileSync(join(h, '.zshrc'), 'utf8')).toContain('# >>> open-knowledge cli >>>');
    expect(JSON.parse(readFileSync(pathInstallMarkerPath(h), 'utf8')).bundleWrapperPath).toBe(
      WRAPPER,
    );
  });

  test('healthy marker fast-path respects disk source of truth', async () => {
    const h = home();
    await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    const healthy = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    expect(healthy.status).toBe('healthy-current');
    writeFileSync(join(h, '.zshrc'), '');
    const repaired = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${h}/.ok/bin`, stderr: '' }),
    });
    expect(repaired.status).toBe('installed');
    expect(readFileSync(join(h, '.zshrc'), 'utf8')).toContain('# >>> open-knowledge cli >>>');
  });

  test('refreshes stale OK symlink in writable non-system PATH dir and skips foreign', async () => {
    const h = home();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    symlinkSync('/Old.app/Contents/Resources/cli/bin/ok.sh', join(bin, 'ok'));
    writeFileSync(join(bin, 'open-knowledge'), 'foreign');
    const events: Array<Record<string, unknown>> = [];
    const result = await ensureCliOnPath({
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      home: h,
      bundleVersion: '0.5.0-test',
      env: { HOME: h, SHELL: '/bin/zsh' },
      spawn: async () => ({ code: 0, stdout: `${bin}:${h}/.ok/bin:/usr/bin`, stderr: '' }),
      logger: { event: (e) => events.push(e) },
    });
    expect(result.status).toBe('installed');
    expect(readlinkSync(join(bin, 'ok'))).toBe(WRAPPER);
    expect(readFileSync(join(bin, 'open-knowledge'), 'utf8')).toBe('foreign');
    expect(events.some((e) => e.event === 'path-install-foreign-shadows-ours')).toBe(true);
  });
});
