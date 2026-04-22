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
/**
 * Fallback toast shown when `bridge.update.relaunchNow()` IPC rejects
 * synchronously — wrong packaging, missing staging dir, Squirrel.Mac
 * throwing. Without this surface, the original Toast A dismisses (sonner
 * closes on action click) and the user stares at an unchanged app with no
 * feedback. Review Pass 4 Major #3 — surface the failure via a secondary
 * error toast so the user has a recovery path ("please restart manually").
 * `shell.openExternal` is NOT wrapped because its only callers pass URLs
 * hardcoded in main (releaseUrlFor, STUCK_HINT_DOWNLOAD_URL) which are
 * trusted inputs that pass the D47 allowlist by construction.
 */
export const TOAST_A_ERROR_BODY = 'Relaunch failed — please restart manually';

/**
 * Toast B body copy for a given version — `"Updated to v${version} — see what's new"`.
 *
 * Version is interpolated raw here, intentionally asymmetric with
 * `releaseUrlFor` in `auto-updater.ts` which percent-encodes the same
 * input. Rationale: `version` comes from `app.getVersion()` (reads the
 * app's own `package.json`, fully trusted), sonner renders the body into
 * a React text node (XSS-safe by default), and users read display text
 * literally — encoding a malformed version like `1.2.3/..` to `1.2.3%2F..`
 * would be actively worse UX. The URL surface has different semantics:
 * the browser's resolver can path-traverse unencoded segments, so that
 * surface gets defensive encoding. Body-surface trust matches URL-surface
 * trust for this input; do not "fix" the asymmetry.
 */
export function toastBBody(version: string): string {
  return `Updated to v${version} — see what's new`;
}

/**
 * Minimal sonner-compatible toast function shape. Extracted so the pure
 * subscription logic in `attachUpdateSubscribers` can be unit-tested with a
 * mock without invoking sonner's DOM side-effects.
 */
type ToastFn = (body: string, opts: ToastOpts) => void;

/**
 * Sonner error-toast variant — used for the Major #3 relaunch-failed
 * surface. Decoupled from `ToastFn` so tests can assert which variant was
 * called (normal vs error). Production wires both to sonner functions.
 */
type ToastErrorFn = (body: string, opts: { id: string; duration?: number }) => void;

export interface ToastOpts {
  duration: number;
  /**
   * D11 explicitly permits the "built-in dismiss button" — sonner renders
   * this when `closeButton: true` is passed. Without it, a `duration:
   * Infinity` toast has no obvious user-dismissal affordance (swipe
   * exists but is undiscoverable). Review Pass 4 Major #6 scope: add
   * dismiss affordance without changing the SPEC-locked copy.
   */
  closeButton: boolean;
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
 *
 * Review Pass 4 Major #3: the Toast A "Relaunch now" onClick now awaits
 * `bridge.update.relaunchNow()` and surfaces an error toast on rejection so
 * the user has a recovery path when the main-side `quitAndInstall()` throws
 * (wrong packaging, missing staging dir). `shell.openExternal` calls stay
 * as fire-and-forget — their URLs are hardcoded in main and pass the D47
 * allowlist by construction, so rejection is not a realistic failure mode.
 */
export function attachUpdateSubscribers(
  bridge: OkDesktopBridge,
  toast: ToastFn,
  toastError: ToastErrorFn = () => {},
): () => void {
  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    bridge.onUpdateDownloaded(({ version }) => {
      toast(TOAST_A_BODY, {
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        id: `update-downloaded-${version}`,
        action: {
          label: TOAST_A_ACTION,
          onClick: () => {
            // Await the IPC so a synchronous throw (or a promise rejection
            // in the IPC transport) is catchable. Without this, `void
            // bridge.update.relaunchNow()` silently discards the rejection
            // and the user sees no feedback. Major #3 — surface the
            // failure via `toastError` with a retry-friendly id so the
            // user can try again or close the app manually.
            (async () => {
              try {
                await bridge.update.relaunchNow();
              } catch {
                toastError(TOAST_A_ERROR_BODY, {
                  id: `relaunch-error-${version}`,
                  duration: Number.POSITIVE_INFINITY,
                });
              }
            })();
          },
        },
      });
    }),
  );

  unsubscribers.push(
    bridge.onWhatsNew(({ version, releaseUrl }) => {
      toast(toastBBody(version), {
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
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
        closeButton: true,
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
    return attachUpdateSubscribers(
      bridge,
      (body, opts) => {
        sonnerToast(body, opts);
      },
      (body, opts) => {
        sonnerToast.error(body, opts);
      },
    );
  }, []);

  return null;
}
