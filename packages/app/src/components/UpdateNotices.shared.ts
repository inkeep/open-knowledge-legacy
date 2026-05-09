import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export const TOAST_A_ACTION = 'Relaunch';
export const TOAST_B_ACTION = 'Release notes';
export const TOAST_C_BODY = 'Updates paused';
export const TOAST_C_ACTION = 'Download';
export const TOAST_D_ACTION_CONTINUE = 'Continue to Stable';
export const TOAST_D_ACTION_STAY = 'Stay on Beta';
export const TOAST_E_ACTION_RESET = 'Reset and Continue to Stable';
export const TOAST_E_ACTION_STAY = 'Stay on Beta';

export const TOAST_A_ERROR_BODY = 'Relaunch failed — please restart manually';

export const TOAST_D_ERROR_BODY = 'Channel switch failed — please try again';

export const TOAST_E_ERROR_BODY = 'Recovery action failed — please try again';

export function appendErrorDetail(base: string, err: unknown): string {
  const detail = err instanceof Error && err.message ? err.message : '';
  return detail ? `${base}: ${detail}` : base;
}

export function toastABody(version: string): string {
  return `Version ${version} ready to install`;
}

export function toastBBody(version: string): string {
  return `Updated to Version ${version}`;
}

export function toastDBody(currentVersion: string, targetVersion: string): string {
  return `Switching to Stable will replace your current version (${currentVersion}) with the latest stable (${targetVersion}). Some recent settings or data from beta may be lost.`;
}

export function toastEBody(currentBuild: string): string {
  return `Your settings and recent projects were saved by a newer build than this one (v${currentBuild}). Reset to defaults, or stay on Beta to keep them.`;
}

export interface UpdateNotice {
  id: string;
  body: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  variant?: 'info' | 'error';
  priority: number;
}

const PRIORITY_SCHEMA_INCOMPATIBILITY = 0;
const PRIORITY_STUCK_HINT = 0;
const PRIORITY_RELAUNCH_ERROR = 1;
const PRIORITY_DOWNGRADE_WARNING = 1;
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
        body: toastABody(version),
        priority: PRIORITY_UPDATE_DOWNLOADED,
        action: {
          label: TOAST_A_ACTION,
          onClick: () => {
            bridge.update.relaunchNow().then(
              () => {
                dismissNotice(noticeId);
              },
              (err: unknown) => {
                addNotice({
                  id: `relaunch-error-${version}`,
                  body: appendErrorDetail(TOAST_A_ERROR_BODY, err),
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

  unsubscribers.push(
    bridge.onUpdateDowngradeWarning(({ currentVersion, targetVersion }) => {
      const noticeId = `downgrade-warning-${currentVersion}-${targetVersion}`;
      const errorId = `downgrade-error-${currentVersion}-${targetVersion}`;
      const reportError = (err: unknown) => {
        dismissNotice(noticeId);
        addNotice({
          id: errorId,
          body: appendErrorDetail(TOAST_D_ERROR_BODY, err),
          variant: 'error',
          priority: PRIORITY_RELAUNCH_ERROR,
        });
      };
      addNotice({
        id: noticeId,
        body: toastDBody(currentVersion, targetVersion),
        priority: PRIORITY_DOWNGRADE_WARNING,
        action: {
          label: TOAST_D_ACTION_CONTINUE,
          onClick: () => {
            bridge.update.confirmDowngrade().then(() => {
              dismissNotice(noticeId);
            }, reportError);
          },
        },
        secondaryAction: {
          label: TOAST_D_ACTION_STAY,
          onClick: () => {
            bridge.update.setChannel('beta').then(() => {
              dismissNotice(noticeId);
            }, reportError);
          },
        },
      });
    }),
  );

  return () => {
    for (const off of unsubscribers) off();
  };
}

type SchemaIncompatibilityDiagnostic = NonNullable<
  Awaited<ReturnType<OkDesktopBridge['state']['query']>>['schemaIncompatibility']
>;

export function addSchemaIncompatibilityNotice(
  bridge: OkDesktopBridge,
  diagnostic: SchemaIncompatibilityDiagnostic,
  addNotice: AddNoticeFn,
  dismissNotice: DismissNoticeFn = () => {},
): void {
  const noticeId = `schema-incompatibility-${diagnostic.persistedSchemaVersion}`;
  const errorId = `schema-incompatibility-error-${diagnostic.persistedSchemaVersion}`;
  const reportError = (err: unknown) => {
    dismissNotice(noticeId);
    addNotice({
      id: errorId,
      body: appendErrorDetail(TOAST_E_ERROR_BODY, err),
      variant: 'error',
      priority: PRIORITY_SCHEMA_INCOMPATIBILITY,
    });
  };
  addNotice({
    id: noticeId,
    body: toastEBody(diagnostic.currentBuild),
    priority: PRIORITY_SCHEMA_INCOMPATIBILITY,
    action: {
      label: TOAST_E_ACTION_RESET,
      onClick: () => {
        bridge.state.resetIncompatible().then(() => {
          dismissNotice(noticeId);
        }, reportError);
      },
    },
    secondaryAction: {
      label: TOAST_E_ACTION_STAY,
      onClick: () => {
        bridge.update.setChannel('beta').then(() => {
          dismissNotice(noticeId);
        }, reportError);
      },
    },
  });
}
