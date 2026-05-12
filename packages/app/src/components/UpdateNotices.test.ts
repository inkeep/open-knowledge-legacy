import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import {
  addSchemaIncompatibilityNotice,
  appendErrorDetail,
  attachUpdateSubscribers,
  pickActiveNotice,
  TOAST_A_ACTION,
  TOAST_A_ERROR_BODY,
  TOAST_B_ACTION,
  TOAST_C_ACTION,
  TOAST_C_BODY,
  TOAST_E_ACTION_RESET,
  TOAST_E_ERROR_BODY,
  toastABody,
  toastBBody,
  toastEBody,
  type UpdateNotice,
} from './UpdateNotices';

type UpdateDownloadedCb = (info: { version: string }) => void;
type WhatsNewCb = (info: { version: string; releaseUrl: string }) => void;
type StuckHintCb = (info: { downloadUrl: string }) => void;

interface FakeBridge {
  onUpdateDownloaded: ReturnType<typeof mock>;
  onWhatsNew: ReturnType<typeof mock>;
  onUpdateStuckHint: ReturnType<typeof mock>;
  update: {
    relaunchNow: ReturnType<typeof mock>;
  };
  state: {
    query: ReturnType<typeof mock>;
    resetIncompatible: ReturnType<typeof mock>;
  };
  shell: { openExternal: ReturnType<typeof mock> };
  _downloaded?: UpdateDownloadedCb;
  _whatsNew?: WhatsNewCb;
  _stuckHint?: StuckHintCb;
  _downloadedUnsub: ReturnType<typeof mock>;
  _whatsNewUnsub: ReturnType<typeof mock>;
  _stuckHintUnsub: ReturnType<typeof mock>;
}

function makeFakeBridge(): FakeBridge {
  const b: FakeBridge = {
    _downloadedUnsub: mock(() => {}),
    _whatsNewUnsub: mock(() => {}),
    _stuckHintUnsub: mock(() => {}),
    onUpdateDownloaded: mock(() => {}),
    onWhatsNew: mock(() => {}),
    onUpdateStuckHint: mock(() => {}),
    update: {
      relaunchNow: mock(() => Promise.resolve(undefined)),
    },
    state: {
      query: mock(() => Promise.resolve({ channel: 'latest', schemaIncompatibility: null })),
      resetIncompatible: mock(() => Promise.resolve(undefined)),
    },
    shell: { openExternal: mock(() => Promise.resolve(undefined)) },
  };
  b.onUpdateDownloaded = mock((cb: UpdateDownloadedCb) => {
    b._downloaded = cb;
    return b._downloadedUnsub;
  });
  b.onWhatsNew = mock((cb: WhatsNewCb) => {
    b._whatsNew = cb;
    return b._whatsNewUnsub;
  });
  b.onUpdateStuckHint = mock((cb: StuckHintCb) => {
    b._stuckHint = cb;
    return b._stuckHintUnsub;
  });
  return b;
}

function castBridge(fake: FakeBridge): OkDesktopBridge {
  return fake as unknown as OkDesktopBridge;
}

describe('copy helpers (minimal-wording revision)', () => {
  test('toastABody formats the version-specific pending-install string', () => {
    expect(toastABody('0.1.1')).toBe('Version 0.1.1 ready to install');
    expect(toastABody('2.0.0-beta.1')).toBe('Version 2.0.0-beta.1 ready to install');
  });

  test('toastBBody formats the "Updated to Version <X>" string', () => {
    expect(toastBBody('0.1.1')).toBe('Updated to Version 0.1.1');
    expect(toastBBody('2.0.0-beta.1')).toBe('Updated to Version 2.0.0-beta.1');
  });

  test('canonical copy strings match the single-card minimal revision', () => {
    expect(TOAST_A_ACTION).toBe('Relaunch');
    expect(TOAST_B_ACTION).toBe('Release notes');
    expect(TOAST_C_BODY).toBe('Updates paused');
    expect(TOAST_C_ACTION).toBe('Download');
  });

  test('toastEBody interpolates the running build version into the refuse-downgrade body', () => {
    expect(toastEBody('0.3.0')).toBe(
      'Your settings and recent projects were saved by a newer build than this one (v0.3.0). Reset to defaults to continue.',
    );
    expect(toastEBody('0.4.0-beta.3')).toBe(
      'Your settings and recent projects were saved by a newer build than this one (v0.4.0-beta.3). Reset to defaults to continue.',
    );
  });

  test('Notice E action copy names the consequence honestly', () => {
    expect(TOAST_E_ACTION_RESET).toBe('Reset to defaults');
  });

  test('TOAST_E_ERROR_BODY is the retry message for a Reset failure', () => {
    expect(TOAST_E_ERROR_BODY).toBe('Recovery action failed — please try again');
  });
});

