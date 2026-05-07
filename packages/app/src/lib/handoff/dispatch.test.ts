/**
 * Unit tests for the single outbound dispatch entry point.
 *
 * Covered surfaces:
 *   (a) Happy paths — each of the four `HandoffTarget` values is routed to the
 *       right primitive with the right URL shape and deps forwarding.
 *   (b) Exhaustiveness — the `_exhaustive: never` line fires at runtime when a
 *       caller passes an invalid target (simulates the future case where
 *       someone adds a union member and forgets the switch case — TypeScript
 *       would catch this at compile time; the runtime assertion is
 *       belt-and-suspenders).
 *   (c) Cursor host gate — web host (no `okDesktop`, no injected spawnCursor)
 *       returns `web-host-cursor-unsupported` cleanly.
 *   (d) AC9 assertion — grep of `packages/app/src/components/` must not
 *       reference `dispatchHandoff`, `dispatchCursor`, or `openExternal`
 *       outside the `lib/handoff/` module. Deferred to US-011 which introduces
 *       the component surfaces; covered there.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { HandoffPayload, HandoffTarget } from '@inkeep/open-knowledge-core';
import { dispatchHandoff } from './dispatch.ts';

const BASE_PAYLOAD = {
  projectDir: '/Users/andrew/Documents/code/open-knowledge',
  docPath: '/Users/andrew/Documents/code/open-knowledge/specs/foo/SPEC.md',
  prompt: 'Open Knowledge doc: specs/foo/SPEC.md.',
} as const;

function makeOpen(impl: (url: string) => Promise<void>) {
  const openExternal = mock(impl);
  return { openExternalDeps: { okDesktop: { shell: { openExternal } } }, openExternal };
}

describe('dispatchHandoff — claude-cowork', () => {
  test('dispatches claude://cowork/new with single-encoded params', async () => {
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'claude-cowork' };
    const result = await dispatchHandoff(payload, { openExternalDeps });
    expect(result).toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledTimes(1);
    const url = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(url).toMatch(/^claude:\/\/cowork\/new\?q=/);
    expect(url).toContain('folder=');
    expect(url).toContain('file=');
  });
});

describe('dispatchHandoff — claude-code', () => {
  test('dispatches claude://code/new with file= retained (E3-b: forward-compat)', async () => {
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'claude-code' };
    const result = await dispatchHandoff(payload, { openExternalDeps });
    expect(result).toEqual({ ok: true });
    const url = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(url).toMatch(/^claude:\/\/code\/new\?q=/);
    expect(url).toContain('file=');
  });
});

describe('dispatchHandoff — codex', () => {
  test('every dispatch is two-shot (wake URL → settle → real URL with prompt and path)', async () => {
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const sleep = mock(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'codex' };
    const result = await dispatchHandoff(payload, { openExternalDeps, codexDeps: { sleep } });
    expect(result).toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledTimes(2);
    const wakeUrl = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(wakeUrl).toBe('codex://new');
    const realUrl = (openExternal.mock.calls[1] as readonly string[])[0];
    expect(realUrl).toMatch(/^codex:\/\/new\?prompt=/);
    expect(realUrl).toContain('path=');
    expect(realUrl).not.toContain('file=');
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchHandoff — cursor', () => {
  test('two-step: spawn → settle → fire cursor:// URL on Electron', async () => {
    const spawnCursor = mock(async () => ({ ok: true as const }));
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const sleep = mock(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'cursor' };
    const result = await dispatchHandoff(payload, {
      cursorDeps: { spawnCursor, sleep, openExternalDeps },
    });
    expect(result).toEqual({ ok: true });
    expect(spawnCursor).toHaveBeenCalledWith(BASE_PAYLOAD.projectDir);
    expect(openExternal).toHaveBeenCalledTimes(1);
    const url = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(url).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/prompt\?/);
  });

  test('web host fallback: no spawnCursor dep + no okDesktop → POSTs to /api/spawn-cursor', async () => {
    const fetchMock = (async () =>
      new Response('', { status: 404 })) as unknown as typeof globalThis.fetch;
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'cursor' };
    const result = await dispatchHandoff(payload, {
      cursorDeps: { fetch: fetchMock, sleep: async () => {} },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-installed');
  });

  test('forwards top-level openExternalDeps to cursor step 2 when cursorDeps lacks its own', async () => {
    const spawnCursor = mock(async () => ({ ok: true as const }));
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const sleep = mock(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'cursor' };
    await dispatchHandoff(payload, {
      openExternalDeps,
      cursorDeps: { spawnCursor, sleep },
    });
    expect(openExternal).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchHandoff — runtime exhaustiveness guard', () => {
  test('unknown target (cast to HandoffTarget) produces invalid-payload at runtime', async () => {
    const payload = {
      ...BASE_PAYLOAD,
      target: 'zed' as HandoffTarget,
    };
    const result = await dispatchHandoff(payload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-payload');
    expect(result.detail ?? '').toContain('zed');
  });
});
