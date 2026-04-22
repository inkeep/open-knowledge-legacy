import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { AddressInfo } from 'node:net';
import {
  createInstalledAgentsProbe,
  createOsProbe,
  type ExecFileLike,
  handleInstalledAgents,
  INSTALLED_AGENTS_CACHE_TTL_MS,
  INSTALLED_AGENTS_SCHEMES,
  type InstalledAgentScheme,
} from './handoff-api.ts';

describe('createInstalledAgentsProbe', () => {
  test('returns a record with exactly claude/codex/cursor keys', async () => {
    const probe = createInstalledAgentsProbe({ probe: async () => true });
    const result = await probe.probeAll();
    expect(Object.keys(result).sort()).toEqual(['claude', 'codex', 'cursor']);
    expect(result).toEqual({ claude: true, codex: true, cursor: true });
  });

  test('3 calls within TTL produce 1 probe per scheme (cache hit)', async () => {
    // SPEC §6.4: 3 calls within 60s → 1 probe per scheme.
    const counts: Record<string, number> = {};
    const probeFn = async (scheme: InstalledAgentScheme) => {
      counts[scheme] = (counts[scheme] ?? 0) + 1;
      return true;
    };

    let clockNow = 1_000_000; // arbitrary starting epoch
    const { probeAll } = createInstalledAgentsProbe({ probe: probeFn, now: () => clockNow });

    await probeAll();
    clockNow += 1000; // +1s
    await probeAll();
    clockNow += 58_000; // +58s (still within 60s TTL)
    await probeAll();

    expect(counts).toEqual({ claude: 1, codex: 1, cursor: 1 });
  });

  test('calls after TTL expiration trigger re-probe', async () => {
    const counts: Record<string, number> = {};
    const probeFn = async (scheme: InstalledAgentScheme) => {
      counts[scheme] = (counts[scheme] ?? 0) + 1;
      return true;
    };

    let clockNow = 0;
    const { probeAll } = createInstalledAgentsProbe({ probe: probeFn, now: () => clockNow });

    await probeAll();
    clockNow += INSTALLED_AGENTS_CACHE_TTL_MS + 1;
    await probeAll();

    expect(counts).toEqual({ claude: 2, codex: 2, cursor: 2 });
  });

  test('concurrent calls coalesce into a single probe per scheme', async () => {
    // In-flight dedup: if 5 requests fire before the probe resolves, all 5
    // await the same probe.
    const counts: Record<string, number> = {};
    const probeFn = async (scheme: InstalledAgentScheme) => {
      counts[scheme] = (counts[scheme] ?? 0) + 1;
      // Deliberate microtask-deferred resolution so all 5 callers see the
      // same in-flight entry.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return true;
    };
    const { probeAll } = createInstalledAgentsProbe({ probe: probeFn });
    await Promise.all([probeAll(), probeAll(), probeAll(), probeAll(), probeAll()]);
    expect(counts).toEqual({ claude: 1, codex: 1, cursor: 1 });
  });

  test('probe rejection resolves to false and caches the false for the TTL', async () => {
    let calls = 0;
    const probeFn = async () => {
      calls++;
      throw new Error('probe timeout');
    };
    let clockNow = 0;
    const { probeWithCache } = createInstalledAgentsProbe({
      probe: probeFn,
      now: () => clockNow,
    });
    expect(await probeWithCache('claude')).toBe(false);
    clockNow += 10_000; // well within TTL
    expect(await probeWithCache('claude')).toBe(false);
    // Only one actual probe call despite two cached calls.
    expect(calls).toBe(1);
  });

  test('ttlMs override is respected', async () => {
    const counts: Record<string, number> = {};
    const probeFn = async (scheme: InstalledAgentScheme) => {
      counts[scheme] = (counts[scheme] ?? 0) + 1;
      return false;
    };
    let clockNow = 0;
    const { probeWithCache } = createInstalledAgentsProbe({
      probe: probeFn,
      now: () => clockNow,
      ttlMs: 5_000,
    });
    await probeWithCache('cursor');
    clockNow += 5_001;
    await probeWithCache('cursor');
    expect(counts.cursor).toBe(2);
  });
});

