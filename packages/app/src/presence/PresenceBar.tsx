import {
  type AgentPresenceEntry,
  computeInitials,
  deriveIconColor,
} from '@inkeep/open-knowledge-core';
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
import { type FC, useEffect, useRef, useState } from 'react';
import { AgentIcon } from '@/components/icons/AgentIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
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

function HumanAvatar({
  user,
  mode,
  tabCount,
}: {
  user: AwarenessUser;
  mode: HumanParticipant['mode'];
  tabCount: number;
}) {
  // Git-config users (principalId present) always render initials — never the
  // animal icon, even if user.name's second word coincidentally matches one
  // (D1: source-gating via principalId presence avoids the 'John Bird' quirk).
  const hasPrincipalId = typeof user.principalId === 'string' && user.principalId.length > 0;
  const animal = hasPrincipalId ? undefined : user.name.split(' ')[1];
  const AnimalIcon = animal ? ANIMAL_ICON_MAP[animal] : undefined;
  const initials = computeInitials(user.name);
  const iconColor = deriveIconColor(user.color);
  const tooltipText = tabCount > 1 ? `${user.name} · ${tabCount} tabs` : user.name;

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
      <TooltipContent>{tooltipText}</TooltipContent>
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

/**
 * Minimum visible duration of the `writing` pulse in ms. The server flips
 * `setPresence(mode:'writing')` → `touchMode('idle')` around each HTTP write,
 * and `applyAgentMarkdownWrite` typically completes in 20-50ms for small
 * edits. Without a floor, the `animate-pulse` CSS class is removed before
 * its 2s keyframe even starts — the ring change is subperceptual.
 *
 * 600ms gives the pulse at least one visible cycle on the 2s animation
 * without feeling laggy. Successive writes re-trigger and extend the
 * window (via the effect's freshness tracking), so under sustained write
 * activity the ring stays lit continuously.
 */
export const WRITING_PULSE_MIN_MS = 600;

/**
 * Hold the writing-pulse visual for at least `WRITING_PULSE_MIN_MS` after
 * the server reports `mode === 'writing'`, even if it flips back to `'idle'`
 * sooner. Does NOT extend past the base `mode === 'writing'` duration — a
 * genuinely long write keeps pulsing as long as the server says so.
 *
 * Returns `true` iff the avatar should render with the pulse treatment.
 *
 * Testing note: the setTimeout + ref pattern is the idiomatic "minimum
 * display duration" — avoiding `useCallback`/`useMemo` per the React
 * Compiler convention in this repo.
 */
function useWritingPulse(mode: AgentPresenceEntry['mode']): boolean {
  const [held, setHeld] = useState(mode === 'writing');
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === 'writing') {
      // Cancel any pending "turn off" timer and lock held=true. This is
      // the "every writing tick re-arms the floor" behavior that lets
      // bursts of rapid writes keep the pulse on continuously.
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setHeld(true);
      return;
    }
    // mode === 'idle' — schedule the pulse to turn off WRITING_PULSE_MIN_MS
    // from now. If a new writing arrives before the timer fires, the `if`
    // branch above cancels and re-arms. If the component unmounts, the
    // cleanup clears the timer.
    if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      setHeld(false);
    }, WRITING_PULSE_MIN_MS);
    return () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, [mode]);

  return held;
}

