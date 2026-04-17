/**
 * Stage 7 time-travel UI: a bottom-anchored strip that lets the viewer jump
 * between checkpoints, compare any two, and auto-replay the evolution.
 *
 * State is owned by `useGraphTimeline()` (fetching + derived payload). This
 * component is a thin presentation layer so the demo's visual identity can
 * evolve without re-running the fetch / diff plumbing.
 */

import type { CheckpointEntry } from '@inkeep/open-knowledge-core';
import { ChevronLeft, ChevronRight, GitCompare, Pause, Play, X as XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { checkpointDisplayLabel, formatCheckpointTime, shortSha } from './graph-timeline-util';

interface GraphTimelineProps {
  checkpoints: CheckpointEntry[];
  viewSha: string | null;
  compareFromSha: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  overrideLoading: boolean;
  overrideError: string | null;

  onSelectView(sha: string | null): void;
  onSelectCompareFrom(sha: string | null): void;
  onTogglePlay(): void;
  onStepPrev(): void;
  onStepNext(): void;
}

export function GraphTimeline({
  checkpoints,
  viewSha,
  compareFromSha,
  isPlaying,
  isLoading,
  error,
  overrideLoading,
  overrideError,
  onSelectView,
  onSelectCompareFrom,
  onTogglePlay,
  onStepPrev,
  onStepNext,
}: GraphTimelineProps) {
  const hasCheckpoints = checkpoints.length > 0;
  const diffActive = viewSha !== null && compareFromSha !== null && compareFromSha !== viewSha;
  const showContent = hasCheckpoints || isLoading || error !== null;

  const compareFromEntry = checkpoints.find((c) => c.sha === compareFromSha) ?? null;

  // Scroll the active chip into view whenever viewSha changes (replay
  // mode, prev/next button, external set). Keeps the user oriented as the
  // timeline steps through the history.
  const chipRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipRowRef.current;
    if (!row) return;
    const target = viewSha
      ? row.querySelector<HTMLElement>(`[data-sha="${viewSha}"]`)
      : row.querySelector<HTMLElement>('[data-sha="__now__"]');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [viewSha]);

  if (!showContent) return null;

  const overlayError = overrideError ?? error;

  return (
    <section
      aria-label="Graph timeline"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3"
    >
      <div className="pointer-events-auto flex w-full max-w-5xl flex-col gap-2 rounded-xl border border-border/70 bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex items-center gap-2">
          {/* Transport controls */}
          <div className="flex items-center gap-0.5">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Step to previous checkpoint"
                  disabled={!hasCheckpoints}
                  onClick={onStepPrev}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                Previous checkpoint
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
                  aria-pressed={isPlaying}
                  disabled={!hasCheckpoints}
                  onClick={onTogglePlay}
                >
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                {isPlaying ? 'Pause replay' : 'Replay graph evolution'}
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Step to next checkpoint"
                  disabled={!hasCheckpoints}
                  onClick={onStepNext}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                Next checkpoint
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Chip strip */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              ref={chipRowRef}
              className="flex items-center gap-1.5 overflow-x-auto scrollbar-none [scroll-behavior:smooth]"
              role="tablist"
              aria-label="Saved graph checkpoints"
            >
              <TimelineChip
                label="Now"
                secondary="live"
                active={viewSha === null}
                compare={compareFromSha === null && viewSha !== null}
                kind="live"
                dataSha="__now__"
                onClick={() => onSelectView(null)}
              />
              {checkpoints.map((entry) => (
                <TimelineChip
                  key={entry.sha}
                  label={checkpointDisplayLabel(entry)}
                  secondary={formatCheckpointTime(entry) || shortSha(entry.sha)}
                  active={viewSha === entry.sha}
                  compare={compareFromSha === entry.sha}
                  kind="checkpoint"
                  dataSha={entry.sha}
                  onClick={() => onSelectView(entry.sha)}
                />
              ))}
              {isLoading && !hasCheckpoints ? (
                <span className="shrink-0 px-2 text-xs text-muted-foreground">
                  Loading checkpoints…
                </span>
              ) : null}
            </div>
          </div>

          {/* Compare picker */}
          <div className="flex shrink-0 items-center gap-0.5">
            {diffActive && compareFromEntry ? (
              <div className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-900 dark:text-emerald-200">
                <GitCompare className="size-3.5" />
                <span className="max-w-[140px] truncate">
                  {checkpointDisplayLabel(compareFromEntry)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-5"
                  aria-label="Clear comparison"
                  onClick={() => onSelectCompareFrom(null)}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            ) : (
              <DropdownMenuRoot>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Compare to another checkpoint"
                        disabled={!hasCheckpoints || viewSha === null}
                      >
                        <GitCompare className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                    Compare with another checkpoint
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="z-[9999] max-h-[320px] overflow-y-auto">
                  <DropdownMenuLabel>Compare against</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {checkpoints
                    .filter((c) => c.sha !== viewSha)
                    .map((c) => (
                      <DropdownMenuItem key={c.sha} onSelect={() => onSelectCompareFrom(c.sha)}>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-xs font-medium">
                            {checkpointDisplayLabel(c)}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {formatCheckpointTime(c) || shortSha(c.sha)}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenuRoot>
            )}
          </div>
        </div>

        {(overlayError || overrideLoading) && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px]"
          >
            {overrideLoading ? (
              <span className="text-muted-foreground">Loading snapshot…</span>
            ) : null}
            {overlayError ? <span className="text-destructive">{overlayError}</span> : null}
          </div>
        )}
      </div>
    </section>
  );
}

function TimelineChip({
  label,
  secondary,
  active,
  compare,
  kind,
  dataSha,
  onClick,
}: {
  label: string;
  secondary: string;
  active: boolean;
  compare: boolean;
  kind: 'live' | 'checkpoint';
  dataSha: string;
  onClick: () => void;
}) {
  // Chip visual states (mutually exclusive precedence: active > compare > idle).
  // - active: current view snapshot
  // - compare: selected as the "from" side of the diff
  // - idle: neither
  const base =
    'shrink-0 select-none rounded-md border px-2 py-1 text-left text-xs transition-colors whitespace-nowrap min-w-[70px]';
  const activeCls = active
    ? 'border-primary bg-primary text-primary-foreground'
    : compare
      ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
      : 'border-border/60 bg-background/70 hover:bg-accent hover:text-accent-foreground';

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-sha={dataSha}
      onClick={onClick}
      className={`${base} ${activeCls}`}
    >
      <div className="truncate font-medium">{label}</div>
      <div
        className={
          active ? 'truncate text-[10px] opacity-80' : 'truncate text-[10px] text-muted-foreground'
        }
      >
        {kind === 'live' ? 'live' : secondary}
      </div>
    </button>
  );
}
