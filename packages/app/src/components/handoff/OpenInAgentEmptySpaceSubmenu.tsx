import {
  composeFilePrompt,
  type HandoffOutcome,
  type HandoffTarget,
  type InstallState,
} from '@inkeep/open-knowledge-core';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { dispatchClaudeWebFallback, TargetIcon } from './OpenInAgentMenuItem';
import type { HandoffDispatchInput } from './useHandoffDispatch';

/** Status hint shown alongside per-target rows when the input is not ready
 *  (workspace not resolved yet). Mirrors `contextRowHint` in the sibling
 *  submenu so accessibility-label phrasing stays in lockstep across surfaces. */
export function emptySpaceRowHint(inputMissing: boolean): string | null {
  if (inputMissing) return 'No workspace';
  return null;
}

interface OpenInAgentEmptySpaceSubmenuProps {
  /** Handoff input for the active scope. `null` while workspace metadata
   *  is still resolving — rows still render disabled with a "No workspace"
   *  hint so the trigger doesn't appear/disappear during the cold-start
   *  fetch (visual stability matches `OpenInAgentContextSubmenu`). */
  readonly input: HandoffDispatchInput | null;
  /** Install state per target. Caller-owned via `useInstalledAgents()` so
   *  the empty-space + sparkle + row surfaces share one coordinator. */
  readonly installStates: Record<HandoffTarget, InstallState>;
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
  /** Show the "Open in claude.ai →" web-fallback row when Claude Desktop
   *  isn't installed. Default `true` matches the file-surface convention;
   *  folder + empty-space surfaces pass `false` — the claude.ai web URL has
   *  no companion `folder=` param to ground the cloud agent. */
  readonly webFallbackVisible?: boolean;
}

export function OpenInAgentEmptySpaceSubmenu(props: OpenInAgentEmptySpaceSubmenuProps): ReactNode {
  const { input, installStates, dispatch, webFallbackVisible = true } = props;
  const inputMissing = input === null;
  const hint = emptySpaceRowHint(inputMissing);

  const installedTargets = VISIBLE_TARGETS.filter(
    (target) => installStates[target.id]?.installed === true,
  );

  const claudeInstalled = installStates['claude-code']?.installed === true;

  const prompt =
    input !== null && input.docContext !== null
      ? composeFilePrompt(input.docContext.relativePath)
      : '';

  const handleClaudeWebFallback = (): void => {
    if (input === null) return;
    void dispatchClaudeWebFallback(prompt);
  };

  const fallbackRowVisible = webFallbackVisible && !claudeInstalled;
  if (installedTargets.length === 0 && !fallbackRowVisible) {
    return null;
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Sparkles aria-hidden="true" />
        Open with AI
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {installedTargets.map((target) => {
          const enabled = !inputMissing;
          const accessibleLabel = hint
            ? `Open with AI ${target.displayName}, ${hint}`
            : `Open with AI ${target.displayName}`;
          return (
            <ContextMenuItem
              key={target.id}
              disabled={!enabled}
              onSelect={() => {
                if (!input) return;
                void dispatch(target.id, input);
              }}
              data-testid={`empty-space-open-in-${target.id}`}
              aria-label={accessibleLabel}
            >
              <TargetIcon id={target.id} aria-hidden="true" />
              <span className="flex-1">{target.displayName}</span>
              {hint ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  {hint}
                </span>
              ) : null}
            </ContextMenuItem>
          );
        })}
        {webFallbackVisible && !claudeInstalled ? (
          <ContextMenuItem
            onSelect={handleClaudeWebFallback}
            disabled={inputMissing}
            data-testid="empty-space-open-in-claude-web-fallback"
            aria-label="Open in claude.ai, opens in browser with prompt pre-filled"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="flex-1">Open in claude.ai →</span>
            <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
              opens in browser
            </span>
          </ContextMenuItem>
        ) : null}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
