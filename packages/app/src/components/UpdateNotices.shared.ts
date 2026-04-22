/**
 * UpdateNotices — pure subscription logic + canonical copy strings.
 *
 * Split out of `UpdateNotices.tsx` so the module-level store (`lib/update-
 * notices-store.ts`) can import it WITHOUT pulling in the React component
 * module (which would create an import cycle). The component module
 * imports these same exports for backward-compatible test visibility.
 *
 * Spec: specs/2026-04-21-m3-electron-updater/SPEC.md §5 AC6, AC7, AC17, AC18.
 * Decisions: D3 / D9 / D11 / D12.
 */

import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

/**
 * Canonical copy strings. D3 / D9 / D12 revised post-M3 manual-smoke
 * UX review — tightened to single-card / minimal-wording shape, with
 * priority-based display (C > A > B; at most one active at a time).
 * SPEC §13 ASK_FIRST previously locked the original strings; this
 * revision was explicitly approved by the spec owner.
 */
export const TOAST_A_BODY = 'Update ready';
export const TOAST_A_ACTION = 'Relaunch';
export const TOAST_B_ACTION = 'Release notes';
export const TOAST_C_BODY = 'Updates paused';
export const TOAST_C_ACTION = 'Download';

/**
 * Fallback notice shown when `bridge.update.relaunchNow()` IPC rejects —
 * wrong packaging, missing staging dir, Squirrel.Mac throwing. Without
 * this, the "Relaunch now" click would do nothing visible. Major #3 —
 * give the user a recovery path.
 */
export const TOAST_A_ERROR_BODY = 'Relaunch failed — please restart manually';

/**
 * Toast B body copy for a given version. Version is interpolated raw —
 * intentionally asymmetric with `releaseUrlFor` in `auto-updater.ts` which
 * percent-encodes. `version` comes from `app.getVersion()` (trusted), and
 * React renders it into a text node (XSS-safe). URL encoding at the URL
 * surface only. Do not "fix" the asymmetry.
 *
 * Revised to minimal form per post-M3 UX review (was
 * `"Updated to v${version} — see what's new"` — the "see what's new"
 * suffix duplicated the action-button label).
 */
export function toastBBody(version: string): string {
  return `Updated to v${version}`;
}

/**
 * Public shape of a single rendered notice. `id` provides dedup across
 * repeat dispatches. `variant: 'error'` renders with a destructive-styled
 * border; the only caller today is the relaunch-failed fallback.
 *
 * `priority` drives single-card display: when multiple notices are armed,
 * the lowest-priority number wins (rendered alone). Lower = more urgent.
 */
export interface UpdateNotice {
  id: string;
  body: string;
  action?: { label: string; onClick: () => void };
  variant?: 'info' | 'error';
  priority: number;
}

/**
 * Priority scheme (lower = more urgent, shown first):
 *   0 — stuck-hint (C): "updates broken, do something"
 *   1 — relaunch-error: error follow-up to A's Relaunch click
 *   2 — update-downloaded (A): "newer version ready, install it"
 *   3 — whats-new (B): "you just updated"
 */
const PRIORITY_STUCK_HINT = 0;
const PRIORITY_RELAUNCH_ERROR = 1;
const PRIORITY_UPDATE_DOWNLOADED = 2;
const PRIORITY_WHATS_NEW = 3;

/**
 * Testable seam — production wires this to the module-level store's
 * `addNotice`; tests pass a capturing stub. Idempotent on id collision
 * (update-in-place).
 */
export type AddNoticeFn = (notice: UpdateNotice) => void;

/**
 * Testable seam for dismissing a notice by id from outside the store.
 * Used by the Toast A onClick handler to remove the card the moment
 * `relaunchNow()` resolves — gives visible feedback in dev (where
 * `quitAndInstall` is a no-op) and is a harmless no-op in production
 * (the app is about to quit anyway, taking the card with it).
 */
export type DismissNoticeFn = (id: string) => void;

/**
 * Pure subscription logic. Attach the three update subscribers on the
 * given bridge + return a single unsubscribe closure that detaches all
 * of them. Testable without a React renderer — accepts an `addNotice`
 * stub.
 *
 * Major #3: the Toast A "Relaunch now" onClick awaits
 * `bridge.update.relaunchNow()` and surfaces an error notice on
 * rejection. `shell.openExternal` calls stay fire-and-forget — their URLs
 * are hardcoded in main and pass the D47 allowlist by construction.
 */
export function attachUpdateSubscribers(
  bridge: OkDesktopBridge,
  addNotice: AddNoticeFn,
  dismissNotice: DismissNoticeFn = () => {},
): () => void {
  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    bridge.onUpdateDownloaded(({ version }) => {
      const noticeId = `update-downloaded-${version}`;
      addNotice({
        id: noticeId,
        body: TOAST_A_BODY,
        priority: PRIORITY_UPDATE_DOWNLOADED,
        action: {
          label: TOAST_A_ACTION,
          onClick: () => {
            bridge.update.relaunchNow().then(
              () => {
                // Production: main quits the app before this resolves, so
                // the dismiss is a no-op (window dies with the app).
                // Dev: quitAndInstall silently no-ops in MacUpdater because
                // Squirrel.Mac can't replace an unpackaged `.app`, so the
                // app stays running — dismissing the card gives the user
                // visible feedback that their click was received.
                dismissNotice(noticeId);
              },
              () => {
                addNotice({
                  id: `relaunch-error-${version}`,
                  body: TOAST_A_ERROR_BODY,
                  variant: 'error',
                  priority: PRIORITY_RELAUNCH_ERROR,
                });
              },
            );
          },
        },
      });
    }),
  );

  unsubscribers.push(
    bridge.onWhatsNew(({ version, releaseUrl }) => {
      addNotice({
        id: `whats-new-${version}`,
        body: toastBBody(version),
        priority: PRIORITY_WHATS_NEW,
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
      addNotice({
        id: 'update-stuck-hint',
        body: TOAST_C_BODY,
        priority: PRIORITY_STUCK_HINT,
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
