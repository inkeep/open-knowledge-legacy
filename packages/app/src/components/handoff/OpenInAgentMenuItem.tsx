/**
 * Per-row component inside the Open-in-Agent dropdown.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §7.1 + §7.3
 * (E4 DIRECTED for web-host Cursor disabled-always; PQ6 LOCKED for the
 * "Open in claude.ai →" secondary affordance on disabled Claude rows).
 *
 * Two visual states per row:
 *   1. Enabled — icon + display name; click invokes the supplied `onSelect`.
 *      Radix DropdownMenuItem closes the menu automatically on selection.
 *   2. Disabled — `data-disabled` + dimmed; click is a no-op (Radix gates
 *      `onSelect` on disabled). Hovering the row opens a Tooltip with:
 *        - Always: an "Install <displayName> →" affordance
 *        - Claude rows only (`hasWebFallback`): an "Open in claude.ai →"
 *          affordance that opens https://claude.ai/new?q=<prompt>
 *        - Web-host Cursor: a single "Cursor handoff requires the desktop
 *          build." copy + an "Install the Open Knowledge desktop app →"
 *          affordance, with NO claude.ai fallback.
 *
 * Per-row interaction is split into two pure helpers (`computeRowState`,
 * `computeWebFallbackUrl`) so unit tests cover the logic without rendering.
 * Full interaction coverage lands under Playwright in US-013.
 */

import {
  buildClaudeAiWebUrl,
  type InstallState,
  type TargetData,
} from '@inkeep/open-knowledge-core';
import { Bot, Code2, Sparkles, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openExternal as defaultOpenExternal } from '@/lib/handoff/open-external';

/**
 * Stable URL for the "Install the Open Knowledge desktop app →" affordance
 * shown only in the web-host Cursor tooltip. Pinned to the public repo
 * landing page since the desktop installer lives in GitHub Releases for
 * dogfood. Update at US-014 ship time if a marketing URL replaces this.
 */
export const OK_DESKTOP_INSTALL_URL = 'https://github.com/inkeep/open-knowledge';

/** Static icon registry — KNOWN_TARGETS stores icon names as string slugs. */
const ICON_REGISTRY: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Terminal,
  Bot,
  Code2,
};

function resolveIcon(slug: string): React.ComponentType<{ className?: string }> {
  return ICON_REGISTRY[slug] ?? Sparkles;
}

/** A clickable affordance shown inside the disabled-row tooltip. */
export interface RowAffordance {
  readonly label: string;
  readonly url: string;
}

/** Tooltip payload for a disabled row. `null` while install state is `null`
 *  (initial probe in flight) — disabled-but-no-tooltip per AC8. */
export interface DisabledTooltip {
  /** Main message — appears as the first line of the tooltip. */
  readonly message: string;
  /** Primary install affordance — always present on a tooltip. */
  readonly installAction: RowAffordance;
  /** Secondary "Open in claude.ai →" affordance — Claude rows only. */
  readonly webFallback?: RowAffordance;
}

export interface RowState {
  readonly enabled: boolean;
  /** When non-null, render a Tooltip with this payload on hover. */
  readonly tooltip: DisabledTooltip | null;
}

/**
 * Pure derivation of per-row visual / tooltip state.
 *
 * Branches:
 *   1. Web-host Cursor (E4 DIRECTED) → always disabled, special tooltip copy.
 *   2. Pre-probe (`installed === null`, AC8) → disabled, no tooltip.
 *   3. Not installed (`installed === false`) → disabled, install + (claude only)
 *      web-fallback affordances.
 *   4. Installed → enabled, no tooltip.
 *
 * `prompt` is the OK-composed prompt string used to build the web-fallback URL.
 * The component owns the URL build — this helper only signals the affordance's
 * existence. (Building the URL inside the helper would tie this pure file to
 * the encodeURIComponent shape; `computeWebFallbackUrl` lives separately.)
 */
export function computeRowState(args: {
  target: TargetData;
  installState: InstallState;
  isElectronHost: boolean;
}): RowState {
  const { target, installState, isElectronHost } = args;

  // Branch 1: web-host Cursor is always disabled (E4 DIRECTED).
  if (target.id === 'cursor' && !isElectronHost) {
    return {
      enabled: false,
      tooltip: {
        message: 'Cursor handoff requires the desktop build.',
        installAction: {
          label: 'Install the Open Knowledge desktop app →',
          url: OK_DESKTOP_INSTALL_URL,
        },
      },
    };
  }

  // Branch 2: pre-probe — defensive disabled, no tooltip (AC8).
  if (installState.installed === null) {
    return { enabled: false, tooltip: null };
  }

  // Branch 3: not installed — install + (claude only) web-fallback.
  if (installState.installed === false) {
    const tooltip: DisabledTooltip = {
      message: `Requires ${target.displayName}.`,
      installAction: {
        label: `Install ${target.displayName} →`,
        url: target.installUrl,
      },
      ...(target.hasWebFallback
        ? {
            webFallback: {
              // The URL itself is built at click time via `computeWebFallbackUrl`
              // — the label here is the visible affordance text.
              label: 'Open in claude.ai →',
              url: '', // sentinel; component substitutes via computeWebFallbackUrl
            },
          }
        : {}),
    };
    return { enabled: false, tooltip };
  }

  // Branch 4: installed — enabled, no tooltip.
  return { enabled: true, tooltip: null };
}

