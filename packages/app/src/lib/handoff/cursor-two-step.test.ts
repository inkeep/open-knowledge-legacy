/**
 * Unit tests for Cursor's two-step dispatcher.
 *
 * Covered surfaces:
 *   (a) Web-host short-circuit (E4 DIRECTED): no spawn, no URL fired — returns
 *       `web-host-cursor-unsupported` cleanly as defense-in-depth.
 *   (b) Electron happy path: spawnCursor called with projectDir; settle delay
 *       scaled by isCursorRunning probe (warm=1000ms, cold=1500ms); then
 *       openExternal fires the cursor:// prompt URL exactly once.
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

describe('dispatchCursor — web host short-circuit', () => {
  test('returns web-host-cursor-unsupported without calling spawnCursor or openExternal', async () => {
    // Explicitly no `spawnCursor` dep; `window.okDesktop` is also undefined in
    // the Bun test env, so the fallback resolves to undefined too.
    const result = await dispatchCursor(PAYLOAD);
    expect(result).toEqual({ ok: false, reason: 'web-host-cursor-unsupported' });
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
    // No isCursorRunning probe → cold-start default (1500ms)
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
