import { describe, expect, mock, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  type HandleSpawnCursorDeps,
  handleSpawnCursor,
  isPathWithinDir,
  type SpawnCursorOutcome,
} from './spawn-cursor-api.ts';

const CONTENT_DIR = '/Users/who/dragons';
const VALID_PATH = '/Users/who/dragons';
const NESTED_PATH = '/Users/who/dragons/specs/foo';

interface CapturedResponse {
  status: number;
  body: unknown;
}

function makeReq(
  method: string,
  body?: string | object,
  opts: { contentLengthOverride?: number } = {},
): IncomingMessage {
  const text =
    typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined;
  const stream = Readable.from(text !== undefined ? [Buffer.from(text)] : []);
  const req = stream as unknown as IncomingMessage;
  (req as unknown as { method: string }).method = method;
  if (opts.contentLengthOverride !== undefined) {
    (req as unknown as { headers: Record<string, string> }).headers = {
      'content-length': String(opts.contentLengthOverride),
    };
  } else {
    (req as unknown as { headers: Record<string, string> }).headers = {};
  }
  return req;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: undefined };
  let chunks = '';
  const res = {
    writeHead: (status: number, _headers?: unknown) => {
      captured.status = status;
    },
    end: (chunk?: string) => {
      if (chunk) chunks += chunk;
      try {
        captured.body = JSON.parse(chunks);
      } catch {
        captured.body = chunks;
      }
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

function makeDeps(overrides: Partial<HandleSpawnCursorDeps> = {}): HandleSpawnCursorDeps {
  return {
    contentDir: CONTENT_DIR,
    platform: 'darwin',
    resolveCursorBinary: async () => '/usr/local/bin/cursor',
    spawnDetached: async () => ({ ok: true }) as SpawnCursorOutcome,
    ...overrides,
  };
}

describe('handleSpawnCursor — method gate', () => {
  test('rejects non-POST methods with 405', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('GET'), res, makeDeps());
    expect(captured.status).toBe(405);
    expect(captured.body).toEqual({ ok: false, reason: 'method-not-allowed' });
  });
});

describe('handleSpawnCursor — body validation', () => {
  test('malformed JSON → 400 invalid-path', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', 'not-json{{'), res, makeDeps());
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
  });

  test('missing path field → 400 invalid-path', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', {}), res, makeDeps());
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
  });

  test('empty path string → 400 invalid-path', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', { path: '' }), res, makeDeps());
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
  });

  test('non-string path → 400 invalid-path', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', { path: 42 }), res, makeDeps());
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
  });
});

describe('handleSpawnCursor — path containment', () => {
  test('rejects paths outside contentDir → 403 invalid-path', async () => {
    const spawnDetached = mock(async () => ({ ok: true }) as SpawnCursorOutcome);
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: '/etc/passwd' }),
      res,
      makeDeps({ spawnDetached }),
    );
    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
    expect(spawnDetached).not.toHaveBeenCalled();
  });

  test('rejects parent traversal → 403 invalid-path', async () => {
    const spawnDetached = mock(async () => ({ ok: true }) as SpawnCursorOutcome);
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: '/Users/who/dragons/../../etc' }),
      res,
      makeDeps({ spawnDetached }),
    );
    expect(captured.status).toBe(403);
    expect(spawnDetached).not.toHaveBeenCalled();
  });

  test('rejects null bytes in path → 403 invalid-path', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: '/Users/who/dragons/\0evil' }),
      res,
      makeDeps(),
    );
    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({ ok: false, reason: 'invalid-path' });
  });

  test('accepts contentDir itself', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', { path: VALID_PATH }), res, makeDeps());
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
  });

  test('accepts nested path inside contentDir', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(makeReq('POST', { path: NESTED_PATH }), res, makeDeps());
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
  });
});

describe('handleSpawnCursor — binary resolution', () => {
  test('resolveCursorBinary returns null → not-installed', async () => {
    const spawnDetached = mock(async () => ({ ok: true }) as SpawnCursorOutcome);
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({ resolveCursorBinary: async () => null, spawnDetached }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: false, reason: 'not-installed' });
    expect(spawnDetached).not.toHaveBeenCalled();
  });
});

