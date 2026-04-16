/**
 * NavigationPendingBar — 4-tier escalating progress indicator for the
 * navigation Suspense transition (spec §D6, §D7, §F3, §F9, §F13).
 *
 * Visible only while `isPending` is true. Tracks elapsed ms since the flip
 * and escalates through four visual tiers so the user always has feedback
 * proportional to how long sync has taken:
 *   - Tier 0 (0-5s):    subtle 2px amber strip under the header
 *   - Tier 1 (5-15s):   visible striped strip + "Loading doc…" label
 *   - Tier 2 (15-25s):  above + "Still loading. This is taking longer than usual." text
 *   - Tier 3 (25-30s):  above + inline "Try again?" button (fires `onRetry`)
 *
 * The 30s mark itself is the hard syncPromise timeout (see `sync-promise.ts`);
 * when it fires, `DocumentErrorBoundary` takes over and this bar unmounts with
 * `isPending` flipping false.
 *
 * Deterministic testing: `clock` is injectable so unit tests can drive the
 * tier function without real timers. The pure `computeTier(elapsedMs)` helper
 * is exported and the canonical surface for tier logic.
 *
 * Accessibility (spec §DX5, §F13):
 *   - Container has `role="status"` + `aria-live="polite"` so screen readers
 *     announce the tier transitions naturally as the label / text / button
 *     content appears.
 *   - `aria-hidden="false"` while rendered — Playwright selector target per F3.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Tier boundary thresholds (ms since isPending flipped true). */
export const TIER_BOUNDARIES_MS = {
  tier1: 5_000,
  tier2: 15_000,
  tier3: 25_000,
  timeout: 30_000,
} as const;

/** Observable tier — 0 is the subtle strip, 3 is the "Try again?" prompt. */
export type PendingTier = 0 | 1 | 2 | 3;

/**
 * Pure elapsed-ms → tier mapping. Exported for unit-test determinism and so
 * future consumers (e.g. tests, telemetry) can reason about tier transitions
 * without instantiating the component.
 */
export function computeTier(elapsedMs: number): PendingTier {
  if (elapsedMs < TIER_BOUNDARIES_MS.tier1) return 0;
  if (elapsedMs < TIER_BOUNDARIES_MS.tier2) return 1;
  if (elapsedMs < TIER_BOUNDARIES_MS.tier3) return 2;
  return 3;
}

/**
 * How often the internal timer polls the clock to update tier state. 250 ms
 * keeps the tier transitions visually punctual (well under a human-perceptible
 * threshold) without being chatty — 4 ticks/sec for at most 30 seconds per
 * pending-window = ~120 updates total, negligible.
 */
const TICK_MS = 250;

export interface NavigationPendingBarProps {
  /** True while navigation is mid-transition (typically from `useTransition`). */
  isPending: boolean;
  /** Called when the user clicks "Try again?" at tier 3. No-op if omitted. */
  onRetry?: () => void;
  /**
   * Monotonic clock for elapsed-time computation. Defaults to `performance.now`.
   * Overridden in unit tests for deterministic tier transitions.
   */
  clock?: () => number;
}

export default function NavigationPendingBar({
  isPending,
  onRetry,
  clock = defaultClock,
}: NavigationPendingBarProps) {
  const [tier, setTier] = useState<PendingTier>(0);

  useEffect(() => {
    if (!isPending) {
      setTier(0);
      return;
    }
    const started = clock();
    // `tick` reads elapsed ms from the injected clock each interval and
    // promotes the tier state. Note: we still use real setInterval for the
    // polling cadence — tests inject `clock` to control what "elapsed" means,
    // not to stub the interval itself.
    const tick = () => {
      const elapsed = clock() - started;
      setTier(computeTier(elapsed));
    };
    tick(); // initial tier so tier 0 renders immediately
    const handle = setInterval(tick, TICK_MS);
    return () => clearInterval(handle);
  }, [isPending, clock]);

  if (!isPending) return null;

  const stripHeightClass = tier >= 1 ? 'h-[3px]' : 'h-[2px]';
  const stripBaseClass =
    'w-full bg-amber-400/70 dark:bg-amber-500/60 transition-opacity duration-150';
  const stripAnimClass = tier >= 1 ? 'animate-pulse opacity-100' : 'opacity-60';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden="false"
      data-slot="navigation-pending-bar"
      data-tier={tier}
      className="pointer-events-none flex w-full flex-col items-center"
    >
      <div className={cn(stripBaseClass, stripHeightClass, stripAnimClass)} />
      {tier >= 1 ? (
        <div className="pointer-events-auto mt-2 flex items-center gap-3 px-3 text-xs text-muted-foreground">
          <span className="font-medium">Loading doc…</span>
          {tier >= 2 ? (
            <span className="max-w-md text-center">
              Still loading. This is taking longer than usual.
            </span>
          ) : null}
          {tier >= 3 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRetry?.()}
              disabled={!onRetry}
              data-slot="navigation-pending-retry"
            >
              Try again?
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function defaultClock(): number {
  return performance.now();
}
