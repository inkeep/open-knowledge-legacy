/**
 * Cursor's deep-link API has no single-call folder-open semantic. To open a
 * workspace AND pre-fill a prompt, two calls are required:
 *
 *   1. Spawn `cursor <projectDir>` via the Electron main-process IPC
 *      `ok:shell:spawn-cursor` (US-004).
 *   2. Wait for the workspace window to materialize, then fire
 *      `cursor://anysphere.cursor-deeplink/prompt?text=&workspace=&mode=agent`.
 *      The `workspace=<basename>` safety-net pins the URL to the just-opened
 *      window even if the OS routes it before Cursor is fully ready.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.5 (TQ4b
 * LOCKED), plus the canonical recipe in
 * `reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-encoding-empirics.md`
 * §Test protocol.
 *
 * Web host: per E4 DIRECTED (2026-04-21), Cursor is **always disabled** on web.
 * `dispatchCursor` on web returns `{ ok: false, reason:
 * 'web-host-cursor-unsupported' }` without touching any server endpoint. The
 * UI filters the row before reaching dispatch, so this branch is
 * defense-in-depth.
 */

import {
  buildCursorUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

/**
 * Settle delay between step 1 (spawn) and step 2 (prompt URL). The canonical
 * recipe (see module comment) uses `sleep 1`; we extend to 1500 ms on cold
 * start since Launch Services adds 500-1500 ms on macOS before the window
 * materializes.
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
   * Cold-start probe — returns `true` if Cursor is already running on this
   * host. Optional: when absent, the cold-start settle delay is used
   * (conservative default — extra 500 ms is preferable to firing the prompt
   * URL before the window exists).
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
