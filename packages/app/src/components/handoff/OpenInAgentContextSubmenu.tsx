import {
  composePrompt,
  type HandoffOutcome,
  type HandoffTarget,
  type InstallState,
} from '@inkeep/open-knowledge-core';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import { cn } from '@/lib/utils';
import {
  dispatchClaudeWebFallback,
  shouldShowSkillInstallBadge,
  TargetIcon,
} from './OpenInAgentMenuItem';
import type { HandoffDispatchInput } from './useHandoffDispatch';

export function contextRowHint(inputMissing: boolean): string | null {
  if (inputMissing) return 'No workspace';
  return null;
}

interface OpenInAgentContextSubmenuProps {
  /** Handoff input for the right-clicked node. `null` means the row's dispatch
   *  is not actionable (no workspace metadata yet). Every row still renders
   *  disabled with a "No workspace" hint so the UX doesn't flicker. */
  readonly input: HandoffDispatchInput | null;
  /** Install state per target. Supplied by `FileTree`'s top-level
   *  `useInstalledAgents()` call so every file row shares one coordinator. */
  readonly installStates: Record<HandoffTarget, InstallState>;
  /** Host classifier — left in the prop signature for consumers that already
   *  thread it; v1 doesn't use it because uninstalled rows aren't rendered.
   *  Web-host Cursor uses the same probe + filter as every other target now
   *  that `cursor-two-step.ts` has a `/api/spawn-cursor` fetch fallback
   *  (PR #625). */
  readonly isElectronHost: boolean;
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
}

export function OpenInAgentContextSubmenu(props: OpenInAgentContextSubmenuProps): ReactNode {
  const { input, installStates, dispatch } = props;
  const { skillInstalled, refresh: refreshIntegration } = useClaudeDesktopIntegration();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const inputMissing = input === null;
  const hint = contextRowHint(inputMissing);

  const installedTargets = KNOWN_TARGETS.filter(
    (target) => installStates[target.id]?.installed === true,
  );

  const claudeInstalled = installStates['claude-cowork']?.installed === true;

  const prompt = input !== null ? composePrompt(input.docContext) : '';

  const handleClaudeWebFallback = (): void => {
    if (input === null) return;
    void dispatchClaudeWebFallback(prompt);
  };

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Sparkles aria-hidden="true" />
          Open in
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {installedTargets.map((target) => {
            const enabled = !inputMissing;
            const onInstallSkillRequest =
              target.id === 'claude-cowork' && enabled && !skillInstalled
                ? () => setInstallDialogOpen(true)
                : undefined;
            const showSkillInstallBadge = shouldShowSkillInstallBadge({
              target,
              onInstallSkillRequest,
            });
            const accessibleLabel = showSkillInstallBadge
              ? `Install Open Knowledge skill in ${target.displayName}`
              : hint
                ? `Open in ${target.displayName}, ${hint}`
                : `Open in ${target.displayName}`;
            return (
              <DropdownMenuItem
                key={target.id}
                disabled={!enabled}
                onSelect={() => {
                  if (!input) return;
                  if (showSkillInstallBadge && onInstallSkillRequest) {
                    onInstallSkillRequest();
                  } else {
                    void dispatch(target.id, input);
                  }
                }}
                data-testid={`file-tree-open-in-${target.id}`}
                aria-label={accessibleLabel}
              >
                <TargetIcon id={target.id} aria-hidden="true" />
                <span className={cn('flex-1', showSkillInstallBadge && 'whitespace-nowrap')}>
                  {target.displayName}
                </span>
                {showSkillInstallBadge ? (
                  <Badge
                    variant="outline"
                    aria-hidden="true"
                    className="ml-2 h-[18px] px-1.5 py-0 text-[10px]"
                    data-testid="open-in-agent-skill-install-badge"
                  >
                    Install
                  </Badge>
                ) : hint ? (
                  <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                    {hint}
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
          {!claudeInstalled ? (
            <DropdownMenuItem
              onSelect={handleClaudeWebFallback}
              disabled={inputMissing}
              data-testid="file-tree-open-in-claude-web-fallback"
              aria-label="Open in claude.ai, opens in browser with prompt pre-filled"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="flex-1">Open in claude.ai →</span>
              <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                opens in browser
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <InstallInClaudeDesktopDialog
        open={installDialogOpen}
        onOpenChange={(next) => {
          setInstallDialogOpen(next);
          if (!next) refreshIntegration();
        }}
      />
    </>
  );
}
