import {
  assertNeverUrnIpcLookup,
  buildCursorUrl,
  type HandoffOutcome,
  type HandoffPayload,
  type IpcChannelReason,
  lookupUrnInRegistry,
  ProblemDetailsSchema,
} from '@inkeep/open-knowledge-core';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

export const CURSOR_SETTLE_MS_WARM = 1000;
export const CURSOR_SETTLE_MS_COLD = 1500;

type SpawnCursorReason = IpcChannelReason<'ok:shell:spawn-cursor'>;

type SpawnCursorOutcome = { ok: true } | { ok: false; reason: SpawnCursorReason };

type SpawnCursor = (path: string) => Promise<SpawnCursorOutcome>;

export interface DispatchCursorDeps {
  readonly spawnCursor?: SpawnCursor;
  readonly isCursorRunning?: () => Promise<boolean>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly openExternalDeps?: OpenExternalDeps;
  readonly fetch?: typeof globalThis.fetch;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFetchSpawnCursor(fetchImpl: typeof globalThis.fetch): SpawnCursor {
  return async (path) => {
    let res: Response;
    try {
      res = await fetchImpl('/api/spawn-cursor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
    } catch {
      return { ok: false, reason: 'spawn-error' };
    }
    if (res.status === 200) {
      return { ok: true };
    }
    if (res.status === 404) {
      return { ok: false, reason: 'not-installed' };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'spawn-error' };
    }
    const parsed = ProblemDetailsSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, reason: 'spawn-error' };
    }
    return mapProblemTypeToReason(parsed.data.type);
  };
}

function mapProblemTypeToReason(type: string): { ok: false; reason: SpawnCursorReason } {
  const lookup = lookupUrnInRegistry(type, 'ok:shell:spawn-cursor');
  switch (lookup.kind) {
    case 'mapped':
      return { ok: false, reason: lookup.reason };
    case 'http-only':
    case 'unknown':
      return { ok: false, reason: 'spawn-error' };
    default:
      return assertNeverUrnIpcLookup(lookup);
  }
}

function resolveSpawnCursor(
  deps: Pick<DispatchCursorDeps, 'spawnCursor' | 'fetch'>,
): SpawnCursor | undefined {
  if (deps.spawnCursor) return deps.spawnCursor;
  const electronImpl =
    typeof window !== 'undefined' ? window.okDesktop?.shell.spawnCursor : undefined;
  if (electronImpl) return electronImpl;
  const fetchImpl =
    deps.fetch ?? (typeof globalThis !== 'undefined' ? globalThis.fetch : undefined);
  if (fetchImpl) return createFetchSpawnCursor(fetchImpl);
  return undefined;
}

export async function dispatchCursor(
  payload: HandoffPayload,
  deps: DispatchCursorDeps = {},
): Promise<HandoffOutcome> {
  const spawnCursor = resolveSpawnCursor(deps);
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

function assertNeverSpawnFailureReason(value: never): never {
  throw new Error(`Unhandled cursor SpawnFailureReason: ${JSON.stringify(value)}`);
}

function mapSpawnFailure(reason: SpawnCursorReason): HandoffOutcome {
  switch (reason) {
    case 'not-installed':
      return { ok: false, reason: 'not-installed', detail: 'cursor binary not found' };
    case 'invalid-path':
      return { ok: false, reason: 'invalid-payload', detail: 'cursor spawn: invalid path' };
    case 'timeout':
      return { ok: false, reason: 'dispatch-error', detail: 'cursor spawn: timeout' };
    case 'spawn-error':
      return { ok: false, reason: 'dispatch-error', detail: 'cursor spawn: spawn-error' };
    default:
      return assertNeverSpawnFailureReason(reason);
  }
}
