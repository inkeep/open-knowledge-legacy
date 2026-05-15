import type { TargetData } from '@inkeep/open-knowledge-core';
import { ArrowUpRight } from 'lucide-react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import {
  buildProjectScopedHandoffInput,
  openInstallUrl,
  useHandoffDispatch,
} from '@/components/handoff/useHandoffDispatch';
import { useInstalledAgents } from '@/components/handoff/useInstalledAgents';
import { VISIBLE_TARGETS } from '@/lib/handoff/targets';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';

interface AgentHandoffGridProps {
  readonly className?: string;
}

export function AgentHandoffGrid({ className }: AgentHandoffGridProps) {
  const { states, refresh } = useInstalledAgents();
  const { dispatch } = useHandoffDispatch();
  const workspace = useWorkspace();
  const handoffInput = buildProjectScopedHandoffInput({ workspace });

  return (
    <div className={cn('grid w-full max-w-5xl gap-4 sm:grid-cols-3', className)}>
      {VISIBLE_TARGETS.map((target) => {
        const probed = states[target.id]?.installed;
        const status: CardStatus =
          probed === true ? 'installed' : probed === false ? 'missing' : 'pending';
        return (
          <AgentHandoffCard
            key={target.id}
            target={target}
            status={status}
            onOpen={
              status === 'installed' && handoffInput !== null
                ? () => {
                    void dispatch(target.id, handoffInput);
                  }
                : undefined
            }
            onInstall={() => {
              void openInstallUrl(target);
              void refresh();
            }}
          />
        );
      })}
    </div>
  );
}

type CardStatus = 'installed' | 'missing' | 'pending';

interface AgentHandoffCardProps {
  readonly target: TargetData;
  readonly status: CardStatus;
  readonly onOpen?: () => void;
  readonly onInstall: () => void;
}

function AgentHandoffCard({ target, status, onOpen, onInstall }: AgentHandoffCardProps) {
  const onClick = status === 'installed' ? onOpen : status === 'missing' ? onInstall : undefined;
  const disabled = status === 'pending' || (status === 'installed' && onOpen === undefined);
  const label = status === 'installed' ? 'Open' : status === 'missing' ? 'Install' : 'Checking';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex h-full flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left transition-[border-color,box-shadow,transform] hover:border-border hover:shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <TargetIcon id={target.id} aria-hidden="true" className="size-4" />
          <h3 className="text-sm font-medium leading-tight">{target.displayName}</h3>
        </div>
        {target.tagline ? (
          <p className="text-1sm leading-relaxed text-muted-foreground">{target.tagline}</p>
        ) : null}
      </div>
      <p className="mt-auto inline-flex items-center gap-1 pt-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        {label}
        {status === 'missing' ? <ArrowUpRight aria-hidden="true" className="size-3" /> : null}
      </p>
    </button>
  );
}
