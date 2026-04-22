/**
 * M3 UpdateNotices — module-level store for persistent auto-updater notices.
 *
 * Why a module-level store instead of React state inside the component:
 *
 * The renderer's `<UpdateNotices />` lives inside the shadcn Sidebar tree,
 * which remounts transparently across theme toggles, sidebar width changes,
 * and other parent-triggered re-mounts we don't control. A subscriber
 * attached inside `useEffect(() => ..., [])` detaches on every unmount and
 * re-attaches on re-mount — and between those moments, any IPC event main
 * sends is dropped on the floor.
 *
 * Moving the bridge subscription to module-init time (before React mounts)
 * solves both halves of the problem:
 *   1. Subscribers attach ONCE per window-lifetime, independent of how
 *      many times UpdateNotices mounts.
 *   2. IPC events landing before React even renders are captured — the
 *      store holds the notices until something consumes them.
 *
 * The component reads state via `useSyncExternalStore`, which is React's
 * canonical path for module-level external stores.
 *
 * Main.tsx imports this file for its side effect. Web/CLI distribution
 * skips the subscribe call because `window.okDesktop` is undefined there.
 *
 * Spec: specs/2026-04-21-m3-electron-updater/SPEC.md §5 AC6, AC7, AC17, AC18.
 * Decisions: D3 / D9 / D11 / D12.
 */

import { attachUpdateSubscribers, type UpdateNotice } from '@/components/UpdateNotices.shared';

let notices: UpdateNotice[] = [];
const listeners = new Set<() => void>();
let attached = false;
let detach: (() => void) | null = null;

function notify(): void {
  for (const l of listeners) l();
}

function addNotice(notice: UpdateNotice): void {
  const idx = notices.findIndex((n) => n.id === notice.id);
  if (idx === -1) {
    notices = [...notices, notice];
  } else {
    const next = notices.slice();
    next[idx] = notice;
    notices = next;
  }
  notify();
}

export function dismissNotice(id: string): void {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  notify();
}

export function getNoticesSnapshot(): UpdateNotice[] {
  return notices;
}

export function subscribeToNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Install the module-init-time bridge subscription. Idempotent — a second
 * call is a no-op so HMR re-evaluation doesn't stack subscribers. Runs in
 * the renderer at `main.tsx`'s module-load side effect, before React mounts.
 */
export function installUpdateNoticesBridge(): void {
  if (attached) return;
  if (typeof window === 'undefined') return;
  const bridge = window.okDesktop;
  if (!bridge) return;
  attached = true;
  detach = attachUpdateSubscribers(bridge, addNotice, dismissNotice);
}

/**
 * HMR / test teardown seam. Production never calls this (the subscription
 * lives for the window's lifetime). Present for module-reload cleanliness
 * and for tests that need a fresh module state between scenarios.
 */
export function uninstallUpdateNoticesBridge(): void {
  if (!attached) return;
  detach?.();
  detach = null;
  attached = false;
  notices = [];
  notify();
}
