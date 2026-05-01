
import {
  composePrompt,
  type DocContext,
  type HandoffOutcome,
  type HandoffPayload,
  type HandoffTarget,
} from '@inkeep/open-knowledge-core';
import { toast as sonnerToast } from 'sonner';
import {
  type EnsureCoworkSkillOutcome,
  ensureCoworkSkillInstalledWithDefaults,
} from '@/lib/handoff/cowork-skill-install';
import { dispatchHandoff as defaultDispatchHandoff } from '@/lib/handoff/dispatch';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import {
  recordHandoff as defaultRecordHandoff,
  type HandoffHost,
  type HandoffStatsLine,
} from '@/lib/handoff/telemetry';
import { docNameToRelativePath, joinWorkspacePath, type Workspace } from '@/lib/workspace-paths';
import '@/lib/desktop-bridge-types';

export interface HandoffDispatchInput {
  readonly docContext: DocContext;
  readonly projectDir: string;
  readonly docPath: string;
}

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

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastSurface {
  success(message: string): void;
  error(message: string, options?: { action?: ToastAction }): void;
}

export interface HandoffDispatchDeps {
  readonly dispatchHandoff: (payload: HandoffPayload) => Promise<HandoffOutcome>;
  readonly recordHandoff: (line: HandoffStatsLine) => Promise<void>;
  readonly toast: ToastSurface;
  readonly now: () => Date;
  readonly isElectronHost: () => boolean;
  readonly getDisplayName: (target: HandoffTarget) => string;
  readonly ensureCoworkSkillInstalled: () => Promise<EnsureCoworkSkillOutcome>;
}

export const MAX_DISPATCH_ATTEMPTS = 3;

export function successToastMessage(displayName: string): string {
  return `Opened in ${displayName}.`;
}

export function errorToastMessage(displayName: string, attempt = 1): string {
  if (attempt >= MAX_DISPATCH_ATTEMPTS) {
    return `Couldn't reach ${displayName} — please try again later.`;
  }
  if (attempt === MAX_DISPATCH_ATTEMPTS - 1) {
    return `Still couldn't reach ${displayName} — try one more time?`;
  }
  return `Couldn't reach ${displayName} — try again?`;
}

export function retryActionLabel(attempt: number): string | null {
  if (attempt >= MAX_DISPATCH_ATTEMPTS) return null;
  return attempt === MAX_DISPATCH_ATTEMPTS - 1 ? 'Try one more time' : 'Retry';
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

export async function runHandoffDispatch(
  target: HandoffTarget,
  input: HandoffDispatchInput,
  deps: HandoffDispatchDeps,
  attempt = 1,
): Promise<HandoffOutcome> {
  if (target === 'claude-cowork' && attempt === 1) {
    let installOutcome: EnsureCoworkSkillOutcome;
    try {
      installOutcome = await deps.ensureCoworkSkillInstalled();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.toast.error(`Couldn't install Open Knowledge skill — ${message}`);
      return { ok: false, reason: 'dispatch-error', detail: `install-error: ${message}` };
    }
    if (installOutcome.kind === 'installed-now') {
      deps.toast.success(
        'Open Knowledge skill saved. Upload it in Claude Desktop, then click Cowork again.',
      );
      return { ok: true };
    }
    if (installOutcome.kind === 'install-failed') {
      const detail = installOutcome.message ?? installOutcome.reason;
      deps.toast.error(`Couldn't install Open Knowledge skill — ${detail}`);
      return { ok: false, reason: 'dispatch-error', detail: `install-failed: ${detail}` };
    }
  }

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
    const label = retryActionLabel(attempt);
    const message = errorToastMessage(displayName, attempt);
    if (label !== null) {
      deps.toast.error(message, {
        action: {
          label,
          onClick: () => {
            void runHandoffDispatch(target, input, deps, attempt + 1);
          },
        },
      });
    } else {
      deps.toast.error(message);
    }
  }

  return outcome;
}

export function getDisplayNameDefault(target: HandoffTarget): string {
  const entry = KNOWN_TARGETS.find((t) => t.id === target);
  return entry?.displayName ?? target;
}

export function isElectronHostDefault(
  windowLike: { okDesktop?: unknown } | undefined = typeof window !== 'undefined'
    ? window
    : undefined,
): boolean {
  return windowLike?.okDesktop != null;
}

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
    ensureCoworkSkillInstalled: ensureCoworkSkillInstalledWithDefaults,
  };
}

interface UseHandoffDispatchResult {
  dispatch: (target: HandoffTarget, input: HandoffDispatchInput) => Promise<HandoffOutcome>;
}

export function useHandoffDispatch(): UseHandoffDispatchResult {
  return {
    dispatch: (target, input) => runHandoffDispatch(target, input, defaultHandoffDispatchDeps()),
  };
}