/**
 * Pure URL builder for the "Open in claude.ai →" web fallback. Wraps
 * `buildClaudeAiWebUrl` so the component doesn't import core URL builders
 * directly (keeps the render path narrow + makes tests trivial).
 */
export function computeWebFallbackUrl(prompt: string): string {
  return buildClaudeAiWebUrl(prompt);
}

/**
 * Success toast copy for the "Open in claude.ai →" secondary affordance.
 * Distinct from the dispatch-success copy in `useHandoffDispatch` —
 * "Opened in {displayName}." would be misleading here because the user
 * fell back to a different surface (browser, not the desktop app).
 */
export function successToastForWebFallback(displayName: string): string {
  return `Opened ${displayName} in your browser.`;
}

export interface OpenInAgentMenuItemProps {
  readonly target: TargetData;
  readonly installState: InstallState;
  readonly isElectronHost: boolean;
  /** Prompt string used to build the web-fallback URL on Claude rows. */
  readonly prompt: string;
  /** Fired only when the row is enabled and the user selects it. The hook
   *  layer (`useHandoffDispatch`) handles toast + telemetry. */
  readonly onSelect: () => void;
  /** Test seam — wraps the openExternal primitive used by tooltip affordances. */
  readonly openExternal?: typeof defaultOpenExternal;
  /** Test seam — fires after a successful web-fallback click so the caller can
   *  surface a toast. Defaults to a no-op; production callers will wire sonner. */
  readonly onWebFallbackSuccess?: (target: TargetData) => void;
}

export function OpenInAgentMenuItem(props: OpenInAgentMenuItemProps): ReactNode {
  const { target, installState, isElectronHost, prompt, onSelect } = props;
  const openExternal = props.openExternal ?? defaultOpenExternal;
  const onWebFallbackSuccess = props.onWebFallbackSuccess ?? (() => {});

  const Icon = resolveIcon(target.icon);
  const rowState = computeRowState({ target, installState, isElectronHost });

  const handleInstallClick = () => {
    if (!rowState.tooltip) return;
    void openExternal(rowState.tooltip.installAction.url);
  };

  const handleWebFallbackClick = () => {
    void (async () => {
      const url = computeWebFallbackUrl(prompt);
      const outcome = await openExternal(url);
      if (outcome.ok) onWebFallbackSuccess(target);
    })();
  };

  const itemContent = (
    <DropdownMenuItem
      disabled={!rowState.enabled}
      onSelect={rowState.enabled ? onSelect : undefined}
      // Override shadcn's `data-[disabled]:pointer-events-none` so the disabled
      // row can still receive mouse hover and trigger the tooltip. Radix gates
      // `onSelect` on `disabled` so click is still a no-op.
      className={rowState.enabled ? undefined : 'data-[disabled]:pointer-events-auto'}
      data-testid={`open-in-agent-item-${target.id}`}
    >
      <Icon className="size-4" />
      <span>Open in {target.displayName}</span>
    </DropdownMenuItem>
  );

  if (!rowState.tooltip) {
    return itemContent;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
      <TooltipContent
        side="left"
        align="start"
        // pointer-events-auto so the affordance links inside are clickable.
        className="pointer-events-auto flex max-w-xs flex-col items-start gap-2 px-3 py-2 text-left"
      >
        <span>{rowState.tooltip.message}</span>
        <button
          type="button"
          onClick={handleInstallClick}
          className="text-left text-background underline underline-offset-2 hover:no-underline"
          data-testid={`open-in-agent-install-${target.id}`}
        >
          {rowState.tooltip.installAction.label}
        </button>
        {rowState.tooltip.webFallback && (
          <button
            type="button"
            onClick={handleWebFallbackClick}
            className="text-left text-background underline underline-offset-2 hover:no-underline"
            data-testid={`open-in-agent-web-fallback-${target.id}`}
          >
            {rowState.tooltip.webFallback.label}
          </button>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
