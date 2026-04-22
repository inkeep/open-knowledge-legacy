/**
 * React hook — single dispatch entry point used by every Open-in-Agent surface
 * (EditorHeader, CommandPalette, FileTree context menu). Composes the three
 * side-effects of a click:
 *
 *   (1) `dispatchHandoff` — route the payload to the per-target URL primitive.
 *   (2) `recordHandoff`   — append one JSONL line to `~/.open-knowledge/stats.jsonl`
 *                           (Electron-only in v0; web host no-op).
 *   (3) sonner toast       — success / failure + retry action.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §5.1
 * (E5a DIRECTED — post-dispatch toast UX; E5b DIRECTED — local-only telemetry).
 *
 * Repo convention (precedent: `CommandPalette.runWithToast`, `useInstalledAgents`):
 * the pure, test-seam helper lives at module scope; the hook is a thin wrapper
 * that fills production dependencies. Unit tests exercise `runHandoffDispatch`
 * directly — no `@testing-library/react` / `happy-dom`.
 */

import {
  composePrompt,
  type DocContext,
  type HandoffOutcome,
  type HandoffPayload,
  type HandoffTarget,
} from '@inkeep/open-knowledge-core';
import { toast as sonnerToast } from 'sonner';
import { dispatchHandoff as defaultDispatchHandoff } from '@/lib/handoff/dispatch';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import {
  recordHandoff as defaultRecordHandoff,
  type HandoffHost,
  type HandoffStatsLine,
} from '@/lib/handoff/telemetry';
import { docNameToRelativePath, joinWorkspacePath, type Workspace } from '@/lib/workspace-paths';
// Side-effect import only — loads the `Window.okDesktop?` global augmentation.
import '@/lib/desktop-bridge-types';

/**
 * Minimal caller-supplied input. `docContext` is used to compose the prompt;
 * `projectDir` + `docPath` are OS-native absolute paths owned by the calling
 * surface (EditorHeader reads from workspace state, FileTree derives from the
 * right-clicked node, CommandPalette uses the active doc).
 */
export interface HandoffDispatchInput {
  readonly docContext: DocContext;
  readonly projectDir: string;
  readonly docPath: string;
}

/**
 * Shared helper for the three surfaces (EditorHeader, CommandPalette, FileTree)
 * that all construct a `HandoffDispatchInput` the same way: from an extension-
 * less doc path (`activeDocName` or a right-clicked tree-node's `path`) plus
 * the workspace root / OS separator.
 *
 * Returns `null` when either input is missing — mirrors the
 * `OpenInAgentMenu.input` contract ("disabled trigger when nothing to dispatch").
 *
 * Centralizing the construction here guarantees that every surface:
 *   - Uses the same `.md`-suffix convention (via `docNameToRelativePath`).
 *   - Joins with the advertised separator (via `joinWorkspacePath`).
 *   - Sets `docContext.relativePath` to the exact same POSIX form that the
 *     prompt composer and MCP server consume.
 */
export function buildHandoffInput(args: {
  readonly docName: string | null;
  readonly workspace: Workspace | null;
}): HandoffDispatchInput | null {
  if (!args.docName || !args.workspace) return null;
  const relativePath = docNameToRelativePath(args.docName);
  const { contentDir, pathSeparator } = args.workspace;
  return {
    docContext: { relativePath },
    projectDir: contentDir,
    docPath: joinWorkspacePath(contentDir, relativePath, pathSeparator),
  };
}

/**
 * Shape of the sonner action affordance — mirrors sonner's public API so we
 * don't leak their full option surface to callers. `label` is the button text;
 * `onClick` runs when the user taps the button.
 */
export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

/**
 * Narrow sonner surface the hook uses. Tests inject a recording double; the
 * production hook uses `sonnerToast.{success,error}`.
 */
export interface ToastSurface {
  success(message: string): void;
  error(message: string, options?: { action?: ToastAction }): void;
}

/**
 * Dependencies injected into `runHandoffDispatch`. Every field has a
 * production default built by `defaultHandoffDispatchDeps()`; tests pass
 * recording doubles to assert call arguments.
 */
export interface HandoffDispatchDeps {
  readonly dispatchHandoff: (payload: HandoffPayload) => Promise<HandoffOutcome>;
  readonly recordHandoff: (line: HandoffStatsLine) => Promise<void>;
  readonly toast: ToastSurface;
  /** Clock — ISO timestamp of the dispatch event. Deterministic in tests. */
  readonly now: () => Date;
  /** Host classifier — populates `host` on telemetry lines. */
  readonly isElectronHost: () => boolean;
  /** Lookup display name for toast copy; falls back to the target id. */
  readonly getDisplayName: (target: HandoffTarget) => string;
}

/**
 * Success toast copy: `Opened in Claude Cowork.` / `Opened in Codex.` etc.
 * Exported for assertion in tests.
 */