describe('handleSpawnCursor — spawn dispatch', () => {
  test('macOS .app bundle path routes through /usr/bin/open -a', async () => {
    const spawnDetached = mock(
      async (_exec: string, _args: ReadonlyArray<string>) => ({ ok: true }) as SpawnCursorOutcome,
    );
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({
        resolveCursorBinary: async () => '/Applications/Cursor.app',
        spawnDetached,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
    expect(spawnDetached).toHaveBeenCalledTimes(1);
    expect(spawnDetached.mock.calls[0]?.[0]).toBe('/usr/bin/open');
    expect(spawnDetached.mock.calls[0]?.[1]).toEqual([
      '-a',
      '/Applications/Cursor.app',
      VALID_PATH,
    ]);
  });

  test('non-bundle exec path is invoked directly with [path] argv', async () => {
    const spawnDetached = mock(
      async (_exec: string, _args: ReadonlyArray<string>) => ({ ok: true }) as SpawnCursorOutcome,
    );
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({
        resolveCursorBinary: async () => '/usr/local/bin/cursor',
        spawnDetached,
      }),
    );
    expect(captured.status).toBe(200);
    expect(spawnDetached).toHaveBeenCalledTimes(1);
    expect(spawnDetached.mock.calls[0]?.[0]).toBe('/usr/local/bin/cursor');
    expect(spawnDetached.mock.calls[0]?.[1]).toEqual([VALID_PATH]);
  });

  test('spawn-error reason propagates', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({
        spawnDetached: async () => ({ ok: false, reason: 'spawn-error' }) as SpawnCursorOutcome,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: false, reason: 'spawn-error' });
  });

  test('timeout reason propagates', async () => {
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({
        spawnDetached: async () => ({ ok: false, reason: 'timeout' }) as SpawnCursorOutcome,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('handleSpawnCursor — Cursor binary discovery (per-platform)', () => {
  test('macOS: bundle-path probe finds the shim without `which`', async () => {
    let whichCalled = false;
    const spawnDetached = mock(async (exec: string, _args: ReadonlyArray<string>) => {
      expect(exec).toBe('/usr/bin/open');
      return { ok: true } as SpawnCursorOutcome;
    });
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: VALID_PATH }),
      res,
      makeDeps({
        platform: 'darwin',
        resolveCursorBinary: async () => {
          whichCalled = true;
          return '/Applications/Cursor.app';
        },
        spawnDetached,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
    expect(whichCalled).toBe(true);
  });

  test('windows: bundle-path probe surface uses the .cmd shim', async () => {
    const spawnDetached = mock(async (exec: string, _args: ReadonlyArray<string>) => {
      expect(exec.endsWith('cursor.cmd')).toBe(true);
      return { ok: true } as SpawnCursorOutcome;
    });
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: 'C:\\Users\\who\\dragons' }),
      res,
      makeDeps({
        platform: 'win32',
        contentDir: 'C:\\Users\\who\\dragons',
        resolveCursorBinary: async () =>
          'C:\\Users\\who\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd',
        spawnDetached,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
  });

  test('linux: PATH lookup is the only viable strategy (no bundle paths registered)', async () => {
    const spawnDetached = mock(
      async (_exec: string, _args: ReadonlyArray<string>) => ({ ok: true }) as SpawnCursorOutcome,
    );
    const { res, captured } = makeRes();
    await handleSpawnCursor(
      makeReq('POST', { path: '/home/who/dragons' }),
      res,
      makeDeps({
        platform: 'linux',
        contentDir: '/home/who/dragons',
        resolveCursorBinary: async () => '/snap/bin/cursor',
        spawnDetached,
      }),
    );
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
    expect(spawnDetached.mock.calls[0]?.[0]).toBe('/snap/bin/cursor');
  });
});

describe('isPathWithinDir', () => {
  test('rejects empty inputs', () => {
    expect(isPathWithinDir('', CONTENT_DIR, 'darwin')).toBe(false);
    expect(isPathWithinDir(VALID_PATH, '', 'darwin')).toBe(false);
  });

  test('rejects relative paths', () => {
    expect(isPathWithinDir('dragons/foo', CONTENT_DIR, 'darwin')).toBe(false);
  });

  test('accepts exact match and descendants on POSIX', () => {
    expect(isPathWithinDir(VALID_PATH, CONTENT_DIR, 'darwin')).toBe(true);
    expect(isPathWithinDir(NESTED_PATH, CONTENT_DIR, 'darwin')).toBe(true);
  });

  test('rejects parent traversal', () => {
    expect(isPathWithinDir('/Users/who/dragons/../../etc', CONTENT_DIR, 'darwin')).toBe(false);
  });

  test('rejects null bytes', () => {
    expect(isPathWithinDir('/Users/who/dragons/\0', CONTENT_DIR, 'darwin')).toBe(false);
  });

  test('rejects cross-drive paths on Windows', () => {
    expect(isPathWithinDir('D:\\foo', 'C:\\Users\\who\\dragons', 'win32')).toBe(false);
  });

  test('accepts same-drive descendants on Windows', () => {
    expect(
      isPathWithinDir('C:\\Users\\who\\dragons\\specs', 'C:\\Users\\who\\dragons', 'win32'),
    ).toBe(true);
  });
});
