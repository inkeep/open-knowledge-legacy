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
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

/** Mirrors `AuthEvent` in `@inkeep/open-knowledge-server`. */
type AuthEvent =
  | {
      type: 'verification';
      user_code: string;
      verification_uri: string;
      expires_in: number;
    }
  | {
      type: 'complete';
      host?: string;
      login: string;
      name?: string;
      email?: string;
      avatarUrl?: string;
    }
  | { type: 'error'; message: string };

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
      const ac = new AbortController();
      const buffer: AuthEvent[] = [];
      const waiters: ((e: AuthEvent | null) => void)[] = [];
      let terminated = false;

      const push = (event: AuthEvent): void => {
        if (terminated) return;
        if (waiters.length > 0) {
          const next = waiters.shift();
          next?.(event);
        } else {
          buffer.push(event);
        }
        if (event.type === 'complete' || event.type === 'error') {
          terminated = true;
          for (const w of waiters.splice(0)) w(null);
        }
      };

      void (async () => {
        try {
          const res = await fetch('/api/local-op/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ json: true }),
            signal: ac.signal,
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
          if (!terminatedByEvent && !terminated) {
            push({
              type: 'error',
              message: 'Sign-in stream ended without confirmation — please try again',
            });
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            terminated = true;
            for (const w of waiters.splice(0)) w(null);
            return;
          }
          push({ type: 'error', message: 'Connection error — try again' });
        }
      })();

      const events: AsyncIterable<AuthEvent> = {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<AuthEvent>> {
              if (buffer.length > 0) {
                const value = buffer.shift();
                if (value === undefined) return { value: undefined, done: true };
                return { value, done: false };
              }
              if (terminated) return { value: undefined, done: true };
              return new Promise<IteratorResult<AuthEvent>>((resolve) => {
                waiters.push((event) => {
                  if (event === null) resolve({ value: undefined, done: true });
                  else resolve({ value: event, done: false });
                });
              });
            },
          };
        },
      };

      return {
        events,
        cancel: () => {
          if (terminated) return;
          terminated = true;
          ac.abort();
          for (const w of waiters.splice(0)) w(null);
        },
      };
    },
  };
}

/**
 * IPC transport — wraps `bridge.localOp.auth.start()`. The bridge already
 * exposes an `OkLocalOpStream` matching this transport's shape; we just
 * adapt the type names.
 */
export function ipcAuthTransport(bridge: OkDesktopBridge): AuthTransport {
  return {
    start(): AuthTransportHandle {
      const stream = bridge.localOp.auth.start();
      // Bridge events have `host` always set on `complete` (server-side
      // type); transport's `host` is optional. The structural shapes
      // overlap so the cast is safe at runtime.
      return {
        events: stream.events as AsyncIterable<AuthEvent>,
        cancel: stream.cancel,
      };
    },
  };
}
