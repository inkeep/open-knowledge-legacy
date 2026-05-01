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

import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

type ClonePhase = 'receiving' | 'resolving' | 'checking' | 'init' | 'done' | string;

/**
 * Union of CloneEvent shapes across both transports. The HTTP `complete`
 * carries `port` (and optional `dir`); the IPC `complete` carries only
 * `dir`. Renderer consumers branch on presence at the dispatch site.
 */
type CloneEvent =
  | { type: 'progress'; phase: ClonePhase; pct: number }
  | { type: 'complete'; port?: number; dir?: string }
  | { type: 'error'; message: string };

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
      const ac = new AbortController();
      const buffer: CloneEvent[] = [];
      const waiters: ((e: CloneEvent | null) => void)[] = [];
      let terminated = false;

      const push = (event: CloneEvent): void => {
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
          const res = await fetch('/api/local-op/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: request.url, dir: request.dir || undefined }),
            signal: ac.signal,
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
            if (terminated) break;
          }
          if (!terminated) {
            push({
              type: 'error',
              message: 'Clone stream ended unexpectedly — check if the clone completed',
            });
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            terminated = true;
            for (const w of waiters.splice(0)) w(null);
            return;
          }
          push({ type: 'error', message: 'Clone failed — connection error' });
        }
      })();

      const events: AsyncIterable<CloneEvent> = {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<CloneEvent>> {
              if (buffer.length > 0) {
                const value = buffer.shift();
                if (value === undefined) return { value: undefined, done: true };
                return { value, done: false };
              }
              if (terminated) return { value: undefined, done: true };
              return new Promise<IteratorResult<CloneEvent>>((resolve) => {
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
 * IPC transport — wraps `bridge.localOp.clone.start()`. The IPC stream
 * already exposes the right async-iterable shape; this just narrows the
 * event union.
 */
export function ipcCloneTransport(bridge: OkDesktopBridge): CloneTransport {
  return {
    start(request): CloneTransportHandle {
      const stream = bridge.localOp.clone.start(request);
      return {
        events: stream.events as AsyncIterable<CloneEvent>,
        cancel: stream.cancel,
      };
    },
  };
}
