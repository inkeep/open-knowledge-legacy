/**
 * Per-row component inside the Open-in-Agent dropdown.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §7.1 + §7.3
 * (E4 DIRECTED for web-host Cursor disabled-always; PQ6 LOCKED for the
 * "Open in claude.ai →" secondary affordance on disabled Claude rows).
 *
 * Three visual shapes per row:
 *   1. Enabled — icon + display name; click invokes the supplied `onSelect`.
 *      Radix DropdownMenuItem closes the menu automatically on selection.
 *   2. Disabled pre-probe (install state is `null`) — plain `DropdownMenuItem`
 *      with `disabled`, inline hint "Detecting…" on the right (AC8 defensive).
 *   3. Disabled post-probe (not installed, or web-host Cursor) — rendered as
 *      a `DropdownMenuSub` whose trigger looks like the enabled row plus a
 *      right-aligned status hint; the submenu contains the PQ6 affordances
 *      as real `DropdownMenuItem`s:
 *        - Always: an "Install <displayName> →" affordance.
 *        - Claude rows only (`hasWebFallback`): an "Open in claude.ai →"
 *          affordance that opens `https://claude.ai/new?q=<prompt>`.
 *        - Web-host Cursor: a single "Install the Open Knowledge desktop
 *          app →" affordance, with NO claude.ai fallback.
 *
 * Why a submenu (not a hover tooltip with buttons): a tooltip hosting
 * interactive content violates the WAI-ARIA tooltip pattern (tooltips are
 * hints; they auto-dismiss, are screen-reader-announced as descriptions, and
 * must not hold focusable widgets). Radix `DropdownMenuItem` with `disabled`
 * also removes the row from roving focus — keyboard users never see the
 * tooltip in the first place. Routing the affordances through a nested
 * `DropdownMenuSub` makes them proper keyboard-reachable menu items and
 * fixes both failure modes at once.
 *
 * Per-row classification is split into the pure helper `computeRowState`
 * (unchanged signature; consumers across sibling surfaces still rely on it)
 * so unit tests cover the logic without rendering.
 */

import {
  buildClaudeAiWebUrl,
  type InstallState,
  type TargetData,
} from '@inkeep/open-knowledge-core';
import type { ReactNode } from 'react';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { openExternal as defaultOpenExternal } from '@/lib/handoff/open-external';

/**
 * Stable URL for the "Install the Open Knowledge desktop app →" affordance
 * shown only in the web-host Cursor submenu. Points at the releases page so
 * users land directly on installers rather than a source-code README.
 */
export const OK_DESKTOP_INSTALL_URL = 'https://github.com/inkeep/open-knowledge/releases';

/** A clickable affordance shown inside the disabled-row submenu. */
export interface RowAffordance {
  readonly label: string;
  readonly url: string;
}

/** Submenu payload for a disabled row. `null` while install state is `null`
 *  (initial probe in flight) — disabled-but-no-submenu per AC8. */
export interface DisabledTooltip {
  /** Main message — describes why the row is disabled (used for the short
   *  hint text rendered inline on the trigger row). */
  readonly message: string;
  /** Primary install affordance — always present when a submenu is shown. */
  readonly installAction: RowAffordance;
  /** Secondary "Open in claude.ai →" affordance — Claude rows only. */
  readonly webFallback?: RowAffordance;
}

export interface RowState {
  readonly enabled: boolean;
  /** When non-null, render a submenu with install + (Claude only) web-fallback
   *  affordances instead of a plain disabled item. The `message` field doubles
   *  as the short right-aligned status hint for the trigger row. */
  readonly tooltip: DisabledTooltip | null;
}

/**
 * Short inline hint rendered on a disabled row's trigger. Parallels the
 * sibling surfaces (`OpenInAgentContextSubmenu.contextRowHint`,
 * `CommandPalette`'s inline hint). Centralized so all three surfaces agree
 * on the pre-probe / not-installed / desktop-only copy.
 */
export function computeRowHint(args: {
  target: TargetData;
  installState: InstallState;
  isElectronHost: boolean;
}): string | null {
  const { target, installState, isElectronHost } = args;
  if (target.id === 'cursor' && !isElectronHost) return 'Desktop only';
  if (installState.installed === null) return 'Detecting…';
  if (installState.installed === false) return 'Not installed';
  return null;
}

