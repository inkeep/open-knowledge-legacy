import type { HandoffPayload } from './types.ts';

/**
 * Path-separator-agnostic basename. Handles both POSIX `/` and Windows `\`
 * separators — inputs like `/Users/who/proj` and `C:\Users\who\proj` both
 * yield the trailing `proj`. Core is "no Node APIs", so `path.basename` from
 * `node:path` is unavailable; this replacement is a pure string op.
 *
 * Returns the input unchanged if it contains no separator.
 */
function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx < 0 ? p : p.substring(idx + 1);
}

/**
 * Build the Cursor prompt URL for step 2 of the two-step dispatch. Step 1
 * (`cursor <projectDir>` spawn to focus the workspace window) is handled by
 * `cursor-two-step.ts` in app-layer.
 *
 * Shape:
 *   cursor://anysphere.cursor-deeplink/prompt?text=<double-enc>&workspace=<single-enc-basename>&mode=agent
 *
 * Encoding rule (per `evidence/cursor-encoding-empirics.md`):
 * - `text=` is DOUBLE-encoded — Cursor's router does two decode passes with
 *   error recovery on the second. Single-encoding silently corrupts prompts
 *   containing substrings that look like valid URL escapes (`%41`, em-dash
 *   bytes, pct-encoded URLs in quoted text). Double-encoding sidesteps this
 *   entirely — matches Linear's production rule in `AIActions.js`.
 * - `workspace=` is single-encoded basename — pins the URL to the workspace
 *   window spawned in step 1, matches `deeplink.routeToWorkspaceName` which
 *   compares by window-name (basename), not path.
 * - `mode=agent` is a literal enum — NOT encoded. (OQ-C DIRECTED: pinned to
 *   `agent` in v0; other modes are Future Work.)
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.2.
 */
export function buildCursorUrl(payload: HandoffPayload): string {
  const text = encodeURIComponent(encodeURIComponent(payload.prompt));
  const workspace = encodeURIComponent(basename(payload.projectDir));
  return `cursor://anysphere.cursor-deeplink/prompt?text=${text}&workspace=${workspace}&mode=agent`;
}
