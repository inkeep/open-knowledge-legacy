/**
 * Unit tests for the Codex two-shot dispatch helper.
 *
 * Covered surfaces:
 *   (a) First call: wake URL → sleep(CODEX_SETTLE_MS) → real URL.
 *   (b) Second call in same session: skips wake, single-shot.
 *   (c) Wake-URL openExternal failure short-circuits before sleep / real URL.
 *   (d) `__resetCodexWarmedForTests` resets the module-scoped warm flag.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { HandoffPayload } from '@inkeep/open-knowledge-core';
import {
  __resetCodexWarmedForTests,
  CODEX_SETTLE_MS,
  CODEX_WAKE_URL,
  dispatchCodex,
} from './codex-two-shot.ts';

const PAYLOAD: HandoffPayload = {
  target: 'codex',
  projectDir: '/Users/who/proj',
  docPath: '/Users/who/proj/specs/foo/SPEC.md',
  prompt: 'Open Knowledge doc: specs/foo/SPEC.md.',
};

function makeOpen(impl: (url: string) => Promise<void> = async () => {}) {
  const openExternal = mock(impl);
  return { openExternalDeps: { okDesktop: { shell: { openExternal } } }, openExternal };
}

describe('dispatchCodex', () => {
  beforeEach(() => __resetCodexWarmedForTests());

  test('first call: fires wake URL, awaits settle, then real URL', async () => {
    const { openExternalDeps, openExternal } = makeOpen();
    const sleep = mock(async () => {});
    const result = await dispatchCodex(PAYLOAD, { openExternalDeps, sleep });
    expect(result).toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledTimes(2);
    expect((openExternal.mock.calls[0] as readonly string[])[0]).toBe(CODEX_WAKE_URL);
    expect((openExternal.mock.calls[1] as readonly string[])[0]).toMatch(/^codex:\/\/new\?prompt=/);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(CODEX_SETTLE_MS);
  });

  test('second call in same session: single-shot (no wake, no sleep)', async () => {
    const { openExternalDeps, openExternal } = makeOpen();
    const sleep = mock(async () => {});
    await dispatchCodex(PAYLOAD, { openExternalDeps, sleep });
    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);

    await dispatchCodex(PAYLOAD, { openExternalDeps, sleep });
    expect(openExternal).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect((openExternal.mock.calls[2] as readonly string[])[0]).toMatch(/^codex:\/\/new\?prompt=/);
  });

  test('wake-URL failure short-circuits — no sleep, no real-URL call', async () => {
    const openExternal = mock(async (url: string) => {
      if (url === CODEX_WAKE_URL) throw new Error('boom');
    });
    const sleep = mock(async () => {});
    const result = await dispatchCodex(PAYLOAD, {
      openExternalDeps: { okDesktop: { shell: { openExternal } } },
      sleep,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('dispatch-error');
    expect(result.detail).toContain('boom');
    expect(sleep).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  test('__resetCodexWarmedForTests rewinds the warm flag', async () => {
    const { openExternalDeps, openExternal } = makeOpen();
    const sleep = mock(async () => {});
    await dispatchCodex(PAYLOAD, { openExternalDeps, sleep });
    __resetCodexWarmedForTests();
    await dispatchCodex(PAYLOAD, { openExternalDeps, sleep });
    expect(openExternal).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
