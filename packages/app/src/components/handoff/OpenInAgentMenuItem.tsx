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
  AGENT_ICON_COLORS,
  AGENT_ICON_COLORS_DARK,
  buildClaudeAiWebUrl,
  type InstallState,
  type TargetData,
} from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { CodexBrandIcon } from '@/components/icons/codex';
import { CursorIcon } from '@/components/icons/cursor';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { openExternal as defaultOpenExternal } from '@/lib/handoff/open-external';
import { cn } from '@/lib/utils';

/**
 * Vendor icon per target. Claude Cowork and Claude Code share `ClaudeIcon`
 * since both dispatch to Claude Desktop. Unknown ids render nothing — the
 * row still reads correctly without an icon (graceful no-op if a 5th target
 * lands here before the map is updated).
 *
 * DropdownMenuItem + DropdownMenuSubTrigger both auto-size `<svg>` children
 * to `size-4`, so the icon doesn't need an explicit size prop.
 *
 * Brand colors come from the shared `AGENT_ICON_COLORS` palette; dark-mode
 * overrides (e.g. Cursor's near-black logo lifts to white) match the
 * timeline + presence-bar treatment.
 */
const TARGET_ICON_KEY: Record<TargetData['id'], string> = {
  'claude-cowork': 'claude',
  'claude-code': 'claude',
  codex: 'openai',
  cursor: 'cursor',
};

export function TargetIcon({
  id,
  style,
  className,
  ...props
}: { id: TargetData['id'] } & SVGProps<SVGSVGElement>): ReactNode {
  const { resolvedTheme } = useTheme();
  const iconKey = TARGET_ICON_KEY[id];
  const isDark = resolvedTheme === 'dark';
  const brandColor = iconKey
    ? ((isDark ? AGENT_ICON_COLORS_DARK[iconKey] : undefined) ?? AGENT_ICON_COLORS[iconKey])
    : undefined;
  // The dropdown item's `focus:**:text-accent-foreground` cascades `color`
  // to every descendant — including the inner `<path>`, whose
  // `fill|stroke="currentColor"` then resolves to accent-foreground (black
  // in light mode). Inline `style.color` on the `<svg>` doesn't reach the
  // path. Override `color` directly on descendants with `!important` via
  // the `--ok-brand-color` custom property so the brand color survives
  // hover/focus.
  const mergedStyle = brandColor
    ? ({ ...style, '--ok-brand-color': brandColor } as CSSProperties)
    : style;
  const mergedClass = cn(brandColor && '[&_*]:![color:var(--ok-brand-color)]', className);
  if (id === 'claude-cowork' || id === 'claude-code')
    return <ClaudeIcon style={mergedStyle} className={mergedClass} {...props} />;
  if (id === 'codex')
    return <CodexBrandIcon style={mergedStyle} className={mergedClass} {...props} />;
  if (id === 'cursor') return <CursorIcon style={mergedStyle} className={mergedClass} {...props} />;
  return null;
}

/**
 * Stable URL for the "Install the Open Knowledge desktop app →" affordance
 * shown only in the web-host Cursor submenu. Points at the releases page so
 * users land directly on installers rather than a source-code README.
 */
export const OK_DESKTOP_INSTALL_URL = 'https://github.com/inkeep/open-knowledge/releases';

/** A clickable affordance shown inside the disabled-row submenu. */
interface RowAffordance {
  readonly label: string;
  readonly url: string;
}

/** Submenu payload for a disabled row. `null` while install state is `null`
 *  (initial probe in flight) — disabled-but-no-submenu per AC8. */
interface DisabledTooltip {
  /** Main message — describes why the row is disabled (used for the short
   *  hint text rendered inline on the trigger row). */
  readonly message: string;
  /** Primary install affordance — always present when a submenu is shown. */
  readonly installAction: RowAffordance;
  /** Secondary "Open in claude.ai →" affordance — Claude rows only. */
  readonly webFallback?: RowAffordance;
}