/**
 * Pure derivation of per-row visual state.
 *
 * Branches:
 *   1. Web-host Cursor (E4 DIRECTED) → always disabled, Install-OK-desktop
 *      affordance.
 *   2. Pre-probe (`installed === null`, AC8) → disabled, no submenu (the
 *      surface renders a plain `DropdownMenuItem` with a "Detecting…" hint).
 *   3. Not installed (`installed === false`) → disabled, install + (Claude
 *      only) web-fallback affordances surface as submenu items.
 *   4. Installed → enabled, no submenu.
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

  // Branch 2: pre-probe — defensive disabled, no submenu (AC8).
  if (installState.installed === null) {
    return { enabled: false, tooltip: null };
  }

  // Branch 3: not installed — install + (claude only) web-fallback.
  if (installState.installed === false) {
    const brand = target.appBrandName ?? target.displayName;
    const tooltip: DisabledTooltip = {
      message: `Requires ${brand}.`,
      installAction: {
        label: `Install ${brand} →`,
        url: target.installUrl,
      },
      ...(target.hasWebFallback
        ? {
            webFallback: {
              // URL is built at click time via `computeWebFallbackUrl` — the
              // sentinel here is a visible label only.
              label: 'Open in claude.ai →',
              url: '',
            },
          }
        : {}),
    };
    return { enabled: false, tooltip };
  }

  // Branch 4: installed — enabled, no submenu.
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
  /** Test seam — wraps the openExternal primitive used by submenu affordances. */
  readonly openExternal?: typeof defaultOpenExternal;
  /** Test seam — fires after a successful web-fallback click so the caller can
   *  surface a toast. Defaults to a no-op; production callers will wire sonner. */
  readonly onWebFallbackSuccess?: (target: TargetData) => void;
}

export function OpenInAgentMenuItem(props: OpenInAgentMenuItemProps): ReactNode {
  const { target, installState, isElectronHost, prompt, onSelect } = props;
  const openExternal = props.openExternal ?? defaultOpenExternal;
  const onWebFallbackSuccess = props.onWebFallbackSuccess ?? (() => {});

  const rowState = computeRowState({ target, installState, isElectronHost });
  const hint = computeRowHint({ target, installState, isElectronHost });

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

  // Enabled row — direct DropdownMenuItem, click dispatches.
  if (rowState.enabled) {
    return (
      <DropdownMenuItem onSelect={onSelect} data-testid={`open-in-agent-item-${target.id}`}>
        <span>Open in {target.displayName}</span>
      </DropdownMenuItem>
    );
  }

  // Pre-probe — plain disabled row with "Detecting…" hint (AC8).
  if (!rowState.tooltip) {
    return (
      <DropdownMenuItem disabled data-testid={`open-in-agent-item-${target.id}`}>
        <span className="flex-1">Open in {target.displayName}</span>
        {hint ? <span className="ml-2 text-muted-foreground text-xs">{hint}</span> : null}
      </DropdownMenuItem>
    );
  }

  // Disabled post-probe — submenu with install + (Claude only) web-fallback.
  // Using DropdownMenuSub instead of a Tooltip-with-buttons preserves the
  // PQ6 affordances while being keyboard-accessible and ARIA-correct.
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid={`open-in-agent-item-${target.id}`}>
        <span className="flex-1">Open in {target.displayName}</span>
        {hint ? <span className="ml-2 text-muted-foreground text-xs">{hint}</span> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="min-w-[260px]"
        data-testid={`open-in-agent-submenu-${target.id}`}
      >
        <DropdownMenuItem
          onSelect={handleInstallClick}
          data-testid={`open-in-agent-install-${target.id}`}
        >
          <span>{rowState.tooltip.installAction.label}</span>
        </DropdownMenuItem>
        {rowState.tooltip.webFallback ? (
          <DropdownMenuItem
            onSelect={handleWebFallbackClick}
            data-testid={`open-in-agent-web-fallback-${target.id}`}
          >
            <span>{rowState.tooltip.webFallback.label}</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
