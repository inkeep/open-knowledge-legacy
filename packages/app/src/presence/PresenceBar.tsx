import { type AgentPresenceEntry, deriveIconColor } from '@inkeep/open-knowledge-core';
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
import { type FC, type SVGProps, useEffect, useRef, useState } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { ClineIcon } from '@/components/icons/cline';
import { CodexIcon } from '@/components/icons/codex';
import { CopilotIcon } from '@/components/icons/copilot';
import { CursorIcon } from '@/components/icons/cursor';
import { WindsurfIcon } from '@/components/icons/windsurf';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hashFromDocName } from '@/lib/doc-hash';
import type { AwarenessUser } from './identity.ts';
import {
  type AgentParticipant,
  type HumanParticipant,
  type Participant,
  usePresence,
} from './use-presence';

/**
 * Navigate to a doc from a user-initiated click (e.g. the cross-doc tooltip
 * wiki-link). Uses the hash-based nav pattern — matches other user-initiated
 * nav sites (FileTree, FolderOverview, EditorHeader). NavigationHandler
 * picks up the hashchange and calls `openTargetTransition`, which drives
 * the Activity/Suspense render path.
 *
 * Distinct from `openDocumentTransition` which only updates the provider
 * pool; hash-setting is the canonical flow when we want the URL to reflect
 * the new location.
 */
function navigateToDoc(docName: string): void {
  window.location.hash = hashFromDocName(docName);
}

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
  onNavigate,
}: {
  participant: AgentParticipant;
  crossDoc: boolean;
  onNavigate: (docName: string) => void; // injected for testability; defaults to hash-set
}) {
  const { presence } = participant;
  const tooltipName = agentTooltipName(presence);
  // Invariant: `navigable` (cross-doc → interactive `<button>`) and
  // `writing` (pulsing ring) are mutually exclusive by construction. Lock
  // that at the predicate level so a future product change ("show pulse
  // on cross-doc writing") cannot silently compose `animate-pulse` onto
  // the navigable `<button>` — pulsing pointer avatars break touch
  // hit-testing on mobile Safari (precedent #20).
  const navigable = crossDoc && presence.currentDoc !== null;
  const heldWriting = useWritingPulse(presence.mode);
  const writing = !navigable && !crossDoc && heldWriting;
  // a11y contract: cross-doc avatars are the navigation affordance (per
  // Radix guidance, interactive content does NOT live inside TooltipContent —
  // keyboard users never reach it). When `navigable`, render a real
  // <button> so it joins the tab sequence, announces as a button to screen
  // readers, and handles Enter/Space natively. The tooltip stays as a
  // descriptive overlay for mouse users. Current-doc avatars render as a
  // non-interactive `<div role="img">` (no nav — it's the active doc).
  const sharedClasses = [
    'inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-2 ring-background',
    navigable ? 'cursor-pointer' : 'cursor-default',
    writing ? 'ring-primary/40 animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const dataAttrs = {
    'data-presence-badge': 'agent',
    'data-presence-mode': presence.mode,
    'data-presence-crossdoc': crossDoc ? 'true' : undefined,
  };

  const avatar = navigable ? (
    // The native <button> role already announces activation semantics; the
    // browser/AT layer handles Enter AND Space without us naming either.
    // Embedding "Press Enter to open" in aria-label doubled the
    // announcement on NVDA/JAWS/VoiceOver and misled Space-only users.
    // WAI-ARIA APG button pattern: do not restate role-provided info.
    <button
      type="button"
      {...dataAttrs}
      aria-label={`${tooltipName}, editing ${presence.currentDoc}`}
      className={sharedClasses}
      style={{ backgroundColor: presence.color }}
      onClick={() => {
        if (presence.currentDoc) onNavigate(presence.currentDoc);
      }}
    >
      <AgentIcon icon={presence.icon} width={16} height={16} className="text-white" />
    </button>
  ) : (
    <div
      {...dataAttrs}
      role="img"
      aria-label={tooltipName}
      className={sharedClasses}
      style={{ backgroundColor: presence.color }}
    >
      <AgentIcon icon={presence.icon} width={16} height={16} className="text-white" />
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">{tooltipName}</span>
        {crossDoc && presence.currentDoc ? (
          // Descriptive text only — the click affordance lives on the avatar
          // itself (keyboard-accessible, screen-reader-announced). Keeping
          // the wiki-link-shaped label here so mouse users still see the
          // familiar wiki-link visual cue.
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
  onNavigate,
}: {
  count: number;
  remainder: Participant[];
  crossDoc: boolean;
  onNavigate: (docName: string) => void; // injected for testability; defaults to hash-set
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
        {currentPrimary.map((p) => renderParticipant(p, navigateToDoc, false))}
        {currentRemainder.length > 0 ? (
          <OverflowChip
            count={currentRemainder.length}
            remainder={currentRemainder}
            crossDoc={false}
            onNavigate={navigateToDoc}
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
            {crossDocPrimary.map((p) => renderParticipant(p, navigateToDoc, true))}
            {crossDocRemainder.length > 0 ? (
              <OverflowChip
                count={crossDocRemainder.length}
                remainder={crossDocRemainder}
                crossDoc={true}
                onNavigate={navigateToDoc}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
