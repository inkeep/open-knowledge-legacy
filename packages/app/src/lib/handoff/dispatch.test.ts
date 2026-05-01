
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
  test('dispatches codex://new with prompt and path (no docPath)', async () => {
    const { openExternalDeps, openExternal } = makeOpen(async () => {});
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'codex' };
    const result = await dispatchHandoff(payload, { openExternalDeps });
    expect(result).toEqual({ ok: true });
    const url = (openExternal.mock.calls[0] as readonly string[])[0];
    expect(url).toMatch(/^codex:\/\/new\?prompt=/);
    expect(url).toContain('path=');
    expect(url).not.toContain('file=');
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

  test('web host fallback: no spawnCursor dep and no window.okDesktop → unsupported', async () => {
    const payload: HandoffPayload = { ...BASE_PAYLOAD, target: 'cursor' };
    const result = await dispatchHandoff(payload);
    expect(result).toEqual({ ok: false, reason: 'web-host-cursor-unsupported' });
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
