import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAndRepairLaunchJsonOnProjectOpen } from './launch-json-wiring.ts';

const EXE = '/Applications/Open Knowledge.app/Contents/MacOS/Open Knowledge';
const WRAPPER = '/Applications/Open Knowledge.app/Contents/Resources/cli/bin/ok.sh';

function project() {
  return mkdtempSync(join(tmpdir(), 'ok-launch-json-'));
}

describe('checkAndRepairLaunchJsonOnProjectOpen', () => {
  test('no file is a no-create no-op', async () => {
    const dir = project();
    const events: Array<Record<string, unknown>> = [];
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      logger: { event: (e) => events.push(e) },
    });
    expect(result.status).toBe('no-file');
    expect(events.some((e) => e.event === 'launch-json-wiring-repair-no-file')).toBe(true);
  });

  test('healthy-current when runtimeExecutable already equals bundled cliPath', async () => {
    const dir = project();
    mkdirSync(join(dir, '.claude'));
    writeFileSync(
      join(dir, '.claude', 'launch.json'),
      JSON.stringify({
        configurations: [
          { name: 'open-knowledge-ui', runtimeExecutable: WRAPPER, runtimeArgs: ['ui'] },
        ],
      }),
    );
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
    });
    expect(result.status).toBe('healthy-current');
  });

  test('no-token when file exists but has no open-knowledge-ui entry', async () => {
    const dir = project();
    mkdirSync(join(dir, '.claude'));
    writeFileSync(
      join(dir, '.claude', 'launch.json'),
      JSON.stringify({ configurations: [{ name: 'other', runtimeExecutable: 'node' }] }),
    );
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
    });
    expect(result.status).toBe('no-token');
  });

  test('parse failure emits read-failed event (not write-failed)', async () => {
    const dir = project();
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'launch.json'), '{ invalid json');
    const events: Array<Record<string, unknown>> = [];
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
      logger: { event: (e) => events.push(e) },
    });
    expect(result.status).toBe('failed');
    expect(events.some((e) => e.event === 'launch-json-wiring-repair-read-failed')).toBe(true);
    expect(events.some((e) => e.event === 'launch-json-wiring-repair-write-failed')).toBe(false);
  });

  test('failed when launch.json root is not an object', async () => {
    const dir = project();
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'launch.json'), '[1, 2, 3]');
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
    });
    expect(result.status).toBe('failed');
  });

  test('existing open-knowledge-ui entry is reclaimed to bundled cliPath and siblings are preserved', async () => {
    const dir = project();
    mkdirSync(join(dir, '.claude'));
    const path = join(dir, '.claude', 'launch.json');
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: '0.0.1',
          configurations: [
            { name: 'other', runtimeExecutable: 'node' },
            {
              name: 'open-knowledge-ui',
              runtimeExecutable: 'npx',
              runtimeArgs: ['-y', '@inkeep/open-knowledge@latest', 'ui'],
            },
          ],
        },
        null,
        2,
      ),
    );
    const result = await checkAndRepairLaunchJsonOnProjectOpen({
      projectDir: dir,
      executablePath: EXE,
      isPackaged: true,
      platform: 'darwin',
    });
    expect(result.status).toBe('repaired');
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.configurations[0].name).toBe('other');
    expect(parsed.configurations[1]).toMatchObject({
      name: 'open-knowledge-ui',
      runtimeExecutable: WRAPPER,
      runtimeArgs: ['ui'],
      autoPort: true,
    });
  });
});
