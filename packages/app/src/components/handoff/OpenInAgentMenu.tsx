/**
 * Dropdown shell for the Open-in-Agent action.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §7.1
 * (primary surface placement; mounted in EditorHeader, CommandPalette via
 * sibling helpers, and FileTree right-click context menu in US-011) + §7.4
 * (Electron / web parity).
 *
 * Composition:
 *   - `useInstalledAgents()` provides per-target install state. `refresh()`
 *     fires when the menu opens (SQ5 DIRECTED option c — async refresh on open
 *     with a 10s per-scheme throttle).
 *   - `useHandoffDispatch()` provides the single `dispatch(target, input)`
 *     entry point. Per AC9, the only outbound dispatch site under
 *     `packages/app/src/components/` lives here (other surfaces wire to this
 *     menu rather than calling `dispatchHandoff` directly).
 *   - One `<OpenInAgentMenuItem />` per `KNOWN_TARGETS` entry — the per-row
 *     component owns enabled/disabled rendering and the disabled-tooltip with
 *     install / web-fallback affordances.
 *
 * The `input` prop is supplied by the surface (EditorHeader, etc.). When
 * `null` (no active doc), the trigger is disabled — the menu has nothing to
 * dispatch.
 */

import { composePrompt, type TargetData } from '@inkeep/open-knowledge-core';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { OpenInAgentMenuItem, successToastForWebFallback } from './OpenInAgentMenuItem';
import { type HandoffDispatchInput, useHandoffDispatch } from './useHandoffDispatch';
import { useInstalledAgents } from './useInstalledAgents';

export { successToastForWebFallback };

export interface OpenInAgentMenuProps {
  /** Active doc context. When `null`, the trigger renders disabled (nothing
   *  to dispatch). Surfaces own the docContext + projectDir + docPath. */
  readonly input: HandoffDispatchInput | null;
}

/**
 * Renders the dropdown trigger + content. Trigger is a `MoreHorizontal` icon
 * button with `aria-label="Open in…"`; content is a list of per-target rows
 * derived from `KNOWN_TARGETS`.
 */
export function OpenInAgentMenu({ input }: OpenInAgentMenuProps): ReactNode {
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const [open, setOpen] = useState(false);

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;

  // The web-fallback is its own side-effect (separate from the per-row
  // dispatch toasts that `useHandoffDispatch` owns). Surface a sonner
  // success toast on a successful claude.ai fallback open.
  const handleWebFallbackSuccess = (target: TargetData): void => {
    sonnerToast.success(successToastForWebFallback(target.displayName));
  };

  // Refresh install state on open per SQ5 DIRECTED option c. The probe
  // coordinator handles throttle + dedup so calling on every open is safe.
  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) void refresh();
  };

  const triggerDisabled = input === null;
  // Use a stable empty-prompt sentinel when input is null. The menu renders
  // disabled in that case so prompt is not actually consumed; this keeps the
  // type narrow and avoids a useless `?? ''` dance in each child.
  const prompt = input !== null ? composePrompt(input.docContext) : '';

  const handleSelect = (target: TargetData): void => {
    if (input === null) return;
    void dispatch(target.id, input);
  };

  return (
    <TooltipProvider>
      <DropdownMenuRoot open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in…"
            disabled={triggerDisabled}
            className="text-muted-foreground"
            data-testid="open-in-agent-trigger"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]" data-testid="open-in-agent-menu">
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
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </TooltipProvider>
  );
}
