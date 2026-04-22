/**
 * Single outbound-dispatch entry point for the Open-in-Agent dropdown (AC9).
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.1.5
 * (E1-b DIRECTED — hand-rolled switch + `never` exhaustiveness; NO registry,
 * NO `HandoffTargetDescriptor`, NO discriminated-union `dispatch.kind`).
 *
 * Adding a 5th target is a 5-file change enforced by the `_exhaustive: never`
 * line + the drift-detector test in `shell-allowlist.test.ts`:
 *   (1) add to `HandoffTarget` union in `packages/core/src/handoff/types.ts`
 *   (2) append to `KNOWN_TARGETS` in `./targets.ts`
 *   (3) add a case here
 *   (4) create the URL builder in `packages/core/src/handoff/<name>-url.ts`
 *   (5) add its scheme to `ALLOWED_SCHEMES` in
 *       `packages/desktop/src/main/shell-allowlist.ts`
 *
 * STOP_IF (§15): do NOT re-introduce a `HandoffTargetDescriptor` type, a
 * discriminated-union `dispatch.kind`, or a function-valued registry. The
 * switch is deliberate — registry was retired per E1-b because its cardinality-
 * one `'two-step'` branch + layering seam (core → app imports for spawn) had
 * no counterweight. Third-party plugin API stays Explored Future Work.
 */

import {
  buildClaudeUrl,
  buildCodexUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type DispatchCursorDeps, dispatchCursor } from './cursor-two-step.ts';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

export interface DispatchHandoffDeps {
  /** Forwarded to `openExternal` for Claude/Codex (and step 2 of Cursor). */
  readonly openExternalDeps?: OpenExternalDeps;
  /** Forwarded to `dispatchCursor`. */
  readonly cursorDeps?: DispatchCursorDeps;
}

/**
 * Route a `HandoffPayload` to its per-target dispatch primitive.
 *
 * `dispatchHandoff` is the ONLY outbound call site for this feature — AC9
 * asserts zero other dispatch references in `packages/app/src/components/`.
 * The drift check is a grep test in US-011 (and can be strengthened to an
 * AST-level assertion if the grep ever gets noisy).
 */
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
