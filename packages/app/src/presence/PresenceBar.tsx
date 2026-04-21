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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import type { AwarenessUser } from './identity.ts';
import {
  type AgentParticipant,
  type HumanParticipant,
  type Participant,
  usePresence,
} from './use-presence';
import { useSyncStatus } from './use-sync-status';
import { useSyncToasts } from './use-sync-toasts';

/**
 * Primary-avatar limits per D7 (DELEGATED). M = current-doc, K = cross-doc;
 * each section applies overflow independently so a large cross-doc cohort
 * doesn't push the current-doc primaries into the overflow popover.
 */
const M_CURRENT_PRIMARY = 4;
const K_CROSSDOC_PRIMARY = 3;

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

const AGENT_DISPLAY_NAME: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  openai: 'Codex',
  github: 'Copilot',
  cline: 'Cline',
  bot: 'Agent',
};

/** Map `icon` to a component. Falls back to Sparkles for unknown agents. */
function AgentIcon({ icon, ...props }: { icon?: string } & SVGProps<SVGSVGElement>) {
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  if (icon === 'windsurf') return <WindsurfIcon {...props} />;
  if (icon === 'openai') return <CodexIcon {...props} />;
  if (icon === 'cline') return <ClineIcon {...props} />;
  if (icon === 'github') return <CopilotIcon {...props} />;
  return <Sparkles strokeWidth={1.5} {...(props as LucideProps)} />;
}

function HumanAvatar({ user, mode }: { user: AwarenessUser; mode: HumanParticipant['mode'] }) {
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

/**
 * Friendly display name for an agent. Prefers the explicit displayName
 * (may be the user's AGENT_LABEL) falling back to the icon-derived name
 * for well-known brands, finally to displayName.
 */
function agentTooltipName(presence: AgentParticipant['presence']): string {
  const iconName = AGENT_DISPLAY_NAME[presence.icon];
  return presence.displayName || iconName || 'Agent';
}

function AgentAvatar({
  participant,
  crossDoc,
  onNavigate,
}: {
  participant: AgentParticipant;
  crossDoc: boolean;
  onNavigate: (docName: string) => void;
}) {
  const { presence } = participant;
  const tooltipName = agentTooltipName(presence);
  // Mode pulse visual is current-doc-only (D10 + D12) — cross-doc avatars
  // stay dimmed regardless of mode to avoid competing with the section's
  // grayscale treatment.
  const editing = !crossDoc && presence.mode === 'editing';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-presence-badge="agent"
          data-presence-mode={presence.mode}
          data-presence-crossdoc={crossDoc ? 'true' : undefined}
          role="img"
          aria-label={tooltipName}
          className={[
            'inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-full ring-2 ring-background',
            editing ? 'ring-primary/40 animate-pulse' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ backgroundColor: presence.color }}
        >
          <AgentIcon icon={presence.icon} width={16} height={16} className="text-white" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">{tooltipName}</span>
        {crossDoc && presence.currentDoc ? (
          <button
            type="button"
            className="text-xs underline underline-offset-2 hover:text-primary"
            onClick={() => {
              if (presence.currentDoc) onNavigate(presence.currentDoc);
            }}
          >
            editing [[{presence.currentDoc}]]
          </button>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * +N overflow chip backed by a shadcn Popover. Renders the remainder avatars
 * (compact inline) when opened. Keyboard navigation inherited from radix.
 */
function OverflowChip({
  count,
  remainder,
  crossDoc,
  onNavigate,
}: {
  count: number;
  remainder: Participant[];
  crossDoc: boolean;
  onNavigate: (docName: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="presence-overflow"
          data-presence-crossdoc={crossDoc ? 'true' : undefined}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs ring-2 ring-background hover:bg-muted/80"
          aria-label={`${count} more ${crossDoc ? 'cross-doc ' : ''}participants`}
        >
          +{count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-xs p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {remainder.map((p) => {
            if (p.kind === 'human') {
              return <HumanAvatar key={p.clientId} user={p.user} mode={p.mode} />;
            }
            return (
              <AgentAvatar
                key={p.agentId}
                participant={p}
                crossDoc={crossDoc}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function renderParticipant(
  p: Participant,
  onNavigate: (docName: string) => void,
  crossDoc: boolean,
) {
  if (p.kind === 'human') {
    return <HumanAvatar key={p.clientId} user={p.user} mode={p.mode} />;
  }
  return (
    <AgentAvatar key={p.agentId} participant={p} crossDoc={crossDoc} onNavigate={onNavigate} />
  );
}

export function PresenceBar() {
  const { activeProvider, activeDocName, systemProvider } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const { current, crossDoc } = usePresence(activeProvider, systemProvider, activeDocName);
  const syncStatus = useSyncStatus(activeProvider);
  useSyncToasts(syncStatus, activeDocName);

  const currentPrimary = current.slice(0, M_CURRENT_PRIMARY);
  const currentRemainder = current.slice(M_CURRENT_PRIMARY);
  const crossDocPrimary = crossDoc.slice(0, K_CROSSDOC_PRIMARY);
  const crossDocRemainder = crossDoc.slice(K_CROSSDOC_PRIMARY);

  return (
    <div data-slot="presence-bar" className="flex items-center px-1 py-1.5">
      <div className="flex items-center gap-1.5" data-presence-section="current">
        {currentPrimary.map((p) => renderParticipant(p, openDocumentTransition, false))}
        {currentRemainder.length > 0 ? (
          <OverflowChip
            count={currentRemainder.length}
            remainder={currentRemainder}
            crossDoc={false}
            onNavigate={openDocumentTransition}
          />
        ) : null}
      </div>

      {crossDoc.length > 0 ? (
        <>
          <div className="mx-2 h-4 w-px bg-border" aria-hidden data-slot="presence-divider" />
          <div
            className="flex items-center gap-1.5 opacity-60 grayscale"
            data-presence-section="crossdoc"
          >
            {crossDocPrimary.map((p) => renderParticipant(p, openDocumentTransition, true))}
            {crossDocRemainder.length > 0 ? (
              <OverflowChip
                count={crossDocRemainder.length}
                remainder={crossDocRemainder}
                crossDoc={true}
                onNavigate={openDocumentTransition}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
