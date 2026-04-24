/**
 * Cursor's deep-link API has no single-call folder-open semantic. To open a
 * workspace AND pre-fill a prompt, two calls are required:
 *
 *   1. Spawn `cursor <projectDir>` via the Electron `ok:shell:spawn-cursor`
 *      IPC.
 *   2. Wait for the workspace window to materialize, then fire
 *      `cursor://anysphere.cursor-deeplink/prompt?text=&workspace=&mode=agent`.
 *      The `workspace=<basename>` parameter pins the URL to the just-opened
 *      window even if the OS routes it before Cursor is fully ready.
 *
 * Web host: Cursor is always disabled. `dispatchCursor` returns
 * `web-host-cursor-unsupported` as defense-in-depth; the UI filters the row
 * before reaching dispatch.
 */

import {
  buildCursorUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

/**
 * Settle delay between step 1 (spawn) and step 2 (prompt URL). Cold start
 * extends to 1500 ms because macOS Launch Services adds 500-1500 ms before
 * the window materializes.
 */
export const CURSOR_SETTLE_MS_WARM = 1000;
export const CURSOR_SETTLE_MS_COLD = 1500;

export interface DispatchCursorDeps {
  /**
   * Electron IPC to spawn `cursor <path>`. Populated from
   * `window.okDesktop.shell.spawnCursor` in production.
   */
  readonly spawnCursor?: (
    path: string,
  ) => Promise<
    | { ok: true }
    | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' }
  >;
  /**
   * Returns `true` if Cursor is already running. Absent = use the cold-start
   * settle delay (extra 500 ms beats firing the prompt URL too early).
   */
  readonly isCursorRunning?: () => Promise<boolean>;
  /** Delay primitive. Injected so tests don't wait real wall-clock time. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Forwarded to `openExternal` for step 2. */
  readonly openExternalDeps?: OpenExternalDeps;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute Cursor's two-step dispatch. Electron-only. Web host returns
 * `web-host-cursor-unsupported` without attempting step 1.
 */
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
