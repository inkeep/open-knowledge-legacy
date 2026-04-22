/**
 * Main-side debug IPC relay (M5 US-004).
 *
 * Renderer invokes `ok:debug:keyring-smoke` via the bridge; this module:
 *   1. Gates on runtime config (D-M5-7) — refuses when the app is packaged
 *      AND `OK_DEBUG_KEYRING_SMOKE` is unset.
 *   2. Looks up the calling window's utility via the injected resolver.
 *   3. Generates a correlation id, posts `debug-keyring-smoke` to the utility,
 *      and awaits the matching `debug-keyring-smoke-result`.
 *   4. Manages per-correlation-id timeout + cleanup so the pending Map never
 *      leaks on timeout or utility death.
 *
 * `handleUtilityMessage(msg)` is called by the window-manager's persistent
 * message listener — it dispatches completion to the pending Map entry.
 */

import { randomUUID } from 'node:crypto';
import type {
  KeyringSmokeResult,
  UtilityDebugKeyringSmokeResultMessage,
} from '../utility/server-entry.ts';

type UtilityLike = {
  postMessage(msg: unknown): void;
};

interface PendingRequest {
  resolve: (result: KeyringSmokeResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface DebugIpcDeps {
  /**
   * Resolve the utility process for the renderer that issued the invoke. The
   * main-side handler calls this with the invoke event's `event.sender`
   * (webContents); the resolver looks up the originating ProjectContext.
   *
   * Returns `null` when the sender has no attached utility (attach-mode
   * window, navigator window, or a window that was closed between invoke and
   * handler dispatch).
   */
  resolveUtility: (sender: unknown) => UtilityLike | null;
  /**
   * Runtime gate — returns true when the debug channel is allowed. Production
   * default: `!app.isPackaged || process.env.OK_DEBUG_KEYRING_SMOKE === '1'`.
   */
  isDebugAllowed: () => boolean;
  /** Timeout for a pending smoke request (ms). Default 10000. */
  timeoutMs?: number;
  /** Test-injectable RNG. Default `crypto.randomUUID`. */
  generateCorrelationId?: () => string;
}

export interface DebugIpcHandle {
  /**
   * Invoked by the main-side IPC handler wrapper (via createHandler). Runs
   * the full gate → post → await pipeline and returns the KeyringSmokeResult.
   */
  requestKeyringSmoke(sender: unknown): Promise<KeyringSmokeResult>;
  /**
   * Called by window-manager's persistent utility-message listener. Dispatches
   * a `debug-keyring-smoke-result` to its matching pending request. Unknown
   * correlation ids are silently dropped (the pending entry may have timed
   * out before the utility replied).
   */
  handleUtilityMessage(msg: unknown): void;
  /**
   * Number of in-flight requests. Exposed for tests to assert leak-free
   * behavior on timeout.
   */
  pendingSize(): number;
}

export function createDebugIpc(deps: DebugIpcDeps): DebugIpcHandle {
  const pending = new Map<string, PendingRequest>();
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const genId = deps.generateCorrelationId ?? randomUUID;

  function settle(
    correlationId: string,
    outcome: { kind: 'ok'; result: KeyringSmokeResult } | { kind: 'err'; err: Error },
  ): void {
    const entry = pending.get(correlationId);
    if (!entry) return;
    pending.delete(correlationId);
    clearTimeout(entry.timer);
    if (outcome.kind === 'ok') {
      entry.resolve(outcome.result);
    } else {
      entry.reject(outcome.err);
    }
  }

  async function requestKeyringSmoke(sender: unknown): Promise<KeyringSmokeResult> {
    if (!deps.isDebugAllowed()) {
      throw new Error('debug-channel disabled in production');
    }
    const utility = deps.resolveUtility(sender);
    if (!utility) {
      throw new Error('debug-keyring-smoke: no utility process attached to this window');
    }
    const correlationId = genId();
    return new Promise<KeyringSmokeResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        settle(correlationId, {
          kind: 'err',
          err: new Error(`debug-keyring-smoke: timed out after ${timeoutMs}ms`),
        });
      }, timeoutMs);
      pending.set(correlationId, { resolve, reject, timer });
      try {
        utility.postMessage({ type: 'debug-keyring-smoke', correlationId });
      } catch (err) {
        settle(correlationId, { kind: 'err', err: err as Error });
      }
    });
  }

  function handleUtilityMessage(msg: unknown): void {
    const typed = msg as Partial<UtilityDebugKeyringSmokeResultMessage> | null | undefined;
    if (!typed || typed.type !== 'debug-keyring-smoke-result') return;
    if (typeof typed.correlationId !== 'string' || !typed.result) return;
    settle(typed.correlationId, { kind: 'ok', result: typed.result });
  }

  return {
    requestKeyringSmoke,
    handleUtilityMessage,
    pendingSize: () => pending.size,
  };
}