interface RowState {
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

interface OpenInAgentMenuItemProps {
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
  /** Test seam — fires after a failed web-fallback click (popup-blocker,
   *  exotic browser, DOM-less environment). Parallel to onWebFallbackSuccess
   *  so the caller can surface a sonner error toast. Defaults to a no-op. */
  readonly onWebFallbackError?: (target: TargetData, reason: string) => void;
}

export function OpenInAgentMenuItem(props: OpenInAgentMenuItemProps): ReactNode {
  const { target, installState, isElectronHost, prompt, onSelect } = props;
  const openExternal = props.openExternal ?? defaultOpenExternal;
  const onWebFallbackSuccess = props.onWebFallbackSuccess ?? (() => {});
  const onWebFallbackError = props.onWebFallbackError ?? (() => {});

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
      if (outcome.ok) {
        onWebFallbackSuccess(target);
      } else {
        onWebFallbackError(target, outcome.detail ?? outcome.reason);
      }
    })();
  };

  // Enabled row — direct DropdownMenuItem, click dispatches.
  if (rowState.enabled) {
    return (
      <DropdownMenuItem
        onSelect={onSelect}
        data-testid={`open-in-agent-item-${target.id}`}
        aria-label={`Open in ${target.displayName}`}
      >
        <TargetIcon id={target.id} aria-hidden="true" />
        <span>{target.displayName}</span>
      </DropdownMenuItem>
    );
  }

  // Pre-probe — plain disabled row with "Detecting…" hint (AC8). `aria-label`
  // composes the hint into the accessible name so AT users hear "Open in
  // Codex, Detecting…" rather than an identical-sounding bare row.
  if (!rowState.tooltip) {
    const preProbeLabel = hint
      ? `Open in ${target.displayName}, ${hint}`
      : `Open in ${target.displayName}`;
    return (
      <DropdownMenuItem
        disabled
        data-testid={`open-in-agent-item-${target.id}`}
        aria-label={preProbeLabel}
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
  }

  // Disabled post-probe — submenu with install + (Claude only) web-fallback.
  // Using DropdownMenuSub instead of a Tooltip-with-buttons preserves the
  // PQ6 affordances while being keyboard-accessible and ARIA-correct. The
  // SubContent opens with a DropdownMenuLabel carrying the descriptive
  // message required by SPEC §7.3 ("Cursor handoff requires the desktop
  // build." / "Requires <brand>.") — without this label the user lost the
  // "why is this disabled" context in the Tooltip → Submenu refactor.
  //
  // `aria-label` on the SubTrigger composes the hint into the accessible name
  // so screen readers hear "Open in Claude Cowork, Not installed" rather than
  // the bare "Open in Claude Cowork" that would otherwise be indistinguishable
  // from an enabled row. The `aria-hidden` hint span stays visually present
  // but is not re-read as part of the computed name.
  const accessibleLabel = hint
    ? `Open in ${target.displayName}, ${hint}`
    : `Open in ${target.displayName}`;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        data-testid={`open-in-agent-item-${target.id}`}
        data-row-disabled=""
        aria-label={accessibleLabel}
      >
        <TargetIcon id={target.id} aria-hidden="true" className="mr-2" />
        <span className="flex-1">{target.displayName}</span>
        {hint ? (
          <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
            {hint}
          </span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="min-w-[260px]"
        data-testid={`open-in-agent-submenu-${target.id}`}
      >
        <DropdownMenuLabel
          className="font-normal text-muted-foreground text-xs"
          data-testid={`open-in-agent-message-${target.id}`}
        >
          {rowState.tooltip.message}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleInstallClick}
          data-testid={`open-in-agent-install-${target.id}`}
        >
          <span>{rowState.tooltip.installAction.label}</span>
        </DropdownMenuItem>
        {rowState.tooltip.webFallback ? (
          // Data-egress disclosure per SPEC §12 R7 — the claude.ai web fallback
          // is the ONE dispatch path that transmits OK-composed prompt content
          // off the machine (all other targets resolve via local URL schemes).
          // "opens in browser with prompt pre-filled" matches the spec-verbatim
          // hint so users in regulated contexts see the data-path signal at
          // click time rather than after the fact. `aria-label` composes the
          // hint into the accessible name so AT users get the same disclosure.
          <DropdownMenuItem
            onSelect={handleWebFallbackClick}
            data-testid={`open-in-agent-web-fallback-${target.id}`}
            aria-label={`${rowState.tooltip.webFallback.label}, opens in browser with prompt pre-filled`}
          >
            <span className="flex-1">{rowState.tooltip.webFallback.label}</span>
            <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
              opens in browser with prompt pre-filled
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
