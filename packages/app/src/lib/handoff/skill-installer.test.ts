/**
 * Unit tests for the pluggable `SkillInstaller` adapters.
 *
 * Covers:
 *   - `electronSkillInstaller` translates the bridge's
 *     `{ok, path | reason+message}` into the normalized `SkillInstallResult`.
 *   - `httpSkillInstaller` posts to `/api/install-skill`, parses the
 *     server's `BuildAndOpenSkillResult`, and collapses 'installed' / 'built'
 *     to ok-true and 'failed' to ok-false. Network + non-2xx responses are
 *     surfaced as ok-false with diagnostic reason codes.
 */

import { describe, expect, mock, test } from 'bun:test';
import {
  type ElectronSkillBridge,
  electronSkillInstaller,
  httpSkillInstaller,
} from './skill-installer';

describe('electronSkillInstaller', () => {
  test('bridge ok: returns ok with path', async () => {
    const bridge: ElectronSkillBridge = {
      buildAndOpen: mock(async () => ({ ok: true, path: '/tmp/skill' })),
    };
    const installer = electronSkillInstaller(bridge);

    expect(await installer.install()).toEqual({ ok: true, path: '/tmp/skill' });
    expect(bridge.buildAndOpen).toHaveBeenCalledTimes(1);
  });

  test('bridge fails: returns ok-false with reason + message', async () => {
    const bridge: ElectronSkillBridge = {
      buildAndOpen: mock(async () => ({
        ok: false,
        reason: 'build-failed',
        message: 'no SKILL.md',
      })),
    };
    const installer = electronSkillInstaller(bridge);

    expect(await installer.install()).toEqual({
      ok: false,
      reason: 'build-failed',
      message: 'no SKILL.md',
    });
  });
});

describe('httpSkillInstaller', () => {
  function fakeFetch(response: {
    ok?: boolean;
    status?: number;
    body?: unknown;
    throwError?: Error;
  }): typeof fetch {
    return mock(async () => {
      if (response.throwError) throw response.throwError;
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: async () => response.body,
      } as Response;
    }) as unknown as typeof fetch;
  }

  test("posts to '/api/install-skill' with empty JSON body and Content-Type", async () => {
    const fetchSpy = fakeFetch({ body: { status: 'installed', outputPath: '/tmp/skill' } });
    const installer = httpSkillInstaller({ fetch: fetchSpy });

    await installer.install();

    const [url, init] = (fetchSpy as unknown as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/install-skill');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  test('respects apiOrigin for cross-origin POSTs', async () => {
    const fetchSpy = fakeFetch({ body: { status: 'installed', outputPath: '/tmp/skill' } });
    const installer = httpSkillInstaller({ fetch: fetchSpy, apiOrigin: 'http://localhost:5173' });

    await installer.install();

    const [url] = (fetchSpy as unknown as ReturnType<typeof mock>).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:5173/api/install-skill');
  });

  test("status 'installed': ok-true with path, no warning", async () => {
    const installer = httpSkillInstaller({
      fetch: fakeFetch({ body: { status: 'installed', outputPath: '/tmp/skill' } }),
    });

    expect(await installer.install()).toEqual({
      ok: true,
      path: '/tmp/skill',
      handoffWarning: undefined,
    });
  });

  test("status 'built' with handoffError: ok-true with warning (file is on disk)", async () => {
    const installer = httpSkillInstaller({
      fetch: fakeFetch({
        body: {
          status: 'built',
          outputPath: '/tmp/skill',
          handoffError: { reason: 'spawn-error', message: 'EACCES' },
        },
      }),
    });

    expect(await installer.install()).toEqual({
      ok: true,
      path: '/tmp/skill',
      handoffWarning: 'EACCES',
    });
  });

  test("status 'failed': ok-false with build-failed reason", async () => {
    const installer = httpSkillInstaller({
      fetch: fakeFetch({ body: { status: 'failed', buildError: 'no SKILL.md' } }),
    });

    expect(await installer.install()).toEqual({
      ok: false,
      reason: 'build-failed',
      message: 'no SKILL.md',
    });
  });

  test('non-2xx HTTP response: ok-false with http-error reason', async () => {
    const installer = httpSkillInstaller({
      fetch: fakeFetch({ ok: false, status: 503 }),
    });

    expect(await installer.install()).toEqual({
      ok: false,
      reason: 'http-error',
      message: 'HTTP 503',
    });
  });

  test('fetch throws: ok-false with network-error reason', async () => {
    const installer = httpSkillInstaller({
      fetch: fakeFetch({ throwError: new Error('NetworkError: failed to connect') }),
    });

    expect(await installer.install()).toEqual({
      ok: false,
      reason: 'network-error',
      message: 'NetworkError: failed to connect',
    });
  });
});
