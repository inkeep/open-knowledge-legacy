/**
 * M3 UpdateToast — renderer side of the auto-updater toast surface.
 *
 * Side-effect component: renders `null` (no visible DOM), subscribes to the
 * three `window.okDesktop` update events at mount, and fires sonner toasts
 * in response. Main-process gates (`AppState.versionPendingInstall`,
 * `lastSeenVersion`, `stuckHintShown`) guarantee each toast fires at most
 * once per relevant transition — but we pass an `id` per sonner call as a
 * second-line defense against duplicate dispatches.
 *
 * Spec: specs/2026-04-21-m3-electron-updater/SPEC.md §5 AC6, AC7, AC17, AC18.
 * Decisions: D3 revised (3 toasts with "Relaunch now" action), D9 (Toast B
 * bare-string + link), D11 (duration: Infinity), D12 (Toast C stuck-hint).
 *
 * Web / CLI distribution: `window.okDesktop` is undefined; the effect no-ops
 * and no subscriptions are attached.
 */

import { useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

/**
 * Canonical copy strings. Centralized so tests can assert exact values and
 * future copy tweaks happen in one place. D3 / D9 / D12.
 */
export const TOAST_A_BODY = 'Update downloaded';
export const TOAST_A_ACTION = 'Relaunch now';
export const TOAST_B_ACTION = "See what's new";
export const TOAST_C_BODY =
  'This app may not be receiving updates. Visit inkeep.com/open-knowledge/download to install a fresh copy.';
export const TOAST_C_ACTION = 'Open download page';

/** Toast B body copy for a given version — `"Updated to v${version} — see what's new"`. */
export function toastBBody(version: string): string {
  return `Updated to v${version} — see what's new`;
}

/**
 * Minimal sonner-compatible toast function shape. Extracted so the pure
 * subscription logic in `attachUpdateSubscribers` can be unit-tested with a
 * mock without invoking sonner's DOM side-effects.
 */
export type ToastFn = (body: string, opts: ToastOpts) => void;

export interface ToastOpts {
  duration: number;
  id: string;
  action: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Pure subscription logic. Attach the three update subscribers on the given
 * bridge + return a single unsubscribe closure that detaches all of them.
 * Testable without a React renderer or sonner — accepts a toast fn stub.
 */
export function attachUpdateSubscribers(bridge: OkDesktopBridge, toast: ToastFn): () => void {
  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    bridge.onUpdateDownloaded(({ version }) => {
      toast(TOAST_A_BODY, {
        duration: Number.POSITIVE_INFINITY,
        id: `update-downloaded-${version}`,
        action: {
          label: TOAST_A_ACTION,
          onClick: () => {
            void bridge.update.relaunchNow();
          },
        },
      });
    }),
  );

  unsubscribers.push(
    bridge.onWhatsNew(({ version, releaseUrl }) => {
      toast(toastBBody(version), {
        duration: Number.POSITIVE_INFINITY,
        id: `whats-new-${version}`,
        action: {
          label: TOAST_B_ACTION,
          onClick: () => {
            void bridge.shell.openExternal(releaseUrl);
          },
        },
      });
    }),
  );

  unsubscribers.push(
    bridge.onUpdateStuckHint(({ downloadUrl }) => {
      toast(TOAST_C_BODY, {
        duration: Number.POSITIVE_INFINITY,
        id: 'update-stuck-hint',
        action: {
          label: TOAST_C_ACTION,
          onClick: () => {
            void bridge.shell.openExternal(downloadUrl);
          },
        },
      });
    }),
  );

  return () => {
    for (const off of unsubscribers) off();
  };
}

/**
 * Mount-once side-effect component. Renders null; its only job is to call
 * `attachUpdateSubscribers` with the window bridge + sonner's `toast` fn on
 * mount, and cleanup on unmount. Mount inside the `<Toaster />` scope so
 * toasts render in the same root.
 */
export function UpdateToast(): null {
  useEffect(() => {
    const bridge = window.okDesktop;
    if (!bridge) return;
    return attachUpdateSubscribers(bridge, (body, opts) => {
      sonnerToast(body, opts);
    });
  }, []);

  return null;
}
