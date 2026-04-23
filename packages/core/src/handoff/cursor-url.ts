import type { HandoffPayload } from './types.ts';

/**
 * Path-separator-agnostic basename — core is "no Node APIs" so
 * `path.basename` is unavailable. Returns input unchanged if no separator.
 */
function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx < 0 ? p : p.substring(idx + 1);
}

/**
 * Build Cursor's step-2 prompt URL. Step 1 (`cursor <projectDir>` spawn to
 * focus the workspace window) is handled by `cursor-two-step.ts`.
 *
 *   cursor://anysphere.cursor-deeplink/prompt?text=<double-enc>&workspace=<single-enc-basename>&mode=agent
 *
 * `text=` is DOUBLE-encoded: Cursor's router does two decode passes with
 * error recovery on the second. Single-encoding silently corrupts prompts
 * containing substrings that look like valid URL escapes (`%41`, em-dash
 * bytes, pct-encoded URLs in quoted text) — this matches Linear's production
 * rule. `workspace=` is single-encoded basename (Cursor routes by
 * window-name, which is the basename, not the full path).
 */
export function buildCursorUrl(payload: HandoffPayload): string {
  const text = encodeURIComponent(encodeURIComponent(payload.prompt));
  const workspace = encodeURIComponent(basename(payload.projectDir));
  return `cursor://anysphere.cursor-deeplink/prompt?text=${text}&workspace=${workspace}&mode=agent`;
}