describe('handleInstalledAgents', () => {
  function createMockReq(method: string): import('node:http').IncomingMessage {
    return { method } as import('node:http').IncomingMessage;
  }

  function createMockRes(): {
    res: import('node:http').ServerResponse;
    writeHead: { status?: number; headers?: Record<string, string> };
    body: string;
  } {
    const writeHead: { status?: number; headers?: Record<string, string> } = {};
    let body = '';
    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        writeHead.status = status;
        writeHead.headers = headers;
      },
      end(chunk?: string) {
        body = chunk ?? '';
      },
    } as unknown as import('node:http').ServerResponse;
    return {
      res,
      writeHead,
      get body() {
        return body;
      },
    };
  }

  test('GET returns 200 with flat boolean record body', async () => {
    const probeAll = async () => ({ claude: true, codex: false, cursor: true }) as const;
    const mock = createMockRes();
    await handleInstalledAgents(createMockReq('GET'), mock.res, probeAll);
    expect(mock.writeHead.status).toBe(200);
    expect(mock.writeHead.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(mock.body)).toEqual({ claude: true, codex: false, cursor: true });
  });

  test('POST returns 405', async () => {
    const probeAll = async () => ({ claude: false, codex: false, cursor: false });
    const mock = createMockRes();
    await handleInstalledAgents(createMockReq('POST'), mock.res, probeAll);
    expect(mock.writeHead.status).toBe(405);
    expect(JSON.parse(mock.body)).toEqual({ ok: false, error: 'Method not allowed' });
  });

  test('PUT returns 405', async () => {
    const probeAll = async () => ({ claude: false, codex: false, cursor: false });
    const mock = createMockRes();
    await handleInstalledAgents(createMockReq('PUT'), mock.res, probeAll);
    expect(mock.writeHead.status).toBe(405);
  });

  test('DELETE returns 405', async () => {
    const probeAll = async () => ({ claude: false, codex: false, cursor: false });
    const mock = createMockRes();
    await handleInstalledAgents(createMockReq('DELETE'), mock.res, probeAll);
    expect(mock.writeHead.status).toBe(405);
  });

  test('probe throw inside probeAll returns 500 (defensive — normally unreachable)', async () => {
    const probeAll = async () => {
      throw new Error('unexpected');
    };
    const mock = createMockRes();
    await handleInstalledAgents(createMockReq('GET'), mock.res, probeAll);
    expect(mock.writeHead.status).toBe(500);
    expect(JSON.parse(mock.body)).toEqual({ ok: false, error: 'Internal server error' });
  });
});

describe('createOsProbe', () => {
  type ExecCall = { cmd: string; args: readonly string[] };

  function makeExecFake(responses: Record<string, { err?: Error | null; stdout?: string }>): {
    exec: ExecFileLike;
    calls: ExecCall[];
  } {
    const calls: ExecCall[] = [];
    const exec: ExecFileLike = (file, args, _opts, cb) => {
      calls.push({ cmd: file, args });
      // Pick the first matching key by command prefix.
      const key = Object.keys(responses).find((k) => k === file) ?? file;
      const resp = responses[key] ?? {};
      // Microtask-defer the callback so the probe Promise is in-flight briefly.
      queueMicrotask(() => {
        cb(resp.err ?? null, resp.stdout ?? '', '');
      });
    };
    return { exec, calls };
  }

  test('macOS probe uses osascript with app-name mapping per scheme', async () => {
    const { exec, calls } = makeExecFake({ osascript: { stdout: 'com.anthropic.claude' } });
    const probe = createOsProbe('darwin', exec);
    expect(await probe('claude')).toBe(true);
    expect(calls[0]?.cmd).toBe('osascript');
    expect(calls[0]?.args).toEqual(['-e', 'id of app "Claude"']);
  });

  test('macOS probe returns false when osascript errors (app not installed)', async () => {
    const err = Object.assign(new Error('exit 1'), { code: 1 });
    const { exec } = makeExecFake({ osascript: { err } });
    const probe = createOsProbe('darwin', exec);
    expect(await probe('codex')).toBe(false);
  });

  test('macOS codex scheme maps to "OpenAI Codex"', async () => {
    const { exec, calls } = makeExecFake({ osascript: { stdout: 'com.openai.codex' } });
    const probe = createOsProbe('darwin', exec);
    await probe('codex');
    expect(calls[0]?.args).toEqual(['-e', 'id of app "OpenAI Codex"']);
  });

  test('Windows probe uses reg query HKCU\\Software\\Classes\\<scheme>', async () => {
    const { exec, calls } = makeExecFake({ reg: {} });
    const probe = createOsProbe('win32', exec);
    expect(await probe('cursor')).toBe(true);
    expect(calls[0]?.cmd).toBe('reg');
    expect(calls[0]?.args).toEqual(['query', 'HKCU\\Software\\Classes\\cursor', '/ve']);
  });

  test('Windows probe returns false when reg query non-zero exit', async () => {
    const err = Object.assign(new Error('exit 1'), { code: 1 });
    const { exec } = makeExecFake({ reg: { err } });
    const probe = createOsProbe('win32', exec);
    expect(await probe('claude')).toBe(false);
  });

  test('Linux probe uses xdg-mime query default x-scheme-handler/<scheme>', async () => {
    const { exec, calls } = makeExecFake({
      'xdg-mime': { stdout: 'anthropic-claude.desktop' },
    });
    const probe = createOsProbe('linux', exec);
    expect(await probe('claude')).toBe(true);
    expect(calls[0]?.cmd).toBe('xdg-mime');
    expect(calls[0]?.args).toEqual(['query', 'default', 'x-scheme-handler/claude']);
  });

  test('Linux probe empty stdout → false', async () => {
    const { exec } = makeExecFake({ 'xdg-mime': { stdout: '' } });
    const probe = createOsProbe('linux', exec);
    expect(await probe('cursor')).toBe(false);
  });

  test('Linux probe whitespace-only stdout → false', async () => {
    const { exec } = makeExecFake({ 'xdg-mime': { stdout: '   \n\t\n' } });
    const probe = createOsProbe('linux', exec);
    expect(await probe('cursor')).toBe(false);
  });

  test('Linux probe exec error → false (conservative default)', async () => {
    const err = Object.assign(new Error('command not found'), { code: 'ENOENT' });
    const { exec } = makeExecFake({ 'xdg-mime': { err } });
    const probe = createOsProbe('linux', exec);
    expect(await probe('claude')).toBe(false);
  });

  test('unknown platform falls back to Linux xdg-mime path', async () => {
    const { exec, calls } = makeExecFake({ 'xdg-mime': { stdout: 'foo.desktop' } });
    const probe = createOsProbe('aix' as NodeJS.Platform, exec);
    expect(await probe('cursor')).toBe(true);
    expect(calls[0]?.cmd).toBe('xdg-mime');
  });
});

