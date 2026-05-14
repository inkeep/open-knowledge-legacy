import { composePrompt, type TargetData } from '@inkeep/open-knowledge-core';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import {
  dispatchClaudeWebFallback,
  OpenInAgentMenuItem,
  successToastForWebFallback,
} from './OpenInAgentMenuItem';
import { type HandoffDispatchInput, useHandoffDispatch } from './useHandoffDispatch';
import { useInstalledAgents } from './useInstalledAgents';

export { successToastForWebFallback };

interface OpenInAgentMenuProps {
  /** Active doc context. When `null`, the trigger renders disabled (nothing
   *  to dispatch). Surfaces own the docContext + projectDir + docPath. */
  readonly input: HandoffDispatchInput | null;
}

export function OpenInAgentMenu({ input }: OpenInAgentMenuProps): ReactNode {
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const { skillInstalled, refresh: refreshIntegration } = useClaudeDesktopIntegration();
  const [open, setOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) void refresh();
  };

  const triggerDisabled = input === null;
  const prompt = input !== null && input.docContext !== null ? composePrompt(input.docContext) : '';

  const handleSelect = (target: TargetData): void => {
    if (input === null) return;
    void dispatch(target.id, input);
  };

  const installedTargets = KNOWN_TARGETS.filter((target) => states[target.id]?.installed === true);

  const claudeInstalled = states['claude-cowork']?.installed === true;

  const handleClaudeWebFallback = (): void => {
    if (input === null) return;
    void dispatchClaudeWebFallback(prompt);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit with AI"
                disabled={triggerDisabled}
                className="text-muted-foreground"
                data-testid="open-in-agent-trigger"
              >
                <Sparkles className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Edit with AI</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[220px]" data-testid="open-in-agent-menu">
          <DropdownMenuLabel className="font-mono font-normal tracking-wide uppercase text-muted-foreground text-xs">
            Open in
          </DropdownMenuLabel>
          {installedTargets.map((target) => {
            const installState = states[target.id];
            const onInstallSkillRequest =
              target.id === 'claude-cowork' && !skillInstalled
                ? () => setInstallDialogOpen(true)
                : undefined;
            return (
              <OpenInAgentMenuItem
                key={target.id}
                target={target}
                installState={installState}
                isElectronHost={isElectronHost}
                prompt={prompt}
                onSelect={() => handleSelect(target)}
                onInstallSkillRequest={onInstallSkillRequest}
              />
            );
          })}
          {!claudeInstalled ? (
            <DropdownMenuItem
              onSelect={handleClaudeWebFallback}
              disabled={input === null}
              data-testid="open-in-agent-claude-web-fallback"
              aria-label="Open in claude.ai, opens in browser with prompt pre-filled"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="flex-1">Open in claude.ai →</span>
              <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                opens in browser
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
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
