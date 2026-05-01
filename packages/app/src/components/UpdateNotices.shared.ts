
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export const TOAST_A_BODY = 'Update ready';
export const TOAST_A_ACTION = 'Relaunch';
export const TOAST_B_ACTION = 'Release notes';
export const TOAST_C_BODY = 'Updates paused';
export const TOAST_C_ACTION = 'Download';

export const TOAST_A_ERROR_BODY = 'Relaunch failed — please restart manually';

export function toastBBody(version: string): string {
  return `Updated to v${version}`;
}

export interface UpdateNotice {
  id: string;
  body: string;
  action?: { label: string; onClick: () => void };
  variant?: 'info' | 'error';
  priority: number;
}

const PRIORITY_STUCK_HINT = 0;
const PRIORITY_RELAUNCH_ERROR = 1;
const PRIORITY_UPDATE_DOWNLOADED = 2;
const PRIORITY_WHATS_NEW = 3;

type AddNoticeFn = (notice: UpdateNotice) => void;

type DismissNoticeFn = (id: string) => void;

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
