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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { type Participant, usePresence } from './use-presence';
import { useSyncStatus } from './use-sync-status';
import { useSyncToasts } from './use-sync-toasts';

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

// NOTE: agent-icon rendering + agent-tooltip name derivation helpers were
// removed here in US-005 (agents no longer publish per-doc awareness so the
// branch went dead). US-006 re-introduces them as part of the sectioned-bar
// refactor that reads `agentPresence` from the `__system__` provider.

function PresenceAvatar({ user, mode }: { user: Participant['user']; mode: Participant['mode'] }) {
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
          role="img"
          aria-label={user.name}
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

export function PresenceBar() {
  const { activeProvider, activeDocName } = useDocumentContext();
  const participants = usePresence(activeProvider);
  const syncStatus = useSyncStatus(activeProvider);
  useSyncToasts(syncStatus, activeDocName);

  return (
    <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
      <div className="flex items-center -space-x-1.5">
        {participants.map((p) => (
          <PresenceAvatar key={p.clientId} user={p.user} mode={p.mode} />
        ))}
      </div>
    </div>
  );
}
