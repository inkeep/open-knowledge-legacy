import type { HocuspocusProvider } from '@hocuspocus/provider';
import { ClaudeIcon } from '@/components/icons/claude';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type Participant, usePresence } from './use-presence';

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

export function PresenceBar({ provider }: { provider: HocuspocusProvider | null }) {
  const participants = usePresence(provider);

  if (!provider) {
    return (
      <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
        <span className="text-xs text-muted-foreground font-mono uppercase">Connecting...</span>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
        <span className="text-xs text-muted-foreground font-mono uppercase">No participants</span>
      </div>
    );
  }

  return (
    <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5 flex-wrap">
      {participants.map((p) => (
        <PresenceBadge key={p.clientId} user={p.user} mode={p.mode} />
      ))}
    </div>
  );
}
