import {
  buildCursorUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

export const CURSOR_SETTLE_MS_WARM = 1000;
export const CURSOR_SETTLE_MS_COLD = 1500;

export interface DispatchCursorDeps {
  readonly spawnCursor?: (
    path: string,
  ) => Promise<
    | { ok: true }
    | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }
  >;
  readonly isCursorRunning?: () => Promise<boolean>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly openExternalDeps?: OpenExternalDeps;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchCursor(
  payload: HandoffPayload,
  deps: DispatchCursorDeps = {},
): Promise<HandoffOutcome> {
  const spawnCursor =
    deps.spawnCursor ??
    (typeof window !== 'undefined' ? window.okDesktop?.shell.spawnCursor : undefined);
  if (!spawnCursor) {
    return { ok: false, reason: 'web-host-cursor-unsupported' };
  }

  const step1 = await spawnCursor(payload.projectDir);
  if (!step1.ok) {
    return mapSpawnFailure(step1.reason);
  }

  const running = deps.isCursorRunning ? await deps.isCursorRunning().catch(() => false) : false;
  const settleMs = running ? CURSOR_SETTLE_MS_WARM : CURSOR_SETTLE_MS_COLD;
  const sleep = deps.sleep ?? defaultSleep;
  await sleep(settleMs);

  return openExternal(buildCursorUrl(payload), deps.openExternalDeps);
}

function mapSpawnFailure(
  reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error',
): HandoffOutcome {
  switch (reason) {
    case 'not-installed':
      return { ok: false, reason: 'not-installed', detail: 'cursor binary not found' };
    case 'invalid-path':
      return { ok: false, reason: 'invalid-payload', detail: 'cursor spawn: invalid path' };
    case 'timeout':
      return { ok: false, reason: 'dispatch-error', detail: 'cursor spawn: timeout' };
    case 'spawn-error':
      return { ok: false, reason: 'dispatch-error', detail: 'cursor spawn: spawn-error' };
    default: {
      const _exhaustive: never = reason;
      return { ok: false, reason: 'dispatch-error', detail: `cursor spawn: ${String(reason)}` };
    }
  }
}
