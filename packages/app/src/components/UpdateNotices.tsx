/**
 * M3 UpdateNotices — renderer side of the auto-updater notice surface.
 *
 * Mounts at the bottom of the sidebar (see `FileSidebar.tsx` →
 * `SidebarFooter`). Reads live notices from a module-level store via
 * `useSyncExternalStore` — the IPC subscription lives OUTSIDE the React
 * tree (see `lib/update-notices-store.ts`) so renderer remounts (theme
 * toggle, sidebar resize, etc.) don't drop in-flight events.
 *
 * Rationale for sidebar placement over sonner overlays: the notices are
 * "permanent until clicked" per D11 — a stable anchored location fits
 * that intent better than a floating toast corner. D2 permits renderer
 * overlays; a sidebar-footer card is the same primitive, just anchored.
 *
 * Spec: specs/2026-04-21-m3-electron-updater/SPEC.md §5 AC6, AC7, AC17, AC18.
 * Decisions: D3 / D9 / D11 / D12.
 */

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { dismissNotice, getNoticesSnapshot, subscribeToNotices } from '@/lib/update-notices-store';
import type { UpdateNotice } from './UpdateNotices.shared';

// Re-export the canonical copy + subscription surface for any consumer
// still importing from `./UpdateNotices` (tests, future callers).
export {
  type AddNoticeFn,
  attachUpdateSubscribers,
  TOAST_A_ACTION,
  TOAST_A_BODY,
  TOAST_A_ERROR_BODY,
  TOAST_B_ACTION,
  TOAST_C_ACTION,
  TOAST_C_BODY,
  toastBBody,
  type UpdateNotice,
} from './UpdateNotices.shared';

/**
 * Renders a single notice card. Minimal layout: one row with body text,
 * action link, and dismiss X. When the body is long enough to wrap,
 * action + dismiss stay right-aligned via flex.
 */
function NoticeCard({ notice, onDismiss }: { notice: UpdateNotice; onDismiss: () => void }) {
  const borderTone = notice.variant === 'error' ? 'border-destructive/60' : 'border-sidebar-border';
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`update-notice-${notice.id}`}
      className={`flex items-center gap-2 rounded-md border bg-sidebar-accent/30 px-2 py-1.5 text-xs text-muted-foreground ${borderTone}`}
    >
      <span className="flex-1 leading-snug">{notice.body}</span>
      {notice.action ? (
        <button
          type="button"
          className="shrink-0 text-xs font-medium underline underline-offset-2 decoration-muted-foreground/40 hover:text-sidebar-foreground hover:decoration-sidebar-foreground"
          onClick={() => {
            notice.action?.onClick();
          }}
        >
          {notice.action.label}
        </button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-5 shrink-0 text-muted-foreground hover:text-sidebar-foreground"
        aria-label="Dismiss notice"
        onClick={onDismiss}
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}

/**
 * Pure selector: pick the single highest-priority (lowest `priority`
 * number) notice from the store. Multiple armed states are mutually
 * exclusive in practice (C = broken updater; A = pending install;
 * B = just updated — A wouldn't arm at the same time as B for the same
 * install), but the priority scheme handles the rare overlap cleanly.
 * Exported for unit-test visibility.
 */
export function pickActiveNotice(notices: readonly UpdateNotice[]): UpdateNotice | null {
  if (notices.length === 0) return null;
  let active = notices[0];
  if (!active) return null;
  for (let i = 1; i < notices.length; i++) {
    const n = notices[i];
    if (n && n.priority < active.priority) active = n;
  }
  return active;
}

/**
 * Mount point for update notices. Subscribes to the module-level store
 * via `useSyncExternalStore` and renders AT MOST ONE card — whichever
 * notice has the lowest priority number. Dismissing reveals the next
 * highest-priority notice if any are still armed. Safe to mount/unmount
 * freely — subscriptions live in the store, not here.
 */
export function UpdateNotices(): ReactNode {
  const notices = useSyncExternalStore(subscribeToNotices, getNoticesSnapshot, getNoticesSnapshot);
  const active = pickActiveNotice(notices);
  if (!active) return null;
  return (
    <div data-testid="update-notices-list">
      <NoticeCard
        notice={active}
        onDismiss={() => {
          dismissNotice(active.id);
        }}
      />
    </div>
  );
}
