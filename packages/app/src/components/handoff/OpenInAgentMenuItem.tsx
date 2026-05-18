import {
  AGENT_ICON_COLORS,
  AGENT_ICON_COLORS_DARK,
  buildClaudeAiWebUrl,
  type InstallState,
  type TargetData,
} from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import type { CSSProperties, ReactNode, SVGProps } from 'react';
import { toast as sonnerToast } from 'sonner';
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

export const OK_DESKTOP_INSTALL_URL = 'https://github.com/inkeep/open-knowledge/releases';

interface RowAffordance {
  readonly label: string;
  readonly url: string;
}

/** Submenu payload for a disabled row. `null` while install state is `null`
 *  (initial probe in flight) — disabled-but-no-submenu. */
interface DisabledTooltip {
  /** Main message — describes why the row is disabled (used for the short
   *  hint text rendered inline on the trigger row). */
  readonly message: string;
  readonly installAction: RowAffordance;
  readonly webFallback?: RowAffordance;
}

interface RowState {
  readonly enabled: boolean;
  /** When non-null, render a submenu with install + (Claude only) web-fallback
   *  affordances instead of a plain disabled item. The `message` field doubles
   *  as the short right-aligned status hint for the trigger row. */
  readonly tooltip: DisabledTooltip | null;
}

export function computeRowHint(args: {
  target: TargetData;
  installState: InstallState;
  isElectronHost: boolean;
}): string | null {
  const { installState } = args;
  if (installState.installed === null) return 'Detecting';
  if (installState.installed === false) return 'Not installed';
  return null;
}

export function computeRowState(args: {
  target: TargetData;
  installState: InstallState;
  isElectronHost: boolean;
}): RowState {
  const { target, installState } = args;

  if (installState.installed === null) {
    return { enabled: false, tooltip: null };
  }

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
              label: 'Open in claude.ai →',
              url: '',
            },
          }
        : {}),
    };
    return { enabled: false, tooltip };
  }

  return { enabled: true, tooltip: null };
}

export function computeWebFallbackUrl(prompt: string): string {
  return buildClaudeAiWebUrl(prompt);
}

export function successToastForWebFallback(displayName: string): string {
  return `Opened ${displayName} in your browser.`;
}

const CLAUDE_WEB_FALLBACK_LABEL = 'claude.ai';

export async function dispatchClaudeWebFallback(
  prompt: string,
  openExternal: typeof defaultOpenExternal = defaultOpenExternal,
): Promise<void> {
  const url = buildClaudeAiWebUrl(prompt);
  const outcome = await openExternal(url);
  if (outcome.ok) {
    sonnerToast.success(successToastForWebFallback(CLAUDE_WEB_FALLBACK_LABEL));
  } else {
    sonnerToast.error(`Couldn't open ${CLAUDE_WEB_FALLBACK_LABEL} in your browser.`);
  }
}

interface OpenInAgentMenuItemProps {
  readonly target: TargetData;
  readonly installState: InstallState;
  readonly isElectronHost: boolean;
  readonly prompt: string;
  /** Fired only when the row is enabled and the user selects it. The hook
   *  layer (`useHandoffDispatch`) handles toast + telemetry. */
  readonly onSelect: () => void;
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

  if (rowState.enabled) {
    return (
      <DropdownMenuItem
        onSelect={onSelect}
        data-testid={`open-in-agent-item-${target.id}`}
        aria-label={`Open with AI ${target.displayName}`}
      >
        <TargetIcon id={target.id} aria-hidden="true" />
        <span>{target.displayName}</span>
      </DropdownMenuItem>
    );
  }

  if (!rowState.tooltip) {
    const preProbeLabel = hint
      ? `Open with AI ${target.displayName}, ${hint}`
      : `Open with AI ${target.displayName}`;
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

  const accessibleLabel = hint
    ? `Open with AI ${target.displayName}, ${hint}`
    : `Open with AI ${target.displayName}`;
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
