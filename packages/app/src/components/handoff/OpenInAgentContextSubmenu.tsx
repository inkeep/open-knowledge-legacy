/**
 * Right-click context submenu variant of the Open-in-Agent action, mounted
 * inside FileTree row ContextMenus (SPEC §7.1 SQ6 DIRECTED — third surface).
 *
 * Why a separate component from `OpenInAgentMenu` / `OpenInAgentMenuItem`:
 * Radix exposes two distinct menu stacks (`@radix-ui/react-dropdown-menu` vs
 * `@radix-ui/react-context-menu`). Their items do NOT interchange — a
 * `DropdownMenuItem` inside `ContextMenuContent` renders detached from the
 * keyboard-nav / focus loop. We render `ContextMenuItem` here, using the
 * shared pure `computeRowState` helper from `OpenInAgentMenuItem` so the
 * enabled/disabled classification is identical across surfaces.
 *
 * Tooltip limitation: right-click menus can't nest tooltips (Radix Tooltip
 * needs a hover-trigger that our ContextMenuItem isn't exposing as a primary
 * surface). Instead of the dropdown's PQ6 affordance-rich tooltip, disabled
 * rows show a right-aligned status hint ("Not installed" / "Detecting…" /
 * "Desktop only") — concise + mirror the CommandPalette pattern. The full
 * PQ6 UX remains on the primary EditorHeader surface.
 *
 * Input construction is the caller's responsibility: FileTree computes
 * `input` from the right-clicked node (NOT the active doc) via
 * `buildHandoffInput({ docName: node.path, workspace })`.
 */

import type {
  HandoffOutcome,
  HandoffTarget,
  InstallState,
  TargetData,
} from '@inkeep/open-knowledge-core';
import type { ReactNode } from 'react';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { computeRowState } from './OpenInAgentMenuItem';
import type { HandoffDispatchInput } from './useHandoffDispatch';

/**
 * Status hint shown on disabled rows in place of the dropdown's PQ6 tooltip.
 * Returns `null` for enabled rows (no hint needed).
 */
export function contextRowHint(
  target: TargetData,
  installState: InstallState,
  isElectronHost: boolean,
  inputMissing: boolean,
): string | null {
  // Web-host Cursor is always disabled regardless of probe result (E4 DIRECTED).
  if (target.id === 'cursor' && !isElectronHost) return 'Desktop only';
  if (installState.installed === null) return 'Detecting…';
  if (installState.installed === false) return 'Not installed';
  if (inputMissing) return 'No workspace';
  return null;
}

interface OpenInAgentContextSubmenuProps {
  /** Handoff input for the right-clicked node. `null` means the row's dispatch
   *  is not actionable (no workspace metadata yet). Every row still renders
   *  disabled with a "No workspace" hint so the UX doesn't flicker. */
  readonly input: HandoffDispatchInput | null;
  /** Install state per target. Supplied by `FileTree`'s top-level
   *  `useInstalledAgents()` call so every file row shares one coordinator. */
  readonly installStates: Record<HandoffTarget, InstallState>;
  /** Host classifier — propagates E4's web-host Cursor special case through
   *  the pure `computeRowState` helper. */
  readonly isElectronHost: boolean;
  /** `useHandoffDispatch().dispatch` from the FileTree caller. Per AC9, the
   *  submenu never imports `dispatchHandoff` directly — it goes through the
   *  hook so toast + telemetry fire exactly once per click. */
  readonly dispatch: (
    target: HandoffTarget,
    input: HandoffDispatchInput,
  ) => Promise<HandoffOutcome>;
}

export function OpenInAgentContextSubmenu(props: OpenInAgentContextSubmenuProps): ReactNode {
  const { input, installStates, isElectronHost, dispatch } = props;
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Open in…</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {KNOWN_TARGETS.map((target) => {
          const installState = installStates[target.id];
          const rowState = computeRowState({ target, installState, isElectronHost });
          const inputMissing = input === null;
          const enabled = rowState.enabled && !inputMissing;
          const hint = contextRowHint(target, installState, isElectronHost, inputMissing);
          // `aria-label` composes the hint into the accessible name so screen
          // readers hear the disabled state (e.g. "Open in Codex, Not
          // installed") rather than reading a bare row that sounds identical
          // to an enabled one. The hint `<span>` is `aria-hidden="true"` to
          // avoid double-speaking the text content. Parallel to the primary
          // EditorHeader dropdown surface (OpenInAgentMenuItem).
          const accessibleLabel = hint
            ? `Open in ${target.displayName}, ${hint}`
            : `Open in ${target.displayName}`;
          return (
            <ContextMenuItem
              key={target.id}
              disabled={!enabled}
              onSelect={() => {
                if (!enabled || !input) return;
                void dispatch(target.id, input);
              }}
              data-testid={`file-tree-open-in-${target.id}`}
              aria-label={accessibleLabel}
            >
              <span className="flex-1">Open in {target.displayName}</span>
              {hint ? (
                <span aria-hidden="true" className="ml-2 text-muted-foreground text-xs">
                  {hint}
                </span>
              ) : null}
            </ContextMenuItem>
          );
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
