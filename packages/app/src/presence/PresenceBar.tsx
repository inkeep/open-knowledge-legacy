import { deriveIconColor } from '@inkeep/open-knowledge-core';
import {
  Bird,
  Bot,
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
import type { FC, SVGProps } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { CursorIcon } from '@/components/icons/cursor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
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

/** Map the `icon` field from awareness to a component. Falls back to Bot for unknown agents. */
function AgentIcon({ icon, ...props }: { icon?: string } & SVGProps<SVGSVGElement>) {
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  // Unknown or missing icon — generic bot
  return <Bot {...(props as LucideProps)} />;
}

const AGENT_DISPLAY_NAME: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  openai: 'Codex',
  github: 'Copilot',
  cline: 'Cline',
  bot: 'Agent',
};

/** Friendly display name for agent tooltip. Prefers label (user-provided), then icon-derived name, then raw name. */
function agentTooltipName(user: Participant['user']): string {
  // If the user set AGENT_LABEL, the name will differ from the icon-derived name — show the label
  const iconName = user.icon ? AGENT_DISPLAY_NAME[user.icon] : undefined;
  return iconName ?? user.name;
}

function PresenceAvatar({ user, mode }: { user: Participant['user']; mode: Participant['mode'] }) {
  if (user.type === 'agent') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-presence-badge="agent"
            data-presence-mode={mode}
            role="img"
            aria-label={user.name}
            className="inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-full ring-2 ring-background"
            style={{ backgroundColor: user.color }}
          >
            <AgentIcon icon={user.icon} width={16} height={16} className="text-white" />
          </div>
        </TooltipTrigger>
        <TooltipContent>{agentTooltipName(user)}</TooltipContent>
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

export function PresenceBar() {
  const { activeProvider, activeDocName } = useDocumentContext();
  const participants = usePresence(activeProvider);
  const syncStatus = useSyncStatus(activeProvider);

  return (
    <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
      {activeDocName && <SyncIndicator status={syncStatus} />}
      <div className="flex items-center -space-x-1.5">
        {participants.map((p) => (
          <PresenceAvatar key={p.clientId} user={p.user} mode={p.mode} />
        ))}
      </div>
    </div>
  );
}
