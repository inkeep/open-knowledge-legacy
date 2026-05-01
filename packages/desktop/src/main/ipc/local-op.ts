/**
 * Pre-project local-op IPC handlers — GitHub device-flow auth + git clone.
 *
 * The Navigator window has no backing API server (apiOrigin is empty —
 * see `packages/desktop/src/main/navigator-window.ts`), so the renderer's
 * `fetch('/api/local-op/...')` calls hit electron-vite's renderer dev
 * server and 404. These IPC handlers spawn the same CLI subprocess that
 * the HTTP relay would have, streaming events back to the renderer via
 * `webContents.send`.
 *
 * Editor windows continue to use the HTTP path — there's no regression
 * because the IPC handlers are gated to renderer-driven IPC invocations
 * only (the HTTP handler in `api-extension.ts` is untouched).
 *
 * Subprocess shape comes from `@inkeep/open-knowledge-server`'s
 * `local-ops` module — the same runners power both the HTTP and IPC
 * paths so they can't drift.
 */

import { randomUUID } from 'node:crypto';
import {
  type AuthReposResponse,
  type AuthStatusResponse,
  type RunCloneController,
  type RunDeviceFlowController,
  runAuthReposSubprocess,
  runAuthStatusSubprocess,
  runCloneSubprocess,
  runDeviceFlowSubprocess,
  validateCloneInputs,
} from '@inkeep/open-knowledge-server';
import type { SendableWebContents } from '../../shared/ipc-send.ts';
import { sendToRenderer } from '../../shared/ipc-send.ts';

/** Single in-flight flow per channel. Concurrent starts return `error: 'busy'`. */
interface InFlightAuth {
  streamId: string;
  controller: RunDeviceFlowController;
}
interface InFlightClone {
  streamId: string;
  controller: RunCloneController;
}

interface LocalOpHandlerState {
  authInFlight: InFlightAuth | null;
  cloneInFlight: InFlightClone | null;
}

export function createLocalOpState(): LocalOpHandlerState {
  return { authInFlight: null, cloneInFlight: null };
}

export interface LocalOpDeps {
  /**
   * Resolve the CLI argv prefix (e.g. `[wrapperPath]` or
   * `[process.execPath, scriptPath]`). Returned at call time so packaged
   * vs dev mode can differ. The dev-mode prefix invokes the workspace's
   * `cli` package via `bun ...` — the packaged prefix invokes the
   * bundled `<bundle>/Contents/Resources/cli/bin/ok.sh` wrapper.
   */
  resolveCliArgs: () => readonly string[];
  /**
   * `webContents.send` target. Always the BrowserWindow that invoked the
   * `:start` channel — captured at the time of the invoke so a window
   * close mid-flow doesn't crash the dispatch (`isDestroyed` is checked
   * before each send).
   */
  state: LocalOpHandlerState;
}

/**
 * Handler for `ok:local-op:auth:start`. Spawns the device-flow subprocess
 * and pipes events back to the caller. Returns a fresh `streamId`.
 */
export function handleAuthStart(
  deps: LocalOpDeps,
  sender: SendableWebContents,
): { ok: true; streamId: string } | { ok: false; error: string } {
  if (deps.state.authInFlight) {
    return { ok: false, error: 'An auth login operation is already in progress' };
  }
  const streamId = randomUUID();
  const controller = runDeviceFlowSubprocess({
    cliArgs: deps.resolveCliArgs(),
    onEvent: (event) => {
      // The wrapper guards against sending to a destroyed webContents —
      // window-close mid-flow would otherwise crash the main process.
      if (!sender.isDestroyed?.()) {
        sendToRenderer(sender, 'ok:local-op:auth:event', { streamId, event });
      }
    },
  });
  deps.state.authInFlight = { streamId, controller };
  void controller.done.finally(() => {
    if (deps.state.authInFlight?.streamId === streamId) {
      deps.state.authInFlight = null;
    }
  });
  return { ok: true, streamId };
}

/** Handler for `ok:local-op:auth:cancel`. */
export function handleAuthCancel(deps: LocalOpDeps, streamId: string): void {
  if (deps.state.authInFlight && deps.state.authInFlight.streamId === streamId) {
    deps.state.authInFlight.controller.cancel();
    // Clear the slot synchronously so a back-to-back start doesn't trip
    // the busy guard during the SIGTERM-to-exit window (~50–100ms). The
    // `controller.done.finally` hook will fire later but no-ops because
    // it streamId-checks against the (now-different or null) slot.
    deps.state.authInFlight = null;
  }
}

/** Handler for `ok:local-op:clone:start`. */
export function handleCloneStart(
  deps: LocalOpDeps,
  sender: SendableWebContents,
  request: { url: string; dir: string },
): { ok: true; streamId: string } | { ok: false; error: string } {
  if (deps.state.cloneInFlight) {
    return { ok: false, error: 'A clone operation is already in progress' };
  }
  const validation = validateCloneInputs(request.url, request.dir);
  if (!validation.ok) {
    return {
      ok: false,
      error:
        validation.reason === 'invalid-url'
          ? 'URL protocol not allowed'
          : 'dir must be within the user home directory',
    };
  }
  const streamId = randomUUID();
  const controller = runCloneSubprocess({
    cliArgs: deps.resolveCliArgs(),
    url: request.url,
    dir: request.dir,
    onEvent: (event) => {
      if (!sender.isDestroyed?.()) {
        sendToRenderer(sender, 'ok:local-op:clone:event', { streamId, event });
      }
    },
  });
  deps.state.cloneInFlight = { streamId, controller };
  void controller.done.finally(() => {
    if (deps.state.cloneInFlight?.streamId === streamId) {
      deps.state.cloneInFlight = null;
    }
  });
  return { ok: true, streamId };
}

/** Handler for `ok:local-op:clone:cancel`. */
export function handleCloneCancel(deps: LocalOpDeps, streamId: string): void {
  if (deps.state.cloneInFlight && deps.state.cloneInFlight.streamId === streamId) {
    deps.state.cloneInFlight.controller.cancel();
    // Clear synchronously — see auth-cancel for rationale.
    deps.state.cloneInFlight = null;
  }
}

/**
 * Handler for `ok:local-op:auth:status`. One-shot — spawns the CLI, waits
 * for completion, returns the parsed status response. No streaming surface
 * because the CLI emits a single line then exits.
 */
export function handleAuthStatus(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthStatusResponse> {
  return runAuthStatusSubprocess({
    cliArgs: deps.resolveCliArgs(),
    host: request?.host,
  });
}

/**
 * Handler for `ok:local-op:auth:repos`. One-shot — spawns the CLI, waits
 * for the bounded repo list, returns it.
 */
export function handleAuthRepos(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthReposResponse> {
  return runAuthReposSubprocess({
    cliArgs: deps.resolveCliArgs(),
    host: request?.host,
  });
}
