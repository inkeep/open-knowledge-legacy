
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
  resolveCliArgs: () => readonly string[];
  state: LocalOpHandlerState;
}

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

export function handleAuthCancel(deps: LocalOpDeps, streamId: string): void {
  if (deps.state.authInFlight && deps.state.authInFlight.streamId === streamId) {
    deps.state.authInFlight.controller.cancel();
    deps.state.authInFlight = null;
  }
}

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

export function handleCloneCancel(deps: LocalOpDeps, streamId: string): void {
  if (deps.state.cloneInFlight && deps.state.cloneInFlight.streamId === streamId) {
    deps.state.cloneInFlight.controller.cancel();
    deps.state.cloneInFlight = null;
  }
}

export function handleAuthStatus(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthStatusResponse> {
  return runAuthStatusSubprocess({
    cliArgs: deps.resolveCliArgs(),
    host: request?.host,
  });
}

export function handleAuthRepos(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthReposResponse> {
  return runAuthReposSubprocess({
    cliArgs: deps.resolveCliArgs(),
    host: request?.host,
  });
}
