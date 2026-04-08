import type { HocuspocusProvider } from '@hocuspocus/provider';
import { ClaudeIcon } from '@/components/icons/claude';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type Participant, usePresence } from './use-presence';
import { type SyncStatus, useSyncStatus } from './use-sync-status';

function PresenceBadge({ user, mode }: { user: Participant['user']; mode: Participant['mode'] }) {
  if (user.type === 'agent') {
    return (
      <Badge
        variant="outline"
        data-presence-badge="agent"
        data-presence-mode={mode}
        className={cn('gap-1.5 border-agent/50 text-agent font-mono text-[11px] tracking-wide')}
      >
        <ClaudeIcon width={14} height={14} className="text-agent" />
        <span>{user.name}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      data-presence-badge="human"
      data-presence-mode={mode}
      className="gap-1.5 font-mono text-[11px] tracking-wide"
    >
      <span
        className="inline-block size-2 rounded-full shrink-0"
        style={{ backgroundColor: user.color }}
      />
      <span>{user.name}</span>
    </Badge>
  );
}

const SYNC_CONFIG: Record<SyncStatus, { color: string; label: string; pulse: boolean }> = {
  connecting: { color: '#f59e0b', label: 'Connecting', pulse: true },
  connected: { color: '#f59e0b', label: 'Syncing', pulse: true },
  synced: { color: '#22c55e', label: 'Synced', pulse: false },
  disconnected: { color: '#ef4444', label: 'Disconnected', pulse: false },
};

function SyncIndicator({ status }: { status: SyncStatus }) {
  const { color, label, pulse } = SYNC_CONFIG[status];
  return (
    <span
      data-sync-status={status}
      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-wide"
    >
      <span className="relative inline-flex size-2">
        {pulse && (
          <span
            className="absolute inline-flex size-full rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="relative inline-flex size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
      {status !== 'synced' && <span>{label}</span>}
    </span>
  );
}

export function PresenceBar({ provider }: { provider: HocuspocusProvider | null }) {
  const participants = usePresence(provider);
  const syncStatus = useSyncStatus(provider);

  return (
    <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5 flex-wrap">
      <SyncIndicator status={syncStatus} />
      {participants.map((p) => (
        <PresenceBadge key={p.clientId} user={p.user} mode={p.mode} />
      ))}
    </div>
  );
}
