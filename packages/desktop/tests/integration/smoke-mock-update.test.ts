import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_PATH = join(dirname(__filename), '..', '..', 'scripts', 'smoke-mock-update.mjs');

describe('smoke-mock-update.mjs — self-test round-trip', () => {
  test('spawns, self-tests, exits 0', async () => {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn('node', [SCRIPT_PATH], {
          env: { ...process.env, OK_UPDATER_FORCE_DEV: '1', MOCK_UPDATE_TIMEOUT_MS: '5000' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (buf: Buffer) => {
          stdout += buf.toString('utf-8');
        });
        child.stderr.on('data', (buf: Buffer) => {
          stderr += buf.toString('utf-8');
        });
        child.on('error', reject);
        child.on('exit', (code) => resolve({ code, stdout, stderr }));
      },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('[mock-updater] event=start');
    expect(result.stdout).toMatch(/\[mock-updater\] port=\d+/);
    expect(result.stdout).toContain('[mock-updater] event=served path=/latest-mac.yml status=200');
    expect(result.stdout).toContain(
      '[mock-updater] event=served path=/open-knowledge-mock.zip status=200',
    );
    expect(result.stdout).toContain('[mock-updater] event=self-test-ok');
    expect(result.stdout).toContain('[mock-updater] event=shutdown reason=done');
    expect(result.stderr).toBe('');
  }, 15000);
});
