import type { EventChannels } from './ipc-events.ts';

export interface SendableWebContents {
  send(channel: string, ...args: unknown[]): void;
  /** Optional — real `WebContents` always has it, but test fakes can omit.
   *  Streaming senders use it to skip `send()` after window close (which
   *  throws and crashes main). Mirrors the pattern in `window-manager.ts`. */
  isDestroyed?(): boolean;
}

export function sendToRenderer<K extends keyof EventChannels>(
  webContents: SendableWebContents,
  channel: K,
  payload: EventChannels[K]['payload'],
): void {
  webContents.send(channel, payload);
}
