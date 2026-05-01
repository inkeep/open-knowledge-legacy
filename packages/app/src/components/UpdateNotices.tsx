
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { dismissNotice, getNoticesSnapshot, subscribeToNotices } from '@/lib/update-notices-store';
import type { UpdateNotice } from './UpdateNotices.shared';

export {
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
