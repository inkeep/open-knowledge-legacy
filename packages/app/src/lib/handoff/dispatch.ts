import {
  buildClaudeUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type DispatchCodexDeps, dispatchCodex } from './codex-two-shot.ts';
import { type DispatchCursorDeps, dispatchCursor } from './cursor-two-step.ts';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

interface DispatchHandoffDeps {
  readonly openExternalDeps?: OpenExternalDeps;
  readonly codexDeps?: DispatchCodexDeps;
  readonly cursorDeps?: DispatchCursorDeps;
}

export async function dispatchHandoff(
  payload: HandoffPayload,
  deps: DispatchHandoffDeps = {},
): Promise<HandoffOutcome> {
  switch (payload.target) {
    case 'claude-cowork':
      return openExternal(buildClaudeUrl({ mode: 'cowork' }, payload), deps.openExternalDeps);
    case 'claude-code':
      return openExternal(buildClaudeUrl({ mode: 'code' }, payload), deps.openExternalDeps);
    case 'codex':
      return dispatchCodex(payload, {
        ...deps.codexDeps,
        openExternalDeps: deps.codexDeps?.openExternalDeps ?? deps.openExternalDeps,
      });
    case 'cursor':
      return dispatchCursor(payload, {
        ...deps.cursorDeps,
        openExternalDeps: deps.cursorDeps?.openExternalDeps ?? deps.openExternalDeps,
      });
    default: {
      const _exhaustive: never = payload.target;
      return {
        ok: false,
        reason: 'invalid-payload',
        detail: `unknown target: ${String(_exhaustive)}`,
      };
    }
  }
}
