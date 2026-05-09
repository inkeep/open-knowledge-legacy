/**
 * Unit tests for Cursor's two-step dispatcher.
 *
 * Covered surfaces:
 *   (a) Electron happy path: caller-provided `spawnCursor` (matches the
 *       Electron IPC shape) is called with projectDir; settle delay scaled
 *       by isCursorRunning probe (warm=1000ms, cold=1500ms); then openExternal
 *       fires the cursor:// prompt URL exactly once.
 *   (b) Web-host fetch fallback: when no `spawnCursor` dep and no
 *       `window.okDesktop`, dispatch falls through to `POST /api/spawn-cursor`.
 *       Outcome shape parity with Electron — wire format `{ ok } | { ok:false; reason }`.
 *   (c) Electron failure paths: spawn returns each `{ok:false, reason}` variant
 *       → mapped to the right HandoffOutcome failure reason with descriptive
 *       detail.
 *   (d) Settle-delay semantics: injected `sleep` receives the expected delay
 *       based on isCursorRunning probe outcome.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { HandoffPayload } from '@inkeep/open-knowledge-core';
import { CURSOR_SETTLE_MS_COLD, CURSOR_SETTLE_MS_WARM, dispatchCursor } from './cursor-two-step.ts';

const PAYLOAD: HandoffPayload = {
  target: 'cursor',
  projectDir: '/Users/andrew/Documents/code/open-knowledge',
  docPath: '/Users/andrew/Documents/code/open-knowledge/specs/foo/SPEC.md',
  prompt: 'Open Knowledge doc: specs/foo/SPEC.md.',
};

describe('dispatchCursor — web host fetch fallback', () => {
  test('with no spawnCursor dep + no okDesktop, POSTs projectDir to /api/spawn-cursor', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof globalThis.fetch;
    const openExternal = mock(async () => {});
    const result = await dispatchCursor(PAYLOAD, {
      fetch: fetchMock,
      sleep: async () => {},
      openExternalDeps: { okDesktop: { shell: { openExternal } } },
    });
    expect(result).toEqual({ ok: true });
    expect(calls.length).toBe(1);
    expect(calls[0]?.input).toBe('/api/spawn-cursor');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ path: PAYLOAD.projectDir });
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  test('fetch 404 (older server / non-loopback) → not-installed (matches Electron contract)', async () => {
    const fetchMock = (async () =>
      new Response('', { status: 404 })) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-installed');
  });

  test('fetch network error → dispatch-error (treated as transient spawn failure)', async () => {
    const fetchMock = (async () => {
      throw new Error('econnrefused');
    }) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
  });

  test('fetch 422 cursor-not-installed problem+json → not-installed', async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          type: 'urn:ok:error:cursor-not-installed',
          title: 'Cursor CLI not found.',
          status: 422,
        }),
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-installed');
  });

  test('fetch 504 cursor-spawn-timeout problem+json → dispatch-error (timeout)', async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          type: 'urn:ok:error:cursor-spawn-timeout',
          title: 'Cursor spawn timeout.',
          status: 504,
        }),
        { status: 504, headers: { 'Content-Type': 'application/problem+json' } },
      )) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
    expect(result.detail ?? '').toContain('cursor spawn: timeout');
  });

  test('fetch 502 cursor-spawn-failed problem+json → dispatch-error (spawn-error)', async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          type: 'urn:ok:error:cursor-spawn-failed',
          title: 'Cursor spawn failed.',
          status: 502,
        }),
        { status: 502, headers: { 'Content-Type': 'application/problem+json' } },
      )) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
    expect(result.detail ?? '').toContain('cursor spawn: spawn-error');
  });

  test('fetch 403 path-escape problem+json → invalid-payload', async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          type: 'urn:ok:error:path-escape',
          title: 'Path escape.',
          status: 403,
        }),
        { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
      )) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-payload');
  });

  test('fetch returns malformed body → dispatch-error', async () => {
    const fetchMock = (async () =>
      new Response('not-json', {
        status: 500,
        headers: { 'Content-Type': 'application/problem+json' },
      })) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
  });

  test('fetch returns problem+json with unknown URN → dispatch-error (default fallback)', async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          type: 'urn:ok:error:internal-server-error',
          title: 'Internal error.',
          status: 500,
        }),
        { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
      )) as unknown as typeof globalThis.fetch;
    const result = await dispatchCursor(PAYLOAD, { fetch: fetchMock, sleep: async () => {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
  });
});

describe('dispatchCursor — Electron happy path', () => {
  test('spawns with projectDir, waits cold settle, then fires cursor:// URL', async () => {
    const spawnCursor = mock(async (_path: string) => ({ ok: true as const }));
    const openExternal = mock(async () => {});
    const sleep = mock(async (_ms: number) => {});

    const result = await dispatchCursor(PAYLOAD, {
      spawnCursor,
      sleep,
      openExternalDeps: { okDesktop: { shell: { openExternal } } },
    });

    expect(result).toEqual({ ok: true });
    expect(spawnCursor).toHaveBeenCalledTimes(1);
    expect(spawnCursor).toHaveBeenCalledWith(PAYLOAD.projectDir);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(CURSOR_SETTLE_MS_COLD);
    expect(openExternal).toHaveBeenCalledTimes(1);
    const firedUrl = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(firedUrl).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/prompt\?text=/);
    expect(firedUrl).toContain('workspace=open-knowledge');
    expect(firedUrl).toContain('mode=agent');
  });

  test('warm settle (1000ms) when isCursorRunning returns true', async () => {
    const sleep = mock(async (_ms: number) => {});
    await dispatchCursor(PAYLOAD, {
      spawnCursor: async () => ({ ok: true as const }),
      isCursorRunning: async () => true,
      sleep,
      openExternalDeps: { okDesktop: { shell: { openExternal: async () => {} } } },
    });
    expect(sleep).toHaveBeenCalledWith(CURSOR_SETTLE_MS_WARM);
  });

  test('cold settle (1500ms) when isCursorRunning throws — conservative default', async () => {
    const sleep = mock(async (_ms: number) => {});
    await dispatchCursor(PAYLOAD, {
      spawnCursor: async () => ({ ok: true as const }),
      isCursorRunning: async () => {
        throw new Error('probe failed');
      },
      sleep,
      openExternalDeps: { okDesktop: { shell: { openExternal: async () => {} } } },
    });
    expect(sleep).toHaveBeenCalledWith(CURSOR_SETTLE_MS_COLD);
  });

  test('never fires openExternal when spawn fails', async () => {
    const openExternal = mock(async () => {});
    await dispatchCursor(PAYLOAD, {
      spawnCursor: async () => ({ ok: false as const, reason: 'not-installed' }),
      sleep: async () => {},
      openExternalDeps: { okDesktop: { shell: { openExternal } } },
    });
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe('dispatchCursor — failure reason mapping', () => {
  test.each([
    ['not-installed', 'not-installed', 'cursor binary not found'],
    ['invalid-path', 'invalid-payload', 'cursor spawn: invalid path'],
    ['timeout', 'dispatch-error', 'cursor spawn: timeout'],
    ['spawn-error', 'dispatch-error', 'cursor spawn: spawn-error'],
  ] as const)('spawn rejection reason=%s maps to outcome reason=%s with detail containing %s', async (spawnReason, expectedReason, expectedDetailFragment) => {
    const result = await dispatchCursor(PAYLOAD, {
      spawnCursor: async () => ({ ok: false as const, reason: spawnReason }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(expectedReason);
    expect(result.detail ?? '').toContain(expectedDetailFragment);
  });
});
