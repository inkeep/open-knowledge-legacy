import type { EventChannels } from './ipc-events.ts';

export interface SendableWebContents {
  send(channel: string, ...args: unknown[]): void;
  isDestroyed?(): boolean;
}

export function sendToRenderer<K extends keyof EventChannels>(
  webContents: SendableWebContents,
  channel: K,
  payload: EventChannels[K]['payload'],
): void {
  webContents.send(channel, payload);
}