describe('appendErrorDetail', () => {
  test('Error with non-empty message → "{base}: {message}"', () => {
    const result = appendErrorDetail('Reset failed', new Error('disk full'));
    expect(result).toBe('Reset failed: disk full');
  });

  test('Error with empty message → base only (no trailing colon)', () => {
    const result = appendErrorDetail('Reset failed', new Error(''));
    expect(result).toBe('Reset failed');
  });

  test('non-Error rejection (string) → base only', () => {
    const result = appendErrorDetail('Reset failed', 'string-throw');
    expect(result).toBe('Reset failed');
  });

  test('undefined rejection → base only', () => {
    const result = appendErrorDetail('Reset failed', undefined);
    expect(result).toBe('Reset failed');
  });
});

describe('attachUpdateSubscribers — registration', () => {
  test('subscribes to all three update channels on the bridge', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    expect(bridge.onUpdateDownloaded).toHaveBeenCalledTimes(1);
    expect(bridge.onWhatsNew).toHaveBeenCalledTimes(1);
    expect(bridge.onUpdateStuckHint).toHaveBeenCalledTimes(1);
  });

  test('returns a single unsubscribe closure that detaches ALL three listeners', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const unsubscribe = attachUpdateSubscribers(castBridge(bridge), addNotice);
    unsubscribe();
    expect(bridge._downloadedUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._whatsNewUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._stuckHintUnsub).toHaveBeenCalledTimes(1);
  });
});

describe('Notice A — ok:update:downloaded', () => {
  test('emits notice with canonical copy + relaunch action on dispatch', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);

    bridge._downloaded?.({ version: '0.1.1' });
    expect(addNotice).toHaveBeenCalledTimes(1);
    const [notice] = addNotice.mock.calls[0] as [UpdateNotice];
    expect(notice.body).toBe(toastABody('0.1.1'));
    expect(notice.id).toBe('update-downloaded-0.1.1');
    expect(notice.action?.label).toBe(TOAST_A_ACTION);
    expect(notice.variant).toBeUndefined();
    expect(notice.priority).toBe(2); // update-downloaded = A
  });

  test('action onClick invokes bridge.update.relaunchNow', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    expect(bridge.update.relaunchNow).toHaveBeenCalledTimes(1);
  });

  test('relaunchNow rejection → error notice with appended detail', async () => {
    const bridge = makeFakeBridge();
    bridge.update.relaunchNow = mock(() => Promise.reject(new Error('quitAndInstall failed')));
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const noticeA = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    noticeA.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(addNotice).toHaveBeenCalledTimes(2);
    const errorNotice = addNotice.mock.calls[1]?.[0] as UpdateNotice;
    expect(errorNotice.body).toBe(`${TOAST_A_ERROR_BODY}: quitAndInstall failed`);
    expect(errorNotice.id).toBe('relaunch-error-0.1.1');
    expect(errorNotice.variant).toBe('error');
    expect(errorNotice.action).toBeUndefined();
    expect(errorNotice.priority).toBe(1); // relaunch-error = higher than A
  });

  test('relaunchNow non-Error rejection (string throw) → error notice without trailing colon', async () => {
    const bridge = makeFakeBridge();
    bridge.update.relaunchNow = mock(() => Promise.reject('not-an-error'));
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const noticeA = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    noticeA.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    const errorNotice = addNotice.mock.calls[1]?.[0] as UpdateNotice;
    expect(errorNotice.body).toBe(TOAST_A_ERROR_BODY);
  });

  test('relaunchNow success → no error notice', async () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.update.relaunchNow).toHaveBeenCalledTimes(1);
    expect(addNotice).toHaveBeenCalledTimes(1);
  });

  test('relaunchNow success → dismissNotice fires with the Toast A id (dev-mode feedback)', async () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const dismissNotice = mock<(id: string) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice, dismissNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(dismissNotice).toHaveBeenCalledTimes(1);
    expect(dismissNotice).toHaveBeenCalledWith('update-downloaded-0.1.1');
  });

  test('relaunchNow rejection → dismissNotice does NOT fire (error notice takes over)', async () => {
    const bridge = makeFakeBridge();
    bridge.update.relaunchNow = mock(() => Promise.reject(new Error('quitAndInstall failed')));
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const dismissNotice = mock<(id: string) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice, dismissNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(dismissNotice).not.toHaveBeenCalled();
    expect(addNotice).toHaveBeenCalledTimes(2);
  });

  test('separate versions produce distinct notice ids (dedup handles repeats)', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    bridge._downloaded?.({ version: '0.1.2' });
    const ids = addNotice.mock.calls.map((c) => (c[0] as UpdateNotice).id);
    expect(ids).toEqual(['update-downloaded-0.1.1', 'update-downloaded-0.1.2']);
  });

  test('same version produces the same notice id (list-level dedup gates visible repeat)', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    bridge._downloaded?.({ version: '0.1.1' });
    const ids = addNotice.mock.calls.map((c) => (c[0] as UpdateNotice).id);
    expect(ids).toEqual(['update-downloaded-0.1.1', 'update-downloaded-0.1.1']);
  });
});

