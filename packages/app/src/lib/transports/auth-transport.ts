/**
 * Transport abstraction for the GitHub device-flow auth UI.
 *
 * Two implementations:
 *   - `httpAuthTransport` — wraps `fetch('/api/local-op/auth/login')` +
 *     `consumeAuthEventStream` (the existing path). Default for editor
 *     windows + web distribution.
 *   - `ipcAuthTransport` — wraps `bridge.localOp.auth.start()`. Used by
 *     the Project Navigator window where there is no backing API server
 *     (apiOrigin is empty).
 *
 * The `AuthModal` component accepts a `transport` prop; the default is
 * the HTTP transport so existing editor callers don't change. Navigator
 * passes the IPC transport explicitly.
 */

import { consumeAuthEventStream } from '@/components/auth-event-stream';
import type { OkDesktopBridge, OkLocalOpAuthEvent } from '@/lib/desktop-bridge-types';
import { createBufferedAsyncStream } from './buffered-async-stream';

/**
 * Auth event shape — both transports emit the same union, so we re-use the
 * bridge type as the canonical source. Server-side definition lives at
 * `packages/server/src/local-ops/types.ts` and is mirrored into the bridge
 * triplet (core / desktop / app), drift-caught at compile time by
 * `packages/desktop/tests/unit/bridge-contract-types.test.ts`.
 */
type AuthEvent = OkLocalOpAuthEvent;

interface AuthTransportHandle {
  /** Async iterable of events. Iteration ends after `complete` / `error` / `cancel()`. */
  readonly events: AsyncIterable<AuthEvent>;
  /** Cancel the in-flight flow. Idempotent. */
  cancel(): void;
}

export interface AuthTransport {
  /** Start a new device-flow login. */
  start(): AuthTransportHandle;
}

/**
 * HTTP transport — wraps `fetch('/api/local-op/auth/login')` and the
 * existing NDJSON line reader. Identical wire shape to the editor-window
 * path; safe to swap in here.
 */
export function httpAuthTransport(): AuthTransport {
  return {
    start(): AuthTransportHandle {
      return createBufferedAsyncStream<AuthEvent>((push, signal) => {
        void (async () => {
          try {
            const res = await fetch('/api/local-op/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ json: true }),
              signal,
            });
            if (!res.ok || !res.body) {
              push({ type: 'error', message: 'Failed to start sign-in — try again' });
              return;
            }
            const terminatedByEvent = await consumeAuthEventStream(
              res.body,
              (line): 'terminal' | 'continue' => {
                try {
                  const event = JSON.parse(line) as AuthEvent;
                  push(event);
                  if (event.type === 'complete' || event.type === 'error') return 'terminal';
                } catch {
                  /* ignore malformed line */
                }
                return 'continue';
              },
            );
            if (!terminatedByEvent && !signal.aborted) {
              push({
                type: 'error',
                message: 'Sign-in stream ended without confirmation — please try again',
              });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            push({ type: 'error', message: 'Connection error — try again' });
          }
        })();
      });
    },
  };
}

/**
 * IPC transport — wraps `bridge.localOp.auth.start()`. The bridge stream's
 * event type IS this transport's event type, so no adaptation is needed.
 */
export function ipcAuthTransport(bridge: OkDesktopBridge): AuthTransport {
  return {
    start(): AuthTransportHandle {
      return bridge.localOp.auth.start();
    },
  };
}
