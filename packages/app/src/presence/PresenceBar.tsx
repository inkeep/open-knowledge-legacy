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
  Sparkles,
  Squirrel,
  Turtle,
} from 'lucide-react';
import type { FC, SVGProps } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { ClineIcon } from '@/components/icons/cline';
import { CodexIcon } from '@/components/icons/codex';
import { CopilotIcon } from '@/components/icons/copilot';
import { CursorIcon } from '@/components/icons/cursor';
import { WindsurfIcon } from '@/components/icons/windsurf';
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

/** Map the `icon` field from awareness to a component. Falls back to Sparkles for unknown agents. */
function AgentIcon({ icon, ...props }: { icon?: string } & SVGProps<SVGSVGElement>) {
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  if (icon === 'windsurf') return <WindsurfIcon {...props} />;
  if (icon === 'openai') return <CodexIcon {...props} />;
  if (icon === 'cline') return <ClineIcon {...props} />;
  if (icon === 'github') return <CopilotIcon {...props} />;
  return <Sparkles strokeWidth={1.5} {...(props as LucideProps)} />;
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