describe('GET /api/installed-agents (integration — real HTTP + real createApiExtension)', () => {
  let tmpDir: string;
  let contentDir: string;
  let server: import('node:http').Server;
  let port: number;
  let probeCalls: Record<string, number>;

  beforeEach(async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { mkdirSync } = await import('node:fs');
    tmpDir = await mkdtemp(join(tmpdir(), 'installed-agents-'));
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    probeCalls = {};

    const { Hocuspocus } = await import('@hocuspocus/server');
    const { AgentSessionManager } = await import('./agent-sessions.ts');
    const { createApiExtension } = await import('./api-extension.ts');

    const hocuspocus = new Hocuspocus({ quiet: true });
    const sessionManager = new AgentSessionManager(hocuspocus);

    const ext = createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir,
      getFileIndex: () => new Map(),
      installedAgentsProbe: async (scheme) => {
        probeCalls[scheme] = (probeCalls[scheme] ?? 0) + 1;
        // Deterministic mock response: claude + cursor installed, codex not.
        return scheme === 'claude' || scheme === 'cursor';
      },
    });

    const { createServer } = await import('node:http');
    server = createServer((req, res) => {
      // biome-ignore lint/suspicious/noExplicitAny: test harness
      hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
        if (!res.writableEnded) {
          res.writeHead(500);
          res.end('Error');
        }
      });
    });

    hocuspocus.configuration.extensions.push(ext);

    port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(addr && typeof addr === 'object' ? (addr as AddressInfo).port : 0);
      });
    });
  });

  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('GET returns 200 + flat boolean record matching injected probe', async () => {
    const res = await fetch(`http://localhost:${port}/api/installed-agents`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toEqual({ claude: true, codex: false, cursor: true });
  });

  test('3 GETs within cache TTL trigger exactly 1 probe per scheme', async () => {
    // SPEC §6.4 AC: "3 calls within 60s → 1 probe per scheme".
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://localhost:${port}/api/installed-agents`);
      expect(res.status).toBe(200);
    }
    expect(probeCalls).toEqual({ claude: 1, codex: 1, cursor: 1 });
  });

  test('POST returns 405', async () => {
    const res = await fetch(`http://localhost:${port}/api/installed-agents`, { method: 'POST' });
    expect(res.status).toBe(405);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: 'Method not allowed' });
  });

  test('schemes constant is exactly the three product targets', () => {
    expect([...INSTALLED_AGENTS_SCHEMES]).toEqual(['claude', 'codex', 'cursor']);
  });
});
