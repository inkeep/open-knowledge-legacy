/**
 * UpdateNotices — unit tests for the pure subscription logic
 * (`attachUpdateSubscribers`) + the canonical copy strings.
 *
 * The React effect wrapper in `UpdateNotices()` is a thin adapter over
 * `attachUpdateSubscribers` — the interesting logic (channel subscription,
 * notice shape, action-button plumbing, unsubscribe-on-unmount semantics)
 * is all exercised here without a DOM renderer.
 *
 * Verifying the full render path (card actually appears in the sidebar
 * footer, close button dismisses, action button fires) is manual +
 * Playwright's job per AC6.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import {
  attachUpdateSubscribers,
  pickActiveNotice,
  TOAST_A_ACTION,
  TOAST_A_BODY,
  TOAST_A_ERROR_BODY,
  TOAST_B_ACTION,
  TOAST_C_ACTION,
  TOAST_C_BODY,
  toastBBody,
  type UpdateNotice,
} from './UpdateNotices';

type UpdateDownloadedCb = (info: { version: string }) => void;
type WhatsNewCb = (info: { version: string; releaseUrl: string }) => void;
type StuckHintCb = (info: { downloadUrl: string }) => void;

interface FakeBridge {
  onUpdateDownloaded: ReturnType<typeof mock>;
  onWhatsNew: ReturnType<typeof mock>;
  onUpdateStuckHint: ReturnType<typeof mock>;
  update: { relaunchNow: ReturnType<typeof mock> };
  shell: { openExternal: ReturnType<typeof mock> };
  /** Test-side handles — set by the `on*` mocks so tests can drive dispatches. */
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
    update: { relaunchNow: mock(() => Promise.resolve(undefined)) },
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

// ————————————————————————————————————————————————————————
// Pure helpers
// ————————————————————————————————————————————————————————

describe('copy helpers (minimal-wording revision)', () => {
  test('toastBBody formats the "Updated to v<X>" string', () => {
    expect(toastBBody('0.1.1')).toBe('Updated to v0.1.1');
    expect(toastBBody('2.0.0-beta.1')).toBe('Updated to v2.0.0-beta.1');
  });

  test('canonical copy strings match the single-card minimal revision', () => {
    expect(TOAST_A_BODY).toBe('Update ready');
    expect(TOAST_A_ACTION).toBe('Relaunch');
    expect(TOAST_B_ACTION).toBe('Release notes');
    expect(TOAST_C_BODY).toBe('Updates paused');
    expect(TOAST_C_ACTION).toBe('Download');
  });
});

// ————————————————————————————————————————————————————————
// attachUpdateSubscribers — subscription
// ————————————————————————————————————————————————————————

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

// ————————————————————————————————————————————————————————
// Notice A: update-downloaded
// ————————————————————————————————————————————————————————

describe('Notice A — ok:update:downloaded', () => {
  test('emits notice with canonical copy + relaunch action on dispatch', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);

    bridge._downloaded?.({ version: '0.1.1' });
    expect(addNotice).toHaveBeenCalledTimes(1);
    const [notice] = addNotice.mock.calls[0] as [UpdateNotice];
    expect(notice.body).toBe(TOAST_A_BODY);
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

  test('relaunchNow rejection → error notice is appended', async () => {
    const bridge = makeFakeBridge();
    bridge.update.relaunchNow = mock(() => Promise.reject(new Error('quitAndInstall failed')));
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    bridge._downloaded?.({ version: '0.1.1' });
    const noticeA = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    noticeA.action?.onClick();
    // Yield microtasks for the async catch to fire.
    await Promise.resolve();
    await Promise.resolve();
    expect(addNotice).toHaveBeenCalledTimes(2);
    const errorNotice = addNotice.mock.calls[1]?.[0] as UpdateNotice;
    expect(errorNotice.body).toBe(TOAST_A_ERROR_BODY);
    expect(errorNotice.id).toBe('relaunch-error-0.1.1');
    expect(errorNotice.variant).toBe('error');
    expect(errorNotice.action).toBeUndefined();
    expect(errorNotice.priority).toBe(1); // relaunch-error = higher than A
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
    // Only the initial notice was emitted, no error follow-up.
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
    expect(addNotice).toHaveBeenCalledTimes(2); // initial + error notice
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

// ————————————————————————————————————————————————————————
// Notice B: what's-new
// ————————————————————————————————————————————————————————

describe('Notice B — ok:update:whats-new', () => {
  test('emits notice with version-specific copy + release URL action', () => {
    const bridge = makeFakeBridge();
    const addNotice = mock<(notice: UpdateNotice) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), addNotice);
    const releaseUrl = 'https://github.com/inkeep/open-knowledge/releases/tag/v0.3.1';
    bridge._whatsNew?.({ version: '0.3.1', releaseUrl });
    expect(addNotice).toHaveBeenCalledTimes(1);
    const notice = addNotice.mock.calls[0]?.[0] as UpdateNotice;
    expect(notice.body).toBe('Updated to v0.3.1');
    expect(notice.id).toBe('whats-new-0.3.1');
    expect(notice.action?.label).toBe(TOAST_B_ACTION);
    expect(notice.priority).toBe(3); // whats-new = lowest
    notice.action?.onClick();
    expect(bridge.shell.openExternal).toHaveBeenCalledWith(releaseUrl);
  });
});

// ————————————————————————————————————————————————————————
// Notice C: stuck-hint (D12)
// ————————————————————————————————————————————————————————

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

// ————————————————————————————————————————————————————————
// Unsubscribe semantics
// ————————————————————————————————————————————————————————

// ————————————————————————————————————————————————————————
// pickActiveNotice — single-card priority selector
// ————————————————————————————————————————————————————————

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