describe('Notice B — ok:update:whats-new', () => {
  test('emits notice with version-specific copy + release URL action', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    const releaseUrl = 'https://github.com/inkeep/open-knowledge/releases/tag/v0.3.1';
    bridge._whatsNew?.({ version: '0.3.1', releaseUrl });
    expect(addNotice).toHaveBeenCalledTimes(1);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    expect(notice.body).toBe('Updated to Version 0.3.1');
    expect(notice.id).toBe('whats-new-0.3.1');
    expect(notice.action?.label).toBe(TOAST_B_ACTION);
    expect(notice.priority).toBe(3); // whats-new = lowest
    notice.action?.onClick();
    expect(bridge.shell.openExternal).toHaveBeenCalledWith(releaseUrl);
  });
});

describe('Notice C — ok:update:stuck-hint', () => {
  test('emits notice with D12 copy + download URL action', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    const downloadUrl = 'https://inkeep.com/open-knowledge/download';
    bridge._stuckHint?.({ downloadUrl });
    expect(addNotice).toHaveBeenCalledTimes(1);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    expect(notice.body).toBe(TOAST_C_BODY);
    expect(notice.id).toBe('update-stuck-hint');
    expect(notice.action?.label).toBe(TOAST_C_ACTION);
    expect(notice.priority).toBe(0); // stuck-hint = highest
    notice.action?.onClick();
    expect(bridge.shell.openExternal).toHaveBeenCalledWith(downloadUrl);
  });

  test('stuck-hint uses a fixed id — second dispatch from main hits the list-level dedup', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._stuckHint?.({ downloadUrl: 'https://x/y' });
    bridge._stuckHint?.({ downloadUrl: 'https://x/y' });
    const ids = addNotice.mock.calls.map((c) => (c[0] as UpdateNotice).id);
    expect(ids).toEqual(['update-stuck-hint', 'update-stuck-hint']);
  });
});