function AgentAvatar({
  participant,
  crossDoc,
  scoped,
  onClickAgent,
}: {
  participant: AgentParticipant;
  crossDoc: boolean;
  /** `true` when the DocPanel is currently showing this agent's Activity view. */
  scoped: boolean;
  /**
   * Handler invoked when the avatar is clicked. Receives the agent's
   * connectionId (the presence map key — the `agent-<raw>` form).
   *
   * Post-2026-04-23 Activity Panel (SPEC D-P9 LOCKED): every agent avatar
   * is a click target that opens the Activity Panel keyed to this agent.
   * The panel's filename-click affordance replaces the old cross-doc
   * nav-on-avatar-click UX (now one more click, much richer info).
   */
  onClickAgent: (connectionId: string) => void;
}) {
  const { presence, agentId } = participant;
  const tooltipName = agentTooltipName(presence);
  const heldWriting = useWritingPulse(presence.mode);
  // Writing pulse only for current-doc agents (crossDoc avatars are dimmed +
  // grayscaled by a parent wrapper; composing animate-pulse on top of that
  // is visually noisy). Precedent #20 bans pulsing on touch targets.
  const writing = !crossDoc && heldWriting;
  // Scoped ring communicates "this avatar's Activity view is currently open."
  // Takes precedence over the writing-pulse ring so the signal is stable
  // even while the agent is actively writing.
  const sharedClasses = [
    'inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-2 cursor-pointer',
    scoped ? 'ring-primary ring-offset-2 ring-offset-background' : 'ring-background',
    writing && !scoped ? 'ring-primary/40 animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const dataAttrs = {
    'data-presence-badge': 'agent',
    'data-presence-mode': presence.mode,
    'data-presence-crossdoc': crossDoc ? 'true' : undefined,
    'data-presence-scoped': scoped ? 'true' : undefined,
  };

  const ariaLabel =
    crossDoc && presence.currentDoc
      ? `Open activity panel for ${tooltipName}, editing ${presence.currentDoc}`
      : `Open activity panel for ${tooltipName}`;

  const avatar = (
    <button
      type="button"
      {...dataAttrs}
      aria-label={ariaLabel}
      className={sharedClasses}
      style={{ backgroundColor: presence.color }}
      onClick={() => onClickAgent(agentId)}
    >
      <AgentIcon icon={presence.icon} width={16} height={16} className="text-white" />
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">{tooltipName}</span>
        {crossDoc && presence.currentDoc ? (
          // Descriptive text only — click affordance is on the avatar itself.
          // Keeping the wiki-link-shaped label so mouse users still see the
          // familiar visual cue, but note it is no longer a nav target.
          <span className="text-xs text-muted-foreground">editing [[{presence.currentDoc}]]</span>
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
  scopedAgentId,
  onClickAgent,
}: {
  count: number;
  remainder: Participant[];
  crossDoc: boolean;
  scopedAgentId: string | null;
  onClickAgent: (connectionId: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="presence-overflow"
          data-presence-crossdoc={crossDoc ? 'true' : undefined}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs ring-2 ring-background hover:bg-muted/80"
          aria-label={`${count} more ${crossDoc ? 'cross-doc ' : ''}${count === 1 ? 'participant' : 'participants'}`}
        >
          +{count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-xs p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {remainder.map((p) => {
            if (p.kind === 'human') {
              return (
                <HumanAvatar key={p.clientId} user={p.user} mode={p.mode} tabCount={p.tabCount} />
              );
            }
            return (
              <AgentAvatar
                key={p.agentId}
                participant={p}
                crossDoc={crossDoc}
                scoped={scopedAgentId === p.agentId}
                onClickAgent={onClickAgent}
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
  onClickAgent: (connectionId: string) => void,
  crossDoc: boolean,
  scopedAgentId: string | null,
) {
  if (p.kind === 'human') {
    return <HumanAvatar key={p.clientId} user={p.user} mode={p.mode} tabCount={p.tabCount} />;
  }
  return (
    <AgentAvatar
      key={p.agentId}
      participant={p}
      crossDoc={crossDoc}
      scoped={scopedAgentId === p.agentId}
      onClickAgent={onClickAgent}
    />
  );
}

export function PresenceBar() {
  const {
    activeProvider,
    activeDocName,
    systemProvider,
    openActivityPanel,
    docPanelMode,
    docPanelAgentId,
  } = useDocumentContext();
  const { current, crossDoc } = usePresence(activeProvider, systemProvider, activeDocName);
  const syncStatus = useSyncStatus(activeProvider);
  useSyncToasts(syncStatus, activeDocName);

  const currentPrimary = current.slice(0, M_CURRENT_PRIMARY);
  const currentRemainder = current.slice(M_CURRENT_PRIMARY);
  const crossDocPrimary = crossDoc.slice(0, K_CROSSDOC_PRIMARY);
  const crossDocRemainder = crossDoc.slice(K_CROSSDOC_PRIMARY);

  // D-P9 LOCKED: every agent avatar opens the Activity Panel keyed to that
  // agent's connectionId. Avatars of the currently-scoped agent get a ring
  // highlight so the user sees which session the DocPanel is showing.
  const onClickAgent = openActivityPanel;
  const scopedAgentId = docPanelMode === 'agent' ? docPanelAgentId : null;

  return (
    <div data-slot="presence-bar" className="flex items-center px-1 py-1.5">
      <div className="flex items-center gap-1.5" data-presence-section="current">
        {currentPrimary.map((p) => renderParticipant(p, onClickAgent, false, scopedAgentId))}
        {currentRemainder.length > 0 ? (
          <OverflowChip
            count={currentRemainder.length}
            remainder={currentRemainder}
            crossDoc={false}
            scopedAgentId={scopedAgentId}
            onClickAgent={onClickAgent}
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
            {crossDocPrimary.map((p) => renderParticipant(p, onClickAgent, true, scopedAgentId))}
            {crossDocRemainder.length > 0 ? (
              <OverflowChip
                count={crossDocRemainder.length}
                remainder={crossDocRemainder}
                crossDoc={true}
                scopedAgentId={scopedAgentId}
                onClickAgent={onClickAgent}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
