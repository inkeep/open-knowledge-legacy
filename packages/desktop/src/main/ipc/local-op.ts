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

const MAX_CONCURRENT_AUTH_QUERIES = 4;

interface LocalOpHandlerState {
  authInFlight: InFlightAuth | null;
  cloneInFlight: InFlightClone | null;
  authStatusInFlight: Map<string, Promise<AuthStatusResponse>>;
  authReposInFlight: Map<string, Promise<AuthReposResponse>>;
}

export function createLocalOpState(): LocalOpHandlerState {
  return {
    authInFlight: null,
    cloneInFlight: null,
    authStatusInFlight: new Map(),
    authReposInFlight: new Map(),
  };
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

const DEFAULT_AUTH_QUERY_HOST = 'github.com';

function runCoalescedAuthQuery<T>(
  inFlight: Map<string, Promise<T>>,
  host: string,
  spawn: () => Promise<T>,
  tooManyError: (host: string) => T,
): Promise<T> {
  const existing = inFlight.get(host);
  if (existing) return existing;
  if (inFlight.size >= MAX_CONCURRENT_AUTH_QUERIES) {
    return Promise.resolve(tooManyError(host));
  }
  const promise = spawn().finally(() => {
    inFlight.delete(host);
  });
  inFlight.set(host, promise);
  return promise;
}

export function handleAuthStatus(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthStatusResponse> {
  const host = request?.host ?? DEFAULT_AUTH_QUERY_HOST;
  return runCoalescedAuthQuery(
    deps.state.authStatusInFlight,
    host,
    () =>
      runAuthStatusSubprocess({
        cliArgs: deps.resolveCliArgs(),
        host: request?.host,
      }),
    (h) => ({
      authenticated: false,
      host: h,
      error: 'too many concurrent auth status queries',
    }),
  );
}

export function handleAuthRepos(
  deps: LocalOpDeps,
  request?: { host?: string },
): Promise<AuthReposResponse> {
  const host = request?.host ?? DEFAULT_AUTH_QUERY_HOST;
  return runCoalescedAuthQuery(
    deps.state.authReposInFlight,
    host,
    () =>
      runAuthReposSubprocess({
        cliArgs: deps.resolveCliArgs(),
        host: request?.host,
      }),
    () => ({
      ok: false,
      error: 'too many concurrent auth repos queries',
    }),
  );
}
