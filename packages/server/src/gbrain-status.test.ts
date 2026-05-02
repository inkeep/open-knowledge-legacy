import { describe, expect, test } from 'bun:test';
import {
  createGBrainStatusDetector,
  type GBrainCommandResult,
  type GBrainCommandRunner,
  parseGBrainSourcesJson,
} from './gbrain-status';

const success = (stdout = ''): GBrainCommandResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
});

const failure = (stderr = 'failed'): GBrainCommandResult => ({
  exitCode: 1,
  stdout: '',
  stderr,
});

function createRunner(results: GBrainCommandResult[]): GBrainCommandRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const runner = async (args: readonly string[]) => {
    calls.push([...args]);
    const result = results.shift();
    if (result === undefined) throw new Error(`unexpected gbrain call: ${args.join(' ')}`);
    return result;
  };
  return Object.assign(runner, { calls });
}

function createRealpath(map: Record<string, string> = {}) {
  return async (path: string) => {
    if (path in map) return map[path];
    return path;
  };
}

describe('parseGBrainSourcesJson', () => {
  test('parses source rows and preserves nullable local paths', () => {
    const sources = parseGBrainSourcesJson(
      JSON.stringify({
        sources: [
          {
            id: 'repo',
            name: 'Repo',
            local_path: '/repo',
            federated: false,
            page_count: 3,
            last_sync_at: '2026-05-01T00:00:00Z',
          },
          {
            id: 'remote',
            name: 'Remote',
            local_path: null,
          },
        ],
      }),
    );

    expect(sources).toEqual([
      {
        id: 'repo',
        name: 'Repo',
        localPath: '/repo',
        federated: false,
        pageCount: 3,
        lastSyncAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 'remote',
        name: 'Remote',
        localPath: null,
        federated: undefined,
        pageCount: undefined,
        lastSyncAt: undefined,
      },
    ]);
  });

  test('rejects invalid JSON and unexpected shapes', () => {
    expect(() => parseGBrainSourcesJson('{not-json')).toThrow();
    expect(() => parseGBrainSourcesJson(JSON.stringify({ sources: {} }))).toThrow();
  });
});

describe('createGBrainStatusDetector', () => {
  test('matches sources after realpath normalization', async () => {
    const runner = createRunner([
      success('gbrain 1.0.0\n'),
      success(
        JSON.stringify({
          sources: [{ id: 'source-1', name: 'Source One', local_path: '/workspace-link' }],
        }),
      ),
    ]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath({
        '/project-link': '/workspace-real',
        '/workspace-link': '/workspace-real',
      }),
    });

    await expect(detector.getStatus('/project-link')).resolves.toEqual({
      state: 'matched',
      sourceId: 'source-1',
      sourceName: 'Source One',
      localPath: '/workspace-real',
    });
    expect(runner.calls).toEqual([['--version'], ['sources', 'list', '--json']]);
  });

  test('falls back to legacy sync.repo_path as the default source', async () => {
    const runner = createRunner([
      success('gbrain 1.0.0\n'),
      success(JSON.stringify({ sources: [{ id: 'other', name: 'Other', local_path: '/other' }] })),
      success('/legacy-link\n'),
    ]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath({
        '/project': '/project-real',
        '/other': '/other-real',
        '/legacy-link': '/project-real',
      }),
    });

    await expect(detector.getStatus('/project')).resolves.toEqual({
      state: 'matched',
      sourceId: 'default',
      sourceName: 'default',
      localPath: '/project-real',
    });
    expect(runner.calls).toEqual([
      ['--version'],
      ['sources', 'list', '--json'],
      ['config', 'get', 'sync.repo_path'],
    ]);
  });

  test('returns not-registered when sources and legacy config do not match', async () => {
    const runner = createRunner([
      success('gbrain 1.0.0\n'),
      success(JSON.stringify({ sources: [{ id: 'other', name: 'Other', local_path: '/other' }] })),
      failure('missing config key'),
    ]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath({ '/project': '/project-real', '/other': '/other-real' }),
    });

    await expect(detector.getStatus('/project')).resolves.toMatchObject({
      state: 'not-registered',
      projectPath: '/project-real',
    });
  });

  test('returns not-installed when the gbrain binary is missing', async () => {
    const runner = createRunner([{ exitCode: null, stdout: '', stderr: '', errorCode: 'ENOENT' }]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath(),
    });

    await expect(detector.getStatus('/project')).resolves.toMatchObject({
      state: 'not-installed',
    });
  });

  test('returns not-configured when sources list fails after a successful version probe', async () => {
    const runner = createRunner([success('gbrain 1.0.0\n'), failure('not initialized')]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath(),
    });

    await expect(detector.getStatus('/project')).resolves.toMatchObject({
      state: 'not-configured',
      diagnostic: 'not initialized',
    });
  });

  test('returns a generic error when sources list fails for an unknown reason', async () => {
    const runner = createRunner([success('gbrain 1.0.0\n'), failure('database is locked')]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath(),
    });

    await expect(detector.getStatus('/project')).resolves.toEqual({
      state: 'error',
      code: 'gbrain-error',
      message: 'gbrain source detection failed.',
      diagnostic: 'database is locked',
    });
  });

  test('returns timeout errors without throwing', async () => {
    const runner = createRunner([{ exitCode: null, stdout: '', stderr: '', timedOut: true }]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath(),
    });

    await expect(detector.getStatus('/project')).resolves.toEqual({
      state: 'error',
      code: 'timeout',
      message: 'gbrain did not respond in time.',
    });
  });

  test('returns invalid-json errors for malformed source responses', async () => {
    const runner = createRunner([success('gbrain 1.0.0\n'), success('not-json')]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath(),
    });

    await expect(detector.getStatus('/project')).resolves.toMatchObject({
      state: 'error',
      code: 'invalid-json',
    });
  });

  test('caches status by normalized project path with refresh and ttl controls', async () => {
    let now = 1000;
    const runner = createRunner([
      success('gbrain 1.0.0\n'),
      success(
        JSON.stringify({
          sources: [{ id: 'source-1', name: 'Source One', local_path: '/project' }],
        }),
      ),
      success('gbrain 1.0.0\n'),
      success(
        JSON.stringify({
          sources: [{ id: 'source-1', name: 'Source One', local_path: '/project' }],
        }),
      ),
      success('gbrain 1.0.0\n'),
      success(
        JSON.stringify({
          sources: [{ id: 'source-1', name: 'Source One', local_path: '/project' }],
        }),
      ),
    ]);
    const detector = createGBrainStatusDetector({
      run: runner,
      realpath: createRealpath({ '/project-link': '/project' }),
      now: () => now,
      ttlMs: 100,
    });

    await detector.getStatus('/project-link');
    await detector.getStatus('/project-link');
    expect(runner.calls).toHaveLength(2);

    await detector.getStatus('/project-link', { refresh: true });
    expect(runner.calls).toHaveLength(4);

    now = 1200;
    await detector.getStatus('/project-link');
    expect(runner.calls).toHaveLength(6);
  });
});
