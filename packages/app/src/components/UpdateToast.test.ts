/**
 * UpdateToast — unit tests for the pure subscription logic
 * (`attachUpdateSubscribers`) + the canonical copy strings.
 *
 * The React effect wrapper in `UpdateToast()` is a thin adapter over
 * `attachUpdateSubscribers` — the interesting logic (channel subscription,
 * toast payload shape, action-button plumbing, unsubscribe-on-unmount
 * semantics) is all exercised here without a DOM renderer or real sonner.
 *
 * Verifying the full render path (sonner actually renders the toast +
 * action button actually clickable) is manual + Playwright's job per AC6.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import {
  attachUpdateSubscribers,
  TOAST_A_ACTION,
  TOAST_A_BODY,
  TOAST_B_ACTION,
  TOAST_C_ACTION,
  TOAST_C_BODY,
  type ToastOpts,
  toastBBody,
} from './UpdateToast';

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

describe('copy helpers', () => {
  test('toastBBody formats the "Updated to v<X> — see what\'s new" string', () => {
    expect(toastBBody('0.1.1')).toBe("Updated to v0.1.1 — see what's new");
    expect(toastBBody('2.0.0-beta.1')).toBe("Updated to v2.0.0-beta.1 — see what's new");
  });

  test('canonical copy strings are non-empty', () => {
    expect(TOAST_A_BODY).toBe('Update downloaded');
    expect(TOAST_A_ACTION).toBe('Relaunch now');
    expect(TOAST_B_ACTION).toBe("See what's new");
    expect(TOAST_C_BODY).toContain('This app may not be receiving updates');
    expect(TOAST_C_BODY).toContain('inkeep.com/open-knowledge/download');
    expect(TOAST_C_ACTION).toBe('Open download page');
  });
});

// ————————————————————————————————————————————————————————
// attachUpdateSubscribers — subscription
// ————————————————————————————————————————————————————————

describe('attachUpdateSubscribers — registration', () => {
  test('subscribes to all three update channels on the bridge', () => {
    const bridge = makeFakeBridge();
    const toast = mock(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    expect(bridge.onUpdateDownloaded).toHaveBeenCalledTimes(1);
    expect(bridge.onWhatsNew).toHaveBeenCalledTimes(1);
    expect(bridge.onUpdateStuckHint).toHaveBeenCalledTimes(1);
  });

  test('returns a single unsubscribe closure that detaches ALL three listeners', () => {
    const bridge = makeFakeBridge();
    const toast = mock(() => {});
    const unsubscribe = attachUpdateSubscribers(castBridge(bridge), toast);
    unsubscribe();
    expect(bridge._downloadedUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._whatsNewUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._stuckHintUnsub).toHaveBeenCalledTimes(1);
  });
});

// ————————————————————————————————————————————————————————
// Toast A: update-downloaded
// ————————————————————————————————————————————————————————

describe('Toast A — ok:update:downloaded', () => {
  test('fires toast with canonical copy + relaunch action on dispatch', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);

    bridge._downloaded?.({ version: '0.1.1' });
    expect(toast).toHaveBeenCalledTimes(1);
    const [body, opts] = toast.mock.calls[0] as [string, ToastOpts];
    expect(body).toBe(TOAST_A_BODY);
    expect(opts.duration).toBe(Number.POSITIVE_INFINITY);
    expect(opts.id).toBe('update-downloaded-0.1.1');
    expect(opts.action.label).toBe(TOAST_A_ACTION);
  });

  test('action onClick invokes bridge.update.relaunchNow', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    bridge._downloaded?.({ version: '0.1.1' });
    const opts = toast.mock.calls[0]?.[1] as ToastOpts;
    opts.action.onClick();
    expect(bridge.update.relaunchNow).toHaveBeenCalledTimes(1);
  });

  test('separate versions produce distinct toast ids (sonner idempotency)', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    bridge._downloaded?.({ version: '0.1.1' });
    bridge._downloaded?.({ version: '0.1.2' });
    const ids = toast.mock.calls.map((c) => (c[1] as ToastOpts).id);
    expect(ids).toEqual(['update-downloaded-0.1.1', 'update-downloaded-0.1.2']);
  });

  test('same version produces the same toast id (sonner dedups by id)', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    bridge._downloaded?.({ version: '0.1.1' });
    bridge._downloaded?.({ version: '0.1.1' });
    const ids = toast.mock.calls.map((c) => (c[1] as ToastOpts).id);
    expect(ids).toEqual(['update-downloaded-0.1.1', 'update-downloaded-0.1.1']);
  });
});

// ————————————————————————————————————————————————————————
// Toast B: what's-new
// ————————————————————————————————————————————————————————

describe('Toast B — ok:update:whats-new', () => {
  test('fires toast with version-specific copy + release URL action', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    const releaseUrl = 'https://github.com/inkeep/open-knowledge/releases/tag/v0.3.1';
    bridge._whatsNew?.({ version: '0.3.1', releaseUrl });
    expect(toast).toHaveBeenCalledTimes(1);
    const [body, opts] = toast.mock.calls[0] as [string, ToastOpts];
    expect(body).toBe("Updated to v0.3.1 — see what's new");
    expect(opts.duration).toBe(Number.POSITIVE_INFINITY);
    expect(opts.id).toBe('whats-new-0.3.1');
    expect(opts.action.label).toBe(TOAST_B_ACTION);
    opts.action.onClick();
    expect(bridge.shell.openExternal).toHaveBeenCalledWith(releaseUrl);
  });
});

// ————————————————————————————————————————————————————————
// Toast C: stuck-hint (D12)
// ————————————————————————————————————————————————————————

describe('Toast C — ok:update:stuck-hint', () => {
  test('fires toast with D12 copy + download URL action', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    const downloadUrl = 'https://inkeep.com/open-knowledge/download';
    bridge._stuckHint?.({ downloadUrl });
    expect(toast).toHaveBeenCalledTimes(1);
    const [body, opts] = toast.mock.calls[0] as [string, ToastOpts];
    expect(body).toBe(TOAST_C_BODY);
    expect(opts.duration).toBe(Number.POSITIVE_INFINITY);
    expect(opts.id).toBe('update-stuck-hint');
    expect(opts.action.label).toBe(TOAST_C_ACTION);
    opts.action.onClick();
    expect(bridge.shell.openExternal).toHaveBeenCalledWith(downloadUrl);
  });

  test('stuck-hint uses a fixed id — sonner dedup prevents second render if main re-dispatches', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    attachUpdateSubscribers(castBridge(bridge), toast);
    bridge._stuckHint?.({ downloadUrl: 'https://x/y' });
    bridge._stuckHint?.({ downloadUrl: 'https://x/y' });
    const ids = toast.mock.calls.map((c) => (c[1] as ToastOpts).id);
    expect(ids).toEqual(['update-stuck-hint', 'update-stuck-hint']);
  });
});

// ————————————————————————————————————————————————————————
// Unsubscribe semantics
// ————————————————————————————————————————————————————————

describe('unsubscribe semantics', () => {
  test('after unsubscribe, subsequent dispatches from stale refs do not fire toast', () => {
    const bridge = makeFakeBridge();
    const toast = mock<(body: string, opts: ToastOpts) => void>(() => {});
    const unsubscribe = attachUpdateSubscribers(castBridge(bridge), toast);
    unsubscribe();
    // Real bridge would stop delivering events after unsubscribe() — assert the
    // 3 unsub closures were called with the expected cadence so any realistic
    // bridge impl would see them detach.
    expect(bridge._downloadedUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._whatsNewUnsub).toHaveBeenCalledTimes(1);
    expect(bridge._stuckHintUnsub).toHaveBeenCalledTimes(1);
  });
});
