/**
 * Typed `webContents.send` wrapper (main-side push-event dispatch).
 *
 * Consumers: any `src/main/*` module that needs to fire a push event to the
 * renderer (project-switched, menu-action, git-init-notice, ...). D19 Biome /
 * CI grep rule forbids raw `webContents.send` outside allowlisted IPC wrapper
 * files; this helper is the canonical path.
 *
 * Paired with `EventChannels` in `./ipc-events.ts` for channel-name + payload
 * type consistency. Subscription-side lives in the preload bridge
 * (`onProjectSwitched`, `onMenuAction`, `onGitInitNotice`).
 */

import type { EventChannels } from './ipc-events.ts';

/** Minimal shape of `electron.WebContents` we use for push events. */
export interface SendableWebContents {
  send(channel: string, ...args: unknown[]): void;
}

/**
 * Type-safe `webContents.send` — the channel determines the payload shape.
 *
 * Usage:
 * ```ts
 * sendToRenderer(window.webContents, 'ok:git-init-notice', { gitDir });
 * ```
 */
export function sendToRenderer<K extends keyof EventChannels>(
  webContents: SendableWebContents,
  channel: K,
  payload: EventChannels[K]['payload'],
): void {
  webContents.send(channel, payload);
}
