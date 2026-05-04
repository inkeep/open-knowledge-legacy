import type {
  HandoffOutcome,
  HandoffTarget,
  InstallState,
  TargetData,
} from '@inkeep/open-knowledge-core';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { computeRowState, TargetIcon } from './OpenInAgentMenuItem';
import type { HandoffDispatchInput } from './useHandoffDispatch';

export function contextRowHint(
  target: TargetData,
  installState: InstallState,
  isElectronHost: boolean,
  inputMissing: boolean,
): string | null {
  if (target.id === 'cursor' && !isElectronHost) return 'Desktop only';
  if (installState.installed === null) return 'Detecting…';
  if (installState.installed === false) return 'Not installed';
  if (inputMissing) return 'No workspace';
  return null;
}

interface OpenInAgentContextSubmenuProps {
  readonly input: HandoffDispatchInput | null;
  readonly installStates: Record<HandoffTarget, InstallState>;
  readonly isElectronHost: boolean;
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
}

export function OpenInAgentContextSubmenu(props: OpenInAgentContextSubmenuProps): ReactNode {
  const { input, installStates, isElectronHost, dispatch } = props;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Sparkles aria-hidden="true" />
        Open in…
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {KNOWN_TARGETS.map((target) => {
          const installState = installStates[target.id];
          const rowState = computeRowState({ target, installState, isElectronHost });
          const inputMissing = input === null;
          const enabled = rowState.enabled && !inputMissing;
          const hint = contextRowHint(target, installState, isElectronHost, inputMissing);
          const accessibleLabel = hint
            ? `Open in ${target.displayName}, ${hint}`
            : `Open in ${target.displayName}`;
          return (
            <DropdownMenuItem
              key={target.id}
              disabled={!enabled}
              onSelect={() => {
                if (!enabled || !input) return;
                void dispatch(target.id, input);
              }}
              data-testid={`file-tree-open-in-${target.id}`}
              aria-label={accessibleLabel}
            >
              <TargetIcon id={target.id} aria-hidden="true" />
              <span className="flex-1">{target.displayName}</span>
              {hint ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  {hint}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
