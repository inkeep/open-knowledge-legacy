import type { HocuspocusProvider } from '@hocuspocus/provider';
import { deriveIconColor } from '@inkeep/open-knowledge-core';
import {
  Bird,
  Cat,
  Dog,
  Fish,
  type LucideProps,
  Rabbit,
  Rat,
  Shrimp,
  Snail,
  Squirrel,
  Turtle,
} from 'lucide-react';
import type { FC } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type Participant, usePresence } from './use-presence';
import { type SyncStatus, useSyncStatus } from './use-sync-status';

const ANIMAL_ICON_MAP: Record<string, FC<LucideProps>> = {
  Bird,
  Cat,
  Dog,
  Fish,
  Mouse: Rat,
  Rabbit,
  Shrimp,
  Snail,
  Squirrel,
  Turtle,
};

function PresenceAvatar({ user, mode }: { user: Participant['user']; mode: Participant['mode'] }) {
  if (user.type === 'agent') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-presence-badge="agent"
            data-presence-mode={mode}
            className="inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-full bg-agent ring-2 ring-background"
          >
            <ClaudeIcon width={16} height={16} className="text-white" />
          </div>
        </TooltipTrigger>
        <TooltipContent>{user.name}</TooltipContent>
      </Tooltip>
    );
  }

  const animal = user.name.split(' ')[1];
  const AnimalIcon = animal ? ANIMAL_ICON_MAP[animal] : undefined;
  const initials = user.name
    .split(' ')
    .map((w) => w[0])
    .join('');
  const iconColor = deriveIconColor(user.color);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-presence-badge="human"
          data-presence-mode={mode}
          className="inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-full ring-2 ring-background"
          style={{ backgroundColor: user.color }}
        >
          {AnimalIcon ? (
            <AnimalIcon size={18} color={iconColor} strokeWidth={1.5} />
          ) : (
            <span
              className="font-mono text-2xs font-semibold leading-none"
              style={{ color: iconColor }}
            >
              {initials}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{user.name}</TooltipContent>
    </Tooltip>
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
      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground"
    >
      <span className="relative inline-flex size-2">
        {pulse && (
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-75"
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
    <TooltipProvider>
      <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
        <SyncIndicator status={syncStatus} />
        <div className="flex items-center -space-x-1.5">
          {participants.map((p) => (
            <PresenceAvatar key={p.clientId} user={p.user} mode={p.mode} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
