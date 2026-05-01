/**
 * Transport abstraction for the git-clone UI.
 *
 * Two implementations:
 *   - `httpCloneTransport` — wraps `fetch('/api/local-op/clone')` (the
 *     existing path). The HTTP relay chains clone → server-start →
 *     emits `{type:'complete', port, dir}`. Default for editor windows
 *     and web distribution.
 *   - `ipcCloneTransport` — wraps `bridge.localOp.clone.start()`. The
 *     IPC path emits `{type:'complete', dir}` (no port — Electron main
 *     spawns a new editor window directly at `dir`).
 */

import type { OkDesktopBridge, OkLocalOpCloneEvent } from '@/lib/desktop-bridge-types';
import { createBufferedAsyncStream } from './buffered-async-stream';

/**
 * HTTP-relay-only complete variant. The relay intercepts the CLI's
 * `{type:'complete', dir}` (= `OkLocalOpCloneEvent` complete) and chains
 * `startServerAtDirAndGetPort` to add `port` before forwarding. IPC has
 * no port — Electron main spawns a new editor window directly at `dir`.
 */
type HttpCloneCompleteEvent = { type: 'complete'; port: number; dir: string };

/**
 * Union spans both transports' shapes. IPC half is the canonical bridge
 * type — drift-caught at compile time. HTTP half adds `port`. Both
 * `complete` variants carry `dir: string`, so consumers always have it.
 */
type CloneEvent = OkLocalOpCloneEvent | HttpCloneCompleteEvent;

interface CloneTransportHandle {
  readonly events: AsyncIterable<CloneEvent>;
  cancel(): void;
}

export interface CloneTransport {
  start(request: { url: string; dir: string }): CloneTransportHandle;
}

/**
 * HTTP transport — wraps the existing fetch('/api/local-op/clone') NDJSON
 * stream reader.
 */
export function httpCloneTransport(): CloneTransport {
  return {
    start(request): CloneTransportHandle {
      return createBufferedAsyncStream<CloneEvent>((push, signal) => {
        void (async () => {
          try {
            const res = await fetch('/api/local-op/clone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: request.url, dir: request.dir || undefined }),
              signal,
            });
            if (!res.ok || !res.body) {
              push({ type: 'error', message: 'Clone failed — check the URL and try again' });
              return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let leftover = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              leftover += decoder.decode(value, { stream: true });
              const lines = leftover.split('\n');
              leftover = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  push(JSON.parse(line) as CloneEvent);
                } catch {
                  /* ignore malformed line */
                }
              }
              if (signal.aborted) break;
            }
            if (!signal.aborted) {
              push({
                type: 'error',
                message: 'Clone stream ended unexpectedly — check if the clone completed',
              });
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            push({ type: 'error', message: 'Clone failed — connection error' });
          }
        })();
      });
    },
  };
}

/**
 * IPC transport — wraps `bridge.localOp.clone.start()`. The bridge stream's
 * `OkLocalOpCloneEvent` is a member of `CloneEvent`, so the handle is
 * assignable directly without an adapter.
 */
export function ipcCloneTransport(bridge: OkDesktopBridge): CloneTransport {
  return {
    start(request): CloneTransportHandle {
      return bridge.localOp.clone.start(request);
    },
  };
}
