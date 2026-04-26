/**
 * Single outbound-dispatch entry point for the Open-in-Agent dropdown — the
 * ONLY site that invokes `openExternal` or `dispatchCursor` for a handoff.
 *
 * Deliberately a hand-rolled switch with `never` exhaustiveness — NO registry,
 * NO discriminated-union `dispatch.kind`, NO function-valued `TargetData`. A
 * registry was retired because its cardinality-one `'two-step'` branch + the
 * core→app import it would force had no counterweight. If a third-party
 * plugin API ever lands, revisit then.
 *
 * Adding a 5th target is a 5-file change; see the KNOWN_TARGETS comment in
 * `./targets.ts` for the checklist.
 */

import {
  buildClaudeUrl,
  buildCodexUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type DispatchCursorDeps, dispatchCursor } from './cursor-two-step.ts';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

interface DispatchHandoffDeps {
  /** Forwarded to `openExternal` for Claude/Codex (and step 2 of Cursor). */
  readonly openExternalDeps?: OpenExternalDeps;
  /** Forwarded to `dispatchCursor`. */
  readonly cursorDeps?: DispatchCursorDeps;
}

/** Route a `HandoffPayload` to its per-target dispatch primitive. */
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
      return openExternal(buildCodexUrl(payload), deps.openExternalDeps);
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