export function successToastMessage(displayName: string): string {
  return `Opened in ${displayName}.`;
}

/**
 * Failure toast copy: `Couldn't reach Claude Cowork — try again?`. Plain
 * ASCII apostrophe matches the spec string (`\'`). Em-dash `—` (U+2014)
 * matches the app's broader failure-message shape (`EditorPane.tsx`
 * uses `Checkpoint failed — try again`).
 */
export function errorToastMessage(displayName: string): string {
  return `Couldn't reach ${displayName} — try again?`;
}

function buildStatsLine(
  target: HandoffTarget,
  outcome: HandoffOutcome,
  host: HandoffHost,
  ts: string,
): HandoffStatsLine {
  if (outcome.ok) {
    return { target, host, outcome: 'ok', ts };
  }
  return { target, host, outcome: 'error', ts, reason: outcome.reason };
}

/**
 * Pure test-seam helper. Called by the React hook with production deps; unit
 * tests call it directly with recording doubles.
 *
 * Behavior:
 *   - Compose `HandoffPayload` from input (adds `composePrompt(docContext)`).
 *   - Call `dispatchHandoff` — never throws per its contract.
 *   - Append one telemetry line (fire-and-await; never throws per `recordHandoff`).
 *   - Fire a single sonner toast:
 *       ok    → `toast.success(successToastMessage(displayName))`
 *       error → `toast.error(errorToastMessage(displayName), { action: retry })`
 *   - Retry action re-invokes `runHandoffDispatch` with the same `(target, input, deps)`.
 *     A retry is an independent dispatch attempt — records its own stats line
 *     and shows its own toast.
 */
export async function runHandoffDispatch(
  target: HandoffTarget,
  input: HandoffDispatchInput,
  deps: HandoffDispatchDeps,
): Promise<HandoffOutcome> {
  const payload: HandoffPayload = {
    target,
    projectDir: input.projectDir,
    docPath: input.docPath,
    prompt: composePrompt(input.docContext),
  };

  const outcome = await deps.dispatchHandoff(payload);

  const host: HandoffHost = deps.isElectronHost() ? 'electron' : 'web';
  const ts = deps.now().toISOString();
  const line = buildStatsLine(target, outcome, host, ts);
  await deps.recordHandoff(line);

  const displayName = deps.getDisplayName(target);
  if (outcome.ok) {
    deps.toast.success(successToastMessage(displayName));
  } else {
    deps.toast.error(errorToastMessage(displayName), {
      action: {
        label: 'Retry',
        onClick: () => {
          void runHandoffDispatch(target, input, deps);
        },
      },
    });
  }

  return outcome;
}

/**
 * Pure display-name resolver. Looks the target up in `KNOWN_TARGETS` and falls
 * back to the target id if (via an unsafe cast) an unknown value arrives.
 * Exported for test observability.
 */
export function getDisplayNameDefault(target: HandoffTarget): string {
  const entry = KNOWN_TARGETS.find((t) => t.id === target);
  return entry?.displayName ?? target;
}

/**
 * Pure host classifier — mirrors `useInstalledAgents.isElectronHostDefault`
 * so both hooks agree on host detection.
 */
export function isElectronHostDefault(
  windowLike: { okDesktop?: unknown } | undefined = typeof window !== 'undefined'
    ? window
    : undefined,
): boolean {
  return windowLike?.okDesktop != null;
}

/**
 * Production dependencies for `runHandoffDispatch`. Wraps module-level bindings
 * (`dispatchHandoff`, `recordHandoff`, `sonnerToast`) behind the pure DI shape.
 */
export function defaultHandoffDispatchDeps(): HandoffDispatchDeps {
  return {
    dispatchHandoff: defaultDispatchHandoff,
    recordHandoff: defaultRecordHandoff,
    toast: {
      success: (message: string) => {
        sonnerToast.success(message);
      },
      error: (message: string, options?: { action?: ToastAction }) => {
        sonnerToast.error(message, options ? { action: options.action } : undefined);
      },
    },
    now: () => new Date(),
    isElectronHost: () => isElectronHostDefault(),
    getDisplayName: getDisplayNameDefault,
  };
}

/**
 * Result of the hook. A single `dispatch` callback wraps the pure helper with
 * production deps; all three UI surfaces call this to land a dispatch (AC9).
 */
export interface UseHandoffDispatchResult {
  dispatch: (target: HandoffTarget, input: HandoffDispatchInput) => Promise<HandoffOutcome>;
}

/**
 * Hook consumed by `OpenInAgentMenu` (US-010) and its three mount sites
 * (US-011). Returns a stable `dispatch` callback; tests exercise the pure
 * `runHandoffDispatch` directly instead of mounting the hook.
 */
export function useHandoffDispatch(): UseHandoffDispatchResult {
  return {
    dispatch: (target, input) => runHandoffDispatch(target, input, defaultHandoffDispatchDeps()),
  };
}