describe('Notice E — schema-incompatibility refuse-downgrade', () => {
  const diagnostic = {
    currentBuild: '0.3.0',
    persistedSchemaVersion: 2,
    maxSupported: 1,
  };

  test('emits notice with spec body, a single Reset action, and priority 0', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice);
    expect(addNotice).toHaveBeenCalledTimes(1);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    expect(notice.id).toBe('schema-incompatibility-2');
    expect(notice.body).toBe(toastEBody('0.3.0'));
    expect(notice.priority).toBe(0);
    expect(notice.action?.label).toBe(TOAST_E_ACTION_RESET);
    expect(notice.secondaryAction).toBeUndefined();
  });

  test('Reset action invokes bridge.state.resetIncompatible', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    expect(bridge.state.resetIncompatible).toHaveBeenCalledTimes(1);
  });

  test('Reset success → dismissNotice fires for the active id', async () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const dismissNotice = mock<(id: string) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice, dismissNotice);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    notice.action?.onClick();
    await Promise.resolve();
    expect(dismissNotice).toHaveBeenCalledTimes(1);
    expect(dismissNotice).toHaveBeenCalledWith('schema-incompatibility-2');
  });

  test('Reset rejection → parent dismissed + error notice with spec shape and appended detail', async () => {
    const bridge = makeFakeBridge();
    bridge.state.resetIncompatible = mock(() => Promise.reject(new Error('disk fail')));
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const dismissNotice = mock<(id: string) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice, dismissNotice);
    const initial = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    initial.action?.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(dismissNotice).toHaveBeenCalledTimes(1);
    expect(dismissNotice).toHaveBeenCalledWith(initial.id);
    const errorNotice = addNotice.mock.calls.at(-1)?.[0] as UpdateNotice;
    expect(errorNotice.id).toBe('schema-incompatibility-error-2');
    expect(errorNotice.body).toBe(`${TOAST_E_ERROR_BODY}: disk fail`);
    expect(errorNotice.variant).toBe('error');
    expect(errorNotice.priority).toBe(0);
    expect(errorNotice.action).toBeUndefined();
  });

  test('different persistedSchemaVersion produces distinct notice ids', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice);
    addSchemaIncompatibilityNotice(
      castBridge(bridge),
      { ...diagnostic, persistedSchemaVersion: 7 },
      addNotice,
    );
    const ids = addNotice.mock.calls.map((c) => (c[0] as UpdateNotice).id);
    expect(ids).toEqual(['schema-incompatibility-2', 'schema-incompatibility-7']);
  });

  test('repeat call with same diagnostic reuses the same id (list-level dedup)', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice);
    addSchemaIncompatibilityNotice(castBridge(bridge), diagnostic, addNotice);
    const ids = addNotice.mock.calls.map((c) => (c[0] as UpdateNotice).id);
    expect(ids).toEqual(['schema-incompatibility-2', 'schema-incompatibility-2']);
  });
});

describe('pickActiveNotice', () => {
  const a: UpdateNotice = { id: 'a', body: 'A', priority: 2 };
  const b: UpdateNotice = { id: 'b', body: 'B', priority: 3 };
  const c: UpdateNotice = { id: 'c', body: 'C', priority: 0 };
  const err: UpdateNotice = { id: 'err', body: 'Err', priority: 1, variant: 'error' };

  test('empty list → null', () => {
    expect(pickActiveNotice([])).toBeNull();
  });

  test('single notice → returns it', () => {
    expect(pickActiveNotice([a])).toBe(a);
  });

  test('C > A > B — stuck-hint wins over everything', () => {
    expect(pickActiveNotice([b, a, c])).toBe(c);
  });

  test('A + B coexist → A wins', () => {
    expect(pickActiveNotice([b, a])).toBe(a);
  });

  test('relaunch-error (1) wins over A (2) and B (3) but not C (0)', () => {
    expect(pickActiveNotice([a, b, err])).toBe(err);
    expect(pickActiveNotice([a, b, err, c])).toBe(c);
  });
});

describe('unsubscribe semantics', () => {
  test('after unsubscribe, all three per-channel unsub closures fire', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    const unsubscribe = attachUpdateSubscribers(castBridge(bridge), addNotice);
    unsubscribe();
    expect(bridge._downloadedUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._whatsNewUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._stuckHintUnsub).toHaveBeenCalledTimes(1);
  });
});
