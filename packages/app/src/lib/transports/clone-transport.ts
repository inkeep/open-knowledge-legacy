import type { OkDesktopBridge, OkLocalOpCloneEvent } from '@/lib/desktop-bridge-types';
import { createBufferedAsyncStream } from './buffered-async-stream';

type HttpCloneCompleteEvent = { type: 'complete'; port: number; dir: string };

type CloneEvent = OkLocalOpCloneEvent | HttpCloneCompleteEvent;

interface CloneTransportHandle {
  readonly events: AsyncIterable<CloneEvent>;
  cancel(): void;
}

export interface CloneTransport {
  start(request: { url: string; dir: string }): CloneTransportHandle;
}

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
                } catch {}
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

export function ipcCloneTransport(bridge: OkDesktopBridge): CloneTransport {
  return {
    start(request): CloneTransportHandle {
      return bridge.localOp.clone.start(request);
    },
  };
}
