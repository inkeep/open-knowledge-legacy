import { composePrompt, type TargetData } from '@inkeep/open-knowledge-core';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { OpenInAgentMenuItem, successToastForWebFallback } from './OpenInAgentMenuItem';
import { type HandoffDispatchInput, useHandoffDispatch } from './useHandoffDispatch';
import { useInstalledAgents } from './useInstalledAgents';

export { successToastForWebFallback };

interface OpenInAgentMenuProps {
  readonly input: HandoffDispatchInput | null;
}

export function OpenInAgentMenu({ input }: OpenInAgentMenuProps): ReactNode {
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const [open, setOpen] = useState(false);

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;

  const handleWebFallbackSuccess = (target: TargetData): void => {
    sonnerToast.success(successToastForWebFallback(target.displayName));
  };

  const handleWebFallbackError = (target: TargetData): void => {
    sonnerToast.error(`Couldn't open ${target.displayName} in your browser.`);
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) void refresh();
  };

  const triggerDisabled = input === null;
  const prompt = input !== null ? composePrompt(input.docContext) : '';

  const handleSelect = (target: TargetData): void => {
    if (input === null) return;
    void dispatch(target.id, input);
  };

  return (
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
          Open in…
        </DropdownMenuLabel>
        {KNOWN_TARGETS.map((target) => {
          const installState = states[target.id];
          return (
            <OpenInAgentMenuItem
              key={target.id}
              target={target}
              installState={installState}
              isElectronHost={isElectronHost}
              prompt={prompt}
              onSelect={() => handleSelect(target)}
              onWebFallbackSuccess={handleWebFallbackSuccess}
              onWebFallbackError={handleWebFallbackError}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
