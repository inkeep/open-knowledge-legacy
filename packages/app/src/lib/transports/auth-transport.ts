import { consumeAuthEventStream } from '@/components/auth-event-stream';
import type { OkDesktopBridge, OkLocalOpAuthEvent } from '@/lib/desktop-bridge-types';
import { createBufferedAsyncStream } from './buffered-async-stream';

type AuthEvent = OkLocalOpAuthEvent;

interface AuthTransportHandle {
  readonly events: AsyncIterable<AuthEvent>;
  cancel(): void;
}

export interface AuthTransport {
  start(): AuthTransportHandle;
}

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
                } catch {}
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

export function ipcAuthTransport(bridge: OkDesktopBridge): AuthTransport {
  return {
    start(): AuthTransportHandle {
      return bridge.localOp.auth.start();
    },
  };
}
